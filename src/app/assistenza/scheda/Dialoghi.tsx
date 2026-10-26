"use client";

// Finestre della scheda (05/10/2026): invio (ricevuta, preventivo, aggiornamenti) sempre mail + WhatsApp, risposta del
// cliente, PRONTO (ritiro in negozio / per corriere), pagato, consegna, corriere, stesso modello.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, Mail, MessageCircle, Send, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { assAnteprimaMail, assAzione, assDocUrl, assStessoModello, CANALI_RISPOSTA, dataOra, eur, pagaFineMese, type Esito, type Scheda, type SchedaBreve } from "@/lib/assistenza";
import { blocchi, ipotesiDelBlocco, parseEstimate, rowTotal, type EstimateLine } from "@/lib/assistenza-preventivo";
import { copia } from "./Comunicazioni";
import { Campo, Modale, Pill, Scelta, area, campo } from "./ui";

// ---------------------------------------------------------------------------
function Anteprima({ s, corpo }: { s: Scheda; corpo: Record<string, unknown> }) {
  const [a, setA] = useState<{ oggetto: string; corpo: string; prova: boolean; destinatario: string | null; whatsapp: string } | null>(null);
  const chiave = JSON.stringify(corpo);
  useEffect(() => {
    const t = setTimeout(() => assAnteprimaMail(s.id, JSON.parse(chiave)).then(setA).catch(() => setA(null)), 250);
    return () => clearTimeout(t);
  }, [s.id, chiave]);
  if (!a) return <div className="text-xs text-muted-foreground">anteprima…</div>;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="rounded-lg border bg-muted/30 p-2.5 text-xs">
        <div className="mb-1 flex items-center gap-1.5 font-semibold"><Mail className="size-3.5" />Mail con PDF</div>
        <div>A: <b>{a.destinatario || "— (manca l'email)"}</b>{a.prova && <span className="text-amber-800"> · PROVA: non va al cliente ({s.email || "senza email"})</span>}</div>
        <div>Oggetto: <b>{a.oggetto}</b></div>
        <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">{a.corpo}</pre>
      </div>
      <div className="rounded-lg border bg-emerald-50/40 p-2.5 text-xs dark:bg-emerald-950/20">
        <div className="mb-1 flex items-center gap-1.5 font-semibold"><MessageCircle className="size-3.5" />WhatsApp</div>
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">{a.whatsapp}</pre>
        <div className="mt-1 text-[11px] text-muted-foreground">{s.prova ? "Scheda di prova: il WhatsApp non parte, resta da mandare a mano." : !s.wa_linea_attiva ? "Linea 334 in sola lettura: il WhatsApp non parte, resta da mandare a mano (Copia testo / Apri chat)." : "Parte dalla linea Apple 334 986 7400."}</div>
      </div>
    </div>
  );
}

function EsitoInvio({ e }: { e: Esito }) {
  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-emerald-600" />Fatto</div>
      {e.mail && <div><Mail className="mr-1 inline size-3.5" />Mail: {e.mail}</div>}
      {e.whatsapp && <div><MessageCircle className="mr-1 inline size-3.5" />WhatsApp: {e.whatsapp}</div>}
      {e.whatsapp_testo && e.whatsapp && !e.whatsapp.startsWith("in coda") && (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => copia(e.whatsapp_testo || "")}><Copy />Copia testo</Button>
          {e.whatsapp_link && <a className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2.5 text-xs hover:bg-muted" href={e.whatsapp_link} target="_blank" rel="noreferrer"><MessageCircle className="size-3.5" />Apri chat</a>}
        </div>
      )}
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
export type TipoInvio = "ricevuta" | "preventivo" | "aggiornamento" | "aggiornamento_riparazione" | "trova";
const TITOLI: Record<TipoInvio, string> = { ricevuta: "Ricevuta d'ingresso", preventivo: "INVIA PREVENTIVO", aggiornamento: "INVIA AGGIORNAMENTO PREVENTIVO",
  aggiornamento_riparazione: "Aggiornamento riparazione", trova: "Istruzioni «Trova il mio» (abilitare la riparazione)" };

/** Invio al cliente: mail + WhatsApp SEMPRE selezionati (si possono togliere solo apposta). */
export function DialogoInvio({ s, tipo, onClose, onInvia }: { s: Scheda; tipo: TipoInvio; onClose: () => void; onInvia: (b: Record<string, unknown>) => Promise<Esito | null> }) {
  const [mail, setMail] = useState(true);
  const [wa, setWa] = useState(true);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [fatto, setFatto] = useState<Esito | null>(null);
  const conNota = tipo === "aggiornamento" || tipo === "aggiornamento_riparazione";
  async function invia() {
    if (tipo === "aggiornamento_riparazione" && !nota.trim()) { toast.error("Scrivi cosa comunicare al cliente"); return; }
    setBusy(true);
    try { const r = await onInvia({ invia_mail: mail, invia_wa: wa, nota }); if (r) setFatto(r); } finally { setBusy(false); }
  }
  return (
    <Modale titolo={`${TITOLI[tipo]} — scheda ${s.sigla}`} onClose={onClose} largo
      piedi={fatto ? <Button onClick={onClose}>Chiudi</Button> : <><Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button disabled={busy || (!mail && !wa && tipo !== "preventivo" && tipo !== "aggiornamento")} onClick={invia}>{busy ? <Loader2 className="animate-spin" /> : <Send />}
          {mail && wa ? "Invia mail + WhatsApp" : mail ? "Invia solo mail" : wa ? "Solo WhatsApp" : "Registra senza inviare"}</Button></>}>
      {fatto ? <EsitoInvio e={fatto} /> : (
        <div className="space-y-3">
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
        </div>
      )}
    </Modale>
  );
}

// ---------------------------------------------------------------------------
/** Risposta del cliente: quale ipotesi accetta (+ eventuali aggiungibili), oppure rifiuta. */
export function DialogoEsito({ s, righe, onClose, onEsito }: { s: Scheda; righe: EstimateLine[]; onClose: () => void; onEsito: (b: Record<string, unknown>) => Promise<boolean> }) {
  const b = Math.max(...blocchi(righe));
  const ips = ipotesiDelBlocco(righe, b);
  const alt = ips.filter((x) => !x.agg);
  const agg = ips.filter((x) => x.agg);
  const [opt, setOpt] = useState<number | null>(alt.find((x) => x.scelta)?.opt ?? alt[0]?.opt ?? null);
  const [prese, setPrese] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  // 05/10/2026 (§10.5): da dove è arrivata la risposta (l'accettazione online arriva da sola dal link del cliente)
  const [canale, setCanale] = useState("telefono");
  const fisse = righe.filter((r) => (r.b ?? 0) === b && r.opt == null).reduce((t, r) => t + rowTotal(r), 0);
  const tot = fisse + (alt.find((x) => x.opt === opt)?.totale || 0) + agg.filter((x) => prese.includes(x.opt)).reduce((t, x) => t + x.totale, 0);
  async function vai(esito: "accettato" | "rifiutato") {
    setBusy(true);
    try { if (await onEsito(esito === "accettato" ? { esito, blocco: b, ipotesi: opt, aggiunte: prese, canale } : { esito, blocco: b, canale })) onClose(); } finally { setBusy(false); }
  }
  return (
    <Modale titolo={`Risposta del cliente${b > 0 ? " al preventivo aggiuntivo" : ""} — scheda ${s.sigla}`} onClose={onClose}
      piedi={<><Button variant="outline" className="mr-auto text-red-700" disabled={busy} onClick={() => vai("rifiutato")}>RIFIUTATO</Button>
        <Button disabled={busy || (alt.length > 0 && opt == null)} onClick={() => vai("accettato")}>{busy && <Loader2 className="animate-spin" />}ACCETTATO · {eur(tot)}</Button></>}>
      <div className="space-y-2">
        {alt.map((x) => (
          <label key={x.opt} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${opt === x.opt ? "border-primary bg-primary/5" : ""}`}>
            <input type="radio" className="mt-1" checked={opt === x.opt} onChange={() => setOpt(x.opt)} />
            <span className="flex-1"><b>{x.n}ª ipotesi</b><br />{x.righe.map((y) => y.r.t).join(" + ")}</span><b className="tabular-nums">{eur(x.totale)}</b>
          </label>
        ))}
        {agg.map((x) => (
          <label key={x.opt} className="flex cursor-pointer items-start gap-2 rounded-lg border border-dashed p-2.5 text-sm">
            <input type="checkbox" className="mt-1" checked={prese.includes(x.opt)} onChange={(e) => setPrese((p) => (e.target.checked ? [...p, x.opt] : p.filter((y) => y !== x.opt)))} />
            <span className="flex-1"><b>{x.n}ª ipotesi · aggiungibile</b><br />{x.righe.map((y) => y.r.t).join(" + ")}</span><b className="tabular-nums">+ {eur(x.totale)}</b>
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Il cliente ha risposto</span>
          <Scelta piccolo valore={canale} opzioni={CANALI_RISPOSTA.filter(([k]) => k !== "online").map(([k, l]) => [k, l])} onChange={setCanale} />
        </div>
        <p className="text-xs text-muted-foreground">Con «ACCETTATO» la scheda va IN RIPARAZIONE (poi si assegna al tecnico) e la lavorazione effettuata si compila con l&apos;ipotesi scelta e il suo importo.{s.spedizione_tipo && s.spedizione_tipo !== "nessuna" ? ` Spedizione ${eur(s.spedizione_importo)} a parte nel totale.` : ""}</p>
      </div>
    </Modale>
  );
}

// ---------------------------------------------------------------------------
/** PRONTO: ritiro in negozio o per corriere (nostro o del cliente), pagamento, totale, esito; poi mail + WhatsApp. */
export function DialogoPronto({ s, lavorazione, totale, onClose, onInvia }: {
  s: Scheda; lavorazione: string; totale: number | string | null; onClose: () => void; onInvia: (b: Record<string, unknown>) => Promise<Esito | null>;
}) {
  const [cons, setCons] = useState<"ritiro" | "spedizione">((s.consegna_modo as "ritiro") || (s.spedizione_tipo === "ar" || s.spedizione_tipo === "solo_ritorno" ? "spedizione" : "ritiro"));
  const [corr, setCorr] = useState<"noi" | "cliente">(s.consegna_corriere || "noi");
  const [pag, setPag] = useState(s.pagamento_modo || "");
  const [tot, setTot] = useState(String(totale ?? s.totale_lavorazione ?? (s.preventivo_esito === "accettato" ? s.preventivo_totale ?? "" : "")));
  const [esito, setEsito] = useState(s.esito || (s.preventivo_esito === "rifiutato" ? "NEGATIVO" : "EFFETTUATO"));
  const [ind, setInd] = useState(s.indirizzo_spedizione || "");
  const [mail, setMail] = useState(true);
  const [wa, setWa] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fatto, setFatto] = useState<Esito | null>(null);
  // 26/10/2026 (Christian, 63226): come per le Tarature, il pronto / consuntivo si manda subito o si PROGRAMMA
  // 26/10/2026: stesse scelte delle Tarature — Adesso · Oggi alle… · Domani alle… · Data e ora a scelta
  const [quando, setQuando] = useState<"adesso" | "oggi" | "domani" | "libero">("adesso");
  const [oraOggi, setOraOggi] = useState(prossimaMezzora);
  const [oraDomani, setOraDomani] = useState("09:30");
  const [dataLibera, setDataLibera] = useState(() => giornoIso(prossimoLavorativo930()));
  const [oraLibera, setOraLibera] = useState("09:30");
  const qs = quando === "oggi" ? { d: giornoIso(new Date()), o: oraOggi } : quando === "domani" ? { d: giornoIso(prossimoLavorativo930()), o: oraDomani }
    : quando === "libero" ? { d: dataLibera, o: oraLibera } : null;
  const programma = qs && qs.d && /^\d{2}:\d{2}$/.test(qs.o) ? new Date(`${qs.d}T${qs.o}:00`).toISOString() : null;
  const passato = !!programma && new Date(programma).getTime() <= Date.now() + 60000;
  const fuoriOrario = !!qs && !inOrarioNegozio(qs.d, qs.o);
  // 26/10/2026 (Christian, 63118): a costo zero niente pagamento da chiedere (né bonifico, né consuntivo, né fattura)
  const gratis = (Number(String(tot).replace(",", ".")) || 0) - (Number(s.acconto) || 0) <= 0.009;
  const pagEff = gratis ? "" : (pag || (cons === "spedizione" ? "bonifico" : ""));
  const corpo = useMemo(() => ({ consegna_modo: cons, pagamento_modo: pagEff, totale_lavorazione: tot, indirizzo_spedizione: ind }), [cons, pagEff, tot, ind]);
  async function invia() {
    setBusy(true);
    try {
      const r = await onInvia({ ...corpo, consegna_corriere: cons === "spedizione" ? corr : null, esito, pagamento_modo: pagEff || null, invia_mail: mail, invia_wa: wa,
        ...(programma ? { programma_il: programma } : {}) });
      if (r) setFatto(r);
    } finally { setBusy(false); }
  }
  return (
    <Modale titolo={`PRONTO — scheda ${s.sigla}`} onClose={onClose} largo
      piedi={fatto ? <Button onClick={onClose}>Chiudi</Button> : <><Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button disabled={busy || (quando !== "adesso" && (!programma || passato))} onClick={invia}>{busy && <Loader2 className="animate-spin" />}{programma ? `PROGRAMMA il pronto (${new Date(programma).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})` : `PRONTO${mail || wa ? " e avvisa il cliente" : ""}`}</Button></>}>
      {fatto ? <EsitoInvio e={fatto} /> : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Scelta valore={cons} opzioni={[["ritiro", "Ritiro in negozio"], ["spedizione", "Per corriere"]]} onChange={setCons} />
            {cons === "spedizione" && <Scelta valore={corr} opzioni={[["noi", "Spediamo noi (UPS/DHL)"], ["cliente", "Corriere del cliente"]]} onChange={setCorr} />}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Pagamento">
              {gratis ? <div className={`${campo} bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-200`}>Nessun pagamento (totale € 0)</div> : (
              <select className={campo} value={pagEff} onChange={(e) => setPag(e.target.value)}>
                <option value="">Al banco (contanti / POS)</option><option value="bonifico">Bonifico (IBAN)</option><option value="paypal">PayPal (+3%)</option><option value="fine_mese">Fine mese (rivenditore)</option></select>)}
            </Campo>
            <Campo label="Totale € (IVA compresa)"><input className={`${campo} text-right font-semibold`} inputMode="decimal" value={tot} onChange={(e) => setTot(e.target.value.replace(",", "."))} /></Campo>
            <Campo label="Esito">
              <select className={campo} value={esito} onChange={(e) => setEsito(e.target.value)}><option value="EFFETTUATO">Effettuato</option><option value="NEGATIVO">Negativo</option><option value="DA ULTIMARE">Da ultimare</option></select>
            </Campo>
          </div>
          {cons === "spedizione" && <Campo label={gratis ? "Indirizzo di spedizione" : "Indirizzo di spedizione (va nella causale del bonifico)"}><input className={campo} value={ind} onChange={(e) => setInd(e.target.value)} placeholder="via, CAP, città" /></Campo>}
          {cons === "spedizione" && <p className="text-xs text-muted-foreground">{gratis ? "Nulla da pagare: al cliente va l'avviso «PRONTO PER LA SPEDIZIONE, nessun importo da pagare, in attesa del ritiro del corriere» — senza consuntivo, IBAN né richiesta di fattura. Poi si fa la spedizione e parte il tracking." : pagEff === "bonifico" ? "Al cliente va il CONSUNTIVO con IBAN e causale: dopo il bonifico si segna «Pagato» e si spedisce." : "Per la spedizione di solito si chiede il bonifico (niente commissioni della carta)."}</p>}
          {!lavorazione && !s.lavorazione && <p className="text-xs text-amber-700">La lavorazione è vuota: si riempie con le righe accettate del preventivo.</p>}
          <Anteprima s={s} corpo={pagEff === "fine_mese" ? { ...corpo, tipo: "pronto" } : corpo} />
          <Canali mail={mail} wa={wa} setMail={setMail} setWa={setWa} />
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <span className="text-sm font-medium">Quando avvisare il cliente:</span>
            <Scelta valore={quando} opzioni={[["adesso", "Adesso"], ["oggi", "Oggi alle…"], ["domani", `${etichettaGiorno(prossimoLavorativo930())} alle…`], ["libero", "Data e ora a scelta"]]} onChange={setQuando} />
            {quando === "oggi" && <input type="time" className={`${campo} w-28`} value={oraOggi} onChange={(e) => setOraOggi(e.target.value)} />}
            {quando === "domani" && <input type="time" className={`${campo} w-28`} value={oraDomani} onChange={(e) => setOraDomani(e.target.value)} />}
            {quando === "libero" && <><input type="date" className={`${campo} w-40`} value={dataLibera} onChange={(e) => setDataLibera(e.target.value)} />
              <input type="time" className={`${campo} w-28`} value={oraLibera} onChange={(e) => setOraLibera(e.target.value)} /></>}
            {passato && <span className="w-full text-xs font-medium text-red-700">L&apos;orario è già passato: scegline uno nel futuro (oppure «Adesso»).</span>}
            {!passato && fuoriOrario && <span className="w-full text-xs text-amber-700">Fuori dall&apos;orario del negozio (lun-ven 9:30-13:30 e 15:00-19:00): il cliente riceverà il messaggio a negozio chiuso.</span>}
            {programma && <span className="w-full text-xs text-muted-foreground">La scheda resta in «Riparazione finita · Pronto programmato»: all&apos;ora scelta parte il {gratis ? (cons === "spedizione" ? "«pronto per la spedizione» (nulla da pagare)" : "pronto") : pagEff === "bonifico" || pagEff === "paypal" ? "consuntivo" : "pronto"} ({[mail && "mail", wa && "WhatsApp"].filter(Boolean).join(" + ") || "nessun canale"}) e la scheda diventa PRONTA.</span>}
          </div>
        </div>
      )}
    </Modale>
  );
}

// ---------------------------------------------------------------------------
export function DialogoPagato({ s, onClose, onPagato }: { s: Scheda; onClose: () => void; onPagato: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [modo, setModo] = useState(s.pagamento_modo || "contanti");
  const [imp, setImp] = useState(String(s.saldo || ""));
  const [data, setData] = useState(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }));
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modale titolo={`Pagamento ricevuto — scheda ${s.sigla}`} onClose={onClose}
      piedi={<><Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button disabled={busy} onClick={async () => { setBusy(true); try { if (await onPagato({ pagamento_modo: modo, importo: imp, data, nota })) onClose(); } finally { setBusy(false); } }}>
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
export function DialogoChiudiTutto({ s, onClose, onChiudi }: { s: Scheda; onClose: () => void; onChiudi: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [esito, setEsito] = useState<"riparato" | "non_riparato" | "nessun_intervento">("riparato");
  const [modo, setModo] = useState<"ritiro" | "spedizione" | "corriere_cliente">(s.consegna_modo === "spedizione" ? (s.consegna_corriere === "cliente" ? "corriere_cliente" : "spedizione") : "ritiro");
  const [fuori, setFuori] = useState(false);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const saldo = Number(s.saldo || 0);
  const daPagare = !s.pagata && saldo > 0.009;
  async function vai() {
    if (daPagare && !fuori) { toast.error("Risulta da pagare: incassa prima, oppure spunta «già pagato / non dovuto»"); return; }
    setBusy(true);
    try { if (await onChiudi({ esito, modo, nota, pagamento_fuori: fuori })) onClose(); } finally { setBusy(false); }
  }
  return (
    <Modale titolo={`Già fatto tutto — chiudi la scheda ${s.sigla}`} onClose={onClose}
      piedi={<><Button variant="outline" onClick={onClose}>Annulla</Button><Button disabled={busy} onClick={vai}>{busy && <Loader2 className="animate-spin" />}Chiudi la scheda</Button></>}>
      <div className="space-y-3 text-sm">
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

export function DialogoConsegna({ s, onClose, onConsegna }: { s: Scheda; onClose: () => void; onConsegna: (modo: string) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const opz: [string, string, string][] = [
    ["ritiro", "Ritirato in negozio", "il cliente è passato a prenderlo"], ["spedizione", "Spedito con il nostro corriere", "etichetta UPS/DHL fatta da noi"],
    ["corriere_cliente", "Ritirato dal corriere del cliente", "il cliente ha mandato il suo corriere"], ["rottamato", "Rottamato", ""], ["venduto", "Venduto", ""]];
  return (
    <Modale titolo={`Consegna — scheda ${s.sigla}`} onClose={onClose}>
      <div className="space-y-2">
        {!s.pagata && s.saldo > 0 && !pagaFineMese(s) && <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Attenzione: risulta ancora da pagare {eur(s.saldo)}. Prima incassa (Scontrino / Fattura / Pagato).</div>}
        {opz.map(([k, l, d]) => (
          <Button key={k} variant={k === (s.consegna_modo === "spedizione" ? (s.consegna_corriere === "cliente" ? "corriere_cliente" : "spedizione") : "ritiro") ? "default" : "outline"}
            className="h-auto w-full justify-start py-2 text-left" disabled={busy}
            onClick={async () => { setBusy(true); try { if (await onConsegna(k)) onClose(); } finally { setBusy(false); } }}>
            <span><b>{l}</b>{d && <span className="block text-xs font-normal opacity-80">{d}</span>}</span>
          </Button>
        ))}
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
  const [prova, setProva] = useState(true);
  const [stampa, setStampa] = useState(true);
  const [avvisaMail, setAvvisaMail] = useState(true);
  const [avvisaWa, setAvvisaWa] = useState(true);
  const [busy, setBusy] = useState(false);
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
    const conRitiro = dir === "ritiro" ? !!giorno : prenotaDaNoi;
    if (!inProva && !confirm(`Creare l'etichetta ${corriere} VERA (costo sul conto ${corriere})${conRitiro ? " e prenotare il corriere" : ""}?`)) return;
    // 14/10/2026: riconsegna di una scheda non ancora pagata → il backend la ferma; qui si chiede conferma esplicita
    const nonPagata = dir === "riconsegna" && !inProva && !s.pagata && s.saldo > 0 && !pagaFineMese(s);
    if (nonPagata && !confirm(`ATTENZIONE: risulta ancora da pagare ${eur(s.saldo)}. Spedire lo stesso, senza pagamento?`)) return;
    setBusy(true);
    try {
      const r = await assAzione(s.id, "spedizione", { operatore, corriere, direzione: dir, indirizzo: ind, giorno_ritiro: giorno || undefined, test: inProva,
        prenota: dir === "riconsegna" ? prenotaDaNoi : undefined, stampa: inProva ? false : stampa, forza: nonPagata || undefined,
        invia_mail: avvisaMail, invia_wa: avvisaWa });
      toast.success(`${r.corriere} ${r.test ? "(PROVA) " : ""}${r.tracking}${r.prn ? ` · ritiro ${r.prn}` : ""}${r.pickup_error ? ` · ERRORE ritiro: ${r.pickup_error}` : ""}` + (r.esito?.mail ? ` · mail ${r.esito.mail}` : "") + (r.esito?.whatsapp ? ` · WhatsApp ${r.esito.whatsapp}` : ""), { duration: 10000 });
      if (!r.stampa || !r.stampa.agente_attivo) window.open(`/api/backend${r.label_url}`, "_blank");
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
              {C("street", "Indirizzo")}{C("city", "Città")}<div className="grid grid-cols-2 gap-2">{C("zip", "CAP")}{C("province", "Prov.")}</div></div>
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
              {!inProva && <label className="flex items-center gap-1.5"><input type="checkbox" checked={stampa} onChange={(e) => setStampa(e.target.checked)} />
                Stampa l&apos;etichetta al banco ({dir === "ritiro" ? "1 copia" : "2 copie"})</label>}
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
