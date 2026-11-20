"use client";
// 20/11/2026 (G-14): pezzi comuni delle RIPARAZIONI APPLE GSX — selettore ambiente (PROVA Apple / PRODUZIONE), messaggi Apple
// (STOP / ACKNOWLEDGE / avvisi sempre visibili), albero di domande Apple (repair/questions ed escalation/options).
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { area, campo } from "../scheda/ui";
import { ripAmbiente, type Ambiente, type DomandaApple, type Esito, type InfoAmbiente, type Risposte } from "@/lib/gsxRip";

const CHIAVE = "gl_gsx_ambiente";

/** Ambiente scelto (ricordato nel browser). PROVA predefinita finché la produzione è bloccata. */
export function useAmbiente(): [Ambiente, (a: Ambiente) => void, InfoAmbiente | null] {
  const [info, setInfo] = useState<InfoAmbiente | null>(null);
  const [amb, setAmb] = useState<Ambiente>("uat");
  useEffect(() => {
    let salvato: string | null = null;
    try { salvato = localStorage.getItem(CHIAVE); } catch { /* niente memoria locale */ }
    ripAmbiente().then((i) => {
      setInfo(i);
      setAmb(i.produzione_bloccata ? (salvato === "prod" ? "prod" : "uat") : ((salvato as Ambiente) || i.predefinito));
    }).catch(() => setAmb("uat"));
  }, []);
  const cambia = (a: Ambiente) => { setAmb(a); try { localStorage.setItem(CHIAVE, a); } catch { /* ok */ } };
  return [amb, cambia, info];
}

export function SelettoreAmbiente({ amb, onChange, info, compatto }: { amb: Ambiente; onChange: (a: Ambiente) => void; info: InfoAmbiente | null; compatto?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border-2 px-2 py-1", amb === "uat" ? "border-sky-400 bg-sky-50 dark:bg-sky-950/30" : "border-red-500 bg-red-50 dark:bg-red-950/30")}
      data-testid="gsx-ambiente">
      <span className="text-xs font-semibold">GSX:</span>
      {(["uat", "prod"] as Ambiente[]).map((a) => (
        <button key={a} type="button" onClick={() => onChange(a)} aria-pressed={amb === a}
          className={cn("rounded-md px-2.5 py-1 text-xs font-bold", amb === a ? (a === "uat" ? "bg-sky-600 text-white" : "bg-red-600 text-white") : "bg-background text-muted-foreground ring-1 ring-border")}>
          {a === "uat" ? "🧪 PROVA Apple" : "🏭 PRODUZIONE"}
        </button>))}
      {!compatto && <span className="text-[11px] text-muted-foreground">
        {amb === "uat" ? "Ambiente di prova Apple: nulla arriva ad Apple davvero." : info?.produzione_bloccata
          ? "Produzione: solo letture. Le scritture si sbloccano su ok di Christian." : "Produzione: le riparazioni sono VERE."}
      </span>}
    </div>);
}

const COLORE: Record<string, string> = {
  STOP: "border-red-500 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-50", HOLD: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50",
  ACKNOWLEDGE: "border-violet-500 bg-violet-50 text-violet-950 dark:bg-violet-950/30 dark:text-violet-50", FEATURE: "border-sky-500 bg-sky-50 text-sky-950 dark:bg-sky-950/30 dark:text-sky-50",
};
const NOME: Record<string, string> = { STOP: "⛔ STOP — Apple blocca", HOLD: "⏸ In attesa (revisione Apple)", ACKNOWLEDGE: "✋ Da confermare", WARNING: "⚠️ Avviso",
  WARN: "⚠️ Avviso", MESSAGE: "ℹ️ Messaggio", FEATURE: "📲 Funzione Apple", COVERAGE_LIMITATIONS: "🧾 Limiti di copertura", REPAIR_TYPE: "🔧 Tipi di riparazione" };

/** Messaggi di Apple SEMPRE visibili; le conferme (ACKNOWLEDGE) con la spunta. */
export function MessaggiApple({ esito, conferme, onConferma }: { esito: Esito | null | undefined; conferme?: Record<string, boolean>; onConferma?: (id: string, v: boolean) => void }) {
  if (!esito || (!esito.messaggi.length && !esito.stop && !esito.limiti_copertura.length)) return null;
  return (
    <div className="space-y-1.5" data-testid="gsx-messaggi">
      {esito.stop && !esito.messaggi.some((m) => m.tipo === "STOP" && m.testo) && (
        <div className={cn("rounded-lg border-2 px-3 py-2 text-sm", COLORE.STOP)}><b>{NOME.STOP}</b>: Apple non ha dato il motivo (in PROVA i testi STOP arrivano spesso vuoti).</div>)}
      {esito.messaggi.map((m, i) => (
        <div key={i} className={cn("rounded-lg border-2 px-3 py-2 text-sm", COLORE[m.tipo] || "border-border bg-muted/40")}>
          <b>{NOME[m.tipo] || m.tipo}</b>{m.sotto ? ` (${m.sotto === "REPAIR_MODE" ? "Modalità riparazione" : m.sotto})` : ""}: {m.testo || "—"}
          {m.tipo === "ACKNOWLEDGE" && m.id && onConferma && (
            <label className="mt-1 flex items-center gap-2 font-medium"><input type="checkbox" checked={!!conferme?.[m.id]} onChange={(e) => onConferma(m.id!, e.target.checked)} />Confermo (Y)</label>)}
        </div>))}
      {esito.limiti_copertura.map((l, i) => (
        <div key={`l${i}`} className="rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/30">
          <b>🧾 Limiti di copertura</b>: {l.testo || "—"}{l.parti.length ? ` · parti ${l.parti.join(", ")}` : ""}{l.coperture.length ? ` · coperture ammesse ${l.coperture.join(", ")}` : ""}
        </div>))}
    </div>);
}

/** Albero di domande Apple: RAD/DPD = scelta, FFB/BBX = testo, INT = solo informazione, ATMNT = allegato (si carica a parte). */
export function AlberoDomande({ domande, risposte, onChange, livello = 0 }: { domande: DomandaApple[]; risposte: Risposte; onChange: (r: Risposte) => void; livello?: number }) {
  return (
    <div className={cn("space-y-2", livello && "ml-4 border-l pl-3")}>
      {domande.map((q) => {
        const r = risposte[q.questionId] || {};
        const scelta = (q.answers || []).find((a) => a.answerId && a.answerId === r.answerId);
        const testo = q.answerType === "FFB" || q.answerType === "BBX" || (!q.answers?.some((a) => a.answerId) && q.answerType !== "INT" && q.answerType !== "ATMNT");
        return (
          <div key={q.questionId} className="text-sm">
            <div className="font-medium">{q.questionPhrase || q.questionId}{q.optional === false && q.answerType !== "INT" && <span className="text-red-600"> *</span>}
              <span className="ml-1 text-[10px] text-muted-foreground">{q.answerType}</span></div>
            {q.answerType === "INT" ? null : q.answerType === "ATMNT" ? <div className="text-xs text-muted-foreground">Allegato: caricalo con «Allegati» qui sotto.</div>
              : testo ? (q.answerType === "BBX"
                ? <textarea className={cn(area, "mt-1")} rows={3} value={r.answerPhrase || ""} onChange={(e) => onChange({ ...risposte, [q.questionId]: { answerPhrase: e.target.value } })} />
                : <input className={cn(campo, "mt-1")} value={r.answerPhrase || ""} onChange={(e) => onChange({ ...risposte, [q.questionId]: { answerPhrase: e.target.value } })} />)
                : q.answerType === "DPD" ? (
                  <select className={cn(campo, "mt-1")} value={r.answerId || ""} onChange={(e) => onChange({ ...risposte, [q.questionId]: { answerId: e.target.value } })}>
                    <option value="">— scegli —</option>
                    {(q.answers || []).map((a) => <option key={a.answerId} value={a.answerId}>{a.answerPhrase}</option>)}
                  </select>)
                  : (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(q.answers || []).map((a) => (
                        <label key={a.answerId} className={cn("flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1", r.answerId === a.answerId && "border-primary bg-primary/10")}>
                          <input type="radio" name={q.questionId} checked={r.answerId === a.answerId} onChange={() => onChange({ ...risposte, [q.questionId]: { answerId: a.answerId } })} />
                          {a.answerPhrase}
                        </label>))}
                    </div>)}
            {scelta?.questions?.length ? <div className="mt-2"><AlberoDomande domande={scelta.questions} risposte={risposte} onChange={onChange} livello={livello + 1} /></div> : null}
          </div>);
      })}
    </div>);
}

export const euro = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n.toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : "—";
};
export const dataOra = (s?: string | null) => (s ? new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/** colore della pill dello stato GSX */
export function tonoStato(st?: string | null): "verde" | "ambra" | "rosso" | "blu" | "grigio" {
  if (!st) return "grigio";
  if (["POCR", "SCNC", "GX08"].includes(st)) return "rosso";
  if (["GX03", "GX02", "NEWO", "RCNC", "ADMH"].includes(st)) return "ambra";
  if (["RFPU", "SPCM", "SCOM"].includes(st)) return "verde";
  return "blu";
}

export async function fileInBase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
