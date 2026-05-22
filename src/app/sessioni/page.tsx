"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSessions, searchLeads, promoteLead, createSession } from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Search, Loader2, ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STATUS_CONFIG } from "@/lib/constants";

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
    setLoading(true);
    const opts: Record<string, string | number | undefined> = {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    if (statusFilter) opts.status = statusFilter;
    if (dateFilter) opts.date = dateFilter;
    listSessions(opts as Parameters<typeof listSessions>[0])
      .then((data) => {
        let rows = data.sessions || [];
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          rows = rows.filter((s: { customers?: { company_name?: string; vat_number?: string } | null; operator?: string }) =>
            (s.customers?.company_name || "").toLowerCase().includes(q) ||
            (s.customers?.vat_number || "").toLowerCase().includes(q) ||
            (s.operator || "").toLowerCase().includes(q),
          );
        }
        setSessions(rows);
        setTotal(data.total ?? data.count ?? 0);
      })
      .catch(() => toast.error("Errore caricamento sessioni"))
      .finally(() => setLoading(false));
  }, [page, statusFilter, dateFilter, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
  }) => {
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
      const session = await createSession(customerId);
      toast.success("Sessione creata!");
      setDialogOpen(false);
      window.location.assign(`/sessioni/${session.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore creazione sessione");
      setCreatingFor(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Sessioni taratura</h2>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuova sessione
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuova sessione di taratura</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
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
                        <p className="p-3 text-gray-500 text-center">Nessun risultato</p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Barra filtri (audit P1.14) */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter chips */}
          <div className="flex flex-wrap gap-1">
            {[
              { key: "", label: "Tutte" },
              { key: "registrazione", label: "Registr." },
              { key: "in_lavorazione", label: "In lavoraz." },
              { key: "pronto_ritiro", label: "Pronto" },
              { key: "attesa_pagamento", label: "Att. pag." },
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
              placeholder="Cerca cliente / P.IVA / operatore..."
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
                  const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/backend/sessions/bulk-action`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "notify-ready", session_ids: Array.from(selectedIds) }),
                  });
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
                  const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/backend/sessions/bulk-action`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "mark-paid", session_ids: Array.from(selectedIds), extra: { payment_method: method } }),
                  });
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
                window.open(`/api/backend/sessions/export.xlsx?${params}`, "_blank");
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
                className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
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
                  className="flex flex-1 items-center justify-between"
                >
                  <div className="flex-1">
                    <p className="font-medium">{s.customers?.company_name || "N/D"}</p>
                    <p className="text-sm text-gray-500">
                      {s.session_date} - {s.total_instruments || 0} strumenti - {s.operator || ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className="text-sm font-medium">
                      EUR {parseFloat(s.total_amount || 0).toFixed(2)}
                    </span>
                    {(() => {
                      // 22/05 ripristino logica 7c053b9: se status=attesa_pagamento
                      // e payment_status=pagato, mostra "Pronto al ritiro" (workflow
                      // di fatto: lavoro finito + cliente ha pagato = solo ritiro fisico).
                      // Per altri status (es. in_lavorazione) il pagato non altera il badge.
                      const isPaidWaiting =
                        s.payment_status === "pagato" &&
                        s.status === "attesa_pagamento";
                      const effectiveStatus = isPaidWaiting ? "pronto_ritiro" : s.status;
                      return (
                        <>
                          <Badge className={STATUS_CONFIG[effectiveStatus]?.color || ""}>
                            {STATUS_CONFIG[effectiveStatus]?.label || effectiveStatus}
                          </Badge>
                          {s.payment_status === "pagato" && s.status !== "completata" && (
                            <Badge className="bg-emerald-100 text-emerald-800">
                              Pagato {s.payment_method ? `(${s.payment_method})` : ""}
                            </Badge>
                          )}
                        </>
                      );
                    })()}
                  </div>
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
