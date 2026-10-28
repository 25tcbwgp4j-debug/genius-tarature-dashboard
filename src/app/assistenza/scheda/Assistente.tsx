"use client";

// 28/10/2026 (Christian): «🎙 Chiedi a Claude» — si detta (microfono della tastiera iPhone o del pulsante) cosa fare sulla
// scheda: l'assistente PROPONE il piano (riepilogo, azioni, anteprima del preventivo) e si esegue solo con «Conferma».
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { assAzione, eur, type Scheda } from "@/lib/assistenza";
import { Modale } from "./ui";

type Azione = { tipo: "preventivo" | "invia" | "campi" | "nota"; righe?: { t: string; p: number | string; opt?: number | null }[];
  diagnosi?: string | null; note?: string | null; come?: string; messaggio?: string | null; campi?: Record<string, unknown>; testo?: string };
type Piano = { riepilogo: string; domanda: string | null; azioni: Azione[]; anteprima: { testo: string; totale: number; totale_prima: number | null } | null;
  scade: number; firma: string | null };

const NOMI: Record<string, string> = { lavorazione: "lavorazione", comunicazione_cliente: "comunicazione al cliente", note_riparazione: "note di riparazione",
  spedizione_tipo: "spedizione", spedizione_importo: "importo spedizione", totale_lavorazione: "totale lavorazione", pagamento_modo: "pagamento", consegna_modo: "consegna" };

function descrivi(a: Azione): string {
  if (a.tipo === "preventivo") return `Preventivo: ${a.righe?.length || 0} voci${a.diagnosi ? " · test in ingresso aggiornato" : ""}${a.note ? " · note" : ""}`;
  if (a.tipo === "invia") return `INVIO al cliente (mail + WhatsApp): ${a.come === "aggiornamento" ? "aggiornamento preventivo" : "preventivo"}${a.messaggio ? ` · «${a.messaggio}»` : ""}`;
  if (a.tipo === "campi") return "Modifica " + Object.entries(a.campi || {}).map(([k, v]) => `${NOMI[k] || k}: ${String(v).slice(0, 120)}`).join(" · ");
  return `Nota nel registro: ${a.testo}`;
}

type Riconoscimento = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };

export function Assistente({ s, operatore, sporca, onEseguito }: { s: Scheda; operatore: string; sporca: boolean; onEseguito: (n: Scheda) => void }) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const [piano, setPiano] = useState<Piano | null>(null);
  const [busy, setBusy] = useState(false);
  const [ascolto, setAscolto] = useState(false);
  const rec = useRef<Riconoscimento | null>(null);
  const SR = typeof window !== "undefined" ? ((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => Riconoscimento) | undefined : undefined;

  useEffect(() => () => rec.current?.stop(), []);

  function microfono() {
    if (!SR) { toast.info("Usa il microfono della tastiera per dettare"); return; }
    if (ascolto) { rec.current?.stop(); return; }
    const r = new SR(); r.lang = "it-IT"; r.interimResults = false; r.continuous = true;
    r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0].transcript).join(" "); setTesto((p) => (p ? p.trimEnd() + " " : "") + t.trim()); };
    r.onend = () => setAscolto(false);
    rec.current = r; r.start(); setAscolto(true);
  }
  async function prepara() {
    if (sporca) { toast.error("Prima salva le modifiche della scheda: l'assistente lavora sulla scheda salvata"); return; }
    setBusy(true); setPiano(null);
    try { setPiano(await assAzione(s.id, "assistente", { richiesta: testo, operatore }) as Piano); } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  async function esegui() {
    if (!piano?.firma) return;
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    const invio = piano.azioni.some((a) => a.tipo === "invia");
    if (invio && !confirm("Il piano INVIA al cliente mail e WhatsApp. Confermi?")) return;
    setBusy(true);
    try {
      const r = await assAzione(s.id, "assistente/esegui", { operatore, azioni: piano.azioni, scade: piano.scade, firma: piano.firma }) as { fatto: string[]; scheda: Scheda };
      toast.success("Fatto: " + r.fatto.join(" · "));
      onEseguito(r.scheda); setAperto(false); setPiano(null); setTesto("");
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <>
      <Button size="xs" variant="outline" className="border-violet-400 text-violet-800 dark:text-violet-200" onClick={() => setAperto(true)}
        title="Detta o scrivi cosa fare su questa scheda (preventivo, lavorazione, invio): l'assistente propone, tu confermi"><Sparkles />Chiedi a Claude</Button>
      {aperto && (
        <Modale titolo={`🎙 Chiedi a Claude — scheda ${s.sigla}`} onClose={() => { rec.current?.stop(); setAperto(false); }} largo
          piedi={<>
            <Button variant="outline" onClick={() => setAperto(false)}>Chiudi</Button>
            {piano?.firma ? <Button disabled={busy} onClick={esegui}>{busy && <Loader2 className="animate-spin" />}Conferma ed esegui</Button>
              : <Button disabled={busy || testo.trim().length < 3} onClick={prepara}>{busy && <Loader2 className="animate-spin" />}Prepara</Button>}</>}>
          <div className="space-y-3">
            <div className="relative">
              <textarea className="min-h-28 w-full rounded-md border bg-background p-2 pr-11 text-base" autoFocus value={testo}
                placeholder="Es.: aggiungi la 2ª ipotesi sostituzione scheda logica ufficiale a 849 scontato da 940 più Touch ID 99, poi manda l'aggiornamento"
                onChange={(e) => { setTesto(e.target.value); setPiano(null); }} />
              <button type="button" onClick={microfono} title="Detta" aria-label="Detta"
                className={`absolute right-2 top-2 rounded-full p-2 ${ascolto ? "animate-pulse bg-red-600 text-white" : "bg-muted"}`}><Mic className="size-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">Nulla cambia finché non premi «Conferma ed esegui». I prezzi non detti l&apos;assistente li prende dai prezzi ufficiali o te li chiede.</p>
            {piano && (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                {piano.domanda && <div className="rounded bg-amber-100 p-2 font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">❓ {piano.domanda}</div>}
                {piano.riepilogo && <p>{piano.riepilogo}</p>}
                {piano.azioni.length > 0 && <ul className="list-disc space-y-0.5 pl-5">{piano.azioni.map((a, i) => <li key={i} className={a.tipo === "invia" ? "font-semibold text-red-700" : ""}>{descrivi(a)}</li>)}</ul>}
                {piano.anteprima && (
                  <div className="rounded bg-muted/60 p-2">
                    <div className="mb-1 text-xs font-semibold">Anteprima preventivo · totale {eur(piano.anteprima.totale)}{piano.anteprima.totale_prima != null ? ` (prima ${eur(piano.anteprima.totale_prima)})` : ""}</div>
                    <pre className="whitespace-pre-wrap text-xs">{piano.anteprima.testo}</pre>
                  </div>)}
                {!piano.firma && !piano.domanda && <p className="text-xs text-muted-foreground">Nessuna azione proposta: riformula la richiesta.</p>}
              </div>)}
          </div>
        </Modale>)}
    </>
  );
}
