"use client";

// TELEFONATE DA RICHIAMARE nella home Apple (13/11/2026, Christian): le chiamate perse — soprattutto a negozio chiuso — che nessuno
// ha ancora richiamato. Si chiudono da sole se dopo c'è una chiamata fatta a quel numero o se il cliente richiama e qualcuno risponde;
// altrimenti con «Richiamato». Stessi dati del pulsante giallo su ogni pagina (DaRichiamare).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, PhoneMissed } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchAPI } from "@/lib/api";
import { toastErrore } from "@/lib/errori";
import { PulsanteChiama } from "@/components/PulsanteChiama";

export type RigaDaRichiamare = {
  id: string; data_ora: string; direzione: string; numero: string | null; nome: string | null; contatto?: string | null;
  internazionale?: string | null; paese?: string | null; nota: string | null;
  automatica?: boolean; volte?: number; prima?: string; fuori_orario?: boolean;
};

const dataOra = (d: string) => new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** «Persa a negozio chiuso · 3 volte» / «Segnata da richiamare» */
export function DettaglioDaRichiamare({ r }: { r: RigaDaRichiamare }) {
  if (!r.automatica) return <>{r.direzione === "uscente" ? "Chiamata fatta" : "Ha chiamato"} il {dataOra(r.data_ora)} · segnata da richiamare</>;
  return (
    <>
      {r.fuori_orario ? <span className="font-semibold text-amber-700 dark:text-amber-400">Negozio chiuso</span> : <span className="font-semibold">Senza risposta</span>}
      {" · "}{(r.volte || 1) > 1 ? `${r.volte} chiamate, l'ultima ${dataOra(r.data_ora)} (prima ${dataOra(r.prima || r.data_ora)})` : dataOra(r.data_ora)}
    </>
  );
}

export function PerseDaRichiamare() {
  const [righe, setRighe] = useState<RigaDaRichiamare[] | null>(null);
  const [busy, setBusy] = useState("");

  const carica = useCallback(() => {
    fetchAPI("/api/telefonate/da-richiamare", { timeoutMs: 20_000 }, false).then((r) => setRighe(r.telefonate || [])).catch(() => setRighe((x) => x ?? []));
  }, []);

  useEffect(() => {
    carica();
    const t = setInterval(carica, 60_000);
    window.addEventListener("telefonate-cambiate", carica);
    return () => { clearInterval(t); window.removeEventListener("telefonate-cambiate", carica); };
  }, [carica]);

  async function fatto(r: RigaDaRichiamare) {
    setBusy(r.id);
    try {
      await fetchAPI(`/api/telefonate/${r.id}`, { method: "PATCH", body: JSON.stringify({ da_richiamare: false }) });
      setRighe((x) => (x || []).filter((y) => y.id !== r.id));
      window.dispatchEvent(new Event("telefonate-cambiate"));
      toast.success(`${r.contatto || r.internazionale || r.numero}: richiamato`);
    } catch (e) {
      toastErrore(e);
    } finally {
      setBusy("");
    }
  }

  const n = righe?.length ?? 0;
  return (
    <Card className={`p-4 ${n ? "border-amber-400 dark:border-amber-600" : ""}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <PhoneMissed className={`h-4 w-4 ${n ? "text-amber-600" : ""}`} /> Telefonate da richiamare{righe ? ` (${n})` : ""}
        </h3>
        <Link href="/telefonate" className="text-sm text-blue-700 hover:underline dark:text-blue-300">Tutte le telefonate</Link>
      </div>
      {righe === null ? <p className="text-sm text-gray-500">Caricamento…</p>
        : !n ? <p className="text-sm text-gray-500">Nessuna chiamata persa da richiamare.</p>
        : (
          <ul className="divide-y">
            {righe.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold tabular-nums">{r.contatto ? `${r.contatto} · ` : ""}{r.internazionale || r.numero}{r.paese && r.paese !== "Italia" ? ` (${r.paese})` : ""}</p>
                  <p className="text-xs text-gray-500"><DettaglioDaRichiamare r={r} />{r.nome ? ` · ${r.nome}` : ""}</p>
                  {r.nota ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{r.nota}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.numero ? <PulsanteChiama numero={r.numero} /> : null}
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => fatto(r)}>
                    {busy === r.id ? <Loader2 className="animate-spin" /> : <Check />} Richiamato
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      <p className="mt-2 text-xs text-gray-500">Si tolgono da sole quando richiamate dal centralino o quando il cliente richiama e qualcuno risponde. Le chiamate fatte dal cellulare non si vedono: in quel caso premete «Richiamato».</p>
    </Card>
  );
}
