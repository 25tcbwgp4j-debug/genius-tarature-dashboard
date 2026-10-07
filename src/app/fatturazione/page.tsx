"use client";

// FATTURAZIONE (30/09/2026) — fatture emesse e ricevute delle 3 società, esiti SdI,
// incassi (contanti, POS SumUp, carta Stripe, bonifico). Trasmissione tramite Openapi.

import { BadgeOperatore } from "@/components/Operatore";
import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banknote, Download, FileText, ListFilter, Loader2, Plus, RefreshCw, RotateCcw, Search, Send, Truck, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import {
  fattConfig, fattElenco, fattPagamentoMultiplo, fattUrlExport, type FattModalita, fattEsiti, fattRiepilogo, fattSincronizza, fattRicevuteStato, fattRicevuteViste, type FattRicevuteStato,
  incElenco, type DaSpedire, type FattSocieta, type Fattura,
} from "@/lib/api";
import Link from "next/link";
import { Incassi } from "./Incassi";
import { Editor } from "./Editor";
import { Anagrafiche } from "./Anagrafiche";
import { DaIncassare, calcolaPeriodo } from "./DaIncassare";
import { Chiusure } from "./Chiusure";
import { Commercialista } from "./Commercialista";
import { Coerenza } from "./Coerenza";
import { usePermessi } from "@/components/permessi";
import { BadgeAttivita, FiltroAttivita } from "@/components/attivita";
import type { FattAnagrafica } from "@/lib/api";
import { Dettaglio } from "./Dettaglio";
import { RigheTrovate, StoricoPrezzi, paroleRicerca } from "./RicercaRighe";
import type { FattStoricoPrezzo } from "@/lib/api";
import { MODALITA_LABEL, SOCIETA_LABEL, STATI, TIPI_LABEL, dataIt, eur } from "./util";
import { annoRoma, oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";

type Tab = "emessa" | "ricevuta" | "incassare" | "pagare" | "clienti" | "fornitori" | "chiusure" | "esiti" | "commercialista" | "sessioni";
interface Esito { id: string; tipo: string; descrizione: string; data: string;
  fatture?: { id: string; numero: string | null; societa: string; controparte_nome: string | null } | null }
// per l'operatore (livelli di accesso 01/10/2026) i totali riservati arrivano null e riservato=true
interface Riepilogo { emesse: number; ricevute: number; fatturato: number | null; iva_vendite: number | null; acquisti: number | null;
  iva_acquisti: number | null; da_incassare: number | null; da_pagare: number | null; scartate: number; bozze: number; non_consegnate: number;
  mesi?: { mese: number; fatturato: number; acquisti: number }[]; riservato?: boolean }
/** Importo o «riservato» quando il backend non lo manda all'operatore. */
const eurR = (v: number | null | undefined) => (v === null || v === undefined ? "riservato" : eur(v));
interface Config { ambiente: string; configurato: boolean }

function Pagina() {
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>("emessa");
  const { admin } = usePermessi();
  const [societa, setSocieta] = useState<string>("");
  const [attivitaF, setAttivitaF] = useState("");
  const [stato, setStato] = useState("");
  const [pagamento, setPagamento] = useState("");
  const [q, setQ] = useState("");
  // sotto-ricerca nelle righe delle fatture già filtrate (07/10/2026): articolo, descrizione, codice, seriale…
  const [qRighe, setQRighe] = useState("");
  const [storico, setStorico] = useState<FattStoricoPrezzo[] | null>(null);
  const [righe, setRighe] = useState<Fattura[]>([]);
  const [esiti, setEsiti] = useState<Esito[]>([]);
  const [rie, setRie] = useState<Riepilogo | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [aperta, setAperta] = useState<string | null>(null);
  // dall'editor (05/10/2026): «Salva e registra pagamento» / «Salva come da pagare» → la bozza si apre sul passo giusto
  const [intento, setIntento] = useState<"pagamento" | "da_pagare" | null>(null);
  const [editor, setEditor] = useState<{ f: Fattura | null; anag?: FattAnagrafica } | null>(null);
  const [anno, setAnno] = useState<number>(annoRoma);
  const [prove, setProve] = useState(false);
  const [mese, setMese] = useState(0);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [modMulti, setModMulti] = useState<FattModalita>("bonifico");
  const [sync, setSync] = useState(false);
  const [ricStato, setRicStato] = useState<FattRicevuteStato | null>(null);
  const [periodo, setPeriodo] = useState<Parameters<typeof calcolaPeriodo>[0]>("tutto");
  const [pGiorno, setPGiorno] = useState("");
  const [pDal, setPDal] = useState("");
  const [pAl, setPAl] = useState("");
  const [soloScadute, setSoloScadute] = useState(false);
  const [incassiAperti, setIncassiAperti] = useState(false);
  const [nIncassi, setNIncassi] = useState(0);
  const [daSpedire, setDaSpedire] = useState<DaSpedire[]>([]);
  const [cercaCrediti, setCercaCrediti] = useState("");
  const per = calcolaPeriodo(periodo, pGiorno, pDal, pAl);

  const caricaIncassi = useCallback(() => {
    incElenco().then((r) => { setNIncassi(r.incassi.length); setDaSpedire(r.da_spedire); }).catch(() => undefined);
  }, []);
  useEffect(() => { caricaIncassi(); }, [caricaIncassi]);

  useEffect(() => { fattConfig().then(setCfg).catch(() => undefined); }, []);
  const caricaRicStato = useCallback(() => { fattRicevuteStato().then(setRicStato).catch(() => undefined); }, []);
  useEffect(() => { caricaRicStato(); }, [caricaRicStato]);
  useEffect(() => {
    const id = sp.get("id");
    if (id) setAperta(id);
    if (sp.get("nuova")) setEditor({ f: null });
    if (sp.get("incassi")) setIncassiAperti(true);
    if (sp.get("tab") === "ricevuta") setTab("ricevuta");   // link del riepilogo Telegram
    if (sp.get("tab") === "commercialista") setTab("commercialista");   // link del Telegram «contabilità allo studio»
    if (sp.get("tab") === "sessioni") setTab("sessioni");   // audit sessioni ↔ fatture
  }, [sp]);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "esiti") {
        const r = await fattEsiti(150);
        setEsiti(r.esiti || []);
      } else if (tab === "emessa" || tab === "ricevuta") {
        const ultimo = mese ? new Date(anno || annoRoma(), mese, 0).getDate() : 0;
        const conPeriodo = periodo !== "tutto";
        const r = await fattElenco({ direzione: tab, societa, stato, pagamento, q, q_righe: qRighe.trim(), attivita: attivitaF, anno: anno && !conPeriodo ? String(anno) : "", prove: prove ? "true" : "", limit: "500",
          da: conPeriodo ? per.dal : mese && anno ? `${anno}-${String(mese).padStart(2, "0")}-01` : "",
          a: conPeriodo ? per.al : mese && anno ? `${anno}-${String(mese).padStart(2, "0")}-${ultimo}` : "" });
        const oggiIso = oggiRoma();
        setStorico(r.storico_prezzi ?? null);
        setRighe((r.fatture || []).filter((f: Fattura) => !soloScadute || (f.pagamento_stato !== "pagata" && f.tipo_documento !== "TD04" && (f.scadenza || f.data || "") < oggiIso)));
        setSel({});
        // aperta la scheda Ricevute: le nuove restano evidenziate in questa vista, il badge si azzera
        if (tab === "ricevuta" && (r.fatture || []).some((f: Fattura) => !f.vista_il)) {
          fattRicevuteViste().then(caricaRicStato).catch(() => undefined);
        }
      }
      // il riepilogo non deve bloccare l'elenco (es. operatore: totali riservati)
      setRie(await fattRiepilogo(societa, anno).catch(() => null));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab, societa, stato, pagamento, q, qRighe, attivitaF, anno, prove, mese, periodo, per.dal, per.al, soloScadute, caricaRicStato]);

  useEffect(() => {
    const t = setTimeout(carica, q || qRighe ? 300 : 0);
    return () => clearTimeout(t);
  }, [carica, q, qRighe]);

  async function sincronizza() {
    setSync(true);
    try {
      const r = await fattSincronizza();
      const ric = r.ricevute as { ok?: boolean; nuove?: { fornitore: string; numero: string; totale: number }[] } | undefined;
      const testo = `${r.messaggio || `${r.passive_nuove || 0} fatture ricevute nuove`} · esiti emesse aggiornati: ${r.esiti_aggiornati || 0}`;
      const elenco = (ric?.nuove || []).slice(0, 8).map((x) => `${x.fornitore} n. ${x.numero} — ${eur(x.totale)}`).join(" · ");
      if (r.ok === false || ric?.ok === false) toast.error(testo, { duration: 15000 });
      else toast.success(testo, { description: elenco || undefined, duration: 10000 });
      carica();
      caricaRicStato();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSync(false);
    }
  }

  /** Azzera: torna alla pagina base della fatturazione (nessun filtro, anno in corso, fatture emesse). */
  function azzera() {
    setTab("emessa"); setStato(""); setPagamento(""); setQ(""); setQRighe(""); setMese(0); setProve(false); setSel({});
    setPeriodo("tutto"); setPGiorno(""); setPDal(""); setPAl(""); setSoloScadute(false); setCercaCrediti("");
    setAnno(annoRoma()); setSocieta(""); setAttivitaF("");
    if (sp.toString()) router.replace("/fatturazione");
  }
  const filtriAttivi = !!(stato || pagamento || q || qRighe || mese || prove || periodo !== "tutto" || soloScadute || societa || attivitaF || anno !== annoRoma() || tab !== "emessa");

  function chiudiDettaglio() {
    setAperta(null);
    if (sp.get("id")) router.replace("/fatturazione");
  }

  const sel_cls = "h-8 rounded-md border border-input bg-background px-2 text-sm";
  const vai = (t: Tab, extra?: { stato?: string; pagamento?: string }) => {
    setTab(t); setStato(extra?.stato || ""); setPagamento(extra?.pagamento || ""); setMese(0);
  };
  const kpi = rie ? [
    { l: `Fatturato ${anno || ""} (imponibile)`, v: eurR(rie.fatturato), s: `${rie.emesse} fatture emesse`, go: () => vai("emessa") },
    { l: "Da incassare", v: eurR(rie.da_incassare), s: rie.bozze ? `${rie.bozze} bozze` : "per cliente →", go: () => vai("incassare") },
    { l: `Acquisti ${anno || ""} (imponibile)`, v: eurR(rie.acquisti), s: `${rie.ricevute} fatture ricevute`, go: () => vai("ricevuta") },
    { l: "Da pagare ai fornitori", v: eurR(rie.da_pagare), s: "per fornitore →", go: () => vai("pagare") },
    { l: "IVA vendite − acquisti", v: rie.iva_vendite === null || rie.iva_acquisti === null ? "riservato" : eur((rie.iva_vendite || 0) - (rie.iva_acquisti || 0)), s: "stima, non liquidazione", go: () => vai("emessa") },
    { l: "Da sistemare", v: String((rie.scartate || 0) + (rie.non_consegnate || 0)), s: `${rie.scartate} scartate · ${rie.non_consegnate} nel cassetto`, go: () => vai("emessa", { stato: "scartata" }) },
  ] : [];
  const maxMese = Math.max(1, ...(rie?.mesi || []).map((m) => Math.max(m.fatturato, m.acquisti)));
  const selIds = Object.keys(sel).filter((k) => sel[k]);
  async function incassaSelezionate() {
    if (!selIds.length) return;
    if (!confirm(`Segnare ${selIds.length} fatture come ${tab === "emessa" ? "incassate" : "pagate"} (${modMulti}, oggi)?`)) return;
    try { await fattPagamentoMultiplo({ ids: selIds, modalita: modMulti }); toast.success(`${selIds.length} fatture aggiornate`); carica(); }
    catch (e) { toastErrore(e); }
  }
  const conPeriodoExp = periodo !== "tutto";
  const ultimoExp = mese ? new Date(anno || annoRoma(), mese, 0).getDate() : 0;
  const exportUrl = fattUrlExport({ direzione: tab === "ricevuta" ? "ricevuta" : "emessa", societa, anno: anno && !conPeriodoExp ? String(anno) : "", stato, pagamento, q,
    prove: prove ? "true" : "",
    da: conPeriodoExp ? per.dal : mese && anno ? `${anno}-${String(mese).padStart(2, "0")}-01` : "",
    a: conPeriodoExp ? per.al : mese && anno ? `${anno}-${String(mese).padStart(2, "0")}-${ultimoExp}` : "" });

  return (
    <div className="space-y-4 p-1 md:p-2">
      <div className="flex flex-wrap items-center gap-3">
        <FileText className="size-6" />
        <h1 className="text-2xl font-semibold">Fatturazione</h1>
        {cfg?.ambiente === "sandbox" && (
          <span className="rounded bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300"
            title="Le fatture vanno all'ambiente di prova Openapi: nulla arriva davvero all'Agenzia delle Entrate">
            AMBIENTE DI PROVA
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <select className={sel_cls} value={anno} onChange={(e) => setAnno(Number(e.target.value))}>
            {Array.from({ length: Math.max(4, annoRoma() - 2022) }, (_, i) => annoRoma() - i).map((a) => <option key={a} value={a}>{a}</option>)}
            <option value={0}>Tutti gli anni</option>
          </select>
          <select className={sel_cls} value={societa} onChange={(e) => setSocieta(e.target.value)}>
            <option value="">Tutte le società</option>
            {Object.entries(SOCIETA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <FiltroAttivita value={attivitaF} onChange={setAttivitaF} />
          {filtriAttivi && <Button variant="ghost" onClick={azzera} title="Torna alla pagina base della fatturazione"><RotateCcw /> Azzera</Button>}
          <Button variant="outline" onClick={() => setIncassiAperti(true)} title="Bonifici, POS, PayPal, Stripe arrivati">
            <Banknote /> Verifica pagamenti
            {nIncassi > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">{nIncassi}</span>}
          </Button>
          <Button variant="outline" onClick={sincronizza} disabled={sync}>
            {sync ? <Loader2 className="animate-spin" /> : <RefreshCw />} Aggiorna da SdI
          </Button>
          <Button onClick={() => setEditor({ f: null })}><Plus /> Nuova fattura</Button>
        </div>
      </div>

      {daSpedire.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <Truck className="size-4" /> <b>{daSpedire.length} {daSpedire.length === 1 ? "sessione pagata da spedire" : "sessioni pagate da spedire"}:</b>
          {daSpedire.slice(0, 6).map((d) => (
            <Link key={d.session_id} href={`/sessioni/${d.session_id}`} className="rounded bg-background px-1.5 py-0.5 underline">
              n. {d.numero} {d.cliente}
            </Link>
          ))}
        </Card>
      )}

      {rie && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpi.map((k) => (
            <Card key={k.l} className="cursor-pointer p-3 transition hover:border-primary" onClick={k.go}>
              <div className="text-xs text-muted-foreground">{k.l}</div>
              <div className={`text-lg font-semibold tabular-nums ${k.v === "riservato" ? "italic text-muted-foreground" : ""}`} title={k.v === "riservato" ? "Visibile solo all'amministratore" : undefined}>{k.v}</div>
              {k.s && <div className="text-xs text-muted-foreground">{k.s}</div>}
            </Card>
          ))}
        </div>
      )}

      {!!rie?.mesi?.length && anno > 0 && (
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Imponibile per mese {anno} — clicca un mese per filtrare</span>
            <span><span className="mr-1 inline-block size-2 rounded-sm bg-primary" />fatturato <span className="ml-2 mr-1 inline-block size-2 rounded-sm bg-muted-foreground/40" />acquisti</span>
          </div>
          <div className="flex h-28 items-end gap-1">
            {(rie.mesi || []).map((m) => (
              <button key={m.mese} title={`${m.mese}/${anno}: fatturato ${eur(m.fatturato)} · acquisti ${eur(m.acquisti)}`}
                onClick={() => { setMese(mese === m.mese ? 0 : m.mese); if (tab !== "emessa" && tab !== "ricevuta") setTab("emessa"); }}
                className={`flex h-full flex-1 flex-col items-center justify-end gap-0.5 rounded ${mese === m.mese ? "bg-muted" : ""}`}>
                <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                  <div className="w-2/5 rounded-t bg-primary" style={{ height: `${(m.fatturato / maxMese) * 100}%` }} />
                  <div className="w-2/5 rounded-t bg-muted-foreground/40" style={{ height: `${(m.acquisti / maxMese) * 100}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{["G","F","M","A","M","G","L","A","S","O","N","D"][m.mese - 1]}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {ricStato?.ultimo && (
        <div className={`text-xs ${ricStato.ultimo.ok ? "text-muted-foreground" : "font-medium text-red-600"}`}
          title={ricStato.ultimo.messaggio}>
          Fatture ricevute — ultimo controllo SdI: {new Date(ricStato.ultimo.quando).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          {" "}({ricStato.ultimo.trigger === "manuale" ? "manuale" : ricStato.ultimo.trigger === "giornaliero" ? "giro delle 8/14" : "automatico ogni 15'"}, {ricStato.ultimo.fonte === "effatta" ? "Effatta" : ricStato.ultimo.fonte})
          {" · "}{ricStato.ultimo.ok ? `${ricStato.ultimo.controllate} in Effatta negli ultimi 3 mesi, ${ricStato.ultimo.nuove} nuove` : ricStato.ultimo.messaggio}
          {ricStato.ultimo_con_novita && <> · ultimo arrivo: {new Date(ricStato.ultimo_con_novita.quando).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} ({ricStato.ultimo_con_novita.nuove})</>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b">
        {([["emessa", "Emesse"], ["ricevuta", "Ricevute"], ["incassare", "Da incassare"], ["pagare", "Da pagare"], ["clienti", "Clienti"], ["fornitori", "Fornitori"], ["chiusure", "Chiusure"], ["sessioni", "Sessioni ↔ fatture"], ["esiti", "Esiti SdI"], ...(admin ? [["commercialista", "Commercialista"]] : [])] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => { if (k === "incassare" || k === "pagare") setCercaCrediti(q); setTab(k); setStato(""); }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>
            {l}
            {k === "incassare" && rie && (rie.da_incassare ?? 0) > 0 && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-700 dark:text-amber-300">{eur(rie.da_incassare ?? 0)}</span>}
            {k === "ricevuta" && (ricStato?.nuove_da_vedere ?? 0) > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white" title="Fatture ricevute arrivate dallo SdI e non ancora viste">{ricStato?.nuove_da_vedere} nuove</span>}
            {k === "pagare" && rie && (rie.da_pagare ?? 0) > 0 && <span className="ml-1 rounded bg-muted px-1 text-[10px]">{eur(rie.da_pagare ?? 0)}</span>}
          </button>
        ))}
        {(tab === "emessa" || tab === "ricevuta") && (
          <div className="ml-auto flex flex-wrap items-center gap-2 pb-2">
            {mese > 0 && <Button size="xs" variant="secondary" onClick={() => setMese(0)}>mese {mese}/{anno} ✕</Button>}
            <select className={sel_cls} value={periodo} onChange={(e) => { setPeriodo(e.target.value as typeof periodo); setMese(0); }} title="Periodo (data fattura)">
              <option value="tutto">Tutto l&apos;anno scelto</option>
              <option value="mese">Mese in corso</option>
              <option value="mese_prec">Mese precedente</option>
              <option value="anno">Anno in corso</option>
              <option value="anno_prec">Anno precedente</option>
              <option value="giorno">Una data…</option>
              <option value="intervallo">Dal… al…</option>
            </select>
            {periodo === "giorno" && <input type="date" className={sel_cls} value={pGiorno} onChange={(e) => setPGiorno(e.target.value)} />}
            {periodo === "intervallo" && <>
              <input type="date" className={sel_cls} value={pDal} onChange={(e) => setPDal(e.target.value)} title="dal" />
              <input type="date" className={sel_cls} value={pAl} onChange={(e) => setPAl(e.target.value)} title="al" />
            </>}
            <Button size="xs" variant={pagamento === "da_pagare" ? "default" : "outline"}
              onClick={() => setPagamento(pagamento === "da_pagare" ? "" : "da_pagare")}>
              {tab === "emessa" ? "da incassare" : "da pagare"}
            </Button>
            <Button size="xs" variant={soloScadute ? "destructive" : "outline"} onClick={() => setSoloScadute(!soloScadute)}>scadute</Button>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={prove} onChange={(e) => setProve(e.target.checked)} /> mostra prove
            </label>
            <a href={exportUrl}><Button size="sm" variant="outline"><Download /> CSV</Button></a>
            <div className="relative">
              <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
              <Input className="h-8 w-56 pl-8" placeholder="Cliente, numero, P.IVA…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="relative w-full sm:w-72" title="Cerca nelle righe delle fatture già selezionate (cliente, periodo, filtri): tutte le parole, senza badare a maiuscole e accenti">
              <ListFilter className="absolute left-2 top-2 size-4 text-muted-foreground" />
              <Input className="h-8 w-full pl-8 pr-8" placeholder="Cerca dentro le fatture (articolo, descrizione, codice…)"
                value={qRighe} onChange={(e) => setQRighe(e.target.value)} />
              {qRighe && (
                <button type="button" className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setQRighe("")} title="Svuota la ricerca nelle righe" aria-label="Svuota la ricerca nelle righe">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <select className={sel_cls} value={stato} onChange={(e) => setStato(e.target.value)}>
              <option value="">Tutti gli stati</option>
              {Object.entries(STATI).filter(([k]) => tab === "ricevuta" ? k === "ricevuta" : k !== "ricevuta")
                .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className={sel_cls} value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
              <option value="">Pagate e non</option>
              <option value="da_pagare">{tab === "emessa" ? "Da incassare" : "Da pagare"}</option>
              <option value="pagata">{tab === "emessa" ? "Incassate" : "Pagate"}</option>
            </select>
          </div>
        )}
      </div>

      {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>}

      {(tab === "incassare" || tab === "pagare") && (
        <DaIncassare key={`${tab}-${cercaCrediti}`} societa={societa || "genius"} anno={0} direzione={tab === "incassare" ? "emessa" : "ricevuta"}
          cercaIniziale={cercaCrediti} onApriFattura={(id) => setAperta(id)} onCambiato={() => { carica(); caricaIncassi(); }} />
      )}

      {tab === "chiusure" && <Chiusure societa={societa} />}
      {tab === "sessioni" && <Coerenza anno={anno || annoRoma()} />}

      {tab === "commercialista" && admin && <Commercialista periodoIniziale={sp.get("periodo") || undefined} />}

      {(tab === "clienti" || tab === "fornitori") && (
        <Anagrafiche societa={societa || "genius"} tipo={tab === "clienti" ? "cliente" : "fornitore"}
          onNuovaFattura={(a) => setEditor({ f: null, anag: a })}
          onApriFattura={(id) => setAperta(id)} />
      )}

      {!loading && (tab === "emessa" || tab === "ricevuta") && selIds.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 p-2 text-sm">
          <span><b>{selIds.length}</b> selezionate · {eur(righe.filter((f) => sel[f.id]).reduce((t, f) => t + Number(f.totale) * (f.tipo_documento === "TD04" ? -1 : 1), 0))}</span>
          <select className={sel_cls} value={modMulti} onChange={(e) => setModMulti(e.target.value as FattModalita)}>
            {(["bonifico", "pos_sumup", "paypal", "contanti", "carta_stripe"] as FattModalita[]).map((m) => <option key={m} value={m}>{MODALITA_LABEL[m]}</option>)}
          </select>
          <Button size="sm" onClick={incassaSelezionate}><Wallet /> Segna {tab === "emessa" ? "incassate" : "pagate"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel({})}>Deseleziona</Button>
        </Card>
      )}

      {!loading && tab === "emessa" && pagamento === "da_pagare" && righe.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 p-2 text-sm">
          <span>{righe.length} fatture da incassare · <b>{eur(righe.reduce((t, f) => t + (Number(f.totale) - Number(f.pagato || 0)) * (f.tipo_documento === "TD04" ? -1 : 1), 0))}</b></span>
          <Button size="sm" className="ml-auto" onClick={() => { setCercaCrediti(q); setTab("incassare"); }}>
            <Send /> Estratto PDF e richiesta di pagamento{q ? ` a «${q}»` : ""}
          </Button>
        </Card>
      )}

      {!loading && (tab === "emessa" || tab === "ricevuta") && !!qRighe.trim() && storico && (
        <StoricoPrezzi voci={storico} parole={paroleRicerca(qRighe)} onApri={(id) => setAperta(id)}
          limitato={periodo === "tutto" && anno ? `solo ${anno}${mese ? ` mese ${mese}` : ""} — scegli «Tutti gli anni» per lo storico completo` : undefined} />
      )}

      {!loading && (tab === "emessa" || tab === "ricevuta") && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-8 p-2" onClick={(e) => e.stopPropagation()}><input type="checkbox"
                  checked={!!righe.length && righe.every((f) => sel[f.id])}
                  onChange={(e) => setSel(Object.fromEntries(righe.map((f) => [f.id, e.target.checked])))} /></th>
                <th className="p-2">Numero</th><th className="p-2">Data</th><th className="p-2">{tab === "emessa" ? "Cliente" : "Fornitore"}</th>
                {!societa && <th className="p-2">Società</th>}
                <th className="p-2 text-right">Imponibile</th><th className="p-2 text-right">Totale</th>
                <th className="p-2">Stato SdI</th><th className="p-2">Pagamento</th>
                {tab === "emessa" && <th className="p-2" title="Operatore">Op.</th>}
              </tr>
            </thead>
            <tbody>
              {righe.map((f) => {
                const st = STATI[f.stato] || { label: f.stato, cls: "bg-muted" };
                const nc = f.tipo_documento === "TD04";
                const scaduta = f.pagamento_stato !== "pagata" && f.scadenza && f.scadenza < oggiRoma();
                const trovate = qRighe.trim() && f.righe_trovate?.length ? f.righe_trovate : null;
                return (
                  <Fragment key={f.id}>
                  <tr className={`cursor-pointer hover:bg-muted/50 ${trovate ? "" : "border-b last:border-0"}`} onClick={() => setAperta(f.id)}>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={!!sel[f.id]} onChange={(e) => setSel((p) => ({ ...p, [f.id]: e.target.checked }))} />
                    </td>
                    <td className="p-2 font-medium">
                      {f.numero || <span className="text-muted-foreground">bozza</span>}
                      {f.tipo_documento !== "TD01" && <div className="text-xs text-muted-foreground">{TIPI_LABEL[f.tipo_documento] || f.tipo_documento}</div>}
                      {f.ambiente === "sandbox" && <span className="ml-1 rounded bg-orange-500/15 px-1 text-[10px] text-orange-700 dark:text-orange-300">PROVA</span>}
                      {tab === "ricevuta" && !f.vista_il && <span className="ml-1 rounded bg-red-600 px-1 text-[10px] font-semibold text-white" title="Arrivata dallo SdI, non ancora vista">NUOVA</span>}
                      {f.origine === "simplyfatt" && <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground" title="Importata dallo storico SimplyFatt">SF</span>}
                      {f.session_number != null && <span className="ml-1 rounded bg-sky-500/15 px-1 text-[10px] text-sky-800 dark:text-sky-200" title="Sessione di taratura collegata">Sess. {f.session_number}</span>}
                      <div><BadgeAttivita a={f.attivita} /></div>
                    </td>
                    <td className="p-2 whitespace-nowrap">{dataIt(f.data)}</td>
                    <td className="p-2">
                      <div>{f.controparte_nome}</div>
                      <div className="text-xs text-muted-foreground">{f.controparte_piva || f.controparte_cf || ""}</div>
                    </td>
                    {!societa && <td className="p-2 text-xs">{SOCIETA_LABEL[f.societa]}</td>}
                    <td className="p-2 text-right tabular-nums">{nc ? "−" : ""}{eur(f.imponibile)}</td>
                    <td className="p-2 text-right font-medium tabular-nums">{nc ? "−" : ""}{eur(f.totale)}</td>
                    <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-xs ${st.cls}`}>{st.label}</span></td>
                    <td className="p-2 text-xs">
                      {nc ? "—" : f.pagamento_stato === "pagata"
                        ? <span className="text-emerald-700 dark:text-emerald-300">{MODALITA_LABEL[f.pagamento_modalita || ""] || "pagata"} · {dataIt(f.pagato_il)}</span>
                        : f.pagamento_stato === "parziale"
                        ? <span className={scaduta ? "font-medium text-red-600" : "text-sky-700 dark:text-sky-300"} title="Incassata in parte (acconto)">
                            in parte: {eur(Number(f.pagato || 0))} · resta {eur(Number(f.totale) - Number(f.pagato || 0))}{f.scadenza ? ` · ${dataIt(f.scadenza)}` : ""}
                          </span>
                        : <span className={scaduta ? "font-medium text-red-600" : "text-amber-700 dark:text-amber-300"}>
                            {tab === "emessa" ? "da incassare" : "da pagare"}{f.scadenza ? ` · ${dataIt(f.scadenza)}` : ""}
                          </span>}
                    </td>
                    {tab === "emessa" && <td className="p-2"><BadgeOperatore op={f.operatore} /></td>}
                  </tr>
                  {trovate && (
                    <tr className="cursor-pointer border-b last:border-0 hover:bg-muted/30" onClick={() => setAperta(f.id)}>
                      <td />
                      <td colSpan={9} className="px-2 pb-2 pt-0">
                        <div className="sticky left-2 max-w-[calc(100vw-3rem)] md:max-w-none">
                          <RigheTrovate righe={trovate} parole={paroleRicerca(qRighe)} nc={nc} />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
              {!righe.length && (
                <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">
                  {qRighe.trim() ? `Nessuna riga contiene «${qRighe.trim()}» nelle fatture selezionate${anno && periodo === "tutto" ? ` (anno ${anno}: prova «Tutti gli anni»)` : ""}` : tab === "emessa" ? "Nessuna fattura emessa con questi filtri" : "Nessuna fattura ricevuta: arrivano da sole dallo SdI quando i fornitori usano il nostro codice destinatario"}
                </td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {!loading && tab === "esiti" && (
        <Card className="divide-y p-0">
          {esiti.map((e) => (
            <button key={e.id} className="block w-full p-3 text-left text-sm hover:bg-muted/50" onClick={() => e.fatture?.id && setAperta(e.fatture.id)}>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{new Date(e.data).toLocaleString("it-IT")}</span>
                <span className="font-medium">{e.tipo}</span>
                {e.fatture && <span>{SOCIETA_LABEL[e.fatture.societa]} · {e.fatture.numero || "bozza"} · {e.fatture.controparte_nome}</span>}
              </div>
              <div>{e.descrizione}</div>
            </button>
          ))}
          {!esiti.length && <div className="p-8 text-center text-muted-foreground">Nessun esito</div>}
        </Card>
      )}

      {aperta && (
        <Dettaglio id={aperta} onClose={() => { setIntento(null); chiudiDettaglio(); }} onChanged={carica} intento={intento}
          onEdit={(f) => { setAperta(null); setEditor({ f }); }}
          onOpen={(id) => setAperta(id)} />
      )}
      {incassiAperti && (
        <Incassi onClose={() => { setIncassiAperti(false); caricaIncassi(); if (sp.get("incassi")) router.replace("/fatturazione"); }}
          onApriFattura={(id) => setAperta(id)} onCambiato={() => { carica(); caricaIncassi(); }} />
      )}
      {editor && (
        <Editor iniziale={editor.f} anagrafica={editor.anag} societaDefault={(societa as FattSocieta) || "genius"}
          onClose={() => setEditor(null)}
          onSaved={(id, passo) => { setEditor(null); carica(); setIntento(passo || null); setAperta(id); }} />
      )}
    </div>
  );
}

export default function FatturazionePage() {
  return (
    <Suspense fallback={<div className="p-6"><Loader2 className="animate-spin" /></div>}>
      <Pagina />
    </Suspense>
  );
}

