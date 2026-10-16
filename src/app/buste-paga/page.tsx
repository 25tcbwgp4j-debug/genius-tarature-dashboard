"use client";

// BUSTE PAGA (16/10/2026) — prospetto paga mensile del lavoro domestico (CCNL colf, badanti, baby sitter) per i
// datori di lavoro persone fisiche della famiglia. SOLO amministratore: dati personali (la pagina è tra quelle del
// titolare in lib/riservate.ts, il backend risponde 403 a chiunque altro).
// Flusso: datore → lavoratore → mese; foglio presenze precompilato → Calcola → Conferma → PDF → Segna come pagata.

import { Suspense, useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, HandCoins, Loader2, TriangleAlert } from "lucide-react";
import { usePermessi } from "@/components/permessi";
import { RiservatoTitolare } from "@/components/RiservatoTitolare";
import { BarraTitolare } from "@/components/BarraTitolare";
import { bpAvvisi, bpDatori, bpLavoratori, type BpAvviso, type BpDatore, type BpLavoratore } from "@/lib/buste-paga";
import { annoRoma, oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";
import { Contributi } from "./Contributi";
import { Impostazioni } from "./Impostazioni";
import { Lavoratori } from "./Lavoratori";
import { Presenze } from "./Presenze";
import { Storico } from "./Storico";
import { MESI, selCls } from "./util";

type Tab = "presenze" | "lavoratori" | "contributi" | "storico" | "impostazioni";
const TABS: [Tab, string][] = [
  ["presenze", "Presenze e busta"], ["lavoratori", "Lavoratori"], ["contributi", "Contributi INPS"], ["storico", "Storico buste"], ["impostazioni", "Impostazioni"],
];

function Pagina() {
  const { admin, caricato } = usePermessi();
  const [tab, setTab] = useState<Tab>("presenze");
  const [datori, setDatori] = useState<BpDatore[]>([]);
  const [datoreId, setDatoreId] = useState("");
  const [lavoratori, setLavoratori] = useState<BpLavoratore[]>([]);
  const [lavId, setLavId] = useState("");
  const [anno, setAnno] = useState(annoRoma);
  const [mese, setMese] = useState(() => Number(oggiRoma().slice(5, 7)));
  const [avvisi, setAvvisi] = useState<BpAvviso[]>([]);
  const [tariffeDaVerificare, setTariffeDaVerificare] = useState(false);
  const [pronto, setPronto] = useState(false);

  const caricaAvvisi = useCallback(() => {
    bpAvvisi().then((r) => { setAvvisi(r.avvisi); setTariffeDaVerificare(r.tariffe_da_verificare); }).catch(() => undefined);
  }, []);

  const caricaDatori = useCallback((scegli?: string) => {
    bpDatori().then((r) => {
      setDatori(r.datori);
      setDatoreId((id) => scegli || (r.datori.some((d) => d.id === id) ? id : r.datori.find((d) => d.attivo)?.id || r.datori[0]?.id || ""));
    }).catch(toastErrore).finally(() => setPronto(true));
  }, []);

  const caricaLavoratori = useCallback((scegli?: string) => {
    if (!datoreId) return;
    bpLavoratori(datoreId).then((r) => {
      setLavoratori(r.lavoratori);
      setLavId((id) => scegli || (r.lavoratori.some((l) => l.id === id) ? id
        : r.lavoratori.find((l) => l.stato === "attivo")?.id || r.lavoratori[0]?.id || ""));
    }).catch(toastErrore);
  }, [datoreId]);

  useEffect(() => { if (admin) { caricaDatori(); caricaAvvisi(); } }, [admin, caricaDatori, caricaAvvisi]);
  useEffect(() => { caricaLavoratori(); }, [caricaLavoratori]);

  if (caricato && !admin) return <RiservatoTitolare />;
  if (!caricato || !pronto) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const datore = datori.find((d) => d.id === datoreId) || null;
  const lav = lavoratori.find((l) => l.id === lavId) || null;
  const spostaMese = (n: number) => {
    const t = anno * 12 + (mese - 1) + n;
    setAnno(Math.floor(t / 12));
    setMese((t % 12) + 1);
  };
  const nomeLav = (id?: string) => { const l = lavoratori.find((x) => x.id === id); return l ? `${l.cognome} ${l.nome}` : ""; };

  return (
    <div className="space-y-4 p-1 md:p-2">
      {/* 16/10/2026: stessa riga della Fatturazione (società + Buste paga), solo titolare */}
      <BarraTitolare attiva="buste-paga" />
      <div className="flex flex-wrap items-center gap-3">
        <HandCoins className="size-6" />
        <h1 className="text-2xl font-semibold">Buste paga</h1>
        <span className="text-sm text-muted-foreground">Lavoro domestico · CCNL Collaboratori familiari</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select className={selCls} value={datoreId} onChange={(e) => { setDatoreId(e.target.value); setLavId(""); }} aria-label="Datore di lavoro">
            {!datori.length && <option value="">Nessun datore</option>}
            {datori.map((d) => <option key={d.id} value={d.id}>{d.cognome} {d.nome}</option>)}
          </select>
          <select className={selCls} value={lavId} onChange={(e) => setLavId(e.target.value)} aria-label="Lavoratore">
            {!lavoratori.length && <option value="">Nessun lavoratore</option>}
            {lavoratori.map((l) => <option key={l.id} value={l.id}>{l.cognome} {l.nome}{l.stato === "cessato" ? " (cessato)" : ""}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => spostaMese(-1)} aria-label="Mese precedente"><ChevronLeft /></Button>
            <select className={selCls} value={mese} onChange={(e) => setMese(Number(e.target.value))} aria-label="Mese">
              {MESI.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select className={selCls} value={anno} onChange={(e) => setAnno(Number(e.target.value))} aria-label="Anno">
              {Array.from({ length: 6 }, (_, i) => annoRoma() + 1 - i).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <Button size="icon-sm" variant="ghost" onClick={() => spostaMese(1)} aria-label="Mese successivo"><ChevronRight /></Button>
          </div>
        </div>
      </div>

      {(avvisi.length > 0 || tariffeDaVerificare) && (
        <Card className="gap-1.5 border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {avvisi.map((a) => (
            <div key={`${a.tipo}-${a.lavoratore_id}-${a.scadenza}`} className={`flex items-start gap-2 ${a.livello === "alto" ? "font-medium text-red-700 dark:text-red-300" : ""}`}>
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /><span>{a.testo}</span>
            </div>
          ))}
          {tariffeDaVerificare && (
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>Tariffe INPS da verificare con la circolare annuale — <button className="underline" onClick={() => setTab("impostazioni")}>apri Impostazioni</button></span>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-2 border-b">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>
            {l}
          </button>
        ))}
        {lav && <span className="ml-auto self-center pb-1 text-xs text-muted-foreground">{nomeLav(lav.id)} · {lav.mansione || "—"}</span>}
      </div>

      {tab === "presenze" && (lav ? <Presenze key={`${lav.id}-${anno}-${mese}`} lav={lav} anno={anno} mese={mese} />
        : <Card className="p-8 text-center text-muted-foreground">Scegli o crea un lavoratore nella scheda «Lavoratori»</Card>)}
      {tab === "lavoratori" && (
        <Lavoratori datore={datore} lavoratori={lavoratori}
          onCambiato={(id) => { caricaLavoratori(id); caricaAvvisi(); }}
          onDatoreSalvato={(d) => { caricaDatori(d.id); setLavId(""); }} />
      )}
      {tab === "contributi" && lav && <Contributi key={`${lav.id}-${anno}`} lavoratoreId={lav.id} anno={anno} />}
      {tab === "storico" && lav && <Storico key={lav.id} lavoratoreId={lav.id} onApri={(a, m) => { setAnno(a); setMese(m); setTab("presenze"); }} />}
      {tab === "impostazioni" && <Impostazioni onSalvate={caricaAvvisi} />}
    </div>
  );
}

export default function BustePagaPage() {
  return (
    <Suspense fallback={<div className="p-6"><Loader2 className="animate-spin" /></div>}>
      <Pagina />
    </Suspense>
  );
}
