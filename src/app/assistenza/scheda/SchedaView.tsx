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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SceltaOperatore, type Operatore } from "@/components/Operatore";
import { toastErrore } from "@/lib/errori";
import {
  assAzione, assDocUrl, assEtichettaUrl, assModifica, assScheda, assTrackUrl, dataOra, DOCUMENTI_PDF, type ConfigAssistenza, type DocPdf, type Esito, type Scheda,
} from "@/lib/assistenza";
import type { EstimateLine } from "@/lib/assistenza-preventivo";
import { Apparecchio, type ValoriApparecchio } from "./Apparecchio";
import { Avanzamento } from "./Avanzamento";
import { CercaCliente, RiepilogoCliente, SchedaClienteModal } from "./Cliente";
import { Comunicazioni, Registro } from "./Comunicazioni";
import { DialogoConsegna, DialogoCorriere, DialogoEsito, DialogoInvio, DialogoPagato, DialogoPronto, DialogoStessoModello, type TipoInvio } from "./Dialoghi";
import { Documenti } from "./Documenti";
import { Lavorazione } from "./Lavorazione";
import { Preventivo, type BozzaPreventivo } from "./Preventivo";
import { DialogoAssegna, DialogoChiudiVerifica, PannelloTecnici } from "./Tecnici";
import { Badge, Campo, Pill, Sezione, area, campo } from "./ui";

type Bozza = Partial<Scheda>;
type Dialogo = null | { k: "invio"; tipo: TipoInvio } | { k: "esito" } | { k: "pronto" } | { k: "pagato" } | { k: "consegna" } | { k: "corriere" } | { k: "stesso" } | { k: "cliente" }
  | { k: "assegna_verifica" } | { k: "chiudi_verifica" } | { k: "assegna_riparazione" };

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
  const ro = !!s?.sola_lettura || s?.stato === "annullata";

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
  async function stampa(tipo: "accettazione" | "etichetta") {
    if (!s) return;
    try {
      const r = await assAzione(s.id, "stampa", { tipo, copie: 1 });
      toast.success(r.simulata ? "Scheda di PROVA: stampa simulata (niente stampanti del negozio), apro il PDF"
        : r.agente_attivo ? `In stampa al banco (${tipo === "etichetta" ? "etichetta Brother" : "A4"})` : "Messa in coda, ma l'agente di stampa non risponde: apro il PDF");
      if (!r.agente_attivo) window.open(tipo === "etichetta" ? assEtichettaUrl(s.id) : assDocUrl(s.id, "auto"), "_blank");
    } catch (e) { toastErrore(e); }
  }
  async function vendi(tipo: "fattura" | "proforma") {
    const r = await azione("vendi", { tipo }, tipo === "fattura" ? "Fattura in BOZZA creata (non inviata allo SdI)" : "Pro forma creato");
    if (r?.url) router.push(r.url);
  }
  function onAzione(a: string) {
    if (a === "arrivato") azione("arrivato", {}, "Dispositivo arrivato · ricevuta inviata");
    else if (a === "preventivo") refPrev.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (a === "invia_preventivo") setDlg({ k: "invio", tipo: s?.preventivo_stato && s.preventivo_stato !== "da_fare" ? "aggiornamento" : "preventivo" });
    else if (a === "esito") setDlg({ k: "esito" });
    else if (a === "pronto") setDlg({ k: "pronto" });
    else if (a === "incassa") { refDoc.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (a === "consegna") setDlg({ k: "consegna" });
    // 05/10/2026 (§10.5): verifica e riparazione assegnate ai tecnici
    else if (a === "assegna_verifica") setDlg({ k: "assegna_verifica" });
    else if (a === "chiudi_verifica") setDlg({ k: "chiudi_verifica" });
    else if (a === "assegna_riparazione") setDlg({ k: "assegna_riparazione" });
    else if (a === "stato_riparazione") refTec.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (a === "aggiornamento") setDlg({ k: "invio", tipo: "aggiornamento_riparazione" });
  }
  async function statoRiparazione(stato: string) {
    let nota = "";
    if (stato === "attesa_ricambi" || stato === "piu_tempo") {
      const x = prompt(stato === "attesa_ricambi" ? "Quale ricambio, dove è ordinato e quando arriva? (facoltativo)" : "Perché serve più tempo? (facoltativo)", "");
      if (x === null) return;
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
          <Button size="icon-xs" variant="outline" disabled={!s.successiva} onClick={() => s.successiva && onApri(s.successiva.id)} title="Successiva (Alt+→)"><ArrowRight /></Button>
          <Badge stato={st} />
          {s.prova && s.origine === "prova" && <Pill tono="ambra">PROVA</Pill>}
          {s.sola_lettura && <Pill>storica FileMaker · sola lettura</Pill>}
          <span className="hidden min-w-0 truncate text-sm text-muted-foreground md:inline">{s.azienda || s.nominativo} · {s.modello || s.prodotto}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={ricarica} title="Ricarica"><RefreshCw /></Button>
            {!ro && <Button size="sm" disabled={!sporca} onClick={() => salva()} title="Ctrl/Cmd+S"><Save />Salva{sporca ? " *" : ""}</Button>}
          </div>
        </div>
        {!ro && <div className="mt-2"><SceltaOperatore value={operatore as Operatore} onChange={setOperatore} compatto /></div>}
      </div>

      <Avanzamento av={s.avanzamento} onAzione={onAzione} disabilitato={!!busy || ro} />

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
        <MenuPdf id={s.id} />
        <Button size="sm" variant="outline" onClick={() => stampa("etichetta")} title="Etichetta Brother"><Tag />Etichetta</Button>
        <Button size="sm" variant="outline" onClick={() => stampa("accettazione")} title="Stampa A4 al banco"><Printer />A4</Button>
        <span className="ml-auto" />
        <a className="text-xs text-muted-foreground underline" href={assTrackUrl(s.token_pubblico)} target="_blank" rel="noreferrer" title="Pagina pubblica per il cliente (senza dati personali)">pagina cliente</a>
        {!ro && <Button size="sm" variant="ghost" onClick={async () => {
          if (!operatore) { toast.error("Scegli l'operatore"); return; }
          try { const n = await assAzione(s.id, "duplica", { operatore, stesso_dispositivo: confirm("Stesso dispositivo? (OK = sì, Annulla = solo stesso cliente)") }); toast.success(`Nuova scheda ${n.sigla}`); onCambiata(); onApri(n.id); }
          catch (e) { toastErrore(e); }
        }}><Copy />Duplica</Button>}
        {st === "consegnato" && !ro && <Button size="sm" variant="ghost" onClick={() => azione("riapri", {}, "Scheda riaperta")}><RotateCcw />Riapri</Button>}
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
        <Preventivo s={s} bz={bz} setBz={setBz} ro={ro} spedDefault={cfg?.spedizione_default?.ar ?? 28}
          onInvia={() => setDlg({ k: "invio", tipo: s.preventivo_stato && s.preventivo_stato !== "da_fare" ? "aggiornamento" : "preventivo" })}
          onNotaInterna={(t) => set("note_interne", ((v("note_interne") as string) ? `${v("note_interne")}\n` : "") + t)}
          onStessoModello={() => setDlg({ k: "stesso" })} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[3fr_2fr]">
        <Lavorazione s={s} v={v} set={set} ro={ro} tecnici={tecnici.map((t) => t.codice)} />
        <div ref={refDoc} className="scroll-mt-28 space-y-3">
          <Documenti s={s} ro={ro} busy={!!busy}
            onScontrino={async () => { if (sporca && !(await salva(true))) return; router.push(`/cassa?scheda=${s.id}`); }}
            onAcconto={async () => {
              if (sporca && !(await salva(true))) return;
              const x = prompt("Importo dell'acconto (€)", "");
              const imp = Number(String(x || "").replace(",", "."));
              if (imp > 0) router.push(`/cassa?${new URLSearchParams({ scheda: s.id, acconto: imp.toFixed(2) })}`);
            }}
            onVendi={vendi} onPagato={() => setDlg({ k: "pagato" })} onCorriere={() => setDlg({ k: "corriere" })} />
          <Sezione titolo="Nota interna" sottotitolo="mai al cliente">
            <textarea className={area} rows={3} disabled={ro} value={(v("note_interne") as string) || ""} onChange={(e) => set("note_interne", e.target.value)} />
          </Sezione>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Comunicazioni s={s} />
        <Registro s={s} />
      </div>

      {dlg?.k === "invio" && <DialogoInvio s={s} tipo={dlg.tipo} onClose={() => setDlg(null)} onInvia={async (body) => {
        const nome = dlg.tipo === "ricevuta" ? "ricevuta" : dlg.tipo === "aggiornamento_riparazione" ? "aggiornamento-riparazione" : "preventivo";
        const corpo = dlg.tipo === "preventivo" || dlg.tipo === "aggiornamento" ? { ...body, tipo: dlg.tipo } : body;
        const r = await azione(nome, corpo, dlg.tipo === "ricevuta" ? "Ricevuta" : dlg.tipo === "aggiornamento_riparazione" ? "Aggiornamento riparazione" : "Preventivo inviato");
        return r ? (r.esito as Esito) : null;
      }} />}
      {dlg?.k === "esito" && <DialogoEsito s={s} righe={bz.righe} onClose={() => setDlg(null)}
        onEsito={async (body) => !!(await azione("esito-preventivo", body, body.esito === "accettato" ? "ACCETTATO: in riparazione, lavorazione precompilata" : "Preventivo RIFIUTATO"))} />}
      {dlg?.k === "pronto" && <DialogoPronto s={s} lavorazione={String(v("lavorazione") || "")} totale={(v("totale_lavorazione") as number | null) ?? null} onClose={() => setDlg(null)}
        onInvia={async (body) => { const r = await azione("pronto", body, "PRONTO"); return r ? (r.esito as Esito) : null; }} />}
      {dlg?.k === "pagato" && <DialogoPagato s={s} onClose={() => setDlg(null)} onPagato={async (body) => !!(await azione("pagamento", body, "Pagamento registrato"))} />}
      {dlg?.k === "consegna" && <DialogoConsegna s={s} onClose={() => setDlg(null)} onConsegna={async (modo) => !!(await azione("consegna", { modo }, "Consegnata: scheda chiusa"))} />}
      {dlg?.k === "corriere" && <DialogoCorriere s={s} operatore={operatore} onClose={() => setDlg(null)}
        onFatta={() => { setDlg(null); ricarica(); onCambiata(); }}
        onCorriereCliente={async () => {
          try { const n = await assModifica(s.id, { consegna_corriere: "cliente", consegna_modo: "spedizione", operatore }); setS(n); toast.success("Annotato: ritira il corriere del cliente"); setDlg(null); }
          catch (e) { toastErrore(e); }
        }} />}
      {dlg?.k === "assegna_verifica" && <DialogoAssegna titolo={`Assegna in verifica — scheda ${s.sigla}`} tecnici={tecnici} attuale={s.tecnico_verifica}
        testo="Chi fa la verifica (test in ingresso / diagnosi)? Il tecnico poi scrive la verifica e la chiude." onClose={() => setDlg(null)}
        onAssegna={async (t) => !!(await azione("assegna-verifica", { tecnico: t }, `Verifica assegnata a ${t}`))} />}
      {dlg?.k === "chiudi_verifica" && <DialogoChiudiVerifica s={s} tecnici={tecnici} onClose={() => setDlg(null)}
        onChiudi={async (body) => !!(await azione("chiudi-verifica", body, "Verifica chiusa: da preventivare"))} />}
      {dlg?.k === "assegna_riparazione" && <DialogoAssegna titolo={`Assegna in riparazione — scheda ${s.sigla}`} tecnici={tecnici} attuale={s.tecnico_riparazione}
        testo="Chi fa la riparazione? Poi si aggiorna lo stato: attesa ricambi, aggiornamento al cliente, serve più tempo, «Trova il mio dispositivo», finita."
        onClose={() => setDlg(null)} onAssegna={async (t) => !!(await azione("assegna-riparazione", { tecnico: t }, `Riparazione assegnata a ${t}`))} />}
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

function MenuPdf({ id }: { id: string }) {
  const [doc, setDoc] = useState<DocPdf>("auto");
  return (
    <span className="inline-flex items-center gap-1 rounded-md border p-0.5">
      <select className="h-7 rounded bg-transparent px-1 text-xs" value={doc} onChange={(e) => setDoc(e.target.value as DocPdf)} aria-label="Documento PDF">
        <option value="auto">PDF secondo lo stato</option>
        {DOCUMENTI_PDF.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <a className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs hover:bg-muted" href={assDocUrl(id, doc)} target="_blank" rel="noreferrer"><FileText className="size-3.5" />Apri</a>
      <a className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs hover:bg-muted" href={assDocUrl(id, doc, true)}><Download className="size-3.5" />Scarica</a>
    </span>
  );
}
