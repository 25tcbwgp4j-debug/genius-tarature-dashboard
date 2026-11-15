"use client";

// Finestre della scheda (05/10/2026): invio (ricevuta, preventivo, aggiornamenti) sempre mail + WhatsApp, risposta del
// cliente, PRONTO (ritiro in negozio / per corriere), pagato, consegna, corriere, stesso modello.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, Mail, MessageCircle, Printer, Send, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { codiceErrore, dettaglioErrore, eServeTitolare, toastErrore } from "@/lib/errori";
import { useChiaveIncasso } from "@/lib/useChiaveIncasso";
import { headerIdempotenza } from "@/lib/idempotenza";
import { assAnteprimaMail, assAzione, assProntoControlli, type ProntoControlli, assDocUrl, assStessoModello, CANALI_OK_SCRITTO, dataOra, eur, lordoPaypal, pagaFineMese, type DocPdf, type PaypalFee, type Esito, type Scheda, type SchedaBreve } from "@/lib/assistenza";
import { blocchi, ipotesiDelBlocco, isActive, parseEstimate, rowTotal, type EstimateLine } from "@/lib/assistenza-preventivo";
import { copia } from "./Comunicazioni";
import { Campo, Modale, Pill, Scelta, area, campo } from "./ui";
import { conferma } from "@/components/Conferma";

// ---------------------------------------------------------------------------
const TITOLI_PDF: Record<string, string> = { ricevuta: "ricevuta d'ingresso", preventivo: "preventivo", pronto: "pronto per il ritiro / la spedizione",
  consuntivo: "consuntivo con bonifico", rifiutato: "preventivo rifiutato (test, lavorazione, restituzione)", auto: "scheda dello stato attuale" };

function Anteprima({ s, corpo }: { s: Scheda; corpo: Record<string, unknown> }) {
  const [a, setA] = useState<{ oggetto: string; corpo: string; prova: boolean; destinatario: string | null; whatsapp: string; documento?: DocPdf | null } | null>(null);
  const chiave = JSON.stringify(corpo);
  useEffect(() => {
    const t = setTimeout(() => assAnteprimaMail(s.id, JSON.parse(chiave)).then(setA).catch(() => setA(null)), 250);
    return () => clearTimeout(t);
  }, [s.id, chiave]);
  if (!a) return <div className="text-xs text-muted-foreground">anteprima…</div>;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="rounded-lg border bg-muted/30 p-2.5 text-sm">
        <div className="mb-1 flex items-center gap-1.5 font-semibold"><Mail className="size-3.5" />{a.documento ? "Mail con PDF" : "Mail (senza PDF)"}</div>
        {/* 26/10/2026 (Christian, 63118): si vede SEMPRE quale scheda PDF parte allegata, calcolata con i valori del pannello */}
        {a.documento && (
          <div className="mb-1 flex flex-wrap items-center gap-1.5">📎 Allegato: <b>{TITOLI_PDF[a.documento] || a.documento}</b>
            <button type="button" className="rounded border bg-white px-1.5 py-0.5 font-medium text-primary hover:bg-muted dark:bg-gray-900"
              onClick={() => window.open(`${assDocUrl(s.id, a.documento as DocPdf)}&${new URLSearchParams(Object.fromEntries(
                Object.entries(corpo).filter(([k, v]) => v != null && v !== "" && ["consegna_modo", "consegna_corriere", "pagamento_modo", "totale_lavorazione", "esito", "indirizzo_spedizione"].includes(k)).map(([k, v]) => [k, String(v)])))}`, "_blank")}>
              Vedi il PDF</button>
          </div>
        )}
        <div>A: <b>{a.destinatario || "— (manca l'email)"}</b>{a.prova && <span className="text-amber-800"> · PROVA: non va al cliente ({s.email || "senza email"})</span>}</div>
        <div>Oggetto: <b>{a.oggetto}</b></div>
        {/* 15/11/2026 (piano 0.2): anteprima intera e leggibile (prima 192px a 12px: se ne leggeva un terzo) */}
        <pre className="mt-1 whitespace-pre-wrap font-sans text-sm leading-relaxed">{a.corpo}</pre>
      </div>
      <div className="rounded-lg border bg-emerald-50/40 p-2.5 text-sm dark:bg-emerald-950/20">
        <div className="mb-1 flex items-center gap-1.5 font-semibold"><MessageCircle className="size-3.5" />WhatsApp</div>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{a.whatsapp}</pre>
        <div className="mt-1 text-[11px] text-muted-foreground">{s.prova ? "Scheda di prova: il WhatsApp non parte, resta da mandare a mano." : !s.wa_linea_attiva ? "Linea 334 in sola lettura: il WhatsApp non parte, resta da mandare a mano (Copia testo / Apri chat)." : "Parte dalla linea Apple 334 986 7400."}</div>
      </div>
    </div>
  );
}

/** 15/11/2026 (piano 5.4): esito.pronto_non_comunicato — la scheda è PRONTO ma il cliente non ha ricevuto nulla */
export const MSG_PRONTO_NON_COMUNICATO = "Il PRONTO non è arrivato al cliente (né mail né WhatsApp): avvisalo per iscritto";
function EsitoInvio({ e }: { e: Esito }) {
  return (
    <div className="space-y-2">
    {e.pronto_non_comunicato && (
      <div role="alert" data-testid="pronto-non-comunicato" className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-semibold text-red-950 dark:bg-red-950/40 dark:text-red-50">
        ⛔ {MSG_PRONTO_NON_COMUNICATO}.
        <span className="mt-1 block text-xs font-normal">La scheda è già PRONTO. Correggi email o cellulare e rimanda, oppure scrivigli tu (mail o WhatsApp).</span>
      </div>)}
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-emerald-600" />{e.programmato ? `Programmato: parte da solo il ${e.programmato}` : "Fatto"}</div>
      {e.mail && <div><Mail className="mr-1 inline size-3.5" />Mail: {e.mail}</div>}
      {e.whatsapp && <div><MessageCircle className="mr-1 inline size-3.5" />WhatsApp: {e.whatsapp}</div>}
      {e.whatsapp_testo && e.whatsapp && !e.whatsapp.startsWith("in coda") && (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => copia(e.whatsapp_testo || "")}><Copy />Copia testo</Button>
          {e.whatsapp_link && <a className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-xs hover:bg-muted" href={e.whatsapp_link} target="_blank" rel="noreferrer"><MessageCircle className="size-3.5" />Apri chat</a>}
        </div>
      )}
    </div>
    </div>
  );
}

/** 15/11/2026 (piano 5.3/5.4): FORZATURA DEL TITOLARE — al titolare il motivo (almeno 5 caratteri, resta nel registro) e
 *  «Procedi comunque»; all'operatore il messaggio chiaro che serve il titolare. */
export const MOTIVO_MIN = 5;
export function ForzaturaTitolare({ admin, perche, motivo, setMotivo, onProcedi, busy, segnaposto }: {
  admin: boolean; perche: string; motivo: string; setMotivo: (m: string) => void; onProcedi?: () => void; busy?: boolean; segnaposto?: string;
}) {
  return (
    <div role="alert" data-testid="forzatura-titolare" className="space-y-2 rounded-lg border-2 border-red-500 bg-red-50 p-3 text-sm text-red-950 dark:bg-red-950/30 dark:text-red-100">
      <div className="font-semibold">⛔ {perche}</div>
      {admin ? <>
        <Campo label={`Sei il titolare: scrivi il motivo (almeno ${MOTIVO_MIN} caratteri, resta nel registro della scheda) *`}>
          <textarea className={area} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={segnaposto || "es. cliente abituale, paga a fine mese con bonifico"} /></Campo>
        {onProcedi && <Button variant="outline" className="border-red-400 text-red-800 dark:text-red-200" disabled={busy || motivo.trim().length < MOTIVO_MIN} onClick={onProcedi} data-testid="procedi-comunque">
          {busy && <Loader2 className="animate-spin" />}Procedi comunque</Button>}
      </> : <p className="font-medium">Serve il titolare: solo lui può procedere, scrivendo il motivo. Chiedigli di farlo dal suo accesso.</p>}
    </div>
  );
}

function Canali({ mail, wa, setMail, setWa }: { mail: boolean; wa: boolean; setMail: (b: boolean) => void; setWa: (b: boolean) => void }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={mail} onChange={(e) => setMail(e.target.checked)} /><Mail className="size-4" />Mail con PDF</label>
      <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={wa} onChange={(e) => setWa(e.target.checked)} /><MessageCircle className="size-4" />WhatsApp</label>
    </div>
  );
}

// ---------------------------------------------------------------------------
/** 15/11/2026 (piano 1.3, «sempre ok scritto»): dove il cliente ha dato l'ok per iscritto. Il telefono non vale.
 *  Il titolare può registrare l'accettazione senza ok scritto, con il motivo (resta nel registro). */
const SENZA_OK = "senza";
function SceltaOk({ canale, setCanale, admin, motivo, setMotivo, evidenzia }: {
  canale: string; setCanale: (c: string) => void; admin: boolean; motivo: string; setMotivo: (m: string) => void; evidenzia?: boolean;
}) {
  const opz: [string, string][] = [...CANALI_OK_SCRITTO, ...(admin ? [[SENZA_OK, "Nessun ok scritto (titolare)"] as [string, string]] : [])];
  return (
    <div className={`space-y-2 rounded-lg border p-2.5 ${evidenzia && !canale ? "border-2 border-red-500" : ""}`}>
      <div className="text-xs font-medium text-muted-foreground">Dove ha accettato il cliente, per iscritto? *</div>
      <Scelta valore={canale || null} opzioni={opz.map(([k, l]) => [k, l])} onChange={setCanale} />
      {canale === SENZA_OK && <Campo label="Motivo (senza ok scritto del cliente, resta nel registro) *">
        <textarea className={area} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="es. garanzia nostra concordata con il titolare" /></Campo>}
      <p className="text-[11px] text-muted-foreground">Il telefono non vale come ok: si chiede la conferma per mail o WhatsApp.</p>
    </div>
  );
}
/** Il corpo per il server: canale dell'ok scritto oppure (solo titolare) il motivo. */
function corpoOk(canale: string, motivo: string): Record<string, unknown> {
  return canale === SENZA_OK ? { motivo_accettazione: motivo.trim() } : canale ? { canale } : {};
}
const okValido = (canale: string, motivo: string) => !!canale && (canale !== SENZA_OK || motivo.trim().length >= 5);
const MSG_OK_MANCANTE = "Serve l'ok del cliente PER ISCRITTO: scegli dove ha accettato (mail, WhatsApp, online, firmato in negozio). Il telefono non vale.";

// ---------------------------------------------------------------------------
export type TipoInvio = "ricevuta" | "preventivo" | "aggiornamento" | "aggiornamento_riparazione" | "trova";
const TITOLI: Record<TipoInvio, string> = { ricevuta: "Ricevuta d'ingresso", preventivo: "INVIA PREVENTIVO", aggiornamento: "INVIA AGGIORNAMENTO PREVENTIVO",
  aggiornamento_riparazione: "Aggiornamento riparazione", trova: "Istruzioni «Trova il mio» (abilitare la riparazione)" };

/** Invio al cliente: mail + WhatsApp SEMPRE selezionati (si possono togliere solo apposta). */
export function DialogoInvio({ s, tipo, onClose, onInvia, admin = false }: { s: Scheda; tipo: TipoInvio; onClose: () => void; onInvia: (b: Record<string, unknown>) => Promise<Esito | null>; admin?: boolean }) {
  // 15/11/2026 (piano 1.2): 409 «preventivo_testi» → elenco di cosa correggere; il titolare può inviare comunque con il motivo
  const [problemi, setProblemi] = useState<string[] | null>(null);
  const [motivoTesti, setMotivoTesti] = useState("");
  const [mail, setMail] = useState(true);
  const [wa, setWa] = useState(!s.cliente_no_whatsapp);   // 26/10/2026: cliente «niente WhatsApp» → spenta
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [fatto, setFatto] = useState<Esito | null>(null);
  const conNota = tipo === "aggiornamento" || tipo === "aggiornamento_riparazione";
  // 30/10/2026 (Christian): il PREVENTIVO (e l'aggiornamento) si manda subito o si PROGRAMMA, come il pronto e le Tarature
  const programmabile = tipo === "preventivo" || tipo === "aggiornamento";
  const q = useQuando();
  const programma = programmabile ? q.programma : null;
  async function invia(forza = false) {
    if (tipo === "aggiornamento_riparazione" && !nota.trim()) { toast.error("Scrivi cosa comunicare al cliente"); return; }
    if (forza && motivoTesti.trim().length < 5) { toast.error("Scrivi il motivo per cui il preventivo parte lo stesso"); return; }
    setBusy(true);
    try {
      const r = await onInvia({ invia_mail: mail, invia_wa: wa, nota, ...(programma ? { programma_il: programma } : {}),
        ...(forza ? { forza_testi: true, motivo_testi: motivoTesti.trim() } : {}) });
      if (r) { setFatto(r); setProblemi(null); }
    } catch (e) {
      if (codiceErrore(e) === "preventivo_testi") {
        const p = dettaglioErrore(e).problemi;
        setProblemi(Array.isArray(p) && p.length ? p.map(String) : [(e as Error).message]);
      } else toastErrore(e);
    } finally { setBusy(false); }
  }
  return (
    <Modale titolo={`${TITOLI[tipo]} — scheda ${s.sigla}`} onClose={onClose} largo
      piedi={fatto ? <Button onClick={onClose}>Chiudi</Button> : <><Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button disabled={busy || (!mail && !wa && (!programmabile || q.quando !== "adesso")) || (programmabile && q.quando !== "adesso" && (!programma || q.passato))} onClick={() => invia()}>{busy ? <Loader2 className="animate-spin" /> : <Send />}
          {programma ? `PROGRAMMA l'invio (${quandoBreve(programma)})` : mail && wa ? "Invia mail + WhatsApp" : mail ? "Invia solo mail" : wa ? "Solo WhatsApp" : "Registra senza inviare"}</Button></>}>
      {fatto ? <EsitoInvio e={fatto} /> : (
        <div className="space-y-3">
          {problemi && (
            <div className="space-y-2 rounded-lg border-2 border-red-500 bg-red-50 p-3 text-sm text-red-950 dark:bg-red-950/30 dark:text-red-100" role="alert">
              <div className="font-semibold">⛔ Il preventivo non parte così: correggi le voci (linguetta Preventivo) e riprova</div>
              <ul className="list-disc space-y-0.5 pl-5">{problemi.map((p, i) => <li key={i}>{p}</li>)}</ul>
              {admin ? <div className="space-y-1.5 border-t border-red-300 pt-2">
                <Campo label="Solo il titolare: motivo per inviarlo comunque (resta nel registro) *">
                  <textarea className={area} rows={2} value={motivoTesti} onChange={(e) => setMotivoTesti(e.target.value)} placeholder="es. voce concordata così con il cliente" /></Campo>
                <Button variant="outline" className="border-red-400 text-red-800 dark:text-red-200" disabled={busy || motivoTesti.trim().length < 5} onClick={() => invia(true)}>
                  {busy && <Loader2 className="animate-spin" />}Invia comunque</Button>
              </div> : <p className="text-xs">Solo il titolare può inviarlo comunque.</p>}
            </div>)}
          {(tipo === "preventivo" || tipo === "aggiornamento") && <>
            <p className="text-sm text-muted-foreground">Controlla il PDF qui sotto: è quello che riceve il cliente. Si salva il preventivo, se ne tiene la copia nello storico e si manda.{" "}
              <a className="font-medium text-primary underline" href={assDocUrl(s.id, "preventivo")} target="_blank" rel="noreferrer">Apri a schermo intero</a></p>
            {/* 24/10/2026: anteprima del PDF direttamente nella finestra d'invio (la bozza è già salvata all'apertura) */}
            <iframe title="Anteprima PDF del preventivo" src={assDocUrl(s.id, "preventivo")} className="h-[60vh] w-full rounded-lg border bg-white" />
          </>}
          {conNota && <Campo label={tipo === "aggiornamento" ? "Nota nel messaggio (facoltativa)" : "Cosa comunicare al cliente *"}>
            <textarea className={area} rows={2} autoFocus value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder={tipo === "aggiornamento" ? "es. TROVA IL MIO IPHONE ATTIVO DA DISABILITARE" : "es. il ricambio arriva giovedì, la riparazione sarà pronta venerdì"} /></Campo>}
          <Anteprima s={s} corpo={{ tipo, nota }} />
          <Canali mail={mail} wa={wa} setMail={setMail} setWa={setWa} />
          {programmabile && <QuandoInvio q={q} titolo="Quando inviarlo al cliente:">
            {programma && <span className="w-full text-xs text-muted-foreground">Il preventivo resta salvato così com&apos;è adesso (voci, test in ingresso, spedizione{conNota ? ", nota" : ""}) e parte da solo all&apos;ora scelta ({[mail && "mail", wa && "WhatsApp"].filter(Boolean).join(" + ") || "scegli almeno un canale"}). Sulla scheda: Invia subito · Modifica orario · Annulla. Se nel frattempo lo mandi a mano o cambi le voci, non parte.</span>}
          </QuandoInvio>}
        </div>
      )}
    </Modale>
  );
}

// ---------------------------------------------------------------------------
/** Risposta del cliente: quale ipotesi accetta (+ eventuali aggiungibili), oppure rifiuta. */
export function DialogoEsito({ s, righe, onClose, onEsito, admin = false }: { s: Scheda; righe: EstimateLine[]; onClose: () => void; onEsito: (b: Record<string, unknown>) => Promise<boolean>; admin?: boolean }) {
  const b = Math.max(...blocchi(righe));
  const ips = ipotesiDelBlocco(righe, b);
  const alt = ips.filter((x) => !x.agg);
  const agg = ips.filter((x) => x.agg);
  const [opt, setOpt] = useState<number | null>(alt.find((x) => x.scelta)?.opt ?? alt[0]?.opt ?? null);
  const [prese, setPrese] = useState<number[]>([]);
  // 04/11/2026 (Christian, 63313): il cliente vuole solo le voci fisse, senza ipotesi: riparazione parziale
  const [soloFisse, setSoloFisse] = useState(false);
  const [busy, setBusy] = useState(false);
  // 05/10/2026 (§10.5): da dove è arrivata la risposta (l'accettazione online arriva da sola dal link del cliente)
  // 15/11/2026 (piano 1.3): nessuna scelta di partenza e niente «telefono»: per ACCETTATO serve l'ok scritto
  const [canale, setCanale] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  // 15/11/2026 (piano 2.6): RICHIESTA DEL CLIENTE insieme alla risposta (es. «stress test prima della consegna»):
  // va nelle note di riparazione e arriva come messaggio al tecnico
  const [richiesta, setRichiesta] = useState("");
  const rc = richiesta.trim() ? { richiesta_cliente: richiesta.trim() } : {};
  const fisse = righe.filter((r) => (r.b ?? 0) === b && r.opt == null).reduce((t, r) => t + rowTotal(r), 0);
  const tot = fisse + (soloFisse ? 0 : alt.find((x) => x.opt === opt)?.totale || 0) + agg.filter((x) => prese.includes(x.opt)).reduce((t, x) => t + x.totale, 0);
  // a € 0 (garanzia, cortesia) l'ok scritto non serve
  const serveOk = tot > 0.009 || Number(s.preventivo_totale || 0) > 0.009;
  async function vai(esito: "accettato" | "rifiutato", tutto = false) {
    if (esito === "accettato" && serveOk && !okValido(canale, motivo)) { setErrore(canale === SENZA_OK ? "Scrivi il motivo (almeno qualche parola)." : MSG_OK_MANCANTE); return; }
    setBusy(true); setErrore(null);
    const ok = corpoOk(canale, motivo);
    try { if (await onEsito(esito === "accettato" ? { esito, blocco: b, ...(soloFisse ? { solo_fisse: true } : { ipotesi: opt }), aggiunte: prese, ...ok, ...rc }
      : { esito, blocco: b, ...(canale && canale !== SENZA_OK ? { canale } : {}), tutto, ...rc })) onClose(); }
    catch (e) {
      const c = codiceErrore(e);
      setErrore(c === "ok_cliente_mancante" ? MSG_OK_MANCANTE : c === "accettazione_da_esito" ? "L'accettazione va registrata da qui indicando il canale dell'ok scritto (mail, WhatsApp, online, firmato in negozio)." : (e as Error).message);
    } finally { setBusy(false); }
  }
  // 28/10/2026 (Christian, 63224): con un preventivo AGGIUNTIVO il rifiuto va detto esattamente: solo l'aggiuntivo (resta
  // valido quello già accettato) oppure tutto (il cliente non vuole più nessuna lavorazione)
  const totAcc = righe.filter((r) => (r.b ?? 0) < b && isActive(r)).reduce((t, r) => t + rowTotal(r), 0);
  return (
    <Modale titolo={`Risposta del cliente${b > 0 ? " al preventivo aggiuntivo" : ""} — scheda ${s.sigla}`} onClose={onClose}
      piedi={b > 0 ? <>
        <Button variant="outline" className="mr-auto text-red-700" disabled={busy} onClick={async () => { if (await conferma({ titolo: "Il cliente rifiuta TUTTO?", testo: "Anche il preventivo già accettato. La scheda diventa «rifiutato · da restituire».", ok: "Rifiuta tutto", pericolo: true })) vai("rifiutato", true); }}>Rifiuta TUTTO</Button>
        <Button variant="outline" className="border-red-300 text-red-700" disabled={busy} onClick={() => vai("rifiutato")}>Rifiuta solo l&apos;aggiuntivo</Button>
        <Button disabled={busy || (alt.length > 0 && opt == null && !soloFisse)} onClick={() => vai("accettato")}>{busy && <Loader2 className="animate-spin" />}Accetta l&apos;aggiuntivo · + {eur(tot)}</Button></> : <>
        <Button variant="outline" className="mr-auto text-red-700" disabled={busy} onClick={() => vai("rifiutato")}>RIFIUTATO</Button>
        <Button disabled={busy || (alt.length > 0 && opt == null && !soloFisse)} onClick={() => vai("accettato")}>{busy && <Loader2 className="animate-spin" />}ACCETTATO · {eur(tot)}</Button></>}>
      <div className="space-y-2">
        {b > 0 && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
          ✓ <b>Preventivo già accettato · {eur(totAcc)}</b>: resta valido in ogni caso, salvo «Rifiuta TUTTO».<br />
          Qui sotto solo il <b>preventivo aggiuntivo</b>: «Rifiuta solo l&apos;aggiuntivo» toglie le sue voci e la scheda prosegue con la lavorazione già accettata.</div>}
        {alt.map((x) => (
          <label key={x.opt} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${!soloFisse && opt === x.opt ? "border-primary bg-primary/5" : ""}`}>
            <input type="radio" className="mt-1" checked={!soloFisse && opt === x.opt} onChange={() => { setOpt(x.opt); setSoloFisse(false); }} />
            <span className="flex-1"><b>{x.n}ª ipotesi</b><br />{x.righe.map((y) => y.r.t).join(" + ")}</span><b className="tabular-nums">{eur(x.totale)}</b>
          </label>
        ))}
        {alt.length > 0 && fisse > 0 && (
          <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${soloFisse ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : ""}`}>
            <input type="radio" className="mt-1" checked={soloFisse} onChange={() => setSoloFisse(true)} />
            <span className="flex-1"><b>Solo la voce fissa</b><br />Nessuna ipotesi: riparazione parziale</span><b className="tabular-nums">{eur(fisse)}</b>
          </label>
        )}
        {agg.map((x) => (
          <label key={x.opt} className="flex cursor-pointer items-start gap-2 rounded-lg border border-dashed p-2.5 text-sm">
            <input type="checkbox" className="mt-1" checked={prese.includes(x.opt)} onChange={(e) => setPrese((p) => (e.target.checked ? [...p, x.opt] : p.filter((y) => y !== x.opt)))} />
            <span className="flex-1"><b>{x.n}ª ipotesi · aggiungibile</b><br />{x.righe.map((y) => y.r.t).join(" + ")}</span><b className="tabular-nums">+ {eur(x.totale)}</b>
          </label>
        ))}
        <SceltaOk canale={canale} setCanale={(c) => { setCanale(c); setErrore(null); }} admin={admin} motivo={motivo} setMotivo={setMotivo} evidenzia={!!errore} />
        {!serveOk && <p className="text-xs text-muted-foreground">Preventivo a € 0 (garanzia, cortesia): l&apos;ok scritto non è obbligatorio.</p>}
        {errore && <div role="alert" className="rounded-md border-2 border-red-500 bg-red-50 px-2.5 py-2 text-sm font-semibold text-red-900 dark:bg-red-950/30 dark:text-red-100">⛔ {errore}</div>}
        <label className="block pt-1">
          <span className="mb-0.5 block text-xs font-medium text-muted-foreground">📝 Richiesta del cliente (facoltativa): cosa chiede sul lavoro, arriva al tecnico</span>
          <textarea className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm" rows={2} value={richiesta} onChange={(e) => setRichiesta(e.target.value)}
            placeholder="es. dopo l'intervento stress test prolungato e conferma dell'esito prima della consegna" />
        </label>
        <p className="text-xs text-muted-foreground">Con «ACCETTATO» la scheda va IN RIPARAZIONE (poi si assegna al tecnico) e la lavorazione effettuata si compila con l&apos;ipotesi scelta e il suo importo.{s.spedizione_tipo && s.spedizione_tipo !== "nessuna" ? ` Spedizione ${eur(s.spedizione_importo)} a parte nel totale.` : ""}</p>
      </div>
    </Modale>
  );
}

// ---------------------------------------------------------------------------
/** PRONTO: ritiro in negozio o per corriere (nostro o del cliente), pagamento, totale, esito; poi mail + WhatsApp. */
export function DialogoPronto({ s, lavorazione, totale, onClose, onInvia, paypalFee, onStampaRiconsegna }: {
  s: Scheda; lavorazione: string; totale: number | string | null; onClose: () => void; onInvia: (b: Record<string, unknown>) => Promise<Esito | null>;
  /** 14/11/2026 (Christian, 63414): Mac con OpenCore → dopo il PRONTO si propone il foglio di riconsegna da far firmare */
  onStampaRiconsegna?: () => void | Promise<void>;
  /** 01/11/2026: commissione PayPal vera (da /config) al posto del +3% */
  paypalFee?: PaypalFee;
}) {
  const [cons, setCons] = useState<"ritiro" | "spedizione">((s.consegna_modo as "ritiro") || (s.spedizione_tipo === "ar" || s.spedizione_tipo === "solo_ritorno" ? "spedizione" : "ritiro"));
  const [corr, setCorr] = useState<"noi" | "cliente">(s.consegna_corriere || "noi");
  // 28/10/2026 (Christian, 63188 Medianet): chi paga sempre con PayPal (rubrica) ha già PayPal scelto
  const [pag, setPag] = useState(s.pagamento_modo || s.pagamento_abituale || "");
  // 27/10/2026 (Christian, 63182): totale ed esito dallo STESSO calcolo del backend (totale_dovuto / esito_pronto): le schede
  // FileMaker hanno i totali vuoti e l'esito «DA ULTIMARE» → prima il pronto diceva «nulla da pagare» e il PDF «non conclusa»
  const vuoto = (x: unknown) => x === null || x === undefined || String(x).trim() === "";
  const totIniziale = !vuoto(totale) ? totale : !vuoto(s.totale_lavorazione) ? s.totale_lavorazione : (s.totale_dovuto ?? "");
  const ricavato = vuoto(totale) && vuoto(s.totale_lavorazione) && vuoto(s.preventivo_totale) && Number(s.totale_dovuto || 0) > 0;
  // 15/11/2026 (piano 0.2): totale scritto all'italiana («89,00»), non «89»
  const [tot, setTot] = useState(vuoto(totIniziale) ? "" : (Number.isFinite(Number(totIniziale)) ? Number(totIniziale).toFixed(2).replace(".", ",") : String(totIniziale)));
  const [esito, setEsito] = useState(s.esito_pronto || (s.esito === "EFFETTUATO" || s.esito === "NEGATIVO" ? s.esito : (s.preventivo_esito === "rifiutato" ? "NEGATIVO" : "EFFETTUATO")));
  const [ind, setInd] = useState(s.indirizzo_spedizione || "");
  // 11/11/2026 (Christian, 63354): NOTA PER IL CLIENTE sull'esito, scritta dal tecnico all'esito e correggibile qui
  const [notaCli, setNotaCli] = useState(s.nota_cliente_esito || "");
  const [mail, setMail] = useState(true);
  const [wa, setWa] = useState(!s.cliente_no_whatsapp);   // 26/10/2026: cliente «niente WhatsApp» → spenta
  const [busy, setBusy] = useState(false);
  const [fatto, setFatto] = useState<Esito | null>(null);
  // 26/10/2026 (Christian, 63226): come per le Tarature, il pronto / consuntivo si manda subito o si PROGRAMMA
  // 26/10/2026: stesse scelte delle Tarature — Adesso · Oggi alle… · Domani alle… · Data e ora a scelta
  const q = useQuando();
  const { quando, programma, passato } = q;
  // 15/11/2026 (piano 0.2, caso 63407): controlli del backend — blocchi, notifiche aperte, richieste del cliente, attesa,
  // pronto già inviato, versioni di macOS diverse, proposta fuori orario (primo giorno lavorativo alle 9:30)
  const [ctl, setCtl] = useState<ProntoControlli | null>(null);
  const [ctlErr, setCtlErr] = useState(false);
  const [confLav, setConfLav] = useState(false);
  const [confDiv, setConfDiv] = useState(false);
  const [forza, setForza] = useState(false);
  const [motivo, setMotivo] = useState("");
  useEffect(() => {
    assProntoControlli(s.id).then((c) => {
      setCtl(c);
      if (c.fuori_orario) {   // D7: fuori orario si propone da solo di programmarlo (si può tornare ad «Adesso»)
        const d = new Date(c.fuori_orario.proposta);
        q.setDataLibera(d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }));
        q.setOraLibera("09:30");
        q.setQuando("libero");
      }
    }).catch(() => setCtlErr(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id]);
  const duri = (ctl?.blocchi || []).filter((b) => b.codice !== "conferma" && b.codice !== "divergenza");
  const serveConf = (ctl?.blocchi || []).some((b) => b.codice === "conferma");
  const serveDiv = (ctl?.divergenze || []).length > 0;
  const bloccato = !ctl || (duri.length > 0 && !(forza && motivo.trim().length >= 5)) || (serveConf && !confLav) || (serveDiv && !confDiv);
  // 26/10/2026 (Christian, 63118): a costo zero niente pagamento da chiedere (né bonifico, né consuntivo, né fattura)
  // «1.197,50» e «1197.50» sono lo stesso importo (prima «1.197.50» = 0 = gratis)
  const totNum = (() => { const t = String(tot).trim(); const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t; return Number(n) || 0; })();
  const gratis = totNum - (Number(s.acconto) || 0) <= 0.009 || !!s.pagata;
  const pagEff = gratis ? "" : (pag || (cons === "spedizione" ? "bonifico" : ""));
  const corpo = useMemo(() => ({ consegna_modo: cons, pagamento_modo: pagEff, totale_lavorazione: String(tot).trim() === "" ? null : totNum, indirizzo_spedizione: ind,
    consegna_corriere: cons === "spedizione" ? corr : "", esito, nota_cliente_esito: notaCli.trim() }), [cons, pagEff, tot, totNum, ind, corr, esito, notaCli]);
  async function invia() {
    setBusy(true);
    try {
      const r = await onInvia({ ...corpo, consegna_corriere: cons === "spedizione" ? corr : null, esito, pagamento_modo: pagEff || "", invia_mail: mail, invia_wa: wa,
        ...(programma ? { programma_il: programma } : {}),
        ...(confLav ? { conferma_lavorazione: true } : {}), ...(confDiv ? { divergenza_confermata: true } : {}),
        ...(forza && duri.length ? { forza: true, forza_motivo: motivo.trim() } : {}) });
      if (r) setFatto(r);
    } finally { setBusy(false); }
  }
  return (
    <Modale titolo={`PRONTO — scheda ${s.sigla}`} onClose={onClose} largo
      piedi={fatto ? <Button onClick={onClose}>Chiudi</Button> : <><Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button disabled={busy || bloccato || (quando !== "adesso" && (!programma || passato))} onClick={invia}>{busy && <Loader2 className="animate-spin" />}{programma ? `PROGRAMMA il pronto (${new Date(programma).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})` : `PRONTO${mail || wa ? " e avvisa il cliente" : ""}`}</Button></>}>
      {fatto ? <div className="space-y-3"><EsitoInvio e={fatto} />
        {onStampaRiconsegna && <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="text-sm font-semibold">🖨 Mac con OpenCore: stampa il FOGLIO DI RICONSEGNA (avvertenza di NON installare aggiornamenti) e fallo firmare al cliente al ritiro.</span>
          <Button size="sm" onClick={() => void onStampaRiconsegna()}><Printer />Stampa il foglio di riconsegna</Button>
        </div>}</div> : (
        <div className="space-y-3">
          {!ctl && !ctlErr && <div className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline size-4 animate-spin" />Controllo la scheda…</div>}
          {ctlErr && <div className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm font-semibold text-red-950 dark:bg-red-950/40 dark:text-red-50">Non riesco a controllare la scheda (notifiche, attesa del cliente): chiudi e riapri il dialogo. Il PRONTO resta spento.</div>}
          {ctl && (duri.length > 0 || ctl.notifiche_aperte.length > 0 || ctl.richieste_cliente.length > 0) && (
            <div className="space-y-1.5 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm text-red-950 dark:bg-red-950/40 dark:text-red-50">
              {duri.map((b, i) => <div key={i} className="font-semibold">⛔ {b.testo}</div>)}
              {ctl.notifiche_aperte.length > 0 && <div className="font-semibold">Notifiche aperte sulla scheda:</div>}
              {ctl.notifiche_aperte.map((n) => <div key={n.id}>{n.livello === "blocco" ? "⛔" : n.livello === "urgente" ? "🚨" : n.livello === "attenzione" ? "⚠️" : "ℹ️"} <b>{n.titolo}</b>{n.da_fare ? ` — da fare: ${n.da_fare}` : ""}</div>)}
              {ctl.richieste_cliente.length > 0 && <div className="font-semibold">Richieste del cliente:</div>}
              {ctl.richieste_cliente.map((r, i) => <div key={i}>📝 {r}</div>)}
              {duri.length > 0 && ctl.puo_forzare && (
                <div className="mt-2 space-y-1.5 border-t border-red-300 pt-2">
                  <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={forza} onChange={(e) => setForza(e.target.checked)} />Sono il titolare: mando il PRONTO lo stesso</label>
                  {forza && <input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obbligatorio, finisce nel registro della scheda)" />}
                </div>)}
            </div>)}
          {ctl && (ctl.attesa_cliente || ctl.pronto_gia_inviato) && (
            <div className="space-y-1 rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-50">
              {ctl.attesa_cliente && <div>⏳ <b>In attesa di risposta dal cliente</b> dal {dataOra(ctl.attesa_cliente.il)}{ctl.attesa_cliente.nota ? `: «${ctl.attesa_cliente.nota}»` : ""}</div>}
              {ctl.pronto_gia_inviato && <div>📣 <b>Pronto già inviato il {dataOra(ctl.pronto_gia_inviato)}</b>: così lo rimandi al cliente.</div>}
            </div>)}
          {ctl && serveDiv && (
            <div className="space-y-1.5 rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-50">
              {ctl.divergenze.map((d, i) => <div key={i} className="font-semibold">⚠️ Attenzione: {d}</div>)}
              <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={confDiv} onChange={(e) => setConfDiv(e.target.checked)} />Ho controllato: il messaggio al cliente dice il lavoro fatto davvero</label>
            </div>)}
          {ctl && serveConf && (
            <div className="space-y-1.5 rounded-lg border-2 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-50">
              <div className="font-semibold">La lavorazione non è stata confermata dal tecnico. Controlla le righe che vanno al cliente:</div>
              <pre className="whitespace-pre-wrap rounded border bg-white p-2 font-sans text-sm text-foreground dark:bg-gray-900">{lavorazione || s.lavorazione || "(vuota: si riempie con le righe accettate del preventivo)"}</pre>
              <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={confLav} onChange={(e) => setConfLav(e.target.checked)} />Ho controllato la lavorazione: è il lavoro fatto</label>
            </div>)}
          {ctl?.fuori_orario && (
            <div className="rounded-lg border border-sky-400 bg-sky-50 p-2.5 text-sm text-sky-950 dark:bg-sky-950/40 dark:text-sky-50">
              🕘 Negozio chiuso adesso ({ctl.fuori_orario.motivo}): ho proposto di programmarlo per <b>{ctl.fuori_orario.etichetta}</b>. Per mandarlo subito scegli «Adesso».
            </div>)}
          <div className="flex flex-wrap items-center gap-3">
            <Scelta valore={cons} opzioni={[["ritiro", "Ritiro in negozio"], ["spedizione", "Per corriere"]]} onChange={setCons} />
            {cons === "spedizione" && <Scelta valore={corr} opzioni={[["noi", "Spediamo noi (UPS/DHL)"], ["cliente", "Corriere del cliente"]]} onChange={setCorr} />}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Pagamento">
              {gratis ? <div className={`${campo} bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-200`}>{s.pagata ? "Già pagata: nessun pagamento da chiedere" : "Nessun pagamento (totale € 0)"}</div> : (
              <select className={campo} value={pagEff} onChange={(e) => setPag(e.target.value)}>
                <option value="">Al banco (contanti / POS)</option><option value="bonifico">Bonifico (IBAN)</option><option value="paypal">PayPal (+ commissione)</option><option value="fine_mese">Fine mese (rivenditore)</option></select>)}
              {!gratis && pagEff === "paypal" && <span className="mt-1 block rounded bg-sky-50 px-1 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                PayPal: si chiede {paypalFee ? eur(lordoPaypal(totNum - (Number(s.acconto) || 0), paypalFee)) : "il saldo + la commissione"} (saldo + commissione PayPal{paypalFee ? ` ${String(paypalFee.pct).replace(".", ",")}% + ${eur(paypalFee.fisso)}` : ""}: a noi arriva netto il saldo); mail, WhatsApp e PDF del consuntivo si rifanno con PayPal{s.pagamento_abituale === "paypal" ? " · cliente che paga di solito con PayPal" : ""}</span>}
            </Campo>
            <Campo label="Totale € (IVA compresa)"><input className={`${campo} text-right font-semibold`} inputMode="decimal" value={tot} onChange={(e) => setTot(e.target.value)} />
              <span className="mt-1 block text-right text-sm font-semibold">{eur(totNum)}</span>
              {ricavato && <span className="mt-1 block rounded bg-amber-100 px-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">Ricavato dalle voci accettate del preventivo + spedizione (i totali della scheda erano vuoti): controllalo</span>}</Campo>
            <Campo label="Esito">
              <select className={campo} value={esito} onChange={(e) => setEsito(e.target.value)}><option value="EFFETTUATO">Effettuato</option><option value="NEGATIVO">Negativo</option></select>
            </Campo>
          </div>
          {cons === "spedizione" && <Campo label={gratis ? "Indirizzo di spedizione" : "Indirizzo di spedizione (va nella causale del bonifico)"}><input className={campo} value={ind} onChange={(e) => setInd(e.target.value)} placeholder="via, CAP, città" /></Campo>}
          {cons === "spedizione" && <p className="text-xs text-muted-foreground">{gratis ? "Nulla da pagare: al cliente va l'avviso «PRONTO PER LA SPEDIZIONE, nessun importo da pagare, in attesa del ritiro del corriere» — senza consuntivo, IBAN né richiesta di fattura. Poi si fa la spedizione e parte il tracking." : pagEff === "bonifico" ? "Al cliente va il CONSUNTIVO con IBAN e causale: dopo il bonifico si segna «Pagato» e si spedisce." : "Per la spedizione di solito si chiede il bonifico (niente commissioni della carta)."}</p>}
          {!lavorazione && !s.lavorazione && <p className="text-xs text-amber-700">La lavorazione è vuota: si riempie con le righe accettate del preventivo.</p>}
          <Campo label="📣 Nota per il cliente sull'esito (va nella mail, nel WhatsApp e nel PDF)" aiuto="Es. «Il dispositivo è stato riparato ed è funzionante: funziona tutto ad eccezione dell'eSIM». Vuota = nessuna nota.">
            <textarea className={`${campo} h-auto min-h-[56px] py-1.5`} value={notaCli} maxLength={1500} onChange={(e) => setNotaCli(e.target.value)}
              placeholder="facoltativa" /></Campo>
          <Anteprima s={s} corpo={pagEff === "fine_mese" ? { ...corpo, tipo: "pronto" } : corpo} />
          <Canali mail={mail} wa={wa} setMail={setMail} setWa={setWa} />
          <QuandoInvio q={q} titolo="Quando avvisare il cliente:">
            {programma && <span className="w-full text-xs text-muted-foreground">La scheda resta in «Riparazione finita · Pronto programmato»: all&apos;ora scelta parte il {gratis ? (cons === "spedizione" ? "«pronto per la spedizione» (nulla da pagare)" : "pronto") : pagEff === "bonifico" || pagEff === "paypal" ? "consuntivo" : "pronto"} ({[mail && "mail", wa && "WhatsApp"].filter(Boolean).join(" + ") || "nessun canale"}) e la scheda diventa PRONTA.</span>}
          </QuandoInvio>
        </div>
      )}
    </Modale>
  );
}

// ---------------------------------------------------------------------------
export function DialogoPagato({ s, onClose, onPagato }: { s: Scheda; onClose: () => void; onPagato: (b: Record<string, unknown>, headers?: Record<string, string>) => Promise<boolean> }) {
  // 15/11/2026 (piano 5.5): Idempotency-Key generata all'apertura del dialogo e riusata se si ripreme PAGATO
  const { chiave } = useChiaveIncasso();
  const [modo, setModo] = useState(s.pagamento_modo || "contanti");
  const [imp, setImp] = useState(String(s.saldo || ""));
  const [data, setData] = useState(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }));
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modale titolo={`Pagamento ricevuto — scheda ${s.sigla}`} onClose={onClose}
      piedi={<><Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button disabled={busy} onClick={async () => { setBusy(true); try { if (await onPagato({ pagamento_modo: modo, importo: imp, data, nota }, headerIdempotenza(chiave, `${modo}-${Math.round(Number(imp || 0) * 100)}`))) onClose(); } finally { setBusy(false); } }}>
          {busy && <Loader2 className="animate-spin" />}PAGATO</Button></>}>
      <div className="space-y-3">
        <Scelta valore={modo} opzioni={[["contanti", "Contanti"], ["pos", "POS"], ["bonifico", "Bonifico"], ["paypal", "PayPal"]]} onChange={setModo} />
        <div className="flex flex-wrap gap-3">
          <Campo label="Importo €"><input className={`${campo} w-40 text-right`} inputMode="decimal" value={imp} onChange={(e) => setImp(e.target.value.replace(",", "."))} /></Campo>
          <Campo label="Data del pagamento"><input type="date" className={`${campo} w-44`} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        </div>
        <Campo label="Riferimento (facoltativo)"><input className={campo} value={nota} placeholder="es. bonifico di …, transazione PayPal …" onChange={(e) => setNota(e.target.value)} /></Campo>
        {(modo === "contanti" || modo === "pos") && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Contanti e POS: fai lo <b>Scontrino</b> dalla scheda (segna da solo il pagamento). Usa «Pagato» solo se lo scontrino è già stato fatto a parte.</p>}
        {modo === "bonifico" && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Bonifico: meglio abbinarlo da <b>Bonifici</b> (arrivato sul conto SumUp): si fa da sola la fattura pagata e la scheda risulta pagata. Spedisci solo ad accredito avvenuto.</p>}
        <p className="text-xs text-muted-foreground">Segna che il pagamento è arrivato, con modalità, importo e data. Il documento fiscale si fa con Scontrino o Fattura.</p>
      </div>
    </Modale>
  );
}

// ---------------------------------------------------------------------------
/** 26/10/2026 (Christian, 62778): scheda già lavorata e riconsegnata ma rimasta aperta → si chiude in un passo. */
export function DialogoChiudiTutto({ s, onClose, onChiudi, admin = false }: { s: Scheda; onClose: () => void; onChiudi: (b: Record<string, unknown>) => Promise<boolean>; admin?: boolean }) {
  // 15/11/2026 (piano 5.3): 409 «chiusura_bloccata» (attesa del cliente, notifica BLOCCO aperta) → elenco; forzatura solo del titolare
  const [blocchiCh, setBlocchiCh] = useState<string[] | null>(null);
  const [forzaMotivo, setForzaMotivo] = useState("");
  const [esito, setEsito] = useState<"riparato" | "non_riparato" | "nessun_intervento">("riparato");
  const [modo, setModo] = useState<"ritiro" | "spedizione" | "corriere_cliente">(s.consegna_modo === "spedizione" ? (s.consegna_corriere === "cliente" ? "corriere_cliente" : "spedizione") : "ritiro");
  const [fuori, setFuori] = useState(false);
  // 15/11/2026 (piano 5.3): «già pagato / non dovuto» solo dal titolare, con il motivo (pagamento_fuori_motivo)
  const [fuoriMotivo, setFuoriMotivo] = useState("");
  const [serveTitolare, setServeTitolare] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const saldo = Number(s.saldo || 0);
  const daPagare = !s.pagata && saldo > 0.009;
  const fuoriPronto = !fuori || (admin && fuoriMotivo.trim().length >= MOTIVO_MIN);
  async function vai(forza = false) {
    if (daPagare && !fuori) { toast.error("Risulta da pagare: incassa prima, oppure spunta «già pagato / non dovuto»"); return; }
    if (fuori && !fuoriPronto) { setServeTitolare(admin ? "Scrivi il motivo del pagamento fuori dal gestionale" : "Pagamento fuori dal gestionale: lo può confermare solo il titolare"); return; }
    if (forza && forzaMotivo.trim().length < 5) { toast.error("Scrivi il motivo per cui chiudi nonostante i blocchi"); return; }
    setBusy(true);
    try { if (await onChiudi({ esito, modo, nota, pagamento_fuori: fuori, ...(fuori ? { pagamento_fuori_motivo: fuoriMotivo.trim() } : {}),
      ...(forza ? { forza: true, forza_motivo: forzaMotivo.trim() } : {}) })) onClose(); }
    catch (e) {
      if (eServeTitolare(e)) { setServeTitolare((e as Error).message); if (daPagare) setFuori(true); }
      else if (codiceErrore(e) === "chiusura_bloccata") {
        const bl = dettaglioErrore(e).blocchi;
        setBlocchiCh(Array.isArray(bl) && bl.length ? bl.map((x) => String((x as { testo?: string })?.testo || x)) : [(e as Error).message]);
      } else toastErrore(e);
    } finally { setBusy(false); }
  }
  return (
    <Modale titolo={`Già fatto tutto — chiudi la scheda ${s.sigla}`} onClose={onClose}
      piedi={<><Button variant="outline" onClick={onClose}>Annulla</Button><Button disabled={busy || !fuoriPronto} onClick={() => vai()}>{busy && <Loader2 className="animate-spin" />}Chiudi la scheda</Button></>}>
      <div className="space-y-3 text-sm">
        {(fuori || serveTitolare) && (
          <ForzaturaTitolare admin={admin} perche={serveTitolare || `Risulta da pagare ${eur(saldo)}: «già pagato / non dovuto» lo conferma solo il titolare, con il motivo`}
            motivo={fuoriMotivo} setMotivo={setFuoriMotivo} busy={busy} onProcedi={() => vai()} segnaposto="es. pagato con bonifico il 10/11 registrato a parte · riparazione di cortesia" />)}
        {blocchiCh && (
          <div role="alert" className="space-y-2 rounded-lg border-2 border-red-500 bg-red-50 p-3 text-red-950 dark:bg-red-950/30 dark:text-red-100">
            <div className="font-semibold">⛔ La scheda non si chiude: prima va risolto</div>
            <ul className="list-disc space-y-0.5 pl-5">{blocchiCh.map((x, i) => <li key={i}>{x}</li>)}</ul>
            {admin ? <div className="space-y-1.5 border-t border-red-300 pt-2">
              <Campo label="Solo il titolare: motivo per chiuderla comunque (resta nel registro) *">
                <textarea className={area} rows={2} value={forzaMotivo} onChange={(e) => setForzaMotivo(e.target.value)} placeholder="es. il cliente ha risposto al banco, notifica superata" /></Campo>
              <Button variant="outline" className="border-red-400 text-red-800 dark:text-red-200" disabled={busy || forzaMotivo.trim().length < 5} onClick={() => vai(true)}>
                {busy && <Loader2 className="animate-spin" />}Chiudi comunque</Button>
            </div> : <p className="text-xs">Risolvi i blocchi (risposta del cliente, notifica da gestire) oppure chiedi al titolare.</p>}
          </div>)}
        <p className="text-muted-foreground">Per le schede già lavorate e riconsegnate ma rimaste a metà: segna pronto e consegna in un colpo solo, saltando i passaggi. Resta tutto nel registro.</p>
        <Campo label="Com'è andata"><Scelta valore={esito} opzioni={[["riparato", "Riparato"], ["non_riparato", "Non riparato"], ["nessun_intervento", "Nessun intervento"]]} onChange={(x) => setEsito(x as typeof esito)} /></Campo>
        <Campo label="Come è stato riconsegnato"><Scelta valore={modo} opzioni={[["ritiro", "Ritirato in negozio"], ["spedizione", "Spedito da noi"], ["corriere_cliente", "Corriere del cliente"]]} onChange={(x) => setModo(x as typeof modo)} /></Campo>
        {daPagare && <label className="flex items-center gap-2 rounded-md bg-amber-50 px-2.5 py-2 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <input type="checkbox" className="size-4" checked={fuori} onChange={(e) => setFuori(e.target.checked)} />Risulta da pagare {eur(saldo)}: è già stato pagato / non è dovuto</label>}
        <Campo label="Nota (facoltativa, resta nelle note interne)"><textarea className={area} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="es. ritirato dal cliente il 20/10, riparazione di cortesia" /></Campo>
      </div>
    </Modale>
  );
}

/** 15/11/2026 (piano 1.3): «Salta preventivo» = il preventivo si considera ACCETTATO senza inviarlo → serve l'ok scritto
 *  del cliente (mail, WhatsApp, online, firmato in negozio); a € 0 non serve; il titolare può senza, con il motivo. */
export function DialogoSaltaPreventivo({ s, admin, onClose, onSalta }: { s: Scheda; admin: boolean; onClose: () => void; onSalta: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [canale, setCanale] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const serveOk = Number(s.preventivo_totale || 0) > 0.009;
  async function vai() {
    if (serveOk && !okValido(canale, motivo)) { setErrore(canale === SENZA_OK ? "Scrivi il motivo (almeno qualche parola)." : MSG_OK_MANCANTE); return; }
    setBusy(true); setErrore(null);
    const ok = corpoOk(canale, motivo);
    try { if (await onSalta({ ...(ok.canale ? { ok_cliente: ok.canale } : {}), ...(ok.motivo_accettazione ? { motivo_accettazione: ok.motivo_accettazione } : {}) })) onClose(); }
    catch (e) { setErrore(codiceErrore(e) === "ok_cliente_mancante" ? MSG_OK_MANCANTE : (e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <Modale titolo={`Saltare il preventivo — scheda ${s.sigla}`} onClose={onClose}
      piedi={<><Button variant="outline" onClick={onClose}>Annulla</Button><Button disabled={busy} onClick={vai}>{busy && <Loader2 className="animate-spin" />}Salta il preventivo</Button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">Il preventivo si considera <b>accettato</b> senza inviarlo al cliente e si passa alla riparazione.{serveOk ? ` Totale ${eur(s.preventivo_totale)}: serve l'ok del cliente per iscritto.` : " Preventivo a € 0 (garanzia, cortesia): l'ok scritto non è obbligatorio."}</p>
        <SceltaOk canale={canale} setCanale={(c) => { setCanale(c); setErrore(null); }} admin={admin} motivo={motivo} setMotivo={setMotivo} evidenzia={!!errore} />
        {errore && <div role="alert" className="rounded-md border-2 border-red-500 bg-red-50 px-2.5 py-2 font-semibold text-red-900 dark:bg-red-950/30 dark:text-red-100">⛔ {errore}</div>}
      </div>
    </Modale>
  );
}

/** 15/11/2026 (piano 2.4 + 2.5): «INCASSA E CONSEGNA» in un solo flusso — 1) pagamento (scontrino, fattura, pagamento già
 *  arrivato) · 2) come esce il dispositivo · 3) foglio di riconsegna se il Mac ha OpenCore · 4) «Conferma consegna».
 *  Prima un clic su «Rottamato» o «Venduto» chiudeva subito la scheda e il saldo aperto era solo un avviso: ora la scelta
 *  si conferma, Rottamato/Venduto stanno a parte con una seconda conferma e senza incasso serve la spunta esplicita. */
export function DialogoConsegna({ s, admin = false, onClose, onConsegna, onScontrino, onFattura, onPagato, onStampaRiconsegna }: {
  s: Scheda; admin?: boolean; onClose: () => void;
  /** 15/11/2026 (piano 5.3): `motivo` = consegna senza pagamento confermata dal titolare (forza + forza_motivo) */
  onConsegna: (modo: string, senzaIncasso: boolean, motivo?: string) => Promise<boolean>;
  onScontrino?: () => void; onFattura?: () => void; onPagato?: () => void; onStampaRiconsegna?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [serveTitolare, setServeTitolare] = useState<string | null>(null);
  const daPagare = !s.pagata && s.saldo > 0 && !pagaFineMese(s);
  const opz: [string, string, string][] = [
    ["ritiro", "Ritirato in negozio", "il cliente è passato a prenderlo"], ["spedizione", "Spedito con il nostro corriere", "etichetta UPS/DHL fatta da noi"],
    ["corriere_cliente", "Ritirato dal corriere del cliente", "il cliente ha mandato il suo corriere"]];
  const predefinito = s.consegna_modo === "spedizione" ? (s.consegna_corriere === "cliente" ? "corriere_cliente" : "spedizione") : "ritiro";
  const [modo, setModo] = useState<string>(predefinito);
  const [senzaIncasso, setSenzaIncasso] = useState(false);
  const [foglio, setFoglio] = useState(false);
  const [altri, setAltri] = useState(false);
  const serveIncasso = daPagare && ["ritiro", "spedizione", "corriere_cliente"].includes(modo);
  // 15/11/2026 (piano 5.3): senza incasso consegna solo il titolare, con il motivo
  const forzatura = (serveIncasso && senzaIncasso) || !!serveTitolare;
  const motivoOk = admin && motivo.trim().length >= MOTIVO_MIN;
  const pronta = !!modo && (!serveIncasso || senzaIncasso) && (!forzatura || motivoOk) && (!onStampaRiconsegna || foglio || modo !== "ritiro");
  async function vai(m: string) {
    setBusy(true);
    try { if (await onConsegna(m, forzatura, forzatura && motivoOk ? motivo.trim() : undefined)) onClose(); }
    catch (e) { if (eServeTitolare(e)) { setServeTitolare((e as Error).message); setSenzaIncasso(true); } else toastErrore(e); }
    finally { setBusy(false); }
  }
  const passo = (n: number, titolo: string, fatto: boolean) => (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <span className={`flex size-6 items-center justify-center rounded-full text-xs ${fatto ? "bg-emerald-600 text-white" : "bg-muted text-foreground"}`}>{fatto ? "✓" : n}</span>{titolo}
    </div>);
  return (
    <Modale titolo={`Incassa e consegna — scheda ${s.sigla}`} onClose={onClose} piedi={<>
      <Button variant="outline" onClick={onClose}>Indietro</Button>
      <Button disabled={busy || !pronta} onClick={() => vai(modo)} data-testid="conferma-consegna">{busy && <Loader2 className="animate-spin" />}Conferma consegna</Button>
    </>}>
      <div className="space-y-4">
        <div className="space-y-2">
          {passo(1, "Pagamento", !daPagare)}
          {!daPagare ? <p className="pl-8 text-sm text-emerald-800 dark:text-emerald-300">{s.pagata || s.saldo <= 0 ? `✔ Pagata${s.pagamento_modo ? ` (${s.pagamento_modo})` : ""}` : "✔ Pagamento a fine mese (cliente con conto mensile)"}</p> : <>
            <p className="pl-8 text-sm">Da incassare: <b className="tabular-nums">{eur(s.saldo)}</b></p>
            <div className="flex flex-wrap gap-1.5 pl-8">
              {onScontrino && <Button size="sm" onClick={onScontrino} title="Apre la cassa con le righe della scheda; dopo lo scontrino torna qui">🧾 Scontrino</Button>}
              {onFattura && <Button size="sm" variant="outline" onClick={onFattura} title="Fattura in bozza collegata alla scheda (non va allo SdI finché non la emetti)">Fattura</Button>}
              {onPagato && <Button size="sm" variant="outline" onClick={onPagato} title="Bonifico, POS o PayPal già arrivati">Pagamento già arrivato</Button>}
            </div>
            <label className="ml-8 flex min-h-10 items-start gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <input type="checkbox" className="mt-0.5 size-4" checked={senzaIncasso} onChange={(e) => setSenzaIncasso(e.target.checked)} />
              <span>Consegno <b>senza incasso</b>: restano da pagare {eur(s.saldo)}</span>
            </label>
          </>}
          {forzatura && <div className="pl-8">
            <ForzaturaTitolare admin={admin} perche={serveTitolare || `Consegna senza pagamento (${eur(s.saldo)} da pagare): la conferma solo il titolare, con il motivo`}
              motivo={motivo} setMotivo={setMotivo} busy={busy} onProcedi={pronta ? () => vai(modo) : undefined} />
          </div>}
        </div>
        <div className="space-y-2">
          {passo(2, "Come esce il dispositivo", !!modo)}
          <div className="space-y-1.5 pl-8">
            {opz.map(([k, l, d]) => (
              <label key={k} className={`flex min-h-10 cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${modo === k ? "border-primary bg-primary/5" : ""}`}>
                <input type="radio" name="modo-consegna" className="mt-1" checked={modo === k} onChange={() => setModo(k)} />
                <span><b>{l}</b>{d && <span className="block text-xs opacity-80">{d}</span>}</span>
              </label>
            ))}
          </div>
        </div>
        {onStampaRiconsegna && (
          <div className="space-y-2">
            {passo(3, "Foglio di riconsegna (Mac con OpenCore)", foglio)}
            <div className="flex flex-wrap items-center gap-2 pl-8 text-sm">
              <Button size="sm" variant="outline" onClick={onStampaRiconsegna}><Printer />Stampa il foglio da far firmare</Button>
              <label className="flex min-h-10 items-center gap-2"><input type="checkbox" className="size-4" checked={foglio} onChange={(e) => setFoglio(e.target.checked)} />Il cliente l&apos;ha firmato</label>
            </div>
          </div>
        )}
        <div className="border-t pt-2">
          <button type="button" className="min-h-10 text-xs text-muted-foreground underline" onClick={() => setAltri((x) => !x)}>{altri ? "Nascondi" : "Altri esiti: rottamato o venduto…"}</button>
          {altri && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {([["rottamato", "Rottamato"], ["venduto", "Venduto"]] as const).map(([k, l]) => (
                <Button key={k} size="sm" variant="outline" className="border-red-300 text-red-700" disabled={busy}
                  onClick={async () => { if (await conferma({ titolo: `${l}: chiudere la scheda?`, testo: `La scheda ${s.sigla} si chiude come «${l.toUpperCase()}». Si può riaprire solo dal titolare.`, ok: `Sì, ${l.toLowerCase()}`, pericolo: true })) vai(k); }}>{l}</Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modale>
  );
}

// ---------------------------------------------------------------------------
type AnteSped = {
  indirizzo: Record<string, string>; mancanti: string[]; indirizzo_libero: string | null; oggetto: string; corpo: string; prova: boolean; email: string | null;
  corriere: "UPS" | "DHL"; prenota: boolean; giorno_ritiro: string | null; ritiro_presso: string | null; test: boolean; dhl_produzione: boolean; dhl_configurato: boolean;
};
type ModoCorriere = "riconsegna" | "ritiro" | "cliente";

/** CORRIERE: tre casi distinti e spiegati — spedisco io (etichetta UPS/DHL), etichetta per farci arrivare il dispositivo,
 *  ritira il corriere del cliente (nessuna etichetta nostra). Schede di prova: corriere sempre in ambiente di prova. */
export function DialogoCorriere({ s, operatore, iniziale = "riconsegna", onClose, onFatta, onCorriereCliente }: {
  s: Scheda; operatore: string; iniziale?: ModoCorriere; onClose: () => void; onFatta: () => void; onCorriereCliente: () => Promise<void>;
}) {
  const [modo, setModo] = useState<ModoCorriere>(iniziale);
  // 24/10/2026: il corriere abituale del cliente (anagrafica), es. Archimedia → DHL
  const [corriere, setCorriere] = useState<"UPS" | "DHL">(
    s.anagrafica?.corriere_default === "DHL" ? "DHL" : "UPS");
  const [ind, setInd] = useState<Record<string, string>>({});
  const [ante, setAnte] = useState<AnteSped | null>(null);
  const [giorno, setGiorno] = useState("");
  const [daNoi, setDaNoi] = useState<boolean | null>(null);
  const prenotaDaNoi = daNoi ?? corriere === "DHL";
  // 28/10/2026 (Christian, 63224): il gestionale è in produzione → si parte con l'etichetta VERA (prima «Prova» era spuntata
  // e la riconsegna usciva finta, 1ZXXXX…). Le schede di prova restano sempre in prova (provaForzata).
  const [prova, setProva] = useState(false);
  const [stampa, setStampa] = useState(true);
  const [avvisaMail, setAvvisaMail] = useState(true);
  const [avvisaWa, setAvvisaWa] = useState(!s.cliente_no_whatsapp);
  const [busy, setBusy] = useState(false);
  // 28/10/2026 (Christian): etichetta di riconsegna — il pacco parte OGGI (scheda chiusa) o un ALTRO GIORNO (resta aperta)
  const [parte, setParte] = useState<"" | "oggi" | "dopo">("");
  const [partenzaIl, setPartenzaIl] = useState("");
  const dir = modo === "ritiro" ? "ritiro" : "riconsegna";
  const chiave = JSON.stringify({ dir, ind, corriere, giorno, prenotaDaNoi });
  useEffect(() => {
    if (modo === "cliente") return;
    const k = JSON.parse(chiave);
    const t = setTimeout(() => assAzione(s.id, "spedizione/anteprima", {
      corriere: k.corriere, direzione: k.dir, indirizzo: k.ind, giorno_ritiro: k.giorno || undefined, prenota: k.dir === "riconsegna" ? k.prenotaDaNoi : undefined,
    }).then(setAnte).catch(toastErrore), 300);
    return () => clearTimeout(t);
  }, [s.id, chiave, modo]);
  const provaForzata = !!ante?.prova;
  const inProva = prova || provaForzata;
  const dhlBloccato = corriere === "DHL" && !inProva && !ante?.dhl_produzione;
  async function crea() {
    if (!operatore) { toast.error("Scegli l'operatore"); return; }
    if (dir === "riconsegna" && !inProva && !parte) { toast.error("Scegli quando parte il pacco: oggi o un altro giorno"); return; }
    const conRitiro = dir === "ritiro" ? !!giorno : prenotaDaNoi;
    if (!inProva && !(await conferma({ titolo: `Etichetta ${corriere} vera`, testo: `Creare l'etichetta ${corriere} VERA (costo sul conto ${corriere})${conRitiro ? " e prenotare il corriere" : ""}?`, ok: "Crea l'etichetta" }))) return;
    // 14/10/2026: riconsegna di una scheda non ancora pagata → il backend la ferma; qui si chiede conferma esplicita
    const nonPagata = dir === "riconsegna" && !inProva && !s.pagata && s.saldo > 0 && !pagaFineMese(s);
    if (nonPagata && !(await conferma({ titolo: "Non ancora pagata", testo: `Risulta ancora da pagare ${eur(s.saldo)}.`, spunta: `Spedisco senza incasso (restano da pagare ${eur(s.saldo)})`, ok: "Spedisci lo stesso", pericolo: true }))) return;
    setBusy(true);
    try {
      const r = await assAzione(s.id, "spedizione", { operatore, corriere, direzione: dir, indirizzo: ind, giorno_ritiro: giorno || undefined, test: inProva,
        prenota: dir === "riconsegna" ? prenotaDaNoi : undefined, stampa: inProva || dir === "ritiro" ? false : stampa, forza: nonPagata || undefined,
        invia_mail: avvisaMail, invia_wa: avvisaWa,
        ...(dir === "riconsegna" && !inProva ? { chiudi: parte === "oggi", partenza_il: parte === "dopo" && partenzaIl ? partenzaIl : undefined } : {}) });
      toast.success(`${r.corriere} ${r.test ? "(PROVA) " : ""}${r.tracking}${r.prn ? ` · ritiro ${r.prn}` : ""}${r.pickup_error ? ` · ERRORE ritiro: ${r.pickup_error}` : ""}` + (r.esito?.mail ? ` · mail ${r.esito.mail}` : "") + (r.esito?.whatsapp ? ` · WhatsApp ${r.esito.whatsapp}` : ""), { duration: 10000 });
      // 05/11/2026 (Christian): il ritiro non si stampa e non si apre: lo stampa il cliente, l'etichetta resta in scheda
      if (dir !== "ritiro" && (!r.stampa || !r.stampa.agente_attivo)) window.open(`/api/backend${r.label_url}`, "_blank");
      onFatta();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  const a = ante?.indirizzo || {};
  const C = (k: string, l: string) => <Campo label={l}><input className={campo} value={ind[k] ?? a[k] ?? ""} onChange={(e) => setInd({ ...ind, [k]: e.target.value })} /></Campo>;
  const MODI: [ModoCorriere, string, string][] = [
    ["riconsegna", "Spedisco io al cliente", "creo l'etichetta UPS o DHL e (se serve) prenoto il ritiro da noi in Viale Somalia"],
    ["ritiro", "Etichetta per farci arrivare il dispositivo", "mando al cliente l'etichetta UPS o DHL: il corriere ritira da lui (o lui porta il pacco a un punto)"],
    ["cliente", "Ritira il corriere del cliente", "il cliente manda il SUO corriere a ritirare da noi: nessuna etichetta nostra"]];
  return (
    <Modale titolo={`Corriere — scheda ${s.sigla}`} onClose={onClose} largo
      piedi={<><Button variant="outline" onClick={onClose}>Annulla</Button>
        {modo === "cliente"
          ? <Button disabled={busy} onClick={async () => { setBusy(true); try { await onCorriereCliente(); } finally { setBusy(false); } }}>Segna: ritira il corriere del cliente</Button>
          : <Button disabled={busy || !!ante?.mancanti.length || dhlBloccato || (corriere === "DHL" && !!ante && !ante.dhl_configurato)} onClick={crea}>
            {busy ? <Loader2 className="animate-spin" /> : <Truck />}Crea etichetta {corriere}{inProva ? " (prova)" : ""}</Button>}</>}>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {MODI.map(([k, l, d]) => (
            <button key={k} type="button" onClick={() => setModo(k)} className={`rounded-lg border p-2.5 text-left text-sm ${modo === k ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}>
              <b className="block">{l}</b><span className="text-xs text-muted-foreground">{d}</span></button>
          ))}
        </div>
        {modo === "cliente" ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm">Si annota sulla scheda che il dispositivo lo ritira il corriere del cliente. Quando passa a prenderlo: <b>Consegna → «Ritirato dal corriere del cliente»</b>. Prima del ritiro il pagamento deve essere arrivato.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-muted-foreground">Corriere</span>
              <Scelta valore={corriere} opzioni={[["UPS", "UPS"], ["DHL", "DHL"]]} onChange={(c) => { setCorriere(c); setDaNoi(null); }} /></div>
            {ante?.indirizzo_libero && <div className="text-xs text-muted-foreground">Indicazioni sulla scheda: {ante.indirizzo_libero}</div>}
            <div className="grid gap-2 md:grid-cols-3">{C("name", "Ragione sociale / nome")}{C("attention", "Alla c.a.")}{C("phone", "Telefono")}
              {C("street", "Indirizzo")}{C("city", "Città")}<div className="grid grid-cols-2 gap-2">{C("zip", "CAP")}{C("province", "Prov.")}</div>
              {/* 28/10/2026 (Christian): la mail a cui va il tracking, modificabile come l'indirizzo */}
              <Campo label="Email per il tracking"><input className={campo} type="email" value={ind.email ?? ante?.email ?? ""} onChange={(e) => setInd({ ...ind, email: e.target.value })} /></Campo></div>
            <p className="text-xs text-muted-foreground">Dati presi dalla scheda, dalla rubrica e dalle spedizioni già fatte per questo cliente: se il {dir === "ritiro" ? "ritiro" : "pacco"} va a un indirizzo diverso, correggili qui (valgono solo per questa spedizione).</p>
            {dir === "ritiro" ? (
              <Campo label={`Giorno del ritiro dal cliente (vuoto = senza prenotazione: porta il pacco a un punto ${corriere})`} className="max-w-sm">
                <input type="date" className={campo} value={giorno} onChange={(e) => setGiorno(e.target.value)} /></Campo>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={prenotaDaNoi} onChange={(e) => setDaNoi(e.target.checked)} />
                  Prenota il ritiro del corriere da noi (Viale Somalia 244/246/248){corriere === "UPS" ? " — UPS passa comunque ogni giorno alle 16:30" : ""}</label>
                {prenotaDaNoi && <Campo label="Giorno (vuoto = oggi/prossimo feriale)" className="w-48"><input type="date" className={campo} value={giorno} onChange={(e) => setGiorno(e.target.value)} /></Campo>}
              </div>
            )}
            {dir === "riconsegna" && !inProva && (
              <div className="rounded-lg border-2 border-sky-300 bg-sky-50 p-2.5 text-sm text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
                <b>Quando parte il pacco?</b>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5"><input type="radio" name="parte" checked={parte === "oggi"} onChange={() => setParte("oggi")} />
                    Parte <b>oggi</b>{corriere === "UPS" ? " (ritiro UPS delle 16:30)" : ""} → la scheda si chiude come SPEDITO</label>
                  <label className="flex items-center gap-1.5"><input type="radio" name="parte" checked={parte === "dopo"} onChange={() => setParte("dopo")} />
                    Parte <b>un altro giorno</b> → la scheda resta aperta (etichetta pronta)</label>
                  {parte === "dopo" && <input type="date" className={`${campo} w-44`} value={partenzaIl} onChange={(e) => setPartenzaIl(e.target.value)} aria-label="Giorno di partenza" />}
                </div>
              </div>)}
            {ante?.mancanti.length ? <div className="text-sm text-red-700">Mancano: {ante.mancanti.join(", ")}</div> : null}
            {corriere === "DHL" && ante && !ante.dhl_configurato && <div className="text-sm text-red-700">DHL non configurato sul server.</div>}
            {dhlBloccato && <div className="text-sm text-amber-800">DHL produzione non ancora attiva sul server: per ora solo in prova (sandpit).</div>}
            {ante && <div className="rounded-lg border bg-muted/30 p-2.5 text-xs">
              {ante.prova && <div className="font-semibold text-amber-800">SCHEDA DI PROVA: corriere sempre in ambiente di prova (nessun costo, nessun ritiro), mail solo a {ante.email}, nessun WhatsApp</div>}
              {ante.prenota && <div>Ritiro {corriere} prenotato {ante.ritiro_presso === "cliente" ? "dal cliente" : `da noi (${ante.ritiro_presso})`}{ante.giorno_ritiro ? ` il ${ante.giorno_ritiro.split("-").reverse().join("/")}` : ""}</div>}
              <b>{ante.oggetto}</b><pre className="whitespace-pre-wrap font-sans">{ante.corpo}</pre></div>}
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={inProva} disabled={provaForzata} onChange={(e) => setProva(e.target.checked)} />
                Ambiente di PROVA {corriere} (nessun costo, nessun corriere)</label>
              {!inProva && dir !== "ritiro" && <label className="flex items-center gap-1.5"><input type="checkbox" checked={stampa} onChange={(e) => setStampa(e.target.checked)} />
                Stampa l&apos;etichetta al banco (2 copie)</label>}
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={avvisaMail} onChange={(e) => setAvvisaMail(e.target.checked)} />
                Mail al cliente con l&apos;etichetta</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={avvisaWa} onChange={(e) => setAvvisaWa(e.target.checked)} />
                WhatsApp al cliente{dir === "ritiro" ? " con l'etichetta allegata" : " col tracking"}</label>
            </div>
          </>
        )}
      </div>
    </Modale>
  );
}

// ---------------------------------------------------------------------------
export function DialogoStessoModello({ s, ro, onClose, onApri, onCopia }: { s: Scheda; ro: boolean; onClose: () => void; onApri: (id: string) => void; onCopia: (r: EstimateLine[]) => void }) {
  const [r, setR] = useState<{ criterio: string; schede: (SchedaBreve & { preventivo_testo: string | null })[] } | null>(null);
  useEffect(() => { assStessoModello(s.id).then(setR).catch(toastErrore); }, [s.id]);
  return (
    <Modale titolo={`Stesso modello — ${s.modello || s.prodotto || ""}`} onClose={onClose} largo>
      {!r ? <Loader2 className="animate-spin" /> : (
        <div className="space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">{r.criterio ? `Per ${r.criterio}, dal più recente. I prezzi cambiano: verificare sul GSX.` : "Scrivi il modello o il seriale sulla scheda."}</div>
          {r.schede.length === 0 && <div className="text-muted-foreground">Nessuna scheda con lo stesso modello e un preventivo.</div>}
          {r.schede.map((x) => (
            <div key={x.id} className="flex gap-2 border-t py-1.5">
              <button className="w-14 shrink-0 text-left font-semibold underline" onClick={() => { onClose(); onApri(x.id); }}>{x.sigla}</button>
              <div className="flex-1"><div className="text-xs text-muted-foreground">{dataOra(x.created_at)} · {x.modello || x.prodotto} · {x.difetto}</div>
                <div className="whitespace-pre-wrap">{x.preventivo_testo}</div></div>
              <div className="shrink-0 text-right">{eur(x.totale_lavorazione ?? x.preventivo_totale)}<div className="text-xs"><Pill>{x.preventivo_esito}</Pill></div>
                {!ro && <Button size="xs" variant="outline" className="mt-1" onClick={() => onCopia(parseEstimate(x.preventivo_testo || ""))}>Copia</Button>}</div>
            </div>
          ))}
        </div>
      )}
    </Modale>
  );
}

/** 24/10/2026 (Christian): il titolare riporta la scheda a qualsiasi stato aperto, anche indietro
 *  (consegnata → il cliente lascia il dispositivo per altre verifiche; accettato → da rifare il preventivo). */
const STATI_RIAPRI: [string, string, string][] = [
  ["in_arrivo", "In arrivo", "il dispositivo non è ancora arrivato (toglie il timbro di accettazione)"],
  ["da_preventivare", "Da preventivare", "il preventivo è da rifare: toglie invio e accettazione del preventivo"],
  ["preventivo_inviato", "Preventivo inviato", "in attesa della risposta del cliente: toglie l'accettazione"],
  ["accettato", "Accettato · in lavorazione", "torna in riparazione (toglie pronto e consegna)"],
  ["rifiutato", "Rifiutato · da restituire", "il cliente non procede"],
  ["pronto", "Pronto", "da ritirare / da spedire (toglie la consegna)"],
];
export function DialogoCambiaStato({ s, onClose, onConferma }: { s: Scheda; onClose: () => void; onConferma: (b: { stato: string; motivo: string }) => Promise<boolean> }) {
  const [stato, setStato] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modale titolo={`Cambia stato — scheda ${s.sigla}`} onClose={onClose}
      piedi={<><Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button disabled={busy || !stato || !motivo.trim()} onClick={async () => { setBusy(true); try { if (await onConferma({ stato, motivo })) onClose(); } finally { setBusy(false); } }}>
          {busy && <Loader2 className="animate-spin" />}Riporta la scheda</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Stato attuale: <b>{s.etichetta_stato}</b>{s.stato === "annullata" ? " (verrà riaperta)" : ""}. I timbri tolti restano nel registro della scheda.</p>
        <div className="grid gap-2">
          {STATI_RIAPRI.filter(([k]) => k !== s.stato).map(([k, l, d]) => (
            <button key={k} type="button" onClick={() => setStato(k)} className={`rounded-lg border p-2.5 text-left text-sm ${stato === k ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}>
              <b className="block">{l}</b><span className="text-xs text-muted-foreground">{d}</span></button>
          ))}
        </div>
        <Campo label="Motivo (resta nel registro) *"><textarea className={area} rows={2} value={motivo} placeholder="es. al ritiro il cliente ha trovato un problema e lo lascia per altre verifiche" onChange={(e) => setMotivo(e.target.value)} /></Campo>
      </div>
    </Modale>
  );
}

/** Prossimo giorno lun-ven alle 9:30 (ora del computer del negozio = ora di Roma). */
function prossimoLavorativo930(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(9, 30, 0, 0);
  return d;
}
const giornoIso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
/** Prossima mezz'ora (default di «Oggi alle…», come nelle Tarature). */
function prossimaMezzora(): string {
  const p = new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  const t = Math.min(Math.ceil((p[0] * 60 + p[1] + 30) / 30) * 30, 23 * 60 + 30);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
/** Orari del negozio: lun-ven 9:30-13:30 e 15:00-19:00. */
function inOrarioNegozio(data: string, ora: string): boolean {
  const [y, m, g] = data.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, g)).getUTCDay();
  if (wd === 0 || wd === 6) return false;
  const [h, mi] = ora.split(":").map(Number);
  const t = h * 60 + mi;
  return (t >= 570 && t <= 810) || (t >= 900 && t <= 1140);
}
const etichettaGiorno = (d: Date) => {
  const domani = new Date(); domani.setDate(domani.getDate() + 1);
  return d.toDateString() === domani.toDateString() ? "Domani" : d.toLocaleDateString("it-IT", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase());
};

const adessoMs = () => Date.now();
/** 30/10/2026: «quando» dell'invio (pronto e preventivo), stesse scelte delle Tarature: Adesso · Oggi alle… · Domani alle… · Data e ora. */
export function useQuando(iniziale?: string | null) {
  const ini = iniziale ? new Date(iniziale) : null;
  const [quando, setQuando] = useState<"adesso" | "oggi" | "domani" | "libero">(ini ? "libero" : "adesso");
  const [oraOggi, setOraOggi] = useState(prossimaMezzora);
  const [oraDomani, setOraDomani] = useState("09:30");
  const [dataLibera, setDataLibera] = useState(() => giornoIso(ini || prossimoLavorativo930()));
  const [oraLibera, setOraLibera] = useState(() => ini ? ini.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hour12: false }) : "09:30");
  const qs = quando === "oggi" ? { d: giornoIso(new Date()), o: oraOggi } : quando === "domani" ? { d: giornoIso(prossimoLavorativo930()), o: oraDomani }
    : quando === "libero" ? { d: dataLibera, o: oraLibera } : null;
  const programma = qs && qs.d && /^\d{2}:\d{2}$/.test(qs.o) ? new Date(`${qs.d}T${qs.o}:00`).toISOString() : null;
  const passato = !!programma && new Date(programma).getTime() <= adessoMs() + 60000;
  const fuoriOrario = !!qs && !inOrarioNegozio(qs.d, qs.o);
  return { quando, setQuando, oraOggi, setOraOggi, oraDomani, setOraDomani, dataLibera, setDataLibera, oraLibera, setOraLibera, programma, passato, fuoriOrario };
}
export type Quando = ReturnType<typeof useQuando>;
export const quandoBreve = (iso: string) => new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function QuandoInvio({ q, titolo, senzaAdesso, children }: { q: Quando; titolo: string; senzaAdesso?: boolean; children?: React.ReactNode }) {
  const opz: [Quando["quando"], string][] = [["adesso", "Adesso"], ["oggi", "Oggi alle…"], ["domani", `${etichettaGiorno(prossimoLavorativo930())} alle…`], ["libero", "Data e ora a scelta"]];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <span className="text-sm font-medium">{titolo}</span>
      <Scelta valore={q.quando} opzioni={senzaAdesso ? opz.filter(([k]) => k !== "adesso") : opz} onChange={q.setQuando} />
      {q.quando === "oggi" && <input type="time" className={`${campo} w-28`} value={q.oraOggi} onChange={(e) => q.setOraOggi(e.target.value)} />}
      {q.quando === "domani" && <input type="time" className={`${campo} w-28`} value={q.oraDomani} onChange={(e) => q.setOraDomani(e.target.value)} />}
      {q.quando === "libero" && <><input type="date" className={`${campo} w-40`} value={q.dataLibera} onChange={(e) => q.setDataLibera(e.target.value)} />
        <input type="time" className={`${campo} w-28`} value={q.oraLibera} onChange={(e) => q.setOraLibera(e.target.value)} /></>}
      {q.passato && <span className="w-full text-xs font-medium text-red-700">L&apos;orario è già passato: scegline uno nel futuro{senzaAdesso ? "" : " (oppure «Adesso»)"}.</span>}
      {!q.passato && q.fuoriOrario && <span className="w-full text-xs text-amber-700">Fuori dall&apos;orario del negozio (lun-ven 9:30-13:30 e 15:00-19:00): il cliente riceverà il messaggio a negozio chiuso.</span>}
      {children}
    </div>
  );
}
