"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Upload, RefreshCw, UserPlus, Pencil, Download } from "lucide-react";
import { toast } from "sonner";

// Va dal proxy Next, non diretto a Railway: il middleware di auth del
// backend rifiuta ogni chiamata senza X-API-Key/JWT, e la chiave sta
// solo lato server. (20/08/2026)
const API_BASE = "/api/backend";

interface SyncNew {
  ragione_sociale: string;
  piva: string;
  codice_fiscale: string;
  sdi: string;
  pec: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  telefono: string;
  email: string;
  fatture_count: number;
}

interface SyncUpdate {
  customer_id: string;
  company_name: string;
  changes: Record<string, string>;
}

interface DiffResult {
  new: SyncNew[];
  updates: SyncUpdate[];
  unchanged: number;
  parsed_count: number;
  message?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSynced?: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  vat_number: "P.IVA", tax_id: "C.F.", sdi_code: "SDI", pec: "PEC",
  address: "Indirizzo", zip_code: "CAP", city: "Città", province: "Provincia",
  phone1: "Telefono", email: "Email",
};

export function SimplyfattSyncModal({ open, onClose, onSynced }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  // Selezione righe da applicare
  const [selectedNew, setSelectedNew] = useState<Set<number>>(new Set());
  const [selectedUpd, setSelectedUpd] = useState<Set<number>>(new Set());

  if (!open) return null;

  const handleClose = () => {
    setDiff(null);
    setSelectedNew(new Set());
    setSelectedUpd(new Set());
    onClose();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLoading(true);
    setDiff(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch(`${API_BASE}/api/simplyfatt/preview-sync`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      const data: DiffResult = await res.json();
      setDiff(data);
      // Pre-seleziona tutto
      setSelectedNew(new Set(data.new.map((_, i) => i)));
      setSelectedUpd(new Set(data.updates.map((_, i) => i)));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore analisi XML");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleApply = async () => {
    if (!diff) return;
    setApplying(true);
    try {
      const toCreate = diff.new.filter((_, i) => selectedNew.has(i));
      const toUpdate = diff.updates.filter((_, i) => selectedUpd.has(i));
      const res = await fetch(`${API_BASE}/api/simplyfatt/apply-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create: toCreate, update: toUpdate }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast.success(`Sincronizzazione completata: ${result.created} creati, ${result.updated} aggiornati`);
      if (result.errors?.length) toast.error(`${result.errors.length} errori — vedi console`);
      onSynced?.();
      handleClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore applicazione");
    } finally {
      setApplying(false);
    }
  };

  const handleExportCsv = () => {
    window.open(`${API_BASE}/api/simplyfatt/export-csv`, "_blank");
  };

  const toggleAll = (
    set: Set<number>, setFn: (s: Set<number>) => void, total: number
  ) => {
    setFn(set.size === total ? new Set() : new Set(Array.from({ length: total }, (_, i) => i)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-600" />
            Sincronizzazione contatti SimplyFatt
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Istruzioni + pulsanti */}
          <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 space-y-1">
            <p className="font-medium">Come funziona</p>
            <p>
              <b>SimplyFatt → Tarature:</b> esporta le fatture emesse da SimplyFatt come XML
              (Fatture Emesse → seleziona → Esporta XML), poi carica i file qui sotto.
            </p>
            <p>
              <b>Tarature → SimplyFatt:</b> scarica il CSV e importalo in SimplyFatt
              (Anagrafiche → Importa). I nuovi file fattura XML già includono telefono ed email.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Upload XML */}
            <label className="cursor-pointer">
              <input
                ref={fileRef}
                type="file"
                accept=".xml,.zip"
                multiple
                className="hidden"
                onChange={handleUpload}
              />
              <span className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white transition-colors ${loading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Carica XML / ZIP da SimplyFatt
              </span>
            </label>

            {/* Export CSV */}
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="w-4 h-4 mr-2" />
              Esporta CSV per SimplyFatt
            </Button>
          </div>

          {/* Risultati diff */}
          {diff && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span className="text-gray-500">XML analizzati: <b>{diff.parsed_count}</b></span>
                <span className="text-green-700">Nuovi: <b>{diff.new.length}</b></span>
                <span className="text-amber-700">Da aggiornare: <b>{diff.updates.length}</b></span>
                <span className="text-gray-500">Invariati: <b>{diff.unchanged}</b></span>
              </div>

              {diff.message && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">{diff.message}</p>
              )}

              {/* Nuovi clienti */}
              {diff.new.length > 0 && (
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-green-600" />
                      Nuovi clienti da creare ({selectedNew.size}/{diff.new.length})
                    </h3>
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => toggleAll(selectedNew, setSelectedNew, diff.new.length)}
                    >
                      {selectedNew.size === diff.new.length ? "Deseleziona tutti" : "Seleziona tutti"}
                    </button>
                  </div>
                  <div className="divide-y text-sm max-h-52 overflow-y-auto">
                    {diff.new.map((c, i) => (
                      <label key={i} className="flex items-start gap-3 py-2 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedNew.has(i)}
                          onChange={() => {
                            const s = new Set(selectedNew);
                            s.has(i) ? s.delete(i) : s.add(i);
                            setSelectedNew(s);
                          }}
                        />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.ragione_sociale}</p>
                          <p className="text-gray-500 text-xs">
                            {[c.piva && `P.IVA ${c.piva}`, c.telefono, c.email].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        {c.fatture_count > 1 && (
                          <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                            {c.fatture_count} fatture
                          </Badge>
                        )}
                      </label>
                    ))}
                  </div>
                </Card>
              )}

              {/* Aggiornamenti */}
              {diff.updates.length > 0 && (
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm flex items-center gap-2">
                      <Pencil className="w-4 h-4 text-amber-600" />
                      Campi vuoti da completare ({selectedUpd.size}/{diff.updates.length})
                    </h3>
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => toggleAll(selectedUpd, setSelectedUpd, diff.updates.length)}
                    >
                      {selectedUpd.size === diff.updates.length ? "Deseleziona tutti" : "Seleziona tutti"}
                    </button>
                  </div>
                  <div className="divide-y text-sm max-h-52 overflow-y-auto">
                    {diff.updates.map((u, i) => (
                      <label key={i} className="flex items-start gap-3 py-2 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedUpd.has(i)}
                          onChange={() => {
                            const s = new Set(selectedUpd);
                            s.has(i) ? s.delete(i) : s.add(i);
                            setSelectedUpd(s);
                          }}
                        />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{u.company_name}</p>
                          <p className="text-gray-500 text-xs">
                            {Object.entries(u.changes)
                              .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${v}`)
                              .join(" · ")}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </Card>
              )}

              {diff.new.length === 0 && diff.updates.length === 0 && (
                <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">
                  Tutti i clienti SimplyFatt sono già sincronizzati con la dashboard.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <Button variant="outline" onClick={handleClose}>Chiudi</Button>
          {diff && (selectedNew.size > 0 || selectedUpd.size > 0) && (
            <Button
              onClick={handleApply}
              disabled={applying}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {applying
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <RefreshCw className="w-4 h-4 mr-2" />}
              Applica ({selectedNew.size + selectedUpd.size} modifiche)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
