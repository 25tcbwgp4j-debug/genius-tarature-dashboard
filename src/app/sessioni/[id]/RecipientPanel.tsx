"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { searchCustomers, updateSession } from "@/lib/api";

interface Customer {
  id: string;
  company_name: string;
  vat_number?: string | null;
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
    address: session.recipient_address || "",
    zip_code: session.recipient_zip_code || "",
    city: session.recipient_city || "",
    province: session.recipient_province || "",
  });
  const [saving, setSaving] = useState(false);

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
          recipient_address: null,
          recipient_zip_code: null,
          recipient_city: null,
          recipient_province: null,
        });
        toast.success("Destinatario riportato a uguale al cliente");
        await onSaved();
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
          recipient_address: manual.address.trim() || null,
          recipient_zip_code: manual.zip_code.trim() || null,
          recipient_city: manual.city.trim() || null,
          recipient_province: manual.province.trim() || null,
        });
      }
      toast.success("Destinatario salvato. Rigenera gli RDT per applicare ai file Excel.");
      await onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore salvataggio destinatario";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Destinatario del rapporto di taratura
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Default: stesso cliente. Spunta se il proprietario degli strumenti e&apos; diverso da chi paga.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-sm font-medium text-gray-700">Destinatario diverso</span>
        </label>
      </div>

      {!enabled ? (
        <div className="text-sm text-gray-500 bg-gray-50 rounded p-3">
          Il rapporto di taratura riportera&apos; cliente e destinatario uguali a:
          <strong className="ml-1">{customer.company_name}</strong>
        </div>
      ) : (
        <div className="space-y-4">
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
                <label className="text-xs text-gray-500">Ragione sociale *</label>
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
                <label className="text-xs text-gray-500">Provincia</label>
                <Input
                  value={manual.province}
                  onChange={(e) => setManual({ ...manual, province: e.target.value })}
                  className="h-9"
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
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end mt-4">
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
          Salva destinatario
        </Button>
      </div>
    </Card>
  );
}
