"use client";

// FATTURAZIONE (30/09/2026) — fatture emesse e ricevute delle 3 società, esiti SdI,
// incassi (contanti, POS SumUp, carta Stripe, bonifico). Trasmissione tramite Openapi.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banknote, Download, FileText, Loader2, Plus, RefreshCw, RotateCcw, Search, Send, Truck, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  fattConfig, fattElenco, fattPagamentoMultiplo, fattUrlExport, type FattModalita, fattEsiti, fattRiepilogo, fattSincronizza,
  incElenco, type DaSpedire, type FattSocieta, type Fattura,
} from "@/lib/api";
import Link from "next/link";
import { Incassi } from "./Incassi";
import { Editor } from "./Editor";
import { Anagrafiche } from "./Anagrafiche";
import { DaIncassare, calcolaPeriodo } from "./DaIncassare";
import { Chiusure } from "./Chiusure";
import type { FattAnagrafica } from "@/lib/api";
import { Dettaglio } from "./Dettaglio";
import { MODALITA_LABEL, SOCIETA_LABEL, STATI, TIPI_LABEL, dataIt, eur } from "./util";

type Tab = "emessa" | "ricevuta" | "incassare" | "pagare" | "clienti" | "fornitori" | "chiusure" | "esiti";
interface Esito { id: string; tipo: string; descrizione: string; data: string;
  fatture?: { id: string; numero: string | null; societa: string; controparte_nome: string | null } | null }
interface Riepilogo { emesse: number; ricevute: number; fatturato: number; iva_vendite: number; acquisti: number;
  iva_acquisti: number; da_incassare: number; da_pagare: number; scartate: number; bozze: number; non_consegnate: number;
  mesi?: { mese: number; fatturato: number; acquisti: number }[] }
interface Config { ambiente: string; configurato: boolean }

function Pagina() {
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>("emessa");
  const [societa, setSocieta] = useState<string>("");
  const [stato, setStato] = useState("");
  const [pagamento, setPagamento] = useState("");
  const [q, setQ] = useState("");
  const [righe, setRighe] = useState<Fattura[]>([]);
  const [esiti, setEsiti] = useState<Esito[]>([]);
  const [rie, setRie] = useState<Riepilogo | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [aperta, setAperta] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ f: Fattura | null; anag?: FattAnagrafica } | null>(null);
  const [anno, setAnno] = useState<number>(new Date().getFullYear());
  const [prove, setProve] = useState(false);
  const [mese, setMese] = useState(0);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [modMulti, setModMulti] = useState<FattModalita>("bonifico");
  const [sync, setSync] = useState(false);
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
  useEffect(() => {
    const id = sp.get("id");
    if (id) setAperta(id);
    if (sp.get("nuova")) setEditor({ f: null });
    if (sp.get("incassi")) setIncassiAperti(true);
  }, [sp]);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "esiti") {
        const r = await fattEsiti(150);
        setEsiti(r.esiti || []);
      } else if (tab === "emessa" || tab === "ricevuta") {
        const ultimo = mese ? new Date(anno || 2026, mese, 0).getDate() : 0;
        const conPeriodo = periodo !== "tutto";
        const r = await fattElenco({ direzione: tab, societa, stato, pagamento, q, anno: anno && !conPeriodo ? String(anno) : "", prove: prove ? "true" : "", limit: "500",
          da: conPeriodo ? per.dal : mese && anno ? `${anno}-${String(mese).padStart(2, "0")}-01` : "",
          a: conPeriodo ? per.al : mese && anno ? `${anno}-${String(mese).padStart(2, "0")}-${ultimo}` : "" });
        const oggiIso = new Date().toISOString().slice(0, 10);
        setRighe((r.fatture || []).filter((f: Fattura) => !soloScadute || (f.pagamento_stato !== "pagata" && f.tipo_documento !== "TD04" && (f.scadenza || f.data || "") < oggiIso)));
        setSel({});
      }
      setRie(await fattRiepilogo(societa, anno));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab, societa, stato, pagamento, q, anno, prove, mese, periodo, per.dal, per.al, soloScadute]);

  useEffect(() => {
    const t = setTimeout(carica, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [carica, q]);

  async function sincronizza() {
    setSync(true);
    try {
      const r = await fattSincronizza();
      toast.success(`Aggiornati ${r.esiti_aggiornati || 0} esiti · ${r.passive_nuove || 0} fatture ricevute nuove`);
      carica();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSync(false);
    }
  }

  /** Azzera: torna alla pagina base della fatturazione (nessun filtro, anno in corso, fatture emesse). */
  function azzera() {
    setTab("emessa"); setStato(""); setPagamento(""); setQ(""); setMese(0); setProve(false); setSel({});
    setPeriodo("tutto"); setPGiorno(""); setPDal(""); setPAl(""); setSoloScadute(false); setCercaCrediti("");
    setAnno(new Date().getFullYear()); setSocieta("");
    if (sp.toString()) router.replace("/fatturazione");
  }
  const filtriAttivi = !!(stato || pagamento || q || mese || prove || periodo !== "tutto" || soloScadute || societa || anno !== new Date().getFullYear() || tab !== "emessa");

  function chiudiDettaglio() {
    setAperta(null);
    if (sp.get("id")) router.replace("/fatturazione");
  }

  const sel_cls = "h-8 rounded-md border border-input bg-background px-2 text-sm";
  const vai = (t: Tab, extra?: { stato?: string; pagamento?: string }) => {
    setTab(t); setStato(extra?.stato || ""); setPagamento(extra?.pagamento || ""); setMese(0);
  };
  const kpi = rie ? [
    { l: `Fatturato ${anno || ""} (imponibile)`, v: eur(rie.fatturato), s: `${rie.emesse} fatture emesse`, go: () => vai("emessa") },
    { l: "Da incassare", v: eur(rie.da_incassare), s: rie.bozze ? `${rie.bozze} bozze` : "per cliente →", go: () => vai("incassare") },
    { l: `Acquisti ${anno || ""} (imponibile)`, v: eur(rie.acquisti), s: `${rie.ricevute} fatture ricevute`, go: () => vai("ricevuta") },
    { l: "Da pagare ai fornitori", v: eur(rie.da_pagare), s: "per fornitore →", go: () => vai("pagare") },
    { l: "IVA vendite − acquisti", v: eur((rie.iva_vendite || 0) - (rie.iva_acquisti || 0)), s: "stima, non liquidazione", go: () => vai("emessa") },
    { l: "Da sistemare", v: String((rie.scartate || 0) + (rie.non_consegnate || 0)), s: `${rie.scartate} scartate · ${rie.non_consegnate} nel cassetto`, go: () => vai("emessa", { stato: "scartata" }) },
  ] : [];
  const maxMese = Math.max(1, ...(rie?.mesi || []).map((m) => Math.max(m.fatturato, m.acquisti)));
  const selIds = Object.keys(sel).filter((k) => sel[k]);
  async function incassaSelezionate() {
    if (!selIds.length) return;
    if (!confirm(`Segnare ${selIds.length} fatture come ${tab === "emessa" ? "incassate" : "pagate"} (${modMulti}, oggi)?`)) return;
    try { await fattPagamentoMultiplo({ ids: selIds, modalita: modMulti }); toast.success(`${selIds.length} fatture aggiornate`); carica(); }
    catch (e) { toast.error((e as Error).message); }
  }
  const exportUrl = fattUrlExport({ direzione: tab === "ricevuta" ? "ricevuta" : "emessa", societa, anno: anno ? String(anno) : "", stato, pagamento, q, prove: prove ? "true" : "" });

  return (
    <div className="space-y-4 p-4 md:p-6">
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
            {[2026, 2025, 2024].map((a) => <option key={a} value={a}>{a}</option>)}
            <option value={0}>Tutti gli anni</option>
          </select>
          <select className={sel_cls} value={societa} onChange={(e) => setSocieta(e.target.value)}>
            <option value="">Tutte le società</option>
            {Object.entries(SOCIETA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
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
              <div className="text-lg font-semibold tabular-nums">{k.v}</div>
              {k.s && <div className="text-xs text-muted-foreground">{k.s}</div>}
            </Card>
          ))}
        </div>
      )}

      {rie?.mesi && anno > 0 && (
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Imponibile per mese {anno} — clicca un mese per filtrare</span>
            <span><span className="mr-1 inline-block size-2 rounded-sm bg-primary" />fatturato <span className="ml-2 mr-1 inline-block size-2 rounded-sm bg-muted-foreground/40" />acquisti</span>
          </div>
          <div className="flex h-28 items-end gap-1">
            {rie.mesi.map((m) => (
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

      <div className="flex flex-wrap items-center gap-2 border-b">
        {([["emessa", "Emesse"], ["ricevuta", "Ricevute"], ["incassare", "Da incassare"], ["pagare", "Da pagare"], ["clienti", "Clienti"], ["fornitori", "Fornitori"], ["chiusure", "Chiusure"], ["esiti", "Esiti SdI"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => { if (k === "incassare" || k === "pagare") setCercaCrediti(q); setTab(k); setStato(""); }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>
            {l}
            {k === "incassare" && rie && rie.da_incassare > 0 && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-700 dark:text-amber-300">{eur(rie.da_incassare)}</span>}
            {k === "pagare" && rie && rie.da_pagare > 0 && <span className="ml-1 rounded bg-muted px-1 text-[10px]">{eur(rie.da_pagare)}</span>}
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
          <span>{righe.length} fatture da incassare · <b>{eur(righe.reduce((t, f) => t + Number(f.totale) * (f.tipo_documento === "TD04" ? -1 : 1), 0))}</b></span>
          <Button size="sm" className="ml-auto" onClick={() => { setCercaCrediti(q); setTab("incassare"); }}>
            <Send /> Estratto PDF e richiesta di pagamento{q ? ` a «${q}»` : ""}
          </Button>
        </Card>
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
              </tr>
            </thead>
            <tbody>
              {righe.map((f) => {
                const st = STATI[f.stato] || { label: f.stato, cls: "bg-muted" };
                const nc = f.tipo_documento === "TD04";
                const scaduta = f.pagamento_stato !== "pagata" && f.scadenza && f.scadenza < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={f.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => setAperta(f.id)}>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={!!sel[f.id]} onChange={(e) => setSel((p) => ({ ...p, [f.id]: e.target.checked }))} />
                    </td>
                    <td className="p-2 font-medium">
                      {f.numero || <span className="text-muted-foreground">bozza</span>}
                      {f.tipo_documento !== "TD01" && <div className="text-xs text-muted-foreground">{TIPI_LABEL[f.tipo_documento] || f.tipo_documento}</div>}
                      {f.ambiente === "sandbox" && <span className="ml-1 rounded bg-orange-500/15 px-1 text-[10px] text-orange-700 dark:text-orange-300">PROVA</span>}
                      {f.origine === "simplyfatt" && <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground" title="Importata dallo storico SimplyFatt">SF</span>}
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
                        : <span className={scaduta ? "font-medium text-red-600" : "text-amber-700 dark:text-amber-300"}>
                            {tab === "emessa" ? "da incassare" : "da pagare"}{f.scadenza ? ` · ${dataIt(f.scadenza)}` : ""}
                          </span>}
                    </td>
                  </tr>
                );
              })}
              {!righe.length && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                  {tab === "emessa" ? "Nessuna fattura emessa con questi filtri" : "Nessuna fattura ricevuta: arrivano da sole dallo SdI quando i fornitori usano il nostro codice destinatario"}
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
        <Dettaglio id={aperta} onClose={chiudiDettaglio} onChanged={carica}
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
          onSaved={(id) => { setEditor(null); carica(); setAperta(id); }} />
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

