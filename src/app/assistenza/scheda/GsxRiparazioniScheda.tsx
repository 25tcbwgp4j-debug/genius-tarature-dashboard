"use client";
// 20/11/2026 (G-14, Christian): nella scheda «Apri riparazione Apple» per qualsiasi dispositivo + scorciatoie Batteria/Display
// iPhone + le riparazioni GSX aperte dal gestionale per questa scheda (numero G, stato, ambiente, tecnico) con la gestione.
import { useCallback, useEffect, useState } from "react";
import { Apple } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { ripScheda, ripScorciatoie, ripStorico, type RigaRiparazione, type Scorciatoia } from "@/lib/gsxRip";
import { Modale, Pill, Sezione } from "./ui";
import { Procedura } from "../gsx-riparazioni/Procedura";
import { GestioneRiparazione } from "../gsx-riparazioni/Gestione";
import { SelettoreAmbiente, dataOra, tonoStato, useAmbiente } from "../gsx-riparazioni/comuni";

export function GsxRiparazioniScheda({ sid, seriale, famiglia, descrizione, ro, operatore, onCambiata }: { sid: string; seriale?: string | null; famiglia?: string | null; descrizione?: string | null; ro: boolean; operatore?: string; onCambiata?: () => void }) {
  const [amb, setAmb, info] = useAmbiente();
  const [righe, setRighe] = useState<RigaRiparazione[]>([]);
  const [apri, setApri] = useState<string | null>(null);   // "" = procedura libera, oppure scorciatoia
  const [gestisci, setGestisci] = useState<RigaRiparazione | null>(null);
  const [storico, setStorico] = useState<Awaited<ReturnType<typeof ripStorico>>["azioni"] | null>(null);
  const carica = useCallback(() => { ripScheda(sid).then((d) => setRighe(d.riparazioni)).catch(() => {}); }, [sid]);
  useEffect(() => { carica(); }, [carica]);
  // 23/11/2026 (Christian, 63500): tutti i tipi di riparazione della famiglia (iPad: programma batteria, display, scocca, garanzia…)
  const [rapide, setRapide] = useState<Scorciatoia[]>([]);
  useEffect(() => { ripScorciatoie(famiglia || "", descrizione || "").then((x) => setRapide(x.gruppo ? x.scorciatoie : [])).catch(() => {}); }, [famiglia, descrizione]);
  return (
    <Sezione titolo="Riparazioni Apple (GSX)" icona={<Apple />} sottotitolo={righe.length ? `${righe.length} dal gestionale` : undefined}
      azioni={<SelettoreAmbiente amb={amb} onChange={setAmb} info={info} compatto />}>
      {!ro && (
        <div className="flex flex-wrap gap-2" data-testid="gsx-apri">
          <Button size="sm" onClick={() => setApri("")}><Apple />Apri riparazione Apple</Button>
          {rapide.map((r) => <Button key={r.chiave} size="sm" variant="outline" onClick={() => setApri(r.chiave)} title="Precompila difetto, ricambio e prezzo con i codici letti da Apple">{r.titolo}</Button>)}
          {rapide.length === 0 && <span className="self-center text-xs text-muted-foreground">«Apri riparazione Apple» = procedura completa: qualsiasi componente, difetto, ricambio, tipo e copertura.</span>}
          <a className="ml-auto self-center text-xs underline" href="/assistenza/gsx-riparazioni">Resi, escalation, ricerca →</a>
        </div>)}
      {righe.length > 0 && (
        <div className="mt-2 space-y-1">
          {righe.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 text-sm">
              <b className="font-mono">{r.repair_id}</b>
              <Pill tono={r.ambiente === "uat" ? "blu" : "rosso"}>{r.ambiente === "uat" ? "PROVA" : "PRODUZIONE"}</Pill>
              <Pill tono={tonoStato(r.stato)}>{r.stato}</Pill><span className="min-w-0 flex-1 truncate">{r.stato_descrizione}{r.tecnico_nome ? ` · ${r.tecnico_nome}` : ""}</span>
              <span className="text-xs text-muted-foreground">{dataOra(r.created_at)}</span>
              <Button size="sm" variant="outline" onClick={() => setGestisci(r)}>Gestisci</Button>
            </div>))}
          <button className="text-xs underline" onClick={() => ripStorico(sid).then((x) => setStorico(x.azioni)).catch(toastErrore)}>Storico azioni GSX</button>
          {storico && <div className="max-h-40 overflow-auto text-xs">{storico.map((a) => <div key={a.id}>{dataOra(a.created_at)} · {a.ambiente} · {a.repair_id || ""} · {a.azione} → {a.esito} · {a.operatore || a.utente}</div>)}</div>}
        </div>)}
      {apri !== null && (
        <Modale largo titolo={<span className="flex flex-wrap items-center gap-2">Apri riparazione Apple <SelettoreAmbiente amb={amb} onChange={setAmb} info={info} compatto /></span>} onClose={() => { setApri(null); carica(); }}>
          <Procedura key={`${amb}-${apri}`} amb={amb} info={info} sid={sid} serialeIniziale={seriale || ""} operatore={operatore} scorciatoia={apri || undefined} famiglia={famiglia}
            onChiudi={() => { setApri(null); carica(); }} onFatto={() => { carica(); onCambiata?.(); }} />
        </Modale>)}
      {gestisci && (
        <Modale largo titolo={`Riparazione ${gestisci.repair_id} (${gestisci.ambiente === "uat" ? "PROVA Apple" : "PRODUZIONE"})`} onClose={() => { setGestisci(null); carica(); }}>
          <GestioneRiparazione rid={gestisci.repair_id} amb={gestisci.ambiente} info={info} sid={sid} operatore={operatore} onCambiata={() => { carica(); onCambiata?.(); }} />
        </Modale>)}
    </Sezione>);
}
