"use client";

// FATTURAZIONE (30/09/2026) — fatture emesse e ricevute delle 3 società, esiti SdI,
// incassi (contanti, POS SumUp, carta Stripe, bonifico). Trasmissione tramite Openapi.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  fattConfig, fattElenco, fattEsiti, fattRiepilogo, fattSincronizza,
  type FattSocieta, type Fattura,
} from "@/lib/api";
import { Editor } from "./Editor";
import { Anagrafiche } from "./Anagrafiche";
import type { FattAnagrafica } from "@/lib/api";
import { Dettaglio } from "./Dettaglio";
import { MODALITA_LABEL, SOCIETA_LABEL, STATI, TIPI_LABEL, dataIt, eur } from "./util";

type Tab = "emessa" | "ricevuta" | "clienti" | "fornitori" | "esiti";
interface Esito { id: string; tipo: string; descrizione: string; data: string;
  fatture?: { id: string; numero: string | null; societa: string; controparte_nome: string | null } | null }
interface Riepilogo { emesse: number; ricevute: number; fatturato: number; iva_vendite: number; acquisti: number;
  iva_acquisti: number; da_incassare: number; da_pagare: number; scartate: number; bozze: number; non_consegnate: number }
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
  const [sync, setSync] = useState(false);

  useEffect(() => { fattConfig().then(setCfg).catch(() => undefined); }, []);
  useEffect(() => {
    const id = sp.get("id");
    if (id) setAperta(id);
    if (sp.get("nuova")) setEditor({ f: null });
  }, [sp]);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "esiti") {
        const r = await fattEsiti(150);
        setEsiti(r.esiti || []);
      } else if (tab === "emessa" || tab === "ricevuta") {
        const r = await fattElenco({ direzione: tab, societa, stato, pagamento, q, anno: anno ? String(anno) : "", prove: prove ? "true" : "", limit: "500" });
        setRighe(r.fatture || []);
      }
      setRie(await fattRiepilogo(societa, anno));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tab, societa, stato, pagamento, q, anno, prove]);

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

  function chiudiDettaglio() {
    setAperta(null);
    if (sp.get("id")) router.replace("/fatturazione");
  }

  const sel = "h-8 rounded-md border border-input bg-background px-2 text-sm";
  const kpi = rie ? [
    { l: "Fatturato (imponibile)", v: eur(rie.fatturato), s: `${rie.emesse} fatture emesse` },
    { l: "Da incassare", v: eur(rie.da_incassare), s: rie.bozze ? `${rie.bozze} bozze` : "" },
    { l: "Acquisti (imponibile)", v: eur(rie.acquisti), s: `${rie.ricevute} fatture ricevute` },
    { l: "Da pagare ai fornitori", v: eur(rie.da_pagare), s: "" },
    { l: "IVA vendite − acquisti", v: eur((rie.iva_vendite || 0) - (rie.iva_acquisti || 0)), s: "stima, non liquidazione" },
    { l: "Da sistemare", v: String((rie.scartate || 0) + (rie.non_consegnate || 0)), s: `${rie.scartate} scartate · ${rie.non_consegnate} nel cassetto` },
  ] : [];

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
          <select className={sel} value={anno} onChange={(e) => setAnno(Number(e.target.value))}>
            {[2026, 2025, 2024].map((a) => <option key={a} value={a}>{a}</option>)}
            <option value={0}>Tutti gli anni</option>
          </select>
          <select className={sel} value={societa} onChange={(e) => setSocieta(e.target.value)}>
            <option value="">Tutte le società</option>
            {Object.entries(SOCIETA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <Button variant="outline" onClick={sincronizza} disabled={sync}>
            {sync ? <Loader2 className="animate-spin" /> : <RefreshCw />} Aggiorna da SdI
          </Button>
          <Button onClick={() => setEditor({ f: null })}><Plus /> Nuova fattura</Button>
        </div>
      </div>

      {rie && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpi.map((k) => (
            <Card key={k.l} className="p-3">
              <div className="text-xs text-muted-foreground">{k.l}</div>
              <div className="text-lg font-semibold tabular-nums">{k.v}</div>
              {k.s && <div className="text-xs text-muted-foreground">{k.s}</div>}
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b">
        {([["emessa", "Emesse"], ["ricevuta", "Ricevute"], ["clienti", "Clienti"], ["fornitori", "Fornitori"], ["esiti", "Esiti SdI"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setStato(""); }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>
            {l}
          </button>
        ))}
        {(tab === "emessa" || tab === "ricevuta") && (
          <div className="ml-auto flex flex-wrap items-center gap-2 pb-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={prove} onChange={(e) => setProve(e.target.checked)} /> mostra prove
            </label>
            <div className="relative">
              <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
              <Input className="h-8 w-56 pl-8" placeholder="Cliente, numero, P.IVA…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className={sel} value={stato} onChange={(e) => setStato(e.target.value)}>
              <option value="">Tutti gli stati</option>
              {Object.entries(STATI).filter(([k]) => tab === "ricevuta" ? k === "ricevuta" : k !== "ricevuta")
                .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className={sel} value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
              <option value="">Pagate e non</option>
              <option value="da_pagare">{tab === "emessa" ? "Da incassare" : "Da pagare"}</option>
              <option value="pagata">{tab === "emessa" ? "Incassate" : "Pagate"}</option>
            </select>
          </div>
        )}
      </div>

      {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>}

      {(tab === "clienti" || tab === "fornitori") && (
        <Anagrafiche societa={societa || "genius"} tipo={tab === "clienti" ? "cliente" : "fornitore"}
          onNuovaFattura={(a) => setEditor({ f: null, anag: a })}
          onApriFattura={(id) => setAperta(id)} />
      )}

      {!loading && (tab === "emessa" || tab === "ricevuta") && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
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
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
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

