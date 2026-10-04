"use client";

// BANCO ASSISTENZA — elenco delle schede a sinistra (richiudibile, per dare spazio alla scheda), la scheda a destra.
// 05/10/2026: la scheda è divisa in componenti in ./scheda/* (stile moderno, barra di avanzamento, preventivo dalle voci
// del modello, cliente dalla rubrica, documenti, comunicazioni). Su iPhone/iPad l'elenco lascia il posto alla scheda.
// Tastiera: F2 o Alt+N nuova scheda · «/» cerca · Alt+← / Alt+→ scheda precedente/successiva · Ctrl/Cmd+S salva · Esc chiude.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PanelLeftClose, PanelLeftOpen, Plus, Search, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOperatore } from "@/components/Operatore";
import { toastErrore } from "@/lib/errori";
import { assConfig, assContatori, assElenco, assPerNumero, assSetConfig, type ConfigAssistenza, type SchedaBreve } from "@/lib/assistenza";
import { NuovaScheda } from "./scheda/NuovaScheda";
import { SchedaView } from "./scheda/SchedaView";
import { Badge } from "./scheda/ui";

// Tutte le schede che rispondono a ricerca/filtro, a blocchi da 500 (il massimo del backend), 4 richieste per volta.
async function tutteLeSchede(q: string, stato: string): Promise<{ schede: SchedaBreve[]; totale: number }> {
  const primo = await assElenco(q, stato, "", 500, 0);
  const pagine: number[] = [];
  for (let off = 500; off < primo.totale; off += 500) pagine.push(off);
  const resto: SchedaBreve[][] = [];
  for (let i = 0; i < pagine.length; i += 4) {
    const blocco = await Promise.all(pagine.slice(i, i + 4).map((off) => assElenco(q, stato, "", 500, off).then((r) => r.schede)));
    resto.push(...blocco);
  }
  const visti = new Set<string>();
  const schede = [primo.schede, ...resto].flat().filter((x) => (visti.has(x.id) ? false : (visti.add(x.id), true)));
  return { schede, totale: primo.totale };
}

// ---------------------------------------------------------------------------
export function Banco() {
  const router = useRouter();
  const sp = useSearchParams();
  const [cfg, setCfg] = useState<ConfigAssistenza | null>(null);
  const [operatore, setOperatore] = useOperatore();
  const [q, setQ] = useState("");
  // 04/10/2026: filtro e nuova accettazione apribili da link (riquadri della Panoramica Apple, segnalibri):
  // /assistenza?stato=pronto · /assistenza?nuova=1
  const FILTRI_VALIDI = ["aperte", "da_preventivare", "preventivo_inviato", "accettato", "rifiutato", "pronto", "da_pagare", "in_arrivo", "consegnato", "tutte"];
  const statoLink = sp.get("stato");
  const [filtro, setFiltro] = useState(statoLink && FILTRI_VALIDI.includes(statoLink) ? statoLink : "aperte");
  const [elenco, setElenco] = useState<SchedaBreve[] | null>(null);
  const [totale, setTotale] = useState(0);
  const [contatori, setContatori] = useState<Record<string, number>>({});
  const [salto, setSalto] = useState("");
  const [nuova, setNuova] = useState(false);
  const cerca = useRef<HTMLInputElement>(null);
  const idLink = sp.get("id");
  const [apertaLocale, setAperta] = useState<string | null>(null);
  const aperta = apertaLocale ?? idLink;
  // elenco richiudibile per dare più spazio alla scheda (desktop); su telefono/iPad la scheda prende tutto lo schermo
  const [elencoChiuso, setElencoChiuso] = useState(false);

  useEffect(() => { assConfig().then(setCfg).catch(() => undefined); }, []);
  // 04/10/2026 (Christian): come in FileMaker la ricerca vale su TUTTE le schede (non solo sul filtro scelto)
  // e porta TUTTI i risultati: così si vedono tutte le schede di un cliente, anche le storiche.
  const inRicerca = q.trim().length > 0;
  const carica = useCallback(() => {
    const st = q.trim() ? "tutte" : filtro;
    // con 1-2 lettere si mostrano le prime 500 (il resto con «Mostra tutte»); da 3 lettere tutti i risultati
    const p = q.trim().length >= 3 ? tutteLeSchede(q, st) : assElenco(q, st, "", q.trim() ? 500 : 150);
    p.then((r) => { setElenco(r.schede); setTotale(r.totale); }).catch((e) => { toastErrore(e); setElenco([]); });
    assContatori().then((r) => setContatori(r.contatori)).catch(() => undefined);
  }, [q, filtro]);
  useEffect(() => { const t = setTimeout(carica, 250); return () => clearTimeout(t); }, [carica]);
  useEffect(() => {
    const n = sp.get("n");
    if (n) assPerNumero(n).then((r) => setAperta(r.id)).catch(toastErrore);
    const st = sp.get("stato");
    if (st && FILTRI_VALIDI.includes(st)) { setFiltro(st); setElenco(null); }
    if (sp.get("nuova") === "1") setNuova(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const [altreInCarico, setAltreInCarico] = useState(false);
  async function caricaAltre() {
    if (!elenco || altreInCarico) return;
    setAltreInCarico(true);
    try {
      const r = await tutteLeSchede(q, q.trim() ? "tutte" : filtro);
      setElenco(r.schede); setTotale(r.totale);
    } catch (e) { toastErrore(e); } finally { setAltreInCarico(false); }
  }

  const apri = useCallback((id: string) => { setAperta(id); router.replace(`/assistenza?id=${id}`); window.scrollTo({ top: 0 }); }, [router]);
  const chiudi = useCallback(() => { setAperta(null); router.replace("/assistenza"); }, [router]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const scrivendo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "F2" || (e.altKey && (e.key === "n" || e.key === "N" || e.code === "KeyN"))) { e.preventDefault(); setNuova(true); }
      else if (e.key === "/" && !scrivendo) { e.preventDefault(); cerca.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  async function salta() {
    if (!salto.trim()) return;
    try {
      const r = await assPerNumero(salto.trim());
      if (!r.esatta) toast.info(`La scheda ${salto} non c'è: aperta la più vicina (${r.sigla})`);
      apri(r.id); setSalto("");
    } catch (e) { toastErrore(e); }
  }

  if (cfg && !cfg.visibile) {
    return <div className="p-6 text-muted-foreground">Le schede di assistenza sono in prova: per ora le vede solo il titolare.</div>;
  }

  return (
    <div className="space-y-2 p-0 sm:p-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => setElencoChiuso((x) => !x)} title={elencoChiuso ? "Mostra l'elenco" : "Nascondi l'elenco (più spazio alla scheda)"}>
          {elencoChiuso ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
        <Wrench className="size-5" />
        <h1 className="mr-2 text-xl font-semibold tracking-tight">Schede di assistenza</h1>
        {cfg && !cfg.numerazione_live && (
          <span className="rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            title="FileMaker è ancora in uso: le schede nuove hanno numeri da 900001, le mail vanno solo all'indirizzo di prova e i WhatsApp non partono">
            PROVA · numeri da 900001 · mail solo a {cfg.email_test} · WhatsApp da mandare a mano
          </span>
        )}
        {cfg?.admin && (
          <label className="ml-auto flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={cfg.operatori_abilitati}
              onChange={(e) => assSetConfig({ operatori_abilitati: e.target.checked }).then((c) => { setCfg(c); toast.success(c.operatori_abilitati ? "Ora la vedono anche gli operatori" : "Di nuovo solo per il titolare"); }).catch(toastErrore)} />
            Visibile agli operatori
          </label>
        )}
        <Button className={cfg?.admin ? "" : "ml-auto"} onClick={() => setNuova(true)} title="F2 o Alt+N"><Plus />NUOVA SCHEDA</Button>
      </div>

      <div className={`grid gap-3 ${elencoChiuso ? "" : "lg:grid-cols-[300px_minmax(0,1fr)]"}`}>
        {/* elenco */}
        <div className={`flex max-h-[calc(100vh-7rem)] flex-col gap-2 rounded-xl border bg-card p-2 shadow-sm lg:sticky lg:top-2 ${elencoChiuso ? "hidden" : aperta ? "hidden lg:flex" : ""}`}>
          <div className="flex gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
              <Input ref={cerca} className="h-8 pl-7" placeholder="Cerca: cliente, seriale, «air 2020 logica»…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Input className="h-8 w-24" placeholder="N. scheda" value={salto} onChange={(e) => setSalto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") salta(); }} inputMode="numeric" />
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            {([["aperte", "Aperte"], ["da_preventivare", "Da preventivare"], ["preventivo_inviato", "Prev. inviato"], ["accettato", "In riparazione"],
              ["rifiutato", "Rifiutate"], ["pronto", "Pronte"], ["da_pagare", "Da pagare"], ["in_arrivo", "In arrivo"], ["consegnato", "Consegnate"], ["tutte", "Tutte"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => { setFiltro(k); setElenco(null); }}
                className={`rounded-full border px-2 py-0.5 ${filtro === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {l}{contatori[k] ? ` ${contatori[k]}` : ""}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">{elenco ? `${totale.toLocaleString("it-IT")} schede${inRicerca ? " trovate su tutte le schede" : ""}${totale > elenco.length ? ` (mostrate le ${elenco.length.toLocaleString("it-IT")} più recenti: in fondo «Mostra tutte»)` : ""}` : "…"}</div>
          <div className="-mx-2 flex-1 overflow-y-auto">
            {elenco === null && <div className="p-4 text-center"><Loader2 className="inline size-4 animate-spin" /></div>}
            {elenco?.map((s) => (
              <button key={s.id} onClick={() => apri(s.id)}
                style={{ contentVisibility: "auto", containIntrinsicSize: "auto 46px" }}
                className={`block w-full border-t px-3 py-1.5 text-left text-sm hover:bg-muted/60 ${aperta === s.id ? "bg-primary/10" : ""}`}>
                <div className="flex items-center gap-2">
                  <b className="tabular-nums">{s.sigla}</b>
                  <span className="truncate">{s.azienda || s.nominativo}</span>
                  <span className="ml-auto"><Badge stato={s.stato} /></span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{s.prodotto}{s.difetto ? ` · ${s.difetto}` : ""}</div>
              </button>
            ))}
            {/* 04/10/2026: si aprono le più recenti; «Mostra tutte» porta l'elenco completo (scorrevole) */}
            {elenco && totale > elenco.length && (
              <button disabled={altreInCarico} onClick={caricaAltre}
                className="block w-full border-t px-3 py-2 text-center text-sm text-blue-700 hover:bg-muted/60 disabled:opacity-60 dark:text-blue-300">
                {altreInCarico ? <><Loader2 className="inline size-4 animate-spin" /> carico tutte le {totale.toLocaleString("it-IT")} schede…</> : `Mostra tutte (${totale.toLocaleString("it-IT")})`}
              </button>
            )}
          </div>
        </div>

        {/* scheda */}
        <div className={`min-w-0 ${aperta ? "" : "hidden lg:block"}`}>
          {aperta ? <SchedaView key={aperta} id={aperta} cfg={cfg} operatore={operatore} setOperatore={setOperatore}
            onApri={apri} onCambiata={carica} onChiudi={chiudi} />
            : <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">Scegli una scheda dall&apos;elenco, scrivi il numero, oppure <b>NUOVA SCHEDA</b> (F2).</div>}
        </div>
      </div>
      {nuova && <NuovaScheda cfg={cfg} operatore={operatore} setOperatore={setOperatore} onClose={() => setNuova(false)}
        onCreata={(s) => { setNuova(false); carica(); apri(s.id); }} />}
    </div>
  );
}

