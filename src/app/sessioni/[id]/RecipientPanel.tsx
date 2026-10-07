"use client";

// Destinatario del rapporto — 07/10/2026 (Christian): è un FLAG dentro la scheda del cliente,
// «Il destinatario del rapporto è diverso da chi paga».
// Spento = destinatario uguale a chi paga, nessun campo a video. Acceso = si apre il blocco del destinatario
// (ricerca in anagrafica o inserimento manuale). Se la sessione ha già un destinatario diverso il flag nasce acceso
// e si vede il riepilogo, con «Modifica destinatario». Colonne usate: recipient_* di calibration_sessions (esistenti).

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { searchCustomers, updateSession } from "@/lib/api";

interface Customer {
  id: string;
  company_name: string;
  vat_number?: string | null;
  tax_id?: string | null;
  pec?: string | null;
  sdi_code?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  province?: string | null;
}

interface SessionLike {
  recipient_different?: boolean | null;
  recipient_customer_id?: string | null;
  recipient_company_name?: string | null;
  recipient_vat_number?: string | null;
  recipient_tax_id?: string | null;
  recipient_pec?: string | null;
  recipient_sdi_code?: string | null;
  recipient_address?: string | null;
  recipient_zip_code?: string | null;
  recipient_city?: string | null;
  recipient_province?: string | null;
}

interface Props {
  sessionId: string;
  session: SessionLike;
  customer: Customer;
  onSaved: () => void | Promise<void>;
}

type Mode = "search" | "manual";

export function RecipientPanel({ sessionId, session, customer, onSaved }: Props) {
  const [enabled, setEnabled] = useState<boolean>(!!session.recipient_different);
  const [mode, setMode] = useState<Mode>(session.recipient_customer_id ? "search" : "manual");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(session.recipient_customer_id || null);
  const [selectedName, setSelectedName] = useState<string>(
    session.recipient_customer_id ? (session.recipient_company_name || "Cliente selezionato") : ""
  );
  const [manual, setManual] = useState({
    company_name: session.recipient_company_name || "",
    vat_number: session.recipient_vat_number || "",
    tax_id: session.recipient_tax_id || "",
    pec: session.recipient_pec || "",
    sdi_code: session.recipient_sdi_code || "",
    address: session.recipient_address || "",
    zip_code: session.recipient_zip_code || "",
    city: session.recipient_city || "",
    province: session.recipient_province || "",
  });
  const [saving, setSaving] = useState(false);
  // modulo aperto: subito se si accende il flag su una sessione senza destinatario salvato, altrimenti con «Modifica»
  const [aperto, setAperto] = useState(false);
  const salvato = !!session.recipient_different;
  const indirizzoDest = [session.recipient_address, [session.recipient_zip_code, session.recipient_city].filter(Boolean).join(" "),
    session.recipient_province ? `(${session.recipient_province})` : ""].filter(Boolean).join(", ");

  // Flag: acceso → apre il blocco; spento su una sessione che aveva il destinatario → torna uguale a chi paga (salva subito)
  const cambiaFlag = async (acceso: boolean) => {
    if (acceso) { setEnabled(true); setAperto(true); return; }
    if (!salvato) { setEnabled(false); setAperto(false); return; }
    if (!confirm("Il destinatario del rapporto torna uguale al cliente che paga?\n\nRicorda di rigenerare i rapporti se erano già stati fatti.")) return;
    setSaving(true);
    try {
      await updateSession(sessionId, { recipient_different: false });
      toast.success("Destinatario riportato a uguale al cliente");
      setEnabled(false);
      setAperto(false);
      await onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio destinatario");
    } finally { setSaving(false); }
  };

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchCustomers(query, 8);
        setResults(((r?.customers ?? r) as Customer[]) || []);
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const pickCustomer = (c: Customer) => {
    setSelectedId(c.id);
    setSelectedName(`${c.company_name}${c.vat_number ? ` — P.IVA ${c.vat_number}` : ""}`);
    // Riempi anche i campi manuali per visibilita' (in caso utente passi a "manual")
    setManual({
      company_name: c.company_name,
      vat_number: c.vat_number || "",
      tax_id: c.tax_id || "",
      pec: c.pec || "",
      sdi_code: c.sdi_code || "",
      address: c.address || "",
      zip_code: c.zip_code || "",
      city: c.city || "",
      province: c.province || "",
    });
    setQuery("");
    setResults([]);
  };

  const clearRecipient = () => {
    setSelectedId(null);
    setSelectedName("");
  };

  const save = async () => {
    setSaving(true);
    try {
      // Disattivato => recipient_different=false e azzera tutto
      if (!enabled) {
        await updateSession(sessionId, {
          recipient_different: false,
          recipient_customer_id: null,
          recipient_company_name: null,
          recipient_vat_number: null,
          recipient_tax_id: null,
          recipient_pec: null,
          recipient_sdi_code: null,
          recipient_address: null,
          recipient_zip_code: null,
          recipient_city: null,
          recipient_province: null,
        });
        toast.success("Destinatario riportato a uguale al cliente");
        await onSaved();
        setAperto(false);
        return;
      }

      // Attivato in modalita' "ricerca anagrafica esistente"
      if (mode === "search") {
        if (!selectedId) {
          toast.error("Seleziona un cliente dall'anagrafica oppure passa a inserimento manuale");
          return;
        }
        await updateSession(sessionId, {
          recipient_different: true,
          recipient_customer_id: selectedId,
          // Salva anche snapshot per persistenza/diagnostica (non strettamente necessario)
          recipient_company_name: manual.company_name || null,
          recipient_vat_number: manual.vat_number || null,
          recipient_tax_id: manual.tax_id || null,
          recipient_pec: manual.pec || null,
          recipient_sdi_code: manual.sdi_code || null,
          recipient_address: manual.address || null,
          recipient_zip_code: manual.zip_code || null,
          recipient_city: manual.city || null,
          recipient_province: manual.province || null,
        });
      } else {
        // Manuale: validazione minima
        if (!manual.company_name.trim()) {
          toast.error("Ragione sociale destinatario obbligatoria");
          return;
        }
        await updateSession(sessionId, {
          recipient_different: true,
          recipient_customer_id: null,
          recipient_company_name: manual.company_name.trim(),
          recipient_vat_number: manual.vat_number.trim() || null,
          recipient_tax_id: manual.tax_id.trim().toUpperCase() || null,
          recipient_pec: manual.pec.trim().toLowerCase() || null,
          recipient_sdi_code: manual.sdi_code.trim().toUpperCase() || null,
          recipient_address: manual.address.trim() || null,
          recipient_zip_code: manual.zip_code.trim() || null,
          recipient_city: manual.city.trim() || null,
          recipient_province: manual.province.trim() || null,
        });
      }
      toast.success("Destinatario salvato. Rigenera gli RDT per applicare ai file Excel.");
      await onSaved();
      setAperto(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore salvataggio destinatario";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* FLAG: sempre visibile, unica riga quando è spento */}
      <label className="flex min-h-11 cursor-pointer select-none items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => cambiaFlag(e.target.checked)}
          className="h-5 w-5 shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
        />
        <Users className="size-4 shrink-0 text-purple-600" />
        <span className="text-sm font-medium text-gray-800">Il destinatario del rapporto è diverso da chi paga</span>
        {!enabled && <span className="hidden text-xs text-gray-500 sm:inline">— ora il rapporto va a {customer.company_name || "chi paga"}</span>}
      </label>

      {/* Acceso e già salvato: riepilogo del destinatario */}
      {enabled && salvato && !aperto && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-purple-200 bg-purple-50 p-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-purple-900">{session.recipient_company_name || "Destinatario dall'anagrafica"}</p>
            <p className="text-xs text-purple-800">
              {[session.recipient_vat_number && `P.IVA ${session.recipient_vat_number}`, session.recipient_tax_id && `CF ${session.recipient_tax_id}`, indirizzoDest]
                .filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <Button variant="outline" className="h-11" onClick={() => setAperto(true)}>Modifica destinatario</Button>
        </div>
      )}

      {enabled && aperto && (
        <div className="mt-2 space-y-3 rounded-md border border-purple-200 bg-purple-50/40 p-3">
          {/* Tabs modalita' */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setMode("search")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === "search" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Search className="w-4 h-4" /> Ricerca in anagrafica
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === "manual" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Users className="w-4 h-4" /> Inserisci manualmente
            </button>
          </div>

          {mode === "search" ? (
            <div className="space-y-2">
              {selectedId ? (
                <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded p-3">
                  <Users className="w-4 h-4 text-purple-600" />
                  <div className="flex-1 text-sm font-medium text-purple-900">{selectedName}</div>
                  <button onClick={clearRecipient} className="text-purple-600 hover:text-purple-800">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cerca per ragione sociale o P.IVA..."
                      className="pl-9 h-9"
                    />
                    {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
                  </div>
                  {results.length > 0 && (
                    <div className="border rounded max-h-56 overflow-y-auto bg-white shadow-sm">
                      {results.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => pickCustomer(c)}
                          className="w-full text-left px-3 py-2 hover:bg-purple-50 border-b last:border-b-0 text-sm"
                        >
                          <div className="font-medium text-gray-900">{c.company_name}</div>
                          <div className="text-xs text-gray-500">
                            {c.vat_number && `P.IVA ${c.vat_number} · `}
                            {[c.address, c.city].filter(Boolean).join(", ") || "—"}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {query.length >= 2 && !searching && results.length === 0 && (
                    <div className="text-xs text-gray-500 italic">
                      Nessun cliente trovato. Passa a &quot;Inserisci manualmente&quot; per creare il destinatario.
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Ragione sociale / Nome e Cognome *</label>
                <Input
                  value={manual.company_name}
                  onChange={(e) => setManual({ ...manual, company_name: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">P.IVA</label>
                <Input
                  value={manual.vat_number}
                  onChange={(e) => setManual({ ...manual, vat_number: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Codice Fiscale</label>
                <Input
                  value={manual.tax_id}
                  onChange={(e) => setManual({ ...manual, tax_id: e.target.value.toUpperCase() })}
                  placeholder="RSSMRA80A01H501Z"
                  className="h-9 uppercase"
                  maxLength={16}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">PEC (fatturazione SDI)</label>
                <Input
                  type="email"
                  value={manual.pec}
                  onChange={(e) => setManual({ ...manual, pec: e.target.value.toLowerCase() })}
                  placeholder="azienda@pec.it"
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Codice SDI</label>
                <Input
                  value={manual.sdi_code}
                  onChange={(e) => setManual({ ...manual, sdi_code: e.target.value.toUpperCase() })}
                  placeholder="0000000"
                  className="h-9 uppercase"
                  maxLength={7}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Indirizzo</label>
                <Input
                  value={manual.address}
                  onChange={(e) => setManual({ ...manual, address: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">CAP</label>
                <Input
                  value={manual.zip_code}
                  onChange={(e) => setManual({ ...manual, zip_code: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Citta&apos;</label>
                <Input
                  value={manual.city}
                  onChange={(e) => setManual({ ...manual, city: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Provincia</label>
                <Input
                  value={manual.province}
                  onChange={(e) => setManual({ ...manual, province: e.target.value.toUpperCase() })}
                  className="h-9 uppercase"
                  maxLength={2}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-11" disabled={saving}
              onClick={() => { if (salvato) setAperto(false); else { setEnabled(false); setAperto(false); } }}>
              <X className="w-4 h-4 mr-1" /> Annulla
            </Button>
            <Button onClick={save} disabled={saving} className="h-11">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Salva destinatario
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
