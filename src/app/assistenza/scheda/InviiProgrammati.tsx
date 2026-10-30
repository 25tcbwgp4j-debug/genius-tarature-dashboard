"use client";

// 30/10/2026 (Christian): INVII PROGRAMMATI della scheda (PREVENTIVO / aggiornamento e PRONTO / consuntivo), come nelle
// Tarature: «⏰ … programmato per le 17:00 di oggi» con Invia subito · Modifica orario · Annulla; dopo l'invio l'esito
// (inviato, non inviato perché la scheda è cambiata, errore). Lo spedisce lo scheduler (ogni minuto) con la stessa logica
// del pulsante.
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchAPI } from "@/lib/api";
import { toastErrore } from "@/lib/errori";
import type { Esito, Scheda } from "@/lib/assistenza";
import { QuandoInvio, quandoBreve, useQuando } from "./Dialoghi";

type Cosa = "preventivo" | "pronto";
const NOMI: Record<Cosa, string> = { preventivo: "PREVENTIVO", pronto: "PRONTO" };
const SETTE_GIORNI = 7 * 24 * 3600 * 1000;

/** «le 17:00 di oggi» · «domani alle 9:30» · «lun 02/11 alle 9:30» (ora di Roma). */
export function quandoLungo(iso: string): string {
  const d = new Date(iso);
  const giorno = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const ora = d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  const oggi = new Date(); const domani = new Date(Date.now() + 24 * 3600 * 1000);
  if (giorno(d) === giorno(oggi)) return `le ${ora} di oggi`;
  if (giorno(d) === giorno(domani)) return `domani alle ${ora}`;
  return `${d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit" })} alle ${ora}`;
}

function campi(s: Scheda, cosa: Cosa) {
  return cosa === "preventivo"
    ? { il: s.preventivo_prog_il, stato: s.preventivo_prog_stato, esito: s.preventivo_prog_esito, eseguito: s.preventivo_prog_eseguito_il, da: s.preventivo_prog_da }
    : { il: s.pronto_prog_il, stato: s.pronto_prog_stato, esito: s.pronto_prog_esito, eseguito: s.pronto_prog_eseguito_il, da: s.pronto_prog_da };
}

function Riga({ s, cosa, ro, operatore, onScheda }: { s: Scheda; cosa: Cosa; ro: boolean; operatore: string; onScheda: (s: Scheda) => void }) {
  const c = campi(s, cosa);
  const [busy, setBusy] = useState<string | null>(null);
  const [sposta, setSposta] = useState(false);
  const [conVociNuove, setConVociNuove] = useState(true);
  const q = useQuando(c.il);
  const recente = !!c.eseguito && Date.now() - new Date(c.eseguito).getTime() < SETTE_GIORNI;
  const nome = cosa === "preventivo" && s.preventivo_prog_body?.tipo === "aggiornamento" ? "AGGIORNAMENTO PREVENTIVO" : NOMI[cosa];
  const base = `/api/assistenza/schede/${s.id}/${cosa}-programmato`;

  async function chiama(chi: string, fn: () => Promise<void>) {
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    setBusy(chi);
    try { await fn(); } catch (e) { toastErrore(e); } finally { setBusy(null); }
  }
  const annulla = () => { if (confirm(`Annullare l'invio programmato del ${nome.toLowerCase()}?`)) chiama("annulla", async () => {
    onScheda(await fetchAPI(`${base}?operatore=${encodeURIComponent(operatore)}`, { method: "DELETE" })); toast.success(`${nome} programmato annullato`);
  }); };
  const subito = () => { if (confirm(`Inviare ADESSO il ${nome.toLowerCase()} al cliente?`)) chiama("subito", async () => {
    const r: { scheda: Scheda; esito: Esito } = await fetchAPI(`${base}/invia-subito`, { method: "POST", body: JSON.stringify({ operatore }) });
    onScheda(r.scheda);
    toast.success(`${nome} inviato` + (r.esito?.mail ? ` · mail ${r.esito.mail}` : "") + (r.esito?.whatsapp ? ` · WhatsApp ${r.esito.whatsapp}` : ""), { duration: 7000 });
  }); };
  const salvaOrario = () => chiama("sposta", async () => {
    if (!q.programma || q.passato) { toast.error("Scegli un orario nel futuro"); return; }
    onScheda(await fetchAPI(base, { method: "PATCH", body: JSON.stringify({ operatore, programma_il: q.programma, aggiorna_contenuto: cosa === "preventivo" && conVociNuove }) }));
    setSposta(false); toast.success(`${nome} spostato a ${quandoBreve(q.programma)}`);
  });

  if (c.stato === "programmato" && c.il) {
    const canali = cosa === "preventivo" && s.preventivo_prog_body
      ? [s.preventivo_prog_body.invia_mail !== false && "mail", s.preventivo_prog_body.invia_wa !== false && "WhatsApp"].filter(Boolean).join(" + ") : "";
    return (
      <div className="space-y-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
        <div className="flex flex-wrap items-center gap-2">
          <span>⏰ <b>{nome}</b> programmato per {quandoLungo(c.il)}{canali && ` · ${canali}`}{c.da && <span className="text-xs text-muted-foreground"> · da {c.da}</span>}</span>
          {!ro && <span className="ml-auto flex flex-wrap gap-1.5">
            <Button size="xs" disabled={!!busy} onClick={subito}>{busy === "subito" && <Loader2 className="animate-spin" />}Invia subito</Button>
            <Button size="xs" variant="outline" disabled={!!busy} onClick={() => setSposta((x) => !x)}>Modifica orario</Button>
            <Button size="xs" variant="outline" className="border-red-300 text-red-700" disabled={!!busy} onClick={annulla}>Annulla</Button>
          </span>}
        </div>
        {cosa === "preventivo" && s.preventivo_prog_cambiato && (
          <div className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            ⚠️ Le voci / il test in ingresso / la spedizione sono cambiati dopo la programmazione: così com&apos;è <b>NON partirà</b>.
            Con «Modifica orario» → «parte il preventivo di adesso» si aggiorna, oppure annulla e rimandalo.</div>)}
        {sposta && !ro && (
          <QuandoInvio q={q} titolo="Nuovo orario:" senzaAdesso>
            {cosa === "preventivo" && s.preventivo_prog_cambiato && <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={conVociNuove} onChange={(e) => setConVociNuove(e.target.checked)} />parte il preventivo di adesso (voci aggiornate)</label>}
            <Button size="xs" className="ml-auto" disabled={!!busy || !q.programma || q.passato} onClick={salvaOrario}>{busy === "sposta" && <Loader2 className="animate-spin" />}Salva orario</Button>
          </QuandoInvio>)}
      </div>);
  }
  if (c.stato === "in_corso") return <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">⏳ {nome} programmato: in invio adesso…</div>;
  if (c.stato === "errore") return <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-100">⚠️ Il {nome.toLowerCase()} programmato NON è partito{c.eseguito ? ` (${quandoBreve(c.eseguito)})` : ""}: {c.esito}. Mandalo a mano.</div>;
  if (c.stato === "inviato" && recente) return <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">✅ {nome} programmato inviato {c.eseguito ? quandoBreve(c.eseguito) : ""}{c.esito ? ` · ${c.esito}` : ""}</div>;
  if (c.stato === "annullato" && recente && (c.esito || "").startsWith("non inviato")) return <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">⏰ Il {nome.toLowerCase()} programmato {c.esito}.</div>;
  return null;
}

export function InviiProgrammati({ s, ro, operatore, onScheda }: { s: Scheda; ro: boolean; operatore: string; onScheda: (s: Scheda) => void }) {
  return <><Riga s={s} cosa="preventivo" ro={ro} operatore={operatore} onScheda={onScheda} /><Riga s={s} cosa="pronto" ro={ro} operatore={operatore} onScheda={onScheda} /></>;
}
