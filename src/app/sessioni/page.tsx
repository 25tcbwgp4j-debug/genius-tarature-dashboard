"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSessions, searchLeads, promoteLead, createSession } from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Search, Loader2, ChevronLeft, ChevronRight, FileDown, UserPlus, Camera, ClipboardPaste, Images, PackageOpen, Play } from "lucide-react";
import { ParseCustomerModal } from "../clienti/ParseCustomerModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getStatusConfig, getPaymentConfig } from "@/lib/constants";

// Chip singolo notifica: verde se inviato, grigio se non ancora fatto
function NotifChip({ label, sent }: { label: string; sent: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
        sent ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
      }`}
    >
      {sent ? "✓" : "–"} {label}
    </span>
  );
}

// Riga notifiche compatta per ogni sessione nel registro
function NotificationChips({ s }: { s: Record<string, unknown> }) {
  return (
    <div className="flex flex-wrap gap-1 mt-0.5" onClick={(e) => e.preventDefault()}>
      {/* Registrazione */}
      <NotifChip label="Reg.✉"  sent={!!(s.receipt_email_at    || s.receipt_email_sent)} />
      <NotifChip label="Reg.📱" sent={!!(s.receipt_whatsapp_at || s.receipt_whatsapp_sent)} />
      {/* Pronto al ritiro */}
      <NotifChip label="Pronto✉"  sent={!!(s.ready_email_at    || s.ready_email_sent)} />
      <NotifChip label="Pronto📱" sent={!!(s.ready_whatsapp_at || s.ready_whatsapp_sent)} />
      {/* Proforma */}
      <NotifChip label="PF✉"  sent={!!(s.proforma_email_at    || s.proforma_email_sent)} />
      <NotifChip label="PF📱" sent={!!(s.proforma_whatsapp_at || s.proforma_whatsapp_sent)} />
      {/* Pagamento */}
      <NotifChip label="Pagato" sent={s.payment_status === "pagato"} />
      {/* Consegnato */}
      <NotifChip label="Consegnato" sent={!!(s.delivered_at)} />
    </div>
  );
}

const PAGE_SIZE = 50;

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  // Anti-double-submit sul pulsante "Crea sessione": indica il customer_id in
  // corso di creazione. Blocca ulteriori click sui risultati finche' la POST
  // non si risolve (risolve bug sessioni duplicate create entro 200ms).
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // Filtri sessioni (audit P1.14): chip status + data + search testuale
  const [statusFilter, setStatusFilter] = useState<string>(""); // "" = tutti
  const [dateFilter, setDateFilter] = useState<string>(""); // YYYY-MM-DD
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  // Bulk selection (P2.8 round 4 max-power 10/05)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === sessions.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sessions.map((s) => s.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  useEffect(() => {
    // "Guardia ultima richiesta vince": senza, la risposta lenta di una ricerca
    // vecchia (es. "ros") poteva arrivare dopo quella nuova ("rossi") e
    // sovrascrivere la lista con risultati non piu' corrispondenti a cio' che
    // e' scritto nel campo. listSessions non espone un AbortSignal, quindi si
    // scartano gli esiti obsoleti con un flag nel cleanup. Audit 17/07.
    let annullato = false;
    setLoading(true);
    const opts: Record<string, string | number | undefined> = {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    if (statusFilter) opts.status = statusFilter;
    if (dateFilter) opts.date = dateFilter;
    listSessions(opts as Parameters<typeof listSessions>[0])
      .then((data) => {
        if (annullato) return;
        let rows = data.sessions || [];
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          // "165", "n. 165", "n165": ricerca per numero di sessione
          const qNum = q.replace(/^n\.?\s*/, "");
          rows = rows.filter((s: { customers?: { company_name?: string; vat_number?: string } | null; operator?: string; session_number?: number }) =>
            (/^\d+$/.test(qNum) && String(s.session_number ?? "") === qNum) ||
            (s.customers?.company_name || "").toLowerCase().includes(q) ||
            (s.customers?.vat_number || "").toLowerCase().includes(q) ||
            (s.operator || "").toLowerCase().includes(q),
          );
        }
        setSessions(rows);
        setTotal(data.total ?? data.count ?? 0);
      })
      .catch(() => {
        if (annullato) return;
        toast.error("Errore caricamento sessioni");
      })
      .finally(() => {
        if (!annullato) setLoading(false);
      });
    return () => {
      annullato = true;
    };
  }, [page, statusFilter, dateFilter, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Cliente nuovo creato dal dialog (incolla dati / foto biglietto): la sessione parte subito
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  // 01/10/2026 — «Il cliente deve ancora portare gli strumenti»: la sessione nasce in ATTESA STRUMENTI
  const [attesaStrumenti, setAttesaStrumenti] = useState(false);
  // Avviso anti-clone: il cliente ha gia' una sessione in attesa strumenti (409 dal backend)
  const [avvisoClone, setAvvisoClone] = useState<{ customerId: string; message: string; sessionId: string } | null>(null);
  const [forzando, setForzando] = useState(false);

  // 02/10/2026 — barra in alto pensata per iPad mini e iPhone: «Nuova sessione», «Ricerca cliente» (inline, con
  // i risultati sotto al campo) e «Inquadra» / «Incolla immagine» (dalla foto o dall'immagine si trova o si crea
  // il cliente e la sessione parte subito). Prima si passava da tre schermate.
  const [q, setQ] = useState("");
  const [qResults, setQResults] = useState<any[]>([]);
  const [qSearching, setQSearching] = useState(false);
  const [imgIniziale, setImgIniziale] = useState<File | null>(null);
  const [modalMode, setModalMode] = useState<"text" | "image">("text");
  const camRef = useRef<HTMLInputElement>(null);
  const [touch, setTouch] = useState(true);
  useEffect(() => { setTouch(typeof navigator !== "undefined" && navigator.maxTouchPoints > 0); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setQResults([]); return; }
    let annullato = false;
    const t = setTimeout(async () => {
      setQSearching(true);
      try {
        const data = await searchLeads(q.trim(), 8);
        if (!annullato) setQResults(data.results || []);
      } catch { /* la barra resta vuota */ } finally { if (!annullato) setQSearching(false); }
    }, 300);
    return () => { annullato = true; clearTimeout(t); };
  }, [q]);

  // Crea la sessione; se il backend segnala una sessione gia' in attesa strumenti apre il dialogo
  // di avviso e ritorna null (la creazione NON avviene finche' l'operatore non conferma).
  const creaSessione = async (customerId: string, conferma = false, attesa = attesaStrumenti) => {
    try {
      return await createSession(customerId, undefined, { attesaStrumenti: attesa, confermaDuplicato: conferma });
    } catch (err: unknown) {
      const e = err as { status?: number; detail?: { code?: string; message?: string; session?: { id?: string } } };
      if (e?.status === 409 && e.detail?.code === "sessione_in_attesa_strumenti" && e.detail.session?.id) {
        setAvvisoClone({ customerId, message: e.detail.message || "C'è già una sessione in attesa strumenti", sessionId: e.detail.session.id });
        setDialogOpen(false);
        return null;
      }
      throw err;
    }
  };

  const avviaSessionePer = async (customerId: string) => {
    if (creatingFor) return;
    setCreatingFor(customerId);
    setNewCustomerOpen(false);
    try {
      const session = await creaSessione(customerId);
      if (!session) { setCreatingFor(null); return; }
      toast.success("Cliente pronto, sessione creata!");
      setDialogOpen(false);
      window.location.assign(`/sessioni/${session.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore creazione sessione");
      setCreatingFor(null);
    }
  };

  const handleSearch = async () => {
    if (customerQuery.length < 2) return;
    setSearching(true);
    try {
      const data = await searchLeads(customerQuery);
      setCustomerResults(data.results || []);
    } catch {
      toast.error("Errore ricerca");
    } finally {
      setSearching(false);
    }
  };

  // Crea sessione a partire da un risultato unificato. Se il lead non e'
  // ancora un customer (fgas_prospect / cold_lead), prima lo promuove.
  const handleCreateSession = async (lead: {
    id: string | null;
    lead_id: string | number;
    source: 'customer' | 'fgas_prospect' | 'cold_lead';
    company_name: string;
  }, attesa: boolean = attesaStrumenti) => {
    // Anti-double-submit: se gia' in corso una creazione, ignora i click.
    const key = String(lead.id || lead.lead_id);
    if (creatingFor) return;
    setCreatingFor(key);
    try {
      let customerId = lead.id as string | null;
      if (!customerId || lead.source !== 'customer') {
        // Promuovi il lead a customer (idempotente)
        const prom = await promoteLead(
          lead.source as 'fgas_prospect' | 'cold_lead',
          lead.lead_id,
        );
        customerId = prom.customer_id;
        toast.success(`${lead.company_name} promosso a cliente`);
      }
      if (!customerId) throw new Error("customer_id mancante");
      const session = await creaSessione(customerId, false, attesa);
      if (!session) { setCreatingFor(null); return; }
      toast.success(attesa ? "Sessione creata in ATTESA STRUMENTI: il cliente deve ancora portarli" : "Sessione creata!");
      setDialogOpen(false);
      window.location.assign(`/sessioni/${session.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore creazione sessione");
      setCreatingFor(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold">Sessioni taratura</h2>
        {/* Barra di partenza: tutto a portata di dito (≥44 px), niente scorrimento orizzontale */}
        <Card className="gap-0 p-3">
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setImgIniziale(f); setModalMode("image"); setDialogOpen(false); setNewCustomerOpen(true); } }} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Button onClick={() => setDialogOpen(true)} className="h-11 shrink-0 px-4 text-sm font-semibold">
              <Plus className="size-5" /> Nuova sessione
            </Button>
            <div className="min-w-0 flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ricerca cliente: nome, P.IVA…"
                  className="h-11 pl-9 text-base sm:text-sm" aria-label="Ricerca cliente"
                  onKeyDown={(e) => { if (e.key === "Enter" && qResults[0]) handleCreateSession(qResults[0]); if (e.key === "Escape") setQ(""); }} />
                {qSearching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-gray-400" />}
              </div>
              {q.trim().length >= 2 && !qSearching && (
                <div className="mt-2 overflow-hidden rounded-lg border bg-white shadow-sm">
                  {qResults.length === 0 ? (
                    <div className="flex flex-col gap-2 p-3 text-sm text-gray-600 sm:flex-row sm:items-center">
                      Nessun cliente trovato.
                      <Button variant="outline" className="h-11 sm:ml-auto" onClick={() => { setModalMode("text"); setImgIniziale(null); setNewCustomerOpen(true); }}>
                        <UserPlus className="size-4" /> Crea «{q.trim()}» come nuovo cliente
                      </Button>
                    </div>
                  ) : qResults.map((c: any) => {
                    const key = String(c.id || c.lead_id);
                    const inCorso = creatingFor === key;
                    return (
                      <div key={`${c.source}-${key}`} className="flex flex-col gap-2 border-b p-2.5 last:border-b-0 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 truncate font-medium">
                            {c.company_name}
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${c.source === "customer" ? "bg-green-100 text-green-800" : c.source === "fgas_prospect" ? "bg-blue-100 text-blue-800" : "bg-fuchsia-100 text-fuchsia-800"}`}>
                              {c.source === "customer" ? "In rubrica" : c.source === "fgas_prospect" ? "F-GAS" : "Places"}
                            </span>
                          </p>
                          <p className="truncate text-xs text-gray-500">{c.vat_number ? `P.IVA ${c.vat_number} · ` : ""}{c.city || ""}{c.province ? ` (${c.province})` : ""}</p>
                        </div>
                        <div className="grid shrink-0 grid-cols-2 gap-1.5">
                          <Button className="h-11 bg-emerald-600 text-white hover:bg-emerald-700" disabled={!!creatingFor} onClick={() => handleCreateSession(c, false)}
                            title="Gli strumenti sono qui: apri la sessione e registrali">
                            {inCorso ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Avvia
                          </Button>
                          <Button variant="outline" className="h-11 border-orange-300 text-orange-800 hover:bg-orange-50" disabled={!!creatingFor} onClick={() => handleCreateSession(c, true)}
                            title="Il cliente deve ancora portare gli strumenti: la sessione nasce in ATTESA STRUMENTI">
                            <PackageOpen className="size-4" /> In attesa
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <Button variant="outline" className="h-11 border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100" onClick={() => camRef.current?.click()}
                title="Fotografa il biglietto da visita, il timbro o la visura: il cliente viene trovato o creato e la sessione parte">
                <Camera className="size-5" /> {touch ? "Inquadra" : "Foto / file"}
              </Button>
              <Button variant="outline" className="h-11 border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"
                onClick={() => { setImgIniziale(null); setModalMode("image"); setDialogOpen(false); setNewCustomerOpen(true); }}
                title="Incolla un'immagine dagli appunti (⌘V) o scegline una dalla galleria">
                {touch ? <Images className="size-5" /> : <ClipboardPaste className="size-5" />} {touch ? "Dalla galleria" : "Incolla immagine"}
              </Button>
            </div>
          </div>
        </Card>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuova sessione di taratura</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <label className={`flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer ${
                attesaStrumenti ? "border-orange-500 bg-orange-50 font-semibold text-orange-800" : "border-gray-200"}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-500"
                  checked={attesaStrumenti}
                  onChange={(e) => setAttesaStrumenti(e.target.checked)}
                />
                Il cliente deve ancora portare gli strumenti (sessione in ATTESA STRUMENTI)
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="Cerca cliente per nome..."
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={searching}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              <div className="max-h-80 overflow-auto">
                {(() => {
                  const inRubrica = customerResults.filter((c: any) => c.source === 'customer');
                  const nuovi = customerResults.filter((c: any) => c.source !== 'customer');
                  const renderRow = (c: any) => {
                    const key = String(c.id || c.lead_id);
                    const isCreating = creatingFor === key;
                    const disabled = !!creatingFor;
                    const badge = c.source === 'customer'
                      ? { label: 'In rubrica', cls: 'bg-green-100 text-green-800' }
                      : c.source === 'fgas_prospect'
                        ? { label: 'F-GAS', cls: 'bg-blue-100 text-blue-800' }
                        : { label: 'Places', cls: 'bg-fuchsia-100 text-fuchsia-800' };
                    return (
                      <button
                        key={`${c.source}-${key}`}
                        disabled={disabled}
                        className={`w-full text-left p-3 border-b last:border-b-0 transition-colors ${
                          disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
                        }`}
                        onClick={() => handleCreateSession(c)}
                      >
                        <p className="font-medium flex items-center gap-2">
                          {c.company_name}
                          <span className={`text-xs px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                          {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                        </p>
                        <p className="text-sm text-gray-500">
                          {c.email ? `${c.email} · ` : ''}{c.city || ""}{c.province ? ` (${c.province})` : ''}
                        </p>
                      </button>
                    );
                  };
                  return (
                    <>
                      {inRubrica.length > 0 && (
                        <div>
                          <div className="px-3 py-2 text-xs font-semibold text-green-800 bg-green-50 border-y border-green-200 uppercase tracking-wide">
                            ✅ Già in rubrica clienti · {inRubrica.length}
                          </div>
                          {inRubrica.map(renderRow)}
                        </div>
                      )}
                      {nuovi.length > 0 && (
                        <div>
                          <div className="px-3 py-2 text-xs font-semibold text-purple-800 bg-purple-50 border-y border-purple-200 uppercase tracking-wide">
                            🆕 Nuovi lead (verranno aggiunti alla rubrica al primo utilizzo) · {nuovi.length}
                          </div>
                          {nuovi.map(renderRow)}
                        </div>
                      )}
                      {customerResults.length === 0 && customerQuery.length >= 2 && !searching && (
                        <p className="p-3 text-gray-500 text-center">Nessun risultato: crea il cliente qui sotto.</p>
                      )}
                    </>
                  );
                })()}
              </div>
              <Button
                variant={customerResults.length === 0 && customerQuery.length >= 2 && !searching ? "default" : "outline"}
                className="w-full"
                disabled={!!creatingFor}
                onClick={() => { setDialogOpen(false); setImgIniziale(null); setModalMode("text"); setNewCustomerOpen(true); }}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Crea nuovo cliente (incolla i dati o la foto del biglietto)
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {/* Avviso anti-clone: sessione gia' in attesa strumenti per questo cliente */}
        <Dialog open={!!avvisoClone} onOpenChange={(o) => { if (!o && !forzando) setAvvisoClone(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-orange-700">Sessione già in attesa strumenti</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="rounded-md border-2 border-orange-500 bg-orange-50 p-3 text-sm font-medium text-orange-900">
                {avvisoClone?.message}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  disabled={forzando}
                  onClick={() => avvisoClone && window.location.assign(`/sessioni/${avvisoClone.sessionId}`)}
                >
                  Apri la sessione esistente
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={forzando}
                  onClick={async () => {
                    if (!avvisoClone) return;
                    setForzando(true);
                    try {
                      const session = await creaSessione(avvisoClone.customerId, true);
                      if (session) {
                        toast.success("Nuova sessione creata");
                        window.location.assign(`/sessioni/${session.id}`);
                      }
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : "Errore creazione sessione");
                      setForzando(false);
                    }
                  }}
                >
                  {forzando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Crea comunque una nuova sessione
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <ParseCustomerModal
          open={newCustomerOpen}
          onClose={() => { setNewCustomerOpen(false); setImgIniziale(null); }}
          onCreated={avviaSessionePer}
          onUpdated={avviaSessionePer}
          onUseExisting={avviaSessionePer}
          initialMode={modalMode}
          initialImage={imgIniziale}
        />
      </div>

      {/* Barra filtri (audit P1.14) */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter chips */}
          <div className="flex flex-wrap gap-1">
            {[
              { key: "", label: "Tutte" },
              { key: "attesa_strumenti", label: "Attesa strum." },
              { key: "registrazione", label: "Registr." },
              { key: "in_lavorazione", label: "In lavoraz." },
              { key: "pronto_ritiro", label: "Pronto" },
              { key: "completata", label: "Compl." },
            ].map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant={statusFilter === s.key ? "default" : "outline"}
                onClick={() => {
                  setPage(1);
                  setStatusFilter(s.key);
                }}
                className="h-7 text-xs"
              >
                {s.label}
              </Button>
            ))}
          </div>
          {/* Date filter */}
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              setPage(1);
              setDateFilter(e.target.value);
            }}
            className="w-auto h-7 text-xs"
            title="Filtra per data sessione"
          />
          {dateFilter && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setPage(1);
                setDateFilter("");
              }}
            >
              ✕ data
            </Button>
          )}
          {/* Search testuale (cliente/operator) */}
          <div className="flex items-center gap-1 flex-1 min-w-[200px]">
            <Input
              placeholder="Cerca n. sessione / cliente / P.IVA / operatore..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  setSearch(searchInput.trim());
                }
              }}
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              onClick={() => {
                setPage(1);
                setSearch(searchInput.trim());
              }}
              className="h-7 text-xs"
            >
              <Search className="w-3 h-3 mr-1" /> Cerca
            </Button>
            {search && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setPage(1);
                }}
              >
                ✕
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Bulk action toolbar (P2.8 round 4) — visibile quando >0 selezionati */}
      {selectedIds.size > 0 && (
        <Card className="p-3 bg-emerald-50 border-emerald-200 sticky top-0 z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-emerald-900">
              {selectedIds.size} selezionate
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={clearSelection}
            >
              Deseleziona
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
              disabled={bulkRunning !== null}
              onClick={async () => {
                if (!confirm(`Inviare notifica "Pronti al ritiro" a ${selectedIds.size} sessioni? Verranno inviati Email + WhatsApp con rate-limit 1/sec.`)) return;
                setBulkRunning("notify-ready");
                try {
                  const r = await fetch("/api/backend/api/sessions/bulk-action", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "notify-ready", session_ids: Array.from(selectedIds) }),
                  });
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  const data = await r.json();
                  toast.success(`Bulk completato: ${data.success}/${data.total} OK`);
                  clearSelection();
                } catch (e) {
                  toast.error("Bulk fallito: " + (e as Error).message);
                } finally {
                  setBulkRunning(null);
                }
              }}
            >
              {bulkRunning === "notify-ready" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Notifica pronti
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
              disabled={bulkRunning !== null}
              onClick={async () => {
                const method = prompt("Metodo pagamento per tutte le sessioni? (bonifico/contanti/pos)", "bonifico");
                if (!method || !["bonifico","contanti","pos"].includes(method)) {
                  toast.error("Metodo non valido");
                  return;
                }
                if (!confirm(`Marcare ${selectedIds.size} sessioni come pagate via ${method}?`)) return;
                setBulkRunning("mark-paid");
                try {
                  const r = await fetch("/api/backend/api/sessions/bulk-action", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "mark-paid", session_ids: Array.from(selectedIds), extra: { payment_method: method } }),
                  });
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  const data = await r.json();
                  toast.success(`${data.success}/${data.total} marcati come pagati (${method})`);
                  clearSelection();
                } catch (e) {
                  toast.error("Bulk fallito: " + (e as Error).message);
                } finally {
                  setBulkRunning(null);
                }
              }}
            >
              {bulkRunning === "mark-paid" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Marca pagato
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              title="Esporta sessioni filtrate in Excel XLSX"
              onClick={() => {
                const params = new URLSearchParams();
                if (statusFilter) params.set("status", statusFilter);
                if (dateFilter) params.set("date_from", dateFilter);
                window.open(`/api/backend/api/sessions-export.xlsx?${params}`, "_blank");
              }}
            >
              <FileDown className="w-3 h-3 mr-1" /> Excel
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="divide-y">
          {/* Header con select-all */}
          {sessions.length > 0 && !loading && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 border-b text-xs text-gray-600">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={selectedIds.size === sessions.length && sessions.length > 0}
                onChange={toggleSelectAll}
                aria-label="Seleziona tutte le sessioni"
              />
              <span>Seleziona tutte ({sessions.length})</span>
            </div>
          )}
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="p-8 text-center text-gray-500">
              {statusFilter || dateFilter || search
                ? "Nessuna sessione con questi filtri"
                : "Nessuna sessione"}
            </p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-3 p-4 transition-colors ${
                  s.status === "attesa_strumenti"
                    ? "bg-orange-50 border-l-4 border-orange-500 hover:bg-orange-100"
                    : "hover:bg-gray-50"}`}
              >
                {/* Bulk select checkbox FUORI dal Link (P2.8) */}
                <input
                  type="checkbox"
                  className="h-4 w-4 flex-shrink-0"
                  checked={selectedIds.has(s.id)}
                  onChange={() => toggleSelect(s.id)}
                  aria-label={`Seleziona sessione ${s.customers?.company_name || s.id}`}
                />
                <Link
                  href={`/sessioni/${s.id}`}
                  className="flex flex-1 flex-col gap-1 min-w-0"
                >
                  {/* Riga 1: cliente + importo + badge stato + badge pagamento */}
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                    <p className="font-medium truncate">
                      {s.session_number != null && (
                        <span className="mr-2 font-mono text-sm text-gray-500">N. {s.session_number}</span>
                      )}
                      {s.customers?.company_name || "N/D"}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      <span className="text-sm font-semibold text-gray-700">
                        EUR {parseFloat(s.total_amount || 0).toFixed(2)}
                      </span>
                      {/* Badge stato sessione */}
                      {(() => {
                        const cfg = getStatusConfig(s.status, { shippingIncluded: !!s.shipping_included });
                        return <Badge className={`${cfg.color} text-xs`}>{cfg.label}</Badge>;
                      })()}
                      {/* Badge pagamento — nascosto per completata (pagamento implicito) */}
                      {s.status !== "completata" && (() => {
                        const pcfg = getPaymentConfig(s.payment_status, s.payment_method);
                        return <Badge className={`${pcfg.color} text-xs`}>{pcfg.label}</Badge>;
                      })()}
                    </div>
                  </div>

                  {/* Riga 2: meta-info */}
                  <p className="text-xs text-gray-500">
                    {s.session_date} · {s.total_instruments || 0} strum. · {s.operator || "—"}
                  </p>

                  {/* Riga 3: notifiche inviate + RDT */}
                  <NotificationChips s={s} />
                </Link>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Paginazione - fix F11 */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>
            {(page - 1) * PAGE_SIZE + 1}-
            {Math.min(page * PAGE_SIZE, total)} di {total} sessioni
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Precedente
            </Button>
            <span className="flex items-center px-3">
              Pag. {page} di {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Successiva <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
