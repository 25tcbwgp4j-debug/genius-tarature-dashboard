"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Search, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { searchCustomers, changeSessionCustomer } from "@/lib/api";

interface CustomerRow {
  id: string;
  company_name: string;
  vat_number?: string | null;
  email?: string | null;
  city?: string | null;
}

interface Props {
  sessionId: string;
  currentCustomerId: string;
  currentCustomerName: string;
  onChanged: () => void | Promise<void>;
}

export function ChangeCustomerDialog({ sessionId, currentCustomerId, currentCustomerName, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<CustomerRow | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!open || !query || query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchCustomers(query, 10);
        const rows = ((r?.customers ?? r) as CustomerRow[]) || [];
        setResults(rows.filter((c) => c.id !== currentCustomerId));
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, currentCustomerId]);

  const handleChange = async () => {
    if (!picked) return;
    if (!confirm(
      `Cambiare il cliente della sessione?\n\n` +
      `Da: ${currentCustomerName}\n` +
      `A: ${picked.company_name}\n\n` +
      `Verranno migrati anche tutti gli strumenti, rapporti RDT e proforma gia' emesse.`,
    )) return;
    setChanging(true);
    try {
      const res = await changeSessionCustomer(sessionId, picked.id);
      const u = res.updates || {};
      toast.success(
        `Cliente cambiato. Migrati: ${u.instruments || 0} strumenti, ${u.reports || 0} rapporti, ${u.proforma || 0} proforma.`,
      );
      setOpen(false); setQuery(""); setPicked(null); setResults([]);
      await onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore cambio cliente");
    } finally { setChanging(false); }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserCog className="w-4 h-4 mr-1" /> Cambia cliente
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="bg-white max-w-xl w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <UserCog className="w-5 h-5 text-blue-600" /> Cambia cliente della sessione
              </h3>
              <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setPicked(null); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Cliente attuale: <strong>{currentCustomerName}</strong>. Cerca il cliente corretto e seleziona.
            </p>

            {picked ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3 flex items-center gap-2">
                <div className="flex-1">
                  <div className="text-sm font-medium text-emerald-900">{picked.company_name}</div>
                  <div className="text-xs text-emerald-700">
                    {picked.vat_number && `P.IVA ${picked.vat_number} · `}
                    {picked.email || "no email"}
                    {picked.city && ` · ${picked.city}`}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPicked(null)}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cerca per ragione sociale o P.IVA..."
                    className="pl-9 h-9"
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
                </div>
                {results.length > 0 && (
                  <div className="border rounded max-h-64 overflow-y-auto">
                    {results.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setPicked(c)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0 text-sm"
                      >
                        <div className="font-medium">{c.company_name}</div>
                        <div className="text-xs text-gray-500">
                          {c.vat_number && `P.IVA ${c.vat_number} · `}{c.email || "no email"}{c.city && ` · ${c.city}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {query.length >= 2 && !searching && results.length === 0 && (
                  <div className="text-xs text-gray-500 italic">Nessun cliente trovato.</div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => { setOpen(false); setPicked(null); }}>Annulla</Button>
              <Button onClick={handleChange} disabled={!picked || changing}>
                {changing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserCog className="w-4 h-4 mr-1" />}
                Cambia cliente
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
