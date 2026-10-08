"use client";

// «Link area clienti» (08/10/2026, fase 1): genera il link magico della sessione per «Genius Lab – Area clienti»
// (sola lettura: stato, strumenti, documenti, pagamento, spedizioni, scadenze) e lo copia negli appunti.
// NON manda niente al cliente: il link lo incolla l'operatore dove serve. Qui si vedono anche i link già creati
// (accessi, scadenza) e si possono revocare.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Copy, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";

type LinkPortale = {
  id: string; scade_il: string; revocato_il: string | null; creato_da: string | null; created_at: string;
  ultimo_accesso: string | null; accessi: number; attivo: boolean;
};

const dt = (v: string | null) => (v ? new Date(v).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—");

export function LinkAreaClienti({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nuovo, setNuovo] = useState<string | null>(null);
  const [elenco, setElenco] = useState<LinkPortale[]>([]);

  const carica = async () => {
    try {
      const r = await fetchAPI(`/api/sessions/${sessionId}/portale-link`);
      setElenco(r.link || []);
    } catch {
      setElenco([]);
    }
  };

  const copia = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiato negli appunti");
    } catch {
      toast.info("Copia il link dal riquadro");
    }
  };

  const genera = async () => {
    setBusy(true);
    try {
      const r = await fetchAPI(`/api/sessions/${sessionId}/portale-link`, { method: "POST", body: JSON.stringify({ giorni: 60 }) });
      setNuovo(r.url);
      setOpen(true);
      await copia(r.url);
      await carica();
    } catch (e) {
      toast.error(`Link non creato: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const revoca = async (id: string) => {
    if (!confirm("Revocare questo link? Il cliente non potrà più aprirlo.")) return;
    try {
      await fetchAPI(`/api/portale-link/${id}/revoca`, { method: "POST" });
      toast.success("Link revocato");
      await carica();
    } catch (e) {
      toast.error(`Revoca non riuscita: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <Button variant="outline" className="h-11" onClick={genera} disabled={busy}
        title="Crea il link per l'Area clienti (sola lettura, 60 giorni) e lo copia. Non invia nulla al cliente.">
        {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />} Link area clienti
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <Card className="bg-white max-w-xl w-full max-h-[85vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Link2 className="w-5 h-5 text-blue-600" /> Link area clienti</h3>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}><X className="w-4 h-4" /></Button>
            </div>
            {nuovo && (
              <>
                <p className="text-xs text-gray-600">
                  Link copiato. Vale 60 giorni e mostra solo questa sessione (stato, strumenti, documenti, pagamento, scadenze).
                  Nessun messaggio è stato inviato al cliente.
                </p>
                <div className="flex gap-2">
                  <input readOnly value={nuovo} className="flex-1 rounded border px-2 py-1.5 text-xs font-mono" onFocus={(e) => e.target.select()} />
                  <Button size="sm" variant="outline" onClick={() => copia(nuovo)}><Copy className="w-4 h-4" /></Button>
                </div>
              </>
            )}
            <div className="border-t pt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Link della sessione</div>
              {elenco.length === 0 && <p className="text-xs text-gray-400">Nessun link.</p>}
              {elenco.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 py-1.5 text-xs border-t first:border-t-0">
                  <div>
                    <span className={`rounded px-1.5 py-0.5 mr-2 ${l.attivo ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>
                      {l.attivo ? "attivo" : l.revocato_il ? "revocato" : "scaduto"}
                    </span>
                    creato {dt(l.created_at)} · scade {dt(l.scade_il)} · aperto {l.accessi}× (ultimo {dt(l.ultimo_accesso)})
                  </div>
                  {l.attivo && <Button size="sm" variant="outline" className="h-7 text-red-700" onClick={() => revoca(l.id)}>Revoca</Button>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
