"use client";

// CHIAMATA IN ARRIVO (05/11/2026, Christian): mentre il telefono squilla, su ogni pagina compare chi chiama
// (nome in rubrica) e le sue ultime schede assistenza. Arriva dal collegamento CTI del centralino (agente sul PC HP).
// 13/11/2026: le schede APERTE vengono prima, evidenziate «IN CORSO», anche se sulla scheda c'è un altro telefono (stesso nome).

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { PhoneCall, PhoneIncoming, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchAPI } from "@/lib/api";

type Scheda = { id: string; numero: number; nominativo?: string | null; azienda?: string | null; prodotto?: string | null; modello?: string | null; stato?: string | null; created_at: string; telefono?: string | null; aperta?: boolean; altro_numero?: boolean };
type Chiamata = { call_id: string; stato: "squilla" | "risposta"; numero: string; interno?: string | null; contatto?: string | null; internazionale?: string | null; paese?: string | null; schede: Scheda[] };

const SENZA = ["/login", "/forgot-password", "/reset-password"];
const STATI: Record<string, string> = { in_arrivo: "In arrivo", accettato: "Accettato", da_preventivare: "Da preventivare", preventivo_inviato: "Preventivo inviato", pronto: "Pronto", consegnato: "Consegnato", annullata: "Annullata" };
const giorno = (d: string) => new Date(d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "2-digit" });

export function ChiamataInArrivo() {
  const pathname = usePathname();
  const [chiamate, setChiamate] = useState<Chiamata[]>([]);
  const [chiuse, setChiuse] = useState<string[]>([]);
  const nascosto = SENZA.some((p) => pathname.startsWith(p));

  const carica = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    fetchAPI("/api/telefonate/in-arrivo", { timeoutMs: 8_000 }, false).then((r) => setChiamate(r.telefonate || [])).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (nascosto) return;
    carica();
    const t = setInterval(carica, 3_000);
    window.addEventListener("focus", carica);
    return () => { clearInterval(t); window.removeEventListener("focus", carica); };
  }, [carica, nascosto]);

  const visibili = chiamate.filter((c) => !chiuse.includes(c.call_id));
  if (nascosto || !visibili.length) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2 print:hidden" aria-live="polite">
      {visibili.map((c) => (
        <div key={c.call_id} className={`rounded-lg border-2 bg-background p-3 shadow-xl ${c.stato === "squilla" ? "border-emerald-500" : "border-sky-500"}`}>
          <div className="flex items-start gap-2">
            {c.stato === "squilla"
              ? <PhoneIncoming className="mt-0.5 size-5 shrink-0 animate-pulse text-emerald-600" />
              : <PhoneCall className="mt-0.5 size-5 shrink-0 text-sky-600" />}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">{c.stato === "squilla" ? "Sta chiamando" : `In linea${c.interno ? ` con il ${c.interno}` : ""}`}</p>
              <p className="truncate text-base font-semibold">{c.contatto || c.schede[0]?.nominativo || c.schede[0]?.azienda || "Numero non in rubrica"}</p>
              <p className="text-sm tabular-nums">{c.internazionale || c.numero}{c.paese && c.paese !== "Italia" ? ` · ${c.paese}` : ""}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setChiuse((x) => [...x, c.call_id])} aria-label="Chiudi"><X /></Button>
          </div>
          {c.schede.length ? (
            <ul className="mt-2 divide-y rounded-md border text-sm">
              {c.schede.map((s) => (
                <li key={s.id}>
                  <Link href={`/assistenza?id=${s.id}`} className={`flex items-center justify-between gap-2 px-2.5 py-1.5 hover:bg-muted ${s.aperta ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}>
                    <span className="min-w-0">
                      <span className="block truncate">
                        {s.aperta ? <span className="mr-1.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">In corso</span> : null}
                        <span className="font-medium tabular-nums">{s.numero}</span> · {s.modello || s.prodotto || "Dispositivo"}
                      </span>
                      {s.altro_numero ? <span className="block truncate text-xs text-amber-800 dark:text-amber-300">Stesso cliente, sulla scheda c&apos;è un altro telefono: {s.telefono || "—"}</span> : null}
                    </span>
                    <span className={`shrink-0 text-xs ${s.aperta ? "font-semibold text-amber-800 dark:text-amber-300" : "text-muted-foreground"}`}>{STATI[s.stato || ""] || s.stato} · {giorno(s.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-xs text-muted-foreground">Nessuna scheda assistenza con questo numero.</p>}
        </div>
      ))}
    </div>
  );
}
