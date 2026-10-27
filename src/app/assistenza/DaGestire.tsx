"use client";

// 26/10/2026 (Christian): come il banner dei bonifici nelle Tarature — in cima alle schede le NOVITÀ DA GESTIRE
// (riparazioni finite da avvisare, ricambi arrivati, preventivi accettati, pronti da inviare…). Ogni voce apre l'elenco.
// «nuovo» = il numero è cresciuto dall'ultima volta che il banner è stato visto su questo computer.
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import type { FaseCruscotto } from "@/lib/assistenza";

const VOCI: [string, (n: number) => string][] = [
  ["finita_da_avvisare", (n) => `✅ ${n} ${n === 1 ? "riparazione finita" : "riparazioni finite"}: manda il PRONTO o il consuntivo`],
  ["ricambi_arrivati", (n) => `🔧 ${n} ${n === 1 ? "ricambio arrivato" : "ricambi arrivati"}: il tecnico può riparare`],
  ["da_assegnare_riparazione", (n) => `👍 ${n} ${n === 1 ? "preventivo accettato" : "preventivi accettati"}: assegna la riparazione`],
  ["preventivi_da_inviare", (n) => `📨 ${n} ${n === 1 ? "preventivo pronto" : "preventivi pronti"} da inviare`],
  ["rifiutati", (n) => `↩️ ${n} ${n === 1 ? "rifiutato" : "rifiutati"}: invia il pronto (restituzione)`],
  ["da_spedire_noi", (n) => `📦 ${n} ${n === 1 ? "pagato" : "pagati"} da spedire`],
  ["trova_attivo", (n) => `🔒 ${n} con «Trova il mio» da disattivare`],
  ["da_assegnare_verifica", (n) => `🔍 ${n} da assegnare in verifica`],
];
const CHIAVE = "assistenza-da-gestire-visti";

/** 27/10/2026 (Christian, 63214): novità scheda per scheda (preventivo appena accettato/rifiutato + cosa chiede il cliente) */
export interface Novita { id: string; sigla: string; cliente: string | null; prodotto: string | null; tipo: "accettato" | "rifiutato";
  il: string; canale: string | null; richiesta: string | null }

export function DaGestire({ fasi, onApri, novita = [], onScheda }: {
  fasi: FaseCruscotto[] | null; onApri: (fase: string) => void; novita?: Novita[]; onScheda?: (id: string) => void;
}) {
  const [visti, setVisti] = useState<Record<string, number>>({});
  const conta: Record<string, number> = {};
  for (const f of fasi || []) {
    conta[f.codice] = f.n;
    for (const x of f.sotto || []) conta[x.codice] = x.n;
  }
  const voci = VOCI.filter(([k]) => (conta[k] || 0) > 0);
  useEffect(() => { try { setVisti(JSON.parse(localStorage.getItem(CHIAVE) || "{}")); } catch { /* niente memoria locale */ } }, []);
  // quello che si è visto ora diventa il riferimento per la prossima volta (dopo un attimo, così il «nuovo» si nota)
  useEffect(() => {
    if (!fasi) return;
    const t = setTimeout(() => { try { localStorage.setItem(CHIAVE, JSON.stringify(Object.fromEntries(VOCI.map(([k]) => [k, conta[k] || 0])))); } catch { /* */ } }, 60000);
    return () => clearTimeout(t);
  }, [fasi]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!voci.length && !novita.length) return null;
  return (
    <div className="space-y-1.5 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
      {novita.map((x) => (
        <button key={`${x.id}-${x.il}`} type="button" onClick={() => onScheda?.(x.id)}
          className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left ${x.tipo === "accettato" ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-red-300 bg-red-50 dark:bg-red-950/30"}`}>
          <span className={`rounded px-1.5 text-[11px] font-bold text-white ${x.tipo === "accettato" ? "bg-emerald-600" : "bg-red-600"}`}>🆕 {x.tipo === "accettato" ? "ACCETTATO" : "RIFIUTATO"}</span>
          <b>Scheda {x.sigla}</b><span>{x.cliente}</span><span className="text-xs text-muted-foreground">{x.prodotto}</span>
          <span className="text-xs text-muted-foreground">{x.canale ? `${x.canale} · ` : ""}{new Date(x.il).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
          <span className="text-xs font-medium">{x.tipo === "accettato" ? "→ assegna la riparazione" : "→ invia il pronto (restituzione)"}</span>
          {x.richiesta && <span className="w-full text-xs"><b>Il cliente chiede:</b> {x.richiesta}</span>}
        </button>
      ))}
      {voci.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
      <BellRing className="size-4" /><b className="mr-1">Da gestire adesso:</b>
      {voci.map(([k, testo]) => {
        const nuovo = (conta[k] || 0) > (visti[k] ?? conta[k]);
        return (
          <button key={k} type="button" onClick={() => onApri(k)}
            className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-medium hover:bg-amber-100 dark:bg-amber-950/40">
            {testo(conta[k])}{nuovo && <span className="ml-1 rounded bg-red-600 px-1 text-[10px] font-bold text-white">NUOVO</span>}
          </button>
        );
      })}
      </div>}
    </div>
  );
}
