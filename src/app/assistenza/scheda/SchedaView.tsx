"use client";

// LA SCHEDA DI ASSISTENZA (05/10/2026, correzioni di Christian dopo la prima prova): stile moderno, gerarchia chiara,
// barra di avanzamento con il prossimo passo, cliente con scheda completa dalla rubrica, apparecchio a menu,
// preventivo dalle voci del modello, lavorazione, documenti/pagamento/corriere, comunicazioni e registro.
// Tastiera: Ctrl/Cmd+S salva · Alt+← / Alt+→ scheda precedente/successiva.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Copy, Download, FileText, Loader2, Mail, MessageSquareText, Package, Printer, RefreshCw, RotateCcw, Save, Tag, Trash2, UserRound,
  ChevronRight, Plus, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SceltaOperatore, type Operatore } from "@/components/Operatore";
import { toastErrore } from "@/lib/errori";
import type { RicambioAtteso } from "@/lib/assistenza";
import { fetchAPI } from "@/lib/api";
import {
  assAzione, assDocUrl, assEtichettaUrl, assModifica, assScheda, assTrackUrl, dataOra, DOCUMENTI_PDF, eur, pagaFineMese, type ConfigAssistenza, type DocPdf, type Esito, type Scheda,
} from "@/lib/assistenza";
import type { EstimateLine } from "@/lib/assistenza-preventivo";
import { Apparecchio, type ValoriApparecchio } from "./Apparecchio";
import { Avanzamento } from "./Avanzamento";
import { CercaCliente, RiepilogoCliente, SchedaClienteModal } from "./Cliente";
import { Comunicazioni, Registro } from "./Comunicazioni";
import { DialogoCambiaStato, DialogoChiudiTutto, DialogoConsegna, DialogoCorriere, DialogoEsito, DialogoInvio, DialogoPagato, DialogoPronto, DialogoStessoModello, type TipoInvio } from "./Dialoghi";
import { Documenti } from "./Documenti";
import { Lavorazione } from "./Lavorazione";
import { Preventivo, type BozzaPreventivo } from "./Preventivo";
import { DialogoAssegna, DialogoChiudiVerifica, PannelloTecnici } from "./Tecnici";
import { Badge, Campo, Modale, Pill, Sezione, area, campo } from "./ui";

type Bozza = Partial<Scheda>;
type Dialogo = null | { k: "invio"; tipo: TipoInvio } | { k: "chiudi_tutto" } | { k: "esito" } | { k: "pronto" } | { k: "pagato" } | { k: "consegna" } | { k: "corriere" } | { k: "stesso" } | { k: "cliente" }
  | { k: "assegna_verifica" } | { k: "chiudi_verifica" } | { k: "assegna_riparazione" } | { k: "assegna_rimontaggio" } | { k: "cambia_stato" };

function bozzaPreventivo(m: Partial<Scheda>): BozzaPreventivo {
  return { righe: (m.preventivo_righe as EstimateLine[]) || [], diagnosi: m.preventivo?.diagnosi || "", note: m.preventivo?.note || "",
    spedizione_tipo: m.spedizione_tipo || "nessuna", spedizione_importo: m.spedizione_importo ?? "" };
}

export function SchedaView({ id, cfg, operatore, setOperatore, onApri, onCambiata, onChiudi }: {
  id: string; cfg: ConfigAssistenza | null; operatore: string; setOperatore: (o: Operatore) => void;
  onApri: (id: string) => void; onCambiata: () => void; onChiudi?: () => void;
}) {
  const router = useRouter();
  const [s, setS] = useState<Scheda | null>(null);
  const [b, setB] = useState<Bozza>({});
  // 27/10/2026: messaggio di passaggio chiuso con la X su questo computer (per questa sessione)
  const [passaggioChiuso, setPassaggioChiuso] = useState(false);
  const chiaveChiuso = s?.passaggio ? `passaggio-chiuso-${s.id}-${s.passaggio.il}` : "";
  useEffect(() => { try { setPassaggioChiuso(!!chiaveChiuso && sessionStorage.getItem(chiaveChiuso) === "1"); } catch { setPassaggioChiuso(false); } }, [chiaveChiuso]);
  function chiudiPassaggio() { try { if (chiaveChiuso) sessionStorage.setItem(chiaveChiuso, "1"); } catch { /* */ } setPassaggioChiuso(true); }
  const [busy, setBusy] = useState("");
  const [dlg, setDlg] = useState<Dialogo>(null);
  const refPrev = useRef<HTMLDivElement>(null);
  const refDoc = useRef<HTMLDivElement>(null);
  const refTec = useRef<HTMLDivElement>(null);
  const tecnici = (cfg?.tecnici || []).filter((t) => t.attivo !== false);
  const admin = !!cfg?.admin;

  const ricarica = useCallback(() => assScheda(id).then((x) => { setS(x); setB({}); }).catch(toastErrore), [id]);
  useEffect(() => { ricarica(); }, [ricarica]);
  const sporca = Object.keys(b).length > 0;
  const v = <K extends keyof Scheda>(k: K): Scheda[K] | undefined => (k in b ? (b as Scheda)[k] : s?.[k]);
  const set = useCallback((k: keyof Scheda, val: unknown) => setB((x) => ({ ...x, [k]: val })), []);
  // 24/10/2026 (Christian): le storiche si correggono; le CHIUSE (consegnate, annullate) solo il titolare, dopo «Cambia stato»
  const ro = s?.stato === "annullata" || (s?.stato === "consegnato" && !admin);

  // bozza del preventivo dentro la bozza della scheda (aggiornamenti funzionali: più modifiche nello stesso clic)
  const setBz = useCallback((f: (bz: BozzaPreventivo) => BozzaPreventivo) => setB((x) => {
    if (!s) return x;
    const cur = bozzaPreventivo({ ...s, ...x });
    const nw = f(cur);
    const out: Bozza = { ...x };
    if (nw.righe !== cur.righe) out.preventivo_righe = nw.righe;
    if (nw.diagnosi !== cur.diagnosi || nw.note !== cur.note) out.preventivo = { ...(s.preventivo || {}), ...(x.preventivo || {}), diagnosi: nw.diagnosi, note: nw.note };
    if (nw.spedizione_tipo !== cur.spedizione_tipo) out.spedizione_tipo = nw.spedizione_tipo;
    if (nw.spedizione_importo !== cur.spedizione_importo) out.spedizione_importo = (nw.spedizione_importo === "" ? null : nw.spedizione_importo) as number | null;
    return out;
  }), [s]);

  const salva = useCallback(async (silenzioso = false): Promise<boolean> => {
    if (!s || !sporca) return true;
    try {
      const n = await assModifica(s.id, { ...b, operatore });
      setS(n); setB({});
      if (!silenzioso) toast.success("Salvata");
      onCambiata();
      return true;
    } catch (e) { toastErrore(e); return false; }
  }, [s, b, sporca, operatore, onCambiata]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); salva(); }
      if (e.altKey && e.key === "ArrowLeft" && s?.precedente) { e.preventDefault(); onApri(s.precedente.id); }
      if (e.altKey && e.key === "ArrowRight" && s?.successiva) { e.preventDefault(); onApri(s.successiva.id); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [salva, s, onApri]);

  // avviso se si lascia la pagina con modifiche non salvate
  useEffect(() => {
    if (!sporca) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sporca]);

  // 24/10/2026: prima di aprire la finestra d'invio o un PDF si salva la bozza, così anteprima, PDF e invio mostrano
  // le stesse voci che il banco vede sullo schermo (prima l'anteprima leggeva solo il preventivo già salvato)
  async function apriInvio(tipo: string) {
    if (sporca && !(await salva(true))) return;
    setDlg({ k: "invio", tipo } as typeof dlg);
  }
  async function azione(nome: string, body: Record<string, unknown>, msg: string) {
    if (!s) return null;
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return null; }
    if (sporca && !(await salva(true))) return null;
    setBusy(nome);
    try {
      const r = await assAzione(s.id, nome, { operatore, ...body });
      const esito = (r && (r.esito || r.esiti)) as Esito | undefined;
      toast.success(msg + (esito?.mail ? ` · mail ${esito.mail}` : "") + (esito?.whatsapp ? ` · WhatsApp ${esito.whatsapp}` : ""), { duration: 7000 });
      await ricarica(); onCambiata();
      return r;
    } catch (e) { toastErrore(e); return null; } finally { setBusy(""); }
  }
  async function stampa(tipo: "accettazione" | "etichetta" | "etichetta_accessori") {
    if (!s) return;
    // 26/10/2026 (63228): prima si salva, altrimenti l'etichetta esce coi dati vecchi (es. «DA COMPILARE»)
    if (sporca && !ro && !(await salva(true))) return;
    try {
      const r = await assAzione(s.id, "stampa", { tipo, copie: 1 });
      toast.success(r.simulata ? "Scheda di PROVA: stampa simulata (niente stampanti del negozio), apro il PDF"
        : r.agente_attivo ? `In stampa al banco (${tipo === "etichetta" ? "etichetta Brother" : tipo === "etichetta_accessori" ? "etichette degli accessori" : "A4"})` : "Messa in coda, ma l'agente di stampa non risponde: apro il PDF");
      if (!r.agente_attivo) window.open(tipo === "etichetta" ? assEtichettaUrl(s.id) : tipo === "etichetta_accessori" ? assEtichettaUrl(s.id).replace("/etichetta.pdf", "/etichetta-accessori.pdf") : assDocUrl(s.id, "auto"), "_blank");
    } catch (e) { toastErrore(e); }
  }
  async function vendi(tipo: "fattura" | "proforma") {
    const r = await azione("vendi", { tipo }, tipo === "fattura" ? "Fattura in BOZZA creata (non inviata allo SdI)" : "Pro forma creato");
    if (r?.url) router.push(r.url);
  }
  function onAzione(a: string) {
    if (a === "arrivato") azione("arrivato", {}, "Dispositivo arrivato · ricevuta inviata");
    else if (a === "preventivo") refPrev.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (a === "invia_preventivo") apriInvio(s?.preventivo_stato && s.preventivo_stato !== "da_fare" ? "aggiornamento" : "preventivo");
    else if (a === "esito") setDlg({ k: "esito" });
    // 28/10/2026 (63247): conto vendita → in vendita in negozio, senza pronto al cliente
    else if (a === "in_vendita") { if (confirm("Mettere il dispositivo IN VENDITA in negozio (conto vendita)?\nNon parte nessun pronto al cliente.")) azione("in-vendita", {}, "Messo IN VENDITA (conto vendita)"); }
    else if (a === "pronto") setDlg({ k: "pronto" });
    else if (a === "incassa") { refDoc.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (a === "consegna") setDlg({ k: "consegna" });
    // 05/10/2026 (§10.5): verifica e riparazione assegnate ai tecnici
    else if (a === "assegna_verifica") setDlg({ k: "assegna_verifica" });
    else if (a === "chiudi_verifica") setDlg({ k: "chiudi_verifica" });
    else if (a === "assegna_riparazione") setDlg({ k: "assegna_riparazione" });
    else if (a === "stato_riparazione") refTec.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (a === "aggiornamento") setDlg({ k: "invio", tipo: "aggiornamento_riparazione" });
    else if (a === "trova") setDlg({ k: "invio", tipo: "trova" });
    // 26/10/2026 (63202): rifiutato → chiuso / da rimontare (tecnico) / rimontato → pronto negativo
    // 26/10/2026 (63118): preventivo negativo → RIFIUTATO subito, senza mandarlo da accettare
    else if (a === "rifiutato_diretto") { if (confirm("Preventivo NEGATIVO: segnare la scheda come RIFIUTATA senza inviare il preventivo al cliente?\nPoi si va al PRONTO (restituzione).")) azione("esito-preventivo", { esito: "rifiutato", canale: "negozio" }, "Preventivo RIFIUTATO (negativo, non inviato)"); }
    // 26/10/2026 (63214): la ricevuta d'ingresso si manda a scheda compilata (oppure «Non serve»)
    else if (a === "ricevuta") apriInvio("ricevuta");
    else if (a === "ricevuta_no") { if (s && confirm("Non mandare la ricevuta d'ingresso per questa scheda?")) assModifica(s.id, { ricevuta_da_inviare: false, operatore }).then(async () => { await ricarica(); onCambiata(); }).catch(toastErrore); }
    else if (a === "rimontaggio") setDlg({ k: "assegna_rimontaggio" });
    else if (a === "rimontaggio_chiuso") azione("rimontaggio", { azione: "non_serve" }, "Dispositivo chiuso: ora invia il PRONTO (negativo)");
    else if (a === "rimontato") azione("rimontaggio", { azione: "fatto" }, "Richiuso: ora invia il PRONTO (negativo)");
  }
  // 26/10/2026: «Trova il mio» attivo / risolto (la riparazione resta bloccata finché il cliente non abilita la riparazione)
  async function trova(az: "attivo" | "risolto") {
    await azione("trova", { azione: az }, az === "attivo" ? "«Trova il mio» attivo: riparazione bloccata" : "«Trova il mio» risolto: si procede");
  }
  async function riconsegna() {
    if (!s) return;
    const x = prompt("Cosa si riconsegna al cliente? (es. «Si riconsegna SOLO l'hard disk con i dati: il MacBook resta a noi»). Vuoto = tutto.",
      s.riconsegna_nota || "");
    if (x === null) return;
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    try { await assModifica(s.id, { riconsegna_nota: x.trim() || null, operatore }); toast.success(x.trim() ? "Scritto nel prossimo passo" : "Si riconsegna tutto"); await ricarica(); onCambiata(); }
    catch (e) { toastErrore(e); }
  }
  async function statoRiparazione(stato: string) {
    let nota = "";
    if (stato === "attesa_ricambi" || stato === "piu_tempo" || stato === "finita") {
      // 27/10/2026: a lavoro finito il tecnico scrive cosa ha fatto (resta nelle note di riparazione)
      // 27/10/2026 (63201): senza un ricambio già in elenco, in attesa ricambi si DEVE scrivere quale (diventa «da ordinare»)
      const serve = stato === "attesa_ricambi" && !(s?.ricambi_attesi || []).some((r) => r.stato !== "arrivato");
      const x = prompt(stato === "attesa_ricambi" ? (serve ? "QUALE RICAMBIO SERVE? (obbligatorio — es. «batteria Dell PKWVM 95Wh»): va nei ricambi da ordinare"
        : "Nota sul ricambio (facoltativo: dove è ordinato, quando arriva)")
        : stato === "finita" ? "Riparazione FINITA: cosa hai fatto? (es. sostituita scheda logica, test finale OK) — resta nelle note di riparazione" : "Perché serve più tempo? (facoltativo)", "");
      if (x === null) return;
      if (serve && !x.trim()) { toast.error("Scrivi quale ricambio serve"); return; }
      nota = x;
    }
    const r = await azione("stato-riparazione", { riparazione_stato: stato, nota }, `Riparazione: ${stato === "finita" ? "FINITA — ora «PRONTO»" : "stato aggiornato"}`);
    if (r && (stato === "aggiornamento_cliente" || stato === "disabilitare_trova")) setDlg({ k: "invio", tipo: "aggiornamento_riparazione" });
  }

  if (!s) return <div className="rounded-xl border bg-card p-10 text-center"><Loader2 className="inline size-5 animate-spin" /></div>;
  const appV: ValoriApparecchio = {
    famiglia: v("famiglia"), prodotto: v("prodotto"), anno: v("anno"), modello: v("modello"), modello_fonte: v("modello_fonte"), modello_da_scheda: v("modello_da_scheda"),
    seriale: v("seriale"), imei: v("imei"), difetto: v("difetto"), accessori: v("accessori"), con_alimentatore: v("con_alimentatore"),
    password_dispositivo: v("password_dispositivo"), apple_id: v("apple_id"), password_apple_id: v("password_apple_id"),
    numero_interno: v("numero_interno"),
  };
  const bz = bozzaPreventivo({ ...s, ...b });
  const st = s.stato;

  return (
    <div className="space-y-3">
      {/* testata */}
      <div className="sticky top-0 z-20 rounded-xl border bg-card/95 p-2.5 shadow-sm backdrop-blur md:p-3">
        <div className="flex flex-wrap items-center gap-2">
          {onChiudi && <Button size="icon-sm" variant="ghost" className="lg:hidden" onClick={onChiudi} title="Torna all'elenco"><ArrowLeft /></Button>}
          <Button size="icon-xs" variant="outline" disabled={!s.precedente} onClick={() => s.precedente && onApri(s.precedente.id)} title="Precedente (Alt+←)"><ArrowLeft /></Button>
          <span className="text-2xl font-bold tabular-nums tracking-tight">{s.sigla}</span>
          {s.numero_interno && <span className="rounded-md border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-900 dark:bg-blue-950/30 dark:text-blue-100" title="Riferimento del rivenditore / cliente">Vs. rif. {s.numero_interno}</span>}
          <Button size="icon-xs" variant="outline" disabled={!s.successiva} onClick={() => s.successiva && onApri(s.successiva.id)} title="Successiva (Alt+→)"><ArrowRight /></Button>
          <Badge stato={st} />
          {s.prova && s.origine === "prova" && <Pill tono="ambra">PROVA</Pill>}
          {s.sola_lettura && <Pill>storica FileMaker</Pill>}
          <span className="hidden min-w-0 truncate text-sm text-muted-foreground md:inline">{s.azienda || s.nominativo} · {s.modello || s.prodotto}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={ricarica} title="Ricarica"><RefreshCw /></Button>
            {!ro && <Button size="sm" disabled={!sporca} onClick={() => salva()} title="Ctrl/Cmd+S"><Save />Salva{sporca ? " *" : ""}</Button>}
          </div>
        </div>
        {/* l'operatore serve anche sulle schede chiuse (Duplica) */}
        <div className="mt-2"><SceltaOperatore value={operatore as Operatore} onChange={setOperatore} compatto /></div>
      </div>

      <BannerScheda s={s} ro={ro} onTrova={trova} onIstruzioni={() => setDlg({ k: "invio", tipo: "trova" })}
        onPreventivo={() => refPrev.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
      <Avanzamento av={s.avanzamento} onAzione={onAzione} disabilitato={!!busy || ro} chiusa={["consegnato", "annullata"].includes(st)}
        rinvii={<>
          {!ro && st !== "in_arrivo" && st !== "annullata" && <>
            <span className="text-xs font-medium text-muted-foreground">📨 Rinvia al cliente:</span>
            <Button size="xs" variant="outline" disabled={!!busy} onClick={() => apriInvio("ricevuta")}>Ricevuta d&apos;ingresso</Button>
            {bz.righe.length > 0 && s.preventivo_stato && s.preventivo_stato !== "da_fare" && <>
              <Button size="xs" variant="outline" disabled={!!busy} onClick={() => apriInvio("preventivo")}
                title="Rimanda il preventivo (stesse voci): il cliente torna a dover accettare o rifiutare">Preventivo</Button>
              <Button size="xs" variant="outline" disabled={!!busy} onClick={() => apriInvio("aggiornamento")}
                title="Rimanda l'aggiornamento del preventivo (con il preventivo aggiuntivo, se c'è)">Aggiornamento preventivo</Button></>}
            {(st === "pronto" || (st === "accettato" && s.riparazione_stato === "finita") || st === "rifiutato") && (
              <Button size="xs" variant="outline" disabled={!!busy} onClick={() => setDlg({ k: "pronto" })}
                title="Rimanda il pronto / consuntivo da pagare (mail + WhatsApp, con IBAN e PDF)">Pronto da pagare</Button>)}</>}
          {(admin || !["consegnato", "annullata"].includes(st)) && (
            <Button size="xs" className="ml-auto bg-amber-500 text-white hover:bg-amber-600" onClick={() => setDlg({ k: "cambia_stato" })}
              title="Riporta la scheda a qualsiasi stato (anche indietro) o la chiude"><RotateCcw />Cambia stato</Button>)}
        </>}
        onGiaFatto={ro ? undefined : () => setDlg({ k: "chiudi_tutto" })} onRiconsegna={ro ? undefined : riconsegna} />
      {/* 27/10/2026 (Christian, 63228): messaggio di passaggio tra tecnici, in pop-up finché non lo si segna letto */}
      {s.passaggio && !s.passaggio.letto_il && !passaggioChiuso && (
        // 27/10/2026: la X lo chiude solo su questo computer (resta da leggere per il tecnico); «Ho letto» lo chiude per tutti
        <Modale titolo={`📨 Messaggio di ${s.passaggio.da} per ${s.passaggio.a} — scheda ${s.sigla}`} onClose={() => chiudiPassaggio()}
          piedi={<>
            <Button variant="outline" onClick={() => chiudiPassaggio()}>Chiudi (non sono {s.passaggio.a})</Button>
            <Button onClick={async () => {
              if (!s.passaggio || !confirm(`Sei ${s.passaggio.a}? Il messaggio sparirà per tutti (resta nelle note di riparazione).`)) return;
              try { setS(await fetchAPI(`/api/assistenza/schede/${s.id}/passaggio-letto`, { method: "POST", body: JSON.stringify({ operatore }) })); toast.success("Messaggio letto: resta nelle note di riparazione"); } catch (e) { toastErrore(e); }
            }}>Sono {s.passaggio.a}: ho letto</Button></>}>
          <p className="whitespace-pre-line text-base">{s.passaggio.testo}</p>
          <p className="mt-3 text-xs text-muted-foreground">Scritto il {new Date(s.passaggio.il).toLocaleString("it-IT", { timeZone: "Europe/Rome" })} · resta nella cronologia delle note di riparazione.</p>
        </Modale>
      )}
      <DaRicordare key={s.id} s={s} ro={ro} operatore={operatore} onSalvata={async () => { await ricarica(); onCambiata(); }} />
      {s.pronto_prog_stato === "programmato" && s.pronto_prog_il && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
          ⏰ PRONTO programmato per {new Date(s.pronto_prog_il).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          {!ro && <Button size="xs" variant="outline" className="ml-auto" onClick={async () => {
            if (!confirm("Annullare il pronto programmato?")) return;
            try { setS(await fetchAPI(`/api/assistenza/schede/${s.id}/pronto-programmato?operatore=${encodeURIComponent(operatore || "")}`, { method: "DELETE" })); toast.success("Pronto programmato annullato"); onCambiata(); } catch (e) { toastErrore(e); }
          }}>Annulla</Button>}
        </div>)}
      {s.pronto_prog_stato === "errore" && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-900">⚠️ Il pronto programmato NON è partito: {s.pronto_prog_esito}. Mandalo con PRONTO.</div>}
      {!ro && s.stato !== "annullata" && <ComunicazioneCliente key={`com-${s.id}`} s={s} operatore={operatore} invia={(b) => azione("comunicazione", b, "Comunicazione inviata al cliente")}
        togli={async () => { if (!confirm("Togliere la comunicazione dalla scheda? Non comparirà più nelle prossime mail, WhatsApp e PDF.")) return;
          try { await assModifica(s.id, { comunicazione_cliente: null, operatore }); await ricarica(); onCambiata(); toast.success("Comunicazione tolta"); } catch (e) { toastErrore(e); } }} />}
      {(s.stato === "accettato" || (s.ricambi_attesi || []).length > 0) && <RicambiAttesi key={`ric-${s.id}`} s={s} ro={ro} operatore={operatore}
        onSalvata={async () => { await ricarica(); onCambiata(); }} />}
      <BannerRecensione s={s} ro={ro} onScelta={(az) => azione("recensione", { azione: az }, az === "invia" ? "Richiesta di recensione inviata" : "Recensione: non si chiede")} />

      {/* azioni e PDF */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card p-2 shadow-sm">
        {!ro && st === "in_arrivo" && <Button size="sm" disabled={!!busy} onClick={() => onAzione("arrivato")}><Package />Dispositivo arrivato</Button>}
        {!ro && <Button size="sm" variant="outline" disabled={!!busy || st === "in_arrivo"} onClick={() => setDlg({ k: "invio", tipo: "ricevuta" })}><Mail />Ricevuta</Button>}
        {!ro && (st === "preventivo_inviato" || (st === "da_preventivare" && bz.righe.length > 0)) && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setDlg({ k: "esito" })}>Accettato / Rifiutato</Button>)}
        {!ro && st === "accettato" && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setDlg({ k: "invio", tipo: "aggiornamento_riparazione" })}><MessageSquareText />Aggiornamento riparazione</Button>}
        {!ro && st !== "in_arrivo" && st !== "consegnato" && <Button size="sm" variant={(st === "accettato" && s.riparazione_stato === "finita") || st === "rifiutato" ? "default" : "outline"} disabled={!!busy} onClick={() => setDlg({ k: "pronto" })}>PRONTO</Button>}
        {!ro && st === "pronto" && <Button size="sm" variant={s.pagata || s.saldo <= 0 ? "default" : "outline"} disabled={!!busy} onClick={() => setDlg({ k: "consegna" })}>CONSEGNA</Button>}
        <span className="mx-0.5 hidden h-6 w-px bg-border sm:block" />
        <MenuPdf id={s.id} prima={() => salva(true)} />
        <Button size="sm" variant="outline" onClick={() => stampa("etichetta")} title="Etichetta Brother"><Tag />Etichetta</Button>
        {/* 26/10/2026 (63228): etichetta a parte per alimentatore e accessori (senza ristampare quella del dispositivo) */}
        {(v("con_alimentatore") || v("accessori")) && <Button size="sm" variant="outline" onClick={() => stampa("etichetta_accessori")}
          title="Un'etichetta per ogni accessorio consegnato"><Tag />Etichetta {v("con_alimentatore") && !v("accessori") ? "alimentatore" : "accessori"}</Button>}
        <Button size="sm" variant="outline" onClick={() => stampa("accettazione")} title="Stampa A4 al banco"><Printer />A4</Button>
        <span className="ml-auto" />
        <a className="text-xs text-muted-foreground underline" href={assTrackUrl(s.token_pubblico)} target="_blank" rel="noreferrer" title="Pagina pubblica per il cliente (senza dati personali)">pagina cliente</a>
        {/* 26/10/2026 (62245): DUPLICA anche dalle schede chiuse e storiche (la scheda originale non cambia) */}
        <Button size="sm" variant="outline" title="Nuova scheda identica (stesso cliente e dispositivo, difetto e accessori): poi correggi quello che serve" onClick={async () => {
          if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
          const stesso = confirm("Duplica la scheda.\n\nOK = scheda IDENTICA (stesso cliente, stesso dispositivo, difetto e accessori)\nAnnulla = solo stesso cliente, dispositivo nuovo");
          try { const n = await assAzione(s.id, "duplica", { operatore, stesso_dispositivo: stesso, identica: stesso }); toast.success(`Nuova scheda ${n.sigla}: correggi quello che serve`); onCambiata(); onApri(n.id); }
          catch (e) { toastErrore(e); }
        }}><Copy />Duplica</Button>
        {/* 25/10/2026: la chat WhatsApp 334 di questo cliente (dati di fatturazione, foto, risposte) */}
        {s.telefono && <Button size="sm" variant="outline" title="Apri la chat WhatsApp staff 334 di questo numero"
          onClick={() => { window.location.href = `/chat-apple?tab=staff&tel=${encodeURIComponent(s.telefono || "")}`; }}><MessageSquareText />Chat WhatsApp</Button>}
        {admin && !ro && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => {
          const m = prompt("Motivo dell'annullamento della scheda?");
          if (m !== null) azione("annulla", { motivo: m }, "Scheda annullata");
        }}><Trash2 />Annulla</Button>}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Sezione titolo="Cliente" icona={<UserRound />}
          azioni={<Button size="sm" variant="outline" onClick={() => setDlg({ k: "cliente" })}>{s.anagrafica ? "Scheda cliente" : "Crea scheda cliente"}</Button>}>
          <div className="space-y-3">
            <RiepilogoCliente a={s.anagrafica} nome={String(v("azienda") || v("nominativo") || "")} telefono={v("telefono")} email={v("email")} />
            {!ro && <CercaCliente placeholder="Cambia cliente: cerca in rubrica" onScelto={(a) => {
              set("anagrafica_id", a.id); set("azienda", a.denominazione);
              const tel = a.cellulare_whatsapp || a.cellulare || a.telefono; if (tel) set("telefono", tel); if (a.email) set("email", a.email);
              toast.info(`Cliente «${a.denominazione}»: salva la scheda per collegarlo`);
            }} />}
            <div className="grid gap-2 sm:grid-cols-2">
              <Campo label="Nome / azienda"><input className={campo} disabled={ro} value={(v("azienda") as string) || ""} onChange={(e) => set("azienda", e.target.value)} /></Campo>
              <Campo label="Cellulare (WhatsApp)"><input className={campo} disabled={ro} inputMode="tel" value={(v("telefono") as string) || ""} onChange={(e) => set("telefono", e.target.value)} /></Campo>
              <Campo label="Email"><input className={campo} disabled={ro} type="email" value={(v("email") as string) || ""} onChange={(e) => set("email", e.target.value)} /></Campo>
              <Campo label="Referente"><input className={campo} disabled={ro} value={(v("referente") as string) || ""} onChange={(e) => set("referente", e.target.value)} /></Campo>
              <Campo label="Indirizzo di spedizione" className="sm:col-span-2"><input className={campo} disabled={ro} value={(v("indirizzo_spedizione") as string) || ""} onChange={(e) => set("indirizzo_spedizione", e.target.value)} /></Campo>
              <Campo label="Note visibili al cliente" className="sm:col-span-2"><input className={campo} disabled={ro} value={(v("note") as string) || ""} onChange={(e) => set("note", e.target.value)} /></Campo>
            </div>
            {/* 24/10/2026 (Christian): rif. del cliente, pacco combinato, DDT, EX in una riga; si modificano a richiesta */}
            <RiferimentiScheda s={s} v={v} set={set} ro={ro} operatore={operatore} onApri={onApri} onCambiata={onCambiata} salva={salva} />
          </div>
        </Sezione>

        <Sezione titolo="Apparecchio" icona={<FileText />} sottotitolo={`accettato ${dataOra(s.fasi?.accettazione?.il || s.created_at)}${s.operatore_accettazione ? ` · ${s.operatore_accettazione}` : ""}`}>
          <Apparecchio v={appV} set={(k, val) => set(k as keyof Scheda, val)} ro={ro} famiglie={cfg?.famiglie} prodotti={cfg?.prodotti} idScheda={s.id} onApri={onApri} />
        </Sezione>
      </div>

      <div ref={refTec} className="scroll-mt-28">
        <PannelloTecnici s={s} tecnici={tecnici} ro={ro} busy={!!busy}
          onAssegnaVerifica={() => setDlg({ k: "assegna_verifica" })} onChiudiVerifica={() => setDlg({ k: "chiudi_verifica" })}
          onRiapriVerifica={() => azione("riapri-verifica", {}, "Verifica riaperta")}
          onAssegnaRiparazione={() => setDlg({ k: "assegna_riparazione" })} onStato={statoRiparazione} />
      </div>

      <div ref={refPrev} className="scroll-mt-28">
        {!ro && bz.righe.length > 0 && ["da_preventivare", "preventivo_inviato", "accettato"].includes(st) && (
          <VerificaPreventivo s={s} admin={admin} busy={!!busy}
            onAzione={(az, nota) => azione("verifica-preventivo", { azione: az, nota },
              az === "richiedi" ? "Preventivo mandato in verifica a Christian" : az === "approva" ? "Preventivo approvato" : az === "correggi" ? "Preventivo rimandato al banco" : "Verifica tolta")}
            onInvia={() => apriInvio(s.preventivo_stato && s.preventivo_stato !== "da_fare" ? "aggiornamento" : "preventivo")} />)}
        <Preventivo s={s} attuale={{ modello: String(v("modello") || ""), prodotto: String(v("prodotto") || ""),
          famiglia: String(v("famiglia") || ""), anno: v("anno") == null ? "" : String(v("anno")) }} bz={bz} setBz={setBz} ro={ro} spedDefault={cfg?.spedizione_default?.ar ?? 28}
          onInvia={() => apriInvio(s.preventivo_stato && s.preventivo_stato !== "da_fare" ? "aggiornamento" : "preventivo")}
          onNotaInterna={(t) => set("note_interne", ((v("note_interne") as string) ? `${v("note_interne")}\n` : "") + t)}
          onStessoModello={() => setDlg({ k: "stesso" })} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[3fr_2fr]">
        <Lavorazione s={s} v={v} set={set} ro={ro} tecnici={tecnici.map((t) => t.codice)} />
        <div ref={refDoc} className="scroll-mt-28 space-y-3">
          <Documenti s={s} ro={ro} busy={!!busy} onFatturaEliminata={async () => { await ricarica(); onCambiata(); }}
            onScontrino={async () => { if (sporca && !(await salva(true))) return; router.push(`/cassa?scheda=${s.id}`); }}
            onAcconto={async () => {
              if (sporca && !(await salva(true))) return;
              const x = prompt("Importo dell'acconto (€)", "");
              const imp = Number(String(x || "").replace(",", "."));
              if (imp > 0) router.push(`/cassa?${new URLSearchParams({ scheda: s.id, acconto: imp.toFixed(2) })}`);
            }}
            onRichiediAcconto={async () => {
              const x = prompt("Acconto da chiedere al cliente (€) — parte una mail e un WhatsApp con IBAN, causale e il preventivo allegato", "");
              const imp = Number(String(x || "").replace(",", "."));
              if (!(imp > 0)) return;
              await azione("richiesta-acconto", { importo: imp }, `Richiesta di acconto di ${eur(imp)} inviata`);
            }}
            onPagamentoAnticipato={async (documento) => {
              if (sporca && !(await salva(true))) return;
              const cosa = documento === "proforma" ? "il PRO FORMA" : "la FATTURA (va allo SdI da incassare)";
              if (!confirm(`Chiedere ORA il pagamento di ${eur(s.saldo)} con ${cosa}? Parte una mail con il documento, IBAN e causale, e un WhatsApp.`)) return;
              await azione("pagamento-anticipato", { documento }, `Richiesta di pagamento anticipato di ${eur(s.saldo)} inviata`);
            }}
            onVendi={vendi} onPagato={() => setDlg({ k: "pagato" })} onCorriere={() => setDlg({ k: "corriere" })} />
          <Sezione titolo="Nota interna" sottotitolo="mai al cliente">
            <textarea className={area} rows={3} disabled={ro} value={(v("note_interne") as string) || ""} onChange={(e) => set("note_interne", e.target.value)} />
          </Sezione>
        </div>
      </div>

      {/* 24/10/2026 (Christian): comunicazioni e fasi si aprono con un clic, così la scheda non è infinita */}
      <div className="grid gap-3 xl:grid-cols-2">
        <Apribile titolo="Comunicazioni al cliente" conteggio={(s.comunicazioni || []).length}><Comunicazioni s={s} /></Apribile>
        <Apribile titolo="Fasi e registro" conteggio={(s.eventi || []).length}><Registro s={s} /></Apribile>
      </div>

      {dlg?.k === "chiudi_tutto" && <DialogoChiudiTutto s={s} onClose={() => setDlg(null)} onChiudi={async (b) => !!(await azione("chiudi-tutto", b, "Scheda chiusa: già fatto tutto"))} />}
      {dlg?.k === "invio" && <DialogoInvio s={s} tipo={dlg.tipo} onClose={() => setDlg(null)} onInvia={async (body) => {
        const nome = dlg.tipo === "ricevuta" ? "ricevuta" : dlg.tipo === "aggiornamento_riparazione" ? "aggiornamento-riparazione" : dlg.tipo === "trova" ? "trova" : "preventivo";
        const corpo = dlg.tipo === "preventivo" || dlg.tipo === "aggiornamento" ? { ...body, tipo: dlg.tipo } : dlg.tipo === "trova" ? { ...body, azione: "invia" } : body;
        const r = await azione(nome, corpo, dlg.tipo === "ricevuta" ? "Ricevuta" : dlg.tipo === "aggiornamento_riparazione" ? "Aggiornamento riparazione" : dlg.tipo === "trova" ? "Istruzioni «Trova il mio» inviate" : "Preventivo inviato");
        return r ? (r.esito as Esito) : null;
      }} />}
      {dlg?.k === "esito" && <DialogoEsito s={s} righe={bz.righe} onClose={() => setDlg(null)}
        onEsito={async (body) => !!(await azione("esito-preventivo", body, body.esito === "accettato" ? "ACCETTATO: in riparazione, lavorazione precompilata" : "Preventivo RIFIUTATO"))} />}
      {dlg?.k === "pronto" && <DialogoPronto s={s} lavorazione={String(v("lavorazione") || "")} totale={(v("totale_lavorazione") as number | null) ?? null} onClose={() => setDlg(null)}
        onInvia={async (body) => { const r = await azione("pronto", body, body.programma_il ? "PRONTO programmato" : "PRONTO"); return r ? (r.esito as Esito) : null; }} />}
      {dlg?.k === "cambia_stato" && <DialogoCambiaStato s={s} onClose={() => setDlg(null)} onConferma={async (b) => !!(await azione("riapri", b, "Stato della scheda cambiato"))} />}
      {dlg?.k === "pagato" && <DialogoPagato s={s} onClose={() => setDlg(null)} onPagato={async (body) => !!(await azione("pagamento", body, "Pagamento registrato"))} />}
      {dlg?.k === "consegna" && <DialogoConsegna s={s} onClose={() => setDlg(null)} onConsegna={async (modo) => {
        // 14/10/2026: con un saldo aperto il backend ferma la consegna; si va avanti solo con conferma esplicita
        const daPagare = ["ritiro", "spedizione", "corriere_cliente"].includes(modo) && !s.pagata && s.saldo > 0 && !pagaFineMese(s);
        if (daPagare && !confirm(`Risulta ancora da pagare ${eur(s.saldo)}. Consegnare lo stesso senza pagamento?`)) return false;
        return !!(await azione("consegna", { modo, forza: daPagare || undefined }, "Consegnata: scheda chiusa"));
      }} />}
      {dlg?.k === "corriere" && <DialogoCorriere s={s} operatore={operatore} onClose={() => setDlg(null)}
        onFatta={() => { setDlg(null); ricarica(); onCambiata(); }}
        onCorriereCliente={async () => {
          try { const n = await assModifica(s.id, { consegna_corriere: "cliente", consegna_modo: "spedizione", operatore }); setS(n); toast.success("Annotato: ritira il corriere del cliente"); setDlg(null); }
          catch (e) { toastErrore(e); }
        }} />}
      {dlg?.k === "assegna_verifica" && <DialogoAssegna titolo={`Assegna in verifica — scheda ${s.sigla}`} tecnici={tecnici} attuale={s.tecnico_verifica}
        testo="Chi fa la verifica (test in ingresso / diagnosi)? Il tecnico poi scrive la verifica e la chiude." onClose={() => setDlg(null)}
        onAssegna={async (t, m) => !!(await azione("assegna-verifica", { tecnico: t, messaggio: m }, `Verifica assegnata a ${t}${m ? " con messaggio" : ""}`))} />}
      {dlg?.k === "chiudi_verifica" && <DialogoChiudiVerifica s={s} tecnici={tecnici} onClose={() => setDlg(null)}
        onChiudi={async (body) => !!(await azione("chiudi-verifica", body, "Verifica chiusa: da preventivare"))} />}
      {dlg?.k === "assegna_riparazione" && <DialogoAssegna titolo={`Assegna in riparazione — scheda ${s.sigla}`} tecnici={tecnici} attuale={s.tecnico_riparazione}
        testo="Chi fa la riparazione? Poi si aggiorna lo stato: attesa ricambi, aggiornamento al cliente, serve più tempo, «Trova il mio dispositivo», finita."
        onClose={() => setDlg(null)} onAssegna={async (t, m) => !!(await azione("assegna-riparazione", { tecnico: t, messaggio: m }, `Riparazione assegnata a ${t}${m ? " con messaggio" : ""}`))} />}
      {dlg?.k === "assegna_rimontaggio" && <DialogoAssegna titolo={`Rifiutato da richiudere — scheda ${s.sigla}`} tecnici={tecnici} attuale={s.tecnico_riparazione}
        testo="Il preventivo è rifiutato e il dispositivo è stato smontato per la verifica: chi lo richiude? Quando l'ha richiuso il tecnico segna «Richiuso: pronto da ritirare» e si invia il PRONTO negativo."
        onClose={() => setDlg(null)} onAssegna={async (t) => !!(await azione("rimontaggio", { azione: "serve", tecnico: t }, `Da richiudere: assegnato a ${t}`))} />}
      {dlg?.k === "stesso" && <DialogoStessoModello s={s} ro={ro} onClose={() => setDlg(null)} onApri={onApri}
        onCopia={(r) => { setBz((x) => ({ ...x, righe: r })); setDlg(null); toast.success("Preventivo copiato: controlla i prezzi e salva"); }} />}
      {dlg?.k === "cliente" && <SchedaClienteModal id={s.anagrafica_id}
        iniziale={s.anagrafica_id ? undefined : { denominazione: s.azienda || s.nominativo || "", cellulare: s.telefono, email: s.email, referente: s.referente }}
        onClose={() => setDlg(null)} onApriScheda={(x) => { setDlg(null); onApri(x); }}
        onSalvato={async (a) => {
          setDlg(null);
          if (!s.anagrafica_id && !ro) { try { setS(await assModifica(s.id, { anagrafica_id: a.id, operatore })); } catch (e) { toastErrore(e); } }
          await ricarica(); onCambiata();
        }} />}
    </div>
  );
}

function MenuPdf({ id, prima }: { id: string; prima: () => Promise<boolean> }) {
  const [doc, setDoc] = useState<DocPdf>("auto");
  // la finestra si apre subito (niente blocco dei popup) e carica il PDF dopo il salvataggio della bozza
  async function apri(scarica: boolean) {
    const w = scarica ? null : window.open("about:blank", "_blank");
    if (!(await prima())) { w?.close(); return; }
    if (w) w.location.href = assDocUrl(id, doc); else window.location.href = assDocUrl(id, doc, true);
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border p-0.5">
      <select className="h-7 rounded bg-transparent px-1 text-xs" value={doc} onChange={(e) => setDoc(e.target.value as DocPdf)} aria-label="Documento PDF">
        <option value="auto">PDF secondo lo stato</option>
        {DOCUMENTI_PDF.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <button type="button" className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs hover:bg-muted" onClick={() => apri(false)}><FileText className="size-3.5" />Apri</button>
      <button type="button" className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs hover:bg-muted" onClick={() => apri(true)}><Download className="size-3.5" />Scarica</button>
    </span>
  );
}

function Apribile({ titolo, conteggio, children }: { titolo: string; conteggio: number; children: React.ReactNode }) {
  const [aperto, setAperto] = useState(false);
  return aperto ? (
    <div className="space-y-1">
      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setAperto(false)}>Chiudi «{titolo}»</button>
      {children}
    </div>
  ) : (
    <button type="button" onClick={() => setAperto(true)} className="flex w-full items-center gap-2 rounded-xl border bg-card px-4 py-3 text-left text-sm font-semibold shadow-sm hover:bg-muted/50">
      <ChevronRight className="size-4" />{titolo}<span className="font-normal text-muted-foreground">({conteggio})</span><span className="ml-auto text-xs font-normal text-muted-foreground">apri</span>
    </button>
  );
}

/** Riferimento del cliente, spedizione combinata, DDT, schede precedenti: riepilogo + modifica + «crea schede nello stesso pacco». */
function RiferimentiScheda({ s, v, set, ro, operatore, onApri, onCambiata, salva }: {
  s: Scheda; v: (k: keyof Scheda) => unknown; set: (k: keyof Scheda, val: unknown) => void; ro: boolean; operatore: string;
  onApri: (id: string) => void; onCambiata: () => void; salva: (silenziosa?: boolean) => Promise<boolean>;
}) {
  const [modifica, setModifica] = useState(false);
  const comb = (v("spedizione_combinata") as string) || "";
  const voci = [["Rif. cliente", v("rif_cliente")], ["DDT", v("ddt_cliente")], ["Schede precedenti", v("schede_precedenti")]].filter(([, x]) => x) as [string, string][];
  async function creaCodice() {
    const nome = String(v("azienda") || v("nominativo") || "X").toUpperCase().replace(/[^A-Z]/g, "");
    const codice = `${nome.slice(0, 2) || "SC"}${s.sigla}`;
    set("spedizione_combinata", codice);
    try { await navigator.clipboard.writeText(codice); } catch { /* copia non disponibile */ }
    toast.success(`Spedizione combinata ${codice} (copiata): salva la scheda`);
  }
  async function altraNelPacco() {
    if (!operatore) { toast.error("Scegli l'operatore"); return; }
    if (!comb) { toast.error("Prima crea il codice della spedizione combinata"); return; }
    // 26/10/2026 (Christian, 63228): quanti ALTRI dispositivi sono nel pacco → altrettante schede VUOTE (numeri progressivi),
    // stesso cliente e stesso pacco; modello, seriale e difetto si compilano dopo (la ricevuta si manda a scheda compilata)
    const x = prompt(`Quanti ALTRI dispositivi ci sono nel pacco ${comb}? (oltre a questo)`, "1");
    if (x === null) return;
    const quante = Number(x.trim());
    if (!Number.isInteger(quante) || quante < 1 || quante > 20) { toast.error("Scrivi un numero da 1 a 20"); return; }
    if (!(await salva(true))) return;
    try {
      const r = await assAzione(s.id, "duplica", { operatore, combinata: true, quante });
      const sigle = ((r.schede as { sigla: string }[]) || []).map((y) => y.sigla).join(", ");
      toast.success(`${quante === 1 ? "Creata la scheda" : `Create ${quante} schede`} ${sigle} nel pacco ${comb}: compila prodotto, seriale e difetto, poi manda la ricevuta`, { duration: 9000 });
      onCambiata(); onApri(r.id);
    } catch (e) { toastErrore(e); }
  }
  const pacco = s.collegamenti?.combinata || [];
  return (
    <div className="space-y-2 rounded-lg border p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {comb ? <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100">📦 {comb}
          <button type="button" title="Copia il codice" onClick={() => navigator.clipboard?.writeText(comb).then(() => toast.success("Codice copiato"))}><Copy className="size-3" /></button></span>
          : <span className="text-xs text-muted-foreground">Nessuna spedizione combinata</span>}
        {voci.map(([k, x]) => <span key={k} className="text-xs"><span className="text-muted-foreground">{k}:</span> <b>{x}</b></span>)}
        <span className="ml-auto flex gap-1">
          {!ro && !comb && <Button size="xs" variant="outline" onClick={creaCodice} title="Più dispositivi nello stesso pacco: crea il codice (iniziali + numero di questa scheda)">📦 Spedizione combinata</Button>}
          {!ro && comb && <Button size="xs" variant="outline" onClick={altraNelPacco}><Plus />Altre schede nello stesso pacco…</Button>}
          {!ro && <Button size="xs" variant="ghost" onClick={() => setModifica((x) => !x)}>{modifica ? "Chiudi" : "Modifica"}</Button>}
        </span>
      </div>
      {pacco.length > 0 && (
        <div className="text-xs"><span className="text-muted-foreground">Nello stesso pacco{s.arrivo_modo === "pony" ? " (pony)" : s.arrivo_modo === "corriere_cliente" ? " (corriere del cliente)" : ""}: </span>
          {pacco.map((c) => <button key={c.id} type="button" className="mr-2 text-blue-700 underline" onClick={() => onApri(c.id)}>{c.sigla}{c.rif_cliente ? ` (${c.rif_cliente})` : ""}</button>)}</div>
      )}
      {modifica && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo label="Riferimento del cliente (rif.)"><input className={campo} disabled={ro} placeholder="es. M2479" value={(v("rif_cliente") as string) || ""} onChange={(e) => set("rif_cliente", e.target.value)} /></Campo>
          <Campo label="Spedizione combinata (stesso pacco)"><input className={campo} disabled={ro} placeholder="es. TA63110" value={comb} onChange={(e) => set("spedizione_combinata", e.target.value.toUpperCase())} /></Campo>
          <Campo label="DDT del cliente"><input className={campo} disabled={ro} value={(v("ddt_cliente") as string) || ""} onChange={(e) => set("ddt_cliente", e.target.value)} /></Campo>
          <Campo label="Schede precedenti (EX)"><input className={campo} disabled={ro} value={(v("schede_precedenti") as string) || ""} onChange={(e) => set("schede_precedenti", e.target.value)} /></Campo>
        </div>
      )}
    </div>
  );
}


/** 26/10/2026 (Christian): dopo la consegna (ritirato o spedito) si sceglie se chiedere la recensione su Google
 *  (mail + WhatsApp, come per le Tarature). Solo per le consegne degli ultimi 30 giorni, una volta per scheda. */
function BannerRecensione({ s, ro, onScelta }: { s: Scheda; ro: boolean; onScelta: (a: "invia" | "no") => void }) {
  const consegna = (s.fasi as Record<string, { il?: string } | undefined> | undefined)?.consegna?.il;
  const recente = !!consegna && Date.now() - new Date(consegna).getTime() < 30 * 86400000;
  if (s.stato !== "consegnato" || !["RITIRATO", "SPEDITO"].includes(String(s.ritirato || "").toUpperCase())) return null;
  if (s.recensione_stato === "inviata") return <div className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground">⭐ Recensione su Google chiesta{s.recensione_il ? ` il ${dataOra(s.recensione_il)}` : ""}</div>;
  if (s.recensione_stato || !recente || ro) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <span className="font-semibold">⭐ {s.ritirato === "SPEDITO" ? "Spedito" : "Ritirato"}: chiediamo al cliente una recensione su Google?</span>
      <span className="text-xs">mail{s.email ? ` a ${s.email}` : " (manca)"} + WhatsApp{s.telefono ? ` a ${s.telefono}` : " (manca)"}</span>
      <span className="ml-auto flex gap-1">
        <Button size="sm" onClick={() => onScelta("invia")}>⭐ Sì, chiedi la recensione</Button>
        <Button size="sm" variant="outline" onClick={() => onScelta("no")}>No</Button>
      </span>
    </div>
  );
}


/** 26/10/2026 (Christian): in cima alla scheda, in chiaro: «Trova il mio» attivo (riparazione bloccata) e come è arrivato /
 *  come torna il dispositivo (corriere del cliente, nostro corriere, pony: NON si ritira a mano in negozio). */
function BannerScheda({ s, ro, onTrova, onIstruzioni, onPreventivo }: { s: Scheda; ro: boolean; onTrova: (a: "attivo" | "risolto") => void; onIstruzioni: () => void; onPreventivo: () => void }) {
  const chiusa = ["consegnato", "annullata"].includes(s.stato);
  const trovaAttivo = s.trova_il_mio === "attivo" || s.riparazione_stato === "disabilitare_trova";
  const bloccata = trovaAttivo && s.preventivo_stato === "accettato";   // prima si accetta il preventivo (63144)
  const arrivo = s.arrivo_modo || "";
  const sped = s.consegna_modo === "spedizione" || ["corriere_cliente", "pony", "corriere_nostro", "ritiro_nostro"].includes(arrivo);
  const delCliente = arrivo === "corriere_cliente" || (s.consegna_modo === "spedizione" && s.consegna_corriere === "cliente");
  const pony = arrivo === "pony";
  // 26/10/2026 (Christian, 63214): il nostro ritiro UPS/DHL collegato alla scheda dice da solo come è arrivato il dispositivo
  const ritiro = (s.spedizioni || []).find((x) => x.direction === "ritiro" && x.status !== "annullata" && !x.test_mode);
  return (
    <>
      {trovaAttivo && !chiusa && (
        <div className={`flex flex-wrap items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm ${bloccata
          ? "border-red-400 bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100" : "border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"}`}>
          <b>{bloccata ? "🔒 «TROVA IL MIO» ATTIVO — RIPARAZIONE BLOCCATA." : "🔒 «TROVA IL MIO» ATTIVO — da disattivare DOPO l'accettazione del preventivo."}</b>
          <span>Il cliente deve abilitare la riparazione (Dov&apos;è → Riparazione o permuta) oppure rimuovere il dispositivo dall&apos;account.</span>
          {!ro && <span className="ml-auto flex gap-1">
            {!bloccata && <Button size="xs" variant="outline" onClick={onPreventivo} title="Scrive l'avviso nelle note del preventivo (va nel PDF)">Inserisci nel preventivo</Button>}
            <Button size="xs" variant="destructive" onClick={onIstruzioni}>Invia istruzioni (mail + WhatsApp)</Button>
            <Button size="xs" variant="outline" onClick={() => onTrova("risolto")}>Il cliente l&apos;ha fatto: si procede</Button>
          </span>}
        </div>
      )}
      {!trovaAttivo && !chiusa && !ro && (
        <div className="-my-1 text-right"><button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => onTrova("attivo")}>
          🔒 Segna «Trova il mio» attivo{s.trova_il_mio === "risolto" ? " (era stato risolto)" : ""}</button></div>
      )}
      {ritiro && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm text-sky-950 dark:bg-sky-950/20 dark:text-sky-100">
          <b>🚚 ARRIVATO CON IL NOSTRO RITIRO {ritiro.carrier || "UPS"}</b>
          <span className="font-mono">{ritiro.tracking}</span>
          {ritiro.pickup_date && <span className="text-xs text-muted-foreground">ritiro del {new Date(`${String(ritiro.pickup_date).slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT")}</span>}
        </div>
      )}
      {(sped || ritiro) && !chiusa && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-sky-400 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
          <b>{pony ? "🛵 ARRIVATO CON PONY / CORRIERE DEL CLIENTE" : delCliente ? "📦 SPEDITO DAL CLIENTE (suo corriere)" : "🚚 SPEDIZIONE ORGANIZZATA DA NOI"}</b>
          <span>— <b>non si ritira a mano in negozio</b>: {pony || delCliente
            ? "torna con la spedizione organizzata dal cliente (aspettiamo la sua etichetta o il suo pony). Se il cliente ci chiede il ritorno, si crea la spedizione di ritorno qui sotto."
            : "torna con il nostro corriere (spedizione di ritorno dalla sezione spedizioni)."}</span>
        </div>
      )}
    </>
  );
}


/** 26/10/2026 (Christian, 63217): nota grande «da ricordare» — cosa va fatto (es. mettere nel pacco la scatola della Pencil). */
/** 26/10/2026 (Christian, 63201): COMUNICAZIONE CON IL CLIENTE — testo libero (es. «ci serve l'alimentatore originale»)
 *  per mail e WhatsApp, in qualsiasi stato della scheda, senza cambiare lo stato e senza rimandare la scheda. */
function ComunicazioneCliente({ s, operatore, invia, togli }: { s: Scheda; operatore: string; invia: (b: Record<string, unknown>) => Promise<unknown>; togli: () => void }) {
  const [testo, setTesto] = useState("");
  const [ricorda, setRicorda] = useState(true);
  // 26/10/2026 (Christian): insieme al testo si può mandare anche la scheda (preventivo, pronto, consuntivo…)
  const [documento, setDocumento] = useState("auto");
  const DOC: [string, string][] = [["auto", "la scheda dello stato attuale"],
    ["", "solo il testo, senza scheda"], ["ricevuta", "ricevuta d'ingresso"], ["preventivo", "preventivo"], ["pronto", "pronto per il ritiro"], ["consuntivo", "consuntivo con bonifico"]];
  const [mail, setMail] = useState(!!s.email);
  const [wa, setWa] = useState(!!s.telefono && !s.cliente_no_whatsapp);
  const [busy, setBusy] = useState(false);
  const [inviata, setInviata] = useState<string | null>(null);
  async function manda() {
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    if (testo.trim().length < 3) { toast.error("Scrivi la comunicazione"); return; }
    const allegato = DOC.find(([k]) => k === documento)?.[1] || "";
    if (!confirm(`Inviare al cliente${mail ? " per mail" : ""}${mail && wa ? " e" : ""}${wa ? " su WhatsApp" : ""}?\n\n«${testo.trim()}»\n\n${documento ? `Insieme a: ${allegato}` : "Solo il testo, senza scheda"}`)) return;
    setBusy(true);
    try { if (await invia({ testo: testo.trim(), invia_mail: mail, invia_wa: wa, ricorda, documento: documento || null })) { setInviata(testo.trim()); setTesto(""); } } finally { setBusy(false); }
  }
  return (
    <div className="space-y-1.5 rounded-xl border-2 border-blue-200 bg-blue-50/60 p-2.5 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-blue-950 dark:text-blue-100">💬 Comunicazione con il cliente</span>
        <span className="text-xs text-muted-foreground">arriva per mail e WhatsApp con il numero della scheda, in qualsiasi stato (non cambia lo stato)</span>
      </div>
      {s.comunicazione_cliente && (
        <div className="flex flex-wrap items-start gap-2 rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-sm dark:bg-blue-950/40">
          <span className="font-semibold">📌 In evidenza in ogni mail, WhatsApp e PDF:</span><span className="flex-1 whitespace-pre-line">{s.comunicazione_cliente}</span>
          <Button size="xs" variant="ghost" className="text-red-700" onClick={togli}>Togli</Button>
        </div>
      )}
      <textarea className={`${campo} min-h-[64px]`} placeholder="Es. Per procedere occorre che ci consegni l'alimentatore originale." value={testo} onChange={(e) => setTesto(e.target.value)} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={mail} disabled={!s.email} onChange={(e) => setMail(e.target.checked)} />mail{s.email ? ` (${s.email})` : " — manca"}</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={wa} disabled={!s.telefono} onChange={(e) => setWa(e.target.checked)} />WhatsApp{s.telefono ? ` (${s.telefono})` : " — manca"}</label>
        <label className="flex items-center gap-1.5">insieme a
          <select className={`${campo} h-8 w-auto py-0`} value={documento} onChange={(e) => setDocumento(e.target.value)}>
            {DOC.map(([k, l]) => <option key={k || "nessuno"} value={k}>{l}</option>)}</select></label>
        <label className="flex items-center gap-1.5" title="Resta sulla scheda: compare in evidenza in tutte le prossime mail, WhatsApp e PDF (preventivo, pronto, consuntivo…)"><input type="checkbox" checked={ricorda} onChange={(e) => setRicorda(e.target.checked)} />resta in tutti i documenti</label>
        <Button size="sm" className="ml-auto" disabled={busy || testo.trim().length < 3 || !(mail || wa)} onClick={manda}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Invia al cliente</Button>
      </div>
      {inviata && <div className="text-xs text-emerald-800">✔ Inviata: «{inviata}» (è anche nel registro della scheda)</div>}
    </div>
  );
}


/** 26/10/2026 (Christian): RICAMBI IN ATTESA, chiari: cosa, link del prodotto ordinato, ordine/fornitore, arrivo previsto.
 *  Salvando, con il preventivo accettato la riparazione va da sola in «attesa ricambi» (o «ricambio arrivato» quando sono tutti arrivati). */
function RicambiAttesi({ s, ro, operatore, onSalvata }: { s: Scheda; ro: boolean; operatore: string; onSalvata: () => Promise<void> }) {
  const vuoto: RicambioAtteso = { cosa: "", link: "", ordine: "", fornitore: "", arrivo_previsto: "", stato: "da_ordinare" };
  const [righe, setRighe] = useState<RicambioAtteso[]>(() => (s.ricambi_attesi || []).map((r) => ({ ...r })));
  const [busy, setBusy] = useState(false);
  const cambiate = JSON.stringify(righe) !== JSON.stringify(s.ricambi_attesi || []);
  const setR = (i: number, k: keyof RicambioAtteso, v: string) => setRighe((x) => x.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  async function salva() {
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    setBusy(true);
    try {
      await assModifica(s.id, { ricambi_attesi: righe.filter((r) => (r.cosa || "").trim() || (r.link || "").trim()), operatore });
      toast.success("Ricambi salvati"); await onSalvata();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  const mancano = righe.filter((r) => r.stato !== "arrivato").length;
  return (
    <div className="space-y-1.5 rounded-xl border-2 border-amber-200 bg-amber-50/50 p-2.5 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-amber-950 dark:text-amber-100">📦 Ricambi in attesa</span>
        <span className="text-xs text-muted-foreground">{righe.length ? `${mancano} da arrivare su ${righe.length}` : "nessun ricambio segnato"} · incolla un link (eBay, AliExpress…) per riga, salva, poi «🛒 Ordina»</span>
        {!ro && <Button size="xs" variant="outline" className="ml-auto" onClick={() => setRighe((x) => [...x, { ...vuoto }])}><Plus />Aggiungi ricambio</Button>}
      </div>
      {righe.map((r, i) => (
        <div key={i} className={`grid gap-1.5 rounded-lg border bg-background p-2 sm:grid-cols-[1.4fr_1fr_0.8fr_0.7fr_0.7fr_auto] ${r.stato === "arrivato" ? "opacity-60" : ""}`}>
          <input className={campo} disabled={ro} placeholder="Cosa (es. Tastiera Lenovo V15 G2)" value={r.cosa || ""} onChange={(e) => setR(i, "cosa", e.target.value)} />
          <div className="flex gap-1">
            <input className={campo} disabled={ro} placeholder="Link del prodotto ordinato" value={r.link || ""} onChange={(e) => setR(i, "link", e.target.value)} />
            {r.link && /^https?:\/\//.test(r.link) && <a className="inline-flex items-center px-1 text-blue-700 underline" href={r.link} target="_blank" rel="noreferrer">apri</a>}
          </div>
          <input className={campo} disabled={ro} placeholder="N. ordine / fornitore" value={r.ordine || ""} onChange={(e) => setR(i, "ordine", e.target.value)} />
          <input className={campo} type="date" disabled={ro} title="Arrivo previsto" value={(r.arrivo_previsto || "").slice(0, 10)} onChange={(e) => setR(i, "arrivo_previsto", e.target.value)} />
          <select className={campo} disabled={ro} value={r.stato || "da_ordinare"} onChange={(e) => setR(i, "stato", e.target.value)}>
            <option value="da_ordinare">Da ordinare</option><option value="richiesto">🛒 Ordine richiesto</option><option value="ordinato">Ordinato</option><option value="arrivato">✔ Arrivato</option></select>
          <span className="flex gap-1">
            {/* 27/10/2026 (Christian): ordine automatico del ricambio (eBay/AliExpress, fattura Genius, PayPal, riferimento alla scheda) */}
            {!ro && r.stato === "da_ordinare" && !cambiate && (s.ricambi_attesi || [])[i] && (
              <Button size="xs" title="Mette il ricambio in coda per l'acquisto: si ordina con fattura Genius e PayPal, col riferimento a questa scheda"
                onClick={async () => {
                  if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
                  if (!confirm(`Ordinare questo ricambio per la scheda ${s.sigla}?\n\n${r.cosa || ""}\n${r.link || ""}\n\nVa in coda per l'acquisto (fattura Genius, PayPal): il pagamento chiede l'impronta di Christian.`)) return;
                  try { await fetchAPI(`/api/assistenza/schede/${s.id}/ricambi/ordina`, { method: "POST", body: JSON.stringify({ indice: i, operatore }) }); toast.success("Ordine richiesto: è in coda per l'acquisto"); await onSalvata(); }
                  catch (e) { toastErrore(e); }
                }}>🛒 Ordina</Button>)}
            {!ro && <Button size="xs" variant="ghost" className="text-red-700" onClick={() => setRighe((x) => x.filter((_, j) => j !== i))}><Trash2 /></Button>}
          </span>
          {r.stato === "richiesto" && <div className="text-xs font-medium text-blue-800 sm:col-span-6">🛒 Ordine richiesto{r.richiesto_il ? ` il ${r.richiesto_il.slice(8, 10)}/${r.richiesto_il.slice(5, 7)}` : ""}{r.richiesto_da ? ` da ${r.richiesto_da}` : ""}: in coda per l&apos;acquisto</div>}
          {r.nota && <div className="text-xs text-muted-foreground sm:col-span-6">{r.nota}</div>}
        </div>
      ))}
      {!ro && cambiate && <div className="flex justify-end"><Button size="sm" disabled={busy} onClick={salva}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Salva ricambi</Button></div>}
    </div>
  );
}


function DaRicordare({ s, ro, operatore, onSalvata }: { s: Scheda; ro: boolean; operatore: string; onSalvata: () => Promise<void> }) {
  const [testo, setTesto] = useState(s.promemoria || "");
  const [apri, setApri] = useState(!!s.promemoria);
  const [busy, setBusy] = useState(false);
  const cambiata = (testo.trim() || null) !== (s.promemoria || null);
  async function salva() {
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    setBusy(true);
    try { await assModifica(s.id, { promemoria: testo.trim() || null, operatore }); toast.success(testo.trim() ? "Nota da ricordare salvata" : "Nota tolta"); await onSalvata(); }
    catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  if (!apri && !ro) return <div className="-mt-1 text-right"><button type="button" className="text-xs font-medium text-orange-700 underline" onClick={() => setApri(true)}>📌 Aggiungi una nota da ricordare</button></div>;
  if (!apri) return null;
  return (
    <div className="space-y-1.5 rounded-xl border-2 border-orange-400 bg-orange-50 p-3 dark:bg-orange-950/30">
      <div className="text-sm font-bold text-orange-900 dark:text-orange-200">📌 DA RICORDARE</div>
      <textarea className={`${area} min-h-[72px] border-orange-300 bg-white text-[15px] font-semibold dark:bg-background`} disabled={ro} value={testo}
        onChange={(e) => setTesto(e.target.value)} placeholder="es. Mettere nel pacco anche la scatola della Pencil già spedita (richiesta Medianet su WhatsApp)"
        rows={Math.max(2, testo.split("\n").length)} />
      {!ro && cambiata && <div className="text-right"><Button size="sm" disabled={busy} onClick={salva}>{busy && <Loader2 className="animate-spin" />}Salva la nota</Button></div>}
    </div>
  );
}


/** 27/10/2026 (Christian): il banco prepara il preventivo e lo manda in VERIFICA al titolare; il titolare lo approva e lo
 *  invia, lo corregge e lo invia, oppure lo rimanda al banco scrivendo cosa sistemare. */
function VerificaPreventivo({ s, admin, busy, onAzione, onInvia }: {
  s: Scheda; admin: boolean; busy: boolean; onAzione: (az: string, nota?: string) => Promise<unknown>; onInvia: () => void;
}) {
  const v = s.preventivo_verifica;
  const quando = (x?: string) => x ? new Date(x).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const richiedi = () => { const n = prompt("Nota per Christian (facoltativa): cosa deve guardare?", ""); if (n !== null) onAzione("richiedi", n); };
  if (!v) return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm">
      <span className="text-muted-foreground">Preventivo preparato dal banco? Prima dell&apos;invio fallo verificare.</span>
      <Button size="sm" variant="outline" className="ml-auto border-violet-400 text-violet-800" disabled={busy} onClick={richiedi}>👑 Richiedi verifica a Christian</Button>
    </div>);
  const colori = v.stato === "richiesta" ? "border-violet-400 bg-violet-50 text-violet-950 dark:bg-violet-950/30 dark:text-violet-100"
    : v.stato === "approvato" ? "border-emerald-400 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"
    : "border-red-400 bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100";
  return (
    <div className={`mb-2 space-y-1.5 rounded-xl border-2 px-3 py-2 text-sm ${colori}`}>
      <div className="flex flex-wrap items-center gap-2">
        <b>{v.stato === "richiesta" ? "👑 IN VERIFICA DA CHRISTIAN" : v.stato === "approvato" ? "✅ APPROVATO DA CHRISTIAN: si può inviare" : "✏️ DA SISTEMARE (Christian)"}</b>
        <span className="text-xs opacity-80">chiesto da {v.richiesta_da} {quando(v.richiesta_il)}{v.risposta_il ? ` · risposta ${quando(v.risposta_il)}` : ""}</span>
      </div>
      {v.nota && <div><span className="font-medium">Nota del banco:</span> {v.nota}</div>}
      {v.risposta && <div className="font-medium">Christian: {v.risposta}</div>}
      <div className="flex flex-wrap gap-1.5">
        {admin && v.stato === "richiesta" && <>
          <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy}
            onClick={async () => { if (await onAzione("approva")) onInvia(); }}>✔ Approva e invia</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAzione("approva")}
            title="Approva senza inviare ora (lo invia il banco)">Approva (invia il banco)</Button>
          <Button size="sm" variant="outline" className="border-red-300 text-red-700" disabled={busy}
            onClick={() => { const n = prompt("Cosa devono sistemare nel preventivo?", ""); if (n && n.trim()) onAzione("correggi", n); }}>✏️ Rimanda al banco con una nota</Button>
          <span className="self-center text-xs opacity-80">Per modificarlo: correggi le voci qui sotto, poi «Approva e invia».</span></>}
        {v.stato !== "richiesta" && <Button size="sm" variant="outline" disabled={busy} onClick={richiedi}>👑 Richiedi di nuovo la verifica</Button>}
        {v.stato === "approvato" && <Button size="sm" disabled={busy} onClick={onInvia}>Invia il preventivo</Button>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAzione("annulla")}>Togli la verifica</Button>
      </div>
    </div>);
}
