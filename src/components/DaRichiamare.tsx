"use client";

// DA RICHIAMARE (04/11/2026, Christian): le telefonate col flag compaiono su qualsiasi pagina, come bonifici e Stripe,
// finché qualcuno non preme «Richiamato». Il flag si mette dalla pagina Telefonate.
// 13/11/2026: ci sono anche le chiamate PERSE non ancora richiamate (calcolate dal registro, si chiudono da sole alla richiamata).

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, PhoneCall, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchAPI } from "@/lib/api";
import { toastErrore } from "@/lib/errori";
import { PulsanteChiama } from "@/components/PulsanteChiama";
import { DettaglioDaRichiamare, type RigaDaRichiamare as Riga } from "@/components/PerseDaRichiamare";
import { CLASSI_PULSANTE_PILA, NellaPila } from "@/components/PilaAvvisi";

const SENZA = ["/login", "/forgot-password", "/reset-password"];

export function DaRichiamare() {
  const pathname = usePathname();
  const [righe, setRighe] = useState<Riga[]>([]);
  const [aperto, setAperto] = useState(false);
  const [busy, setBusy] = useState("");
  const nascosto = SENZA.some((p) => pathname.startsWith(p));

  const carica = useCallback(() => {
    fetchAPI("/api/telefonate/da-richiamare", { timeoutMs: 20_000 }, false).then((r) => setRighe(r.telefonate || [])).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (nascosto) return;
    carica();
    const t = setInterval(carica, 60_000);
    window.addEventListener("focus", carica);
    window.addEventListener("telefonate-cambiate", carica);
    return () => { clearInterval(t); window.removeEventListener("focus", carica); window.removeEventListener("telefonate-cambiate", carica); };
  }, [carica, nascosto]);

  if (nascosto) return null;
  const n = righe.length;

  async function fatto(r: Riga) {
    setBusy(r.id);
    try {
      await fetchAPI(`/api/telefonate/${r.id}`, { method: "PATCH", body: JSON.stringify({ da_richiamare: false }) });
      const resto = righe.filter((x) => x.id !== r.id);
      setRighe(resto);
      if (!resto.length) setAperto(false);
      window.dispatchEvent(new Event("telefonate-cambiate"));
      toast.success(`${r.contatto || r.internazionale || r.numero || "Numero nascosto"}: richiamato`);
    } catch (e) {
      toastErrore(e);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      {n > 0 && !aperto && (
        // 13/11/2026: nella pila unica degli avvisi (non copre più i contenuti); su iPhone solo icona e numero
        <NellaPila ordine={3}>
          <button type="button" onClick={() => setAperto(true)} title={`${n} ${n === 1 ? "telefonata" : "telefonate"} da richiamare`}
            aria-label={`${n} ${n === 1 ? "telefonata" : "telefonate"} da richiamare`}
            className={`${CLASSI_PULSANTE_PILA} bg-amber-600 hover:bg-amber-700`}>
            <span className="absolute -left-1 -top-1 size-3 animate-ping rounded-full bg-amber-400" />
            <PhoneCall className="size-4" /> {n}<span className="hidden sm:inline"> da richiamare</span>
          </button>
        </NellaPila>
      )}
      {aperto && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 print:hidden" onClick={() => setAperto(false)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-4 py-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><PhoneCall className="size-5 text-amber-600" /> Da richiamare</h2>
              <Button variant="ghost" size="icon-sm" onClick={() => setAperto(false)} aria-label="Chiudi"><X /></Button>
            </div>
            <ul className="divide-y">
              {righe.map((r) => (
                <li key={r.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold tabular-nums">{r.contatto ? `${r.contatto} · ` : ""}{r.internazionale || r.numero || "Numero nascosto"}{r.paese && r.paese !== "Italia" ? ` (${r.paese})` : ""}</p>
                    <p className="text-xs text-muted-foreground"><DettaglioDaRichiamare r={r} />{r.nome ? ` · ${r.nome}` : ""}</p>
                    {r.nota ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{r.nota}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {r.numero ? <PulsanteChiama numero={r.numero} /> : null}
                    <Button size="sm" disabled={busy === r.id} onClick={() => fatto(r)}>
                      {busy === r.id ? <Loader2 className="animate-spin" /> : <Check />} Richiamato
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="p-4"><Link href="/telefonate" onClick={() => setAperto(false)} className="text-sm text-blue-700 hover:underline dark:text-blue-300">Apri tutte le telefonate</Link></div>
          </div>
        </div>
      )}
    </>
  );
}
