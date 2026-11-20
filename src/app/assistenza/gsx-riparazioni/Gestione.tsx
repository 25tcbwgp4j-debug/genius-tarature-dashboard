"use client";
// 20/11/2026 (G-14): GESTIONE di una riparazione Apple GSX — stato (BEGR/AWTP/AWTR/RFPU), note, tecnico, parti (KGB/KBB,
// DOA/SDOA/GPR/CTS), completamento (SPCM), annullamento (RCNC + verifica dopo qualche minuto, alternativa escalation «RCR»),
// bozze (invio / DELR), storico Apple, resi KBB con scadenza (Italia: gratis entro 20 gg) ed etichetta.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toastErrore } from "@/lib/errori";
import { area, campo, Pill } from "../scheda/ui";
import {
  ripAggiorna, ripAudit, ripDettaglio, ripDocumento, ripInvia, ripResi, ripResiConferma, ripResiGestisci, ripTecnici,
  type Ambiente, type Dettaglio, type Esito, type InfoAmbiente, type Reso, type Tecnico,
} from "@/lib/gsxRip";
import { MessaggiApple, dataOra, euro, tonoStato } from "./comuni";

export function GestioneRiparazione({ rid, amb, info, sid, operatore, onCambiata }: {
  rid: string; amb: Ambiente; info: InfoAmbiente | null; sid?: string; operatore?: string; onCambiata?: () => void;
}) {
  const [d, setD] = useState<Dettaglio | null>(null);
  const [busy, setBusy] = useState("");
  const [nota, setNota] = useState("");
  const [esito, setEsito] = useState<Esito | null>(null);
  const [conferme, setConferme] = useState<Record<string, boolean>>({});
  const [kgb, setKgb] = useState<Record<number, { kgb: string; kbb: string }>>({});
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof ripAudit>>["voci"] | null>(null);
  const [resi, setResi] = useState<Reso[] | null>(null);
  const [tecnici, setTecnici] = useState<Tecnico[]>([]);
  const [bulk, setBulk] = useState("");
  const [sped, setSped] = useState({ carrierCode: "", trackingNumber: "", peso: "", lunghezza: "", larghezza: "", altezza: "" });

  const leggi = useCallback(async () => {
    setBusy("leggi");
    try { setD(await ripDettaglio(rid, amb, sid || "")); } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }, [rid, amb, sid]);
  useEffect(() => { Promise.resolve().then(leggi); ripTecnici(amb).then((t) => setTecnici(t.tecnici)).catch(() => {}); }, [leggi, amb]);
  useEffect(() => {   // NEWO: Apple la rilascia da sola in 30-90 s → ricontrollo
    if (d?.stato !== "NEWO" && d?.stato !== "RCNC") return;
    const t = setTimeout(leggi, d.stato === "NEWO" ? 15000 : 60000);
    return () => clearTimeout(t);
  }, [d, leggi]);

  async function aggiorna(b: { stato?: string; nota?: string; tecnico?: string; parti?: Parameters<typeof ripAggiorna>[0]["parti"]; confermato?: boolean }, cosa: string) {
    setBusy(cosa);
    try {
      const r = await ripAggiorna({ amb, repairId: rid, sid, operatore, ...b, conferme: Object.entries(conferme).filter(([, v]) => v).map(([id]) => ({ id, value: "Y" })) });
      setEsito(r.esito);
      if (r.dettaglio) setD(r.dettaglio);
      if (r.aggiornata) {
        toast.success(r.annullamento_da_verificare ? "Annullamento chiesto: Apple lo elabora in qualche minuto (SCNC = annullata). Ricontrollo da solo." : "Aggiornata su GSX");
        setNota(""); onCambiata?.();
      } else toast.error(r.messaggio);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function inviaBozza() {
    setBusy("invio");
    try {
      const r = await ripInvia({ amb, repairId: rid, sid, operatore, conferme: Object.entries(conferme).filter(([, v]) => v).map(([id]) => ({ id, value: "Y" })) });
      setEsito(r.esito);
      if (r.creata) { toast.success(r.messaggio); onCambiata?.(); await leggi(); } else toast.error(r.messaggio);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function leggiResi() {
    setBusy("resi");
    try { setResi((await ripResi({ amb, repairId: rid })).parti); } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  if (!d) return <div className="p-3 text-sm text-muted-foreground">{busy ? <><Loader2 className="inline size-4 animate-spin" /> Leggo {rid} da Apple…</> : `Riparazione ${rid} non leggibile`}</div>;
  const chiusa = ["SPCM", "SCOM", "SCNC"].includes(d.stato) || !!d.chiusa;
  const serializzate = d.parti.filter((p) => p.serializzato);
  return (
    <div className="space-y-3 text-sm" data-testid="gsx-gestione">
      <div className="flex flex-wrap items-center gap-2">
        <b className="font-mono text-base">{d.id}</b>
        <Pill tono={tonoStato(d.stato)}>{d.stato}</Pill><span>{d.stato_descrizione}</span>
        {d.nota_stato && <span className="text-xs text-muted-foreground">({d.nota_stato})</span>}
        <Button size="sm" variant="ghost" className="ml-auto" disabled={!!busy} onClick={leggi}>{busy === "leggi" ? <Loader2 className="animate-spin" /> : <RefreshCw />}Aggiorna</Button>
      </div>
      {d.blocco_credito && <div className="rounded-lg border-2 border-red-500 bg-red-50 px-3 py-2 font-semibold text-red-900 dark:bg-red-950/40 dark:text-red-100">⚠️ BLOCCO CREDITO Apple (POCR): ferma finché i crediti Apple non la sbloccano; ogni aggiornamento è rifiutato.</div>}
      {d.stato === "RCNC" && <div className="rounded-lg border-2 border-amber-500 bg-amber-50 px-3 py-2 dark:bg-amber-950/30">Annullamento chiesto: Apple lo sta elaborando. Se torna allo stato di prima, l&apos;annullamento è fallito → escalation GSXHELP «Cancellation Request» (sezione Escalation).</div>}
      <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
        <div>Dispositivo: <b>{d.dispositivo.nome}</b> · {d.dispositivo.seriale}{d.dispositivo.imei ? ` · IMEI ${d.dispositivo.imei}` : ""}</div>
        <div>Tipo: {d.tipo} {d.tipo_descrizione} · PO {d.po || "—"}</div>
        <div>Copertura: {d.copertura || "—"} {d.copertura_opzione ? `· ${d.copertura_opzione}` : ""}</div>
        <div>Tecnico: {d.tecnico || "—"} ({d.tecnico_id || "—"}) · notifica {d.notifica || "—"}</div>
        <div>Creata: {dataOra(d.creata)} · ricevuta {dataOra(d.ricevuta_il)}</div>
        <div>Totale Apple: <b>{euro(d.totale)}</b> · cliente {d.cliente}</div>
      </div>
      {d.messaggi.length > 0 && <div className="space-y-1">{d.messaggi.map((m, i) => <div key={i} className={cn("rounded-md border px-2 py-1 text-xs", m.livello === "ERROR" ? "border-red-400 bg-red-50 dark:bg-red-950/30" : "bg-muted/40")}>{m.livello} {m.codice}: {m.testo}</div>)}</div>}
      <MessaggiApple esito={esito} conferme={conferme} onConferma={(id, v) => setConferme((c) => ({ ...c, [id]: v }))} />

      {d.bozza ? (
        <div className="flex flex-wrap gap-2 rounded-lg border-2 border-dashed p-2">
          <span className="w-full text-xs">Bozza «Salvata per dopo»: controllabile anche in GSX web.</span>
          <Button size="sm" disabled={!!busy} onClick={inviaBozza}>{busy === "invio" ? <Loader2 className="animate-spin" /> : <Send />}Invia ad Apple</Button>
          <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => window.confirm(`Eliminare la bozza ${rid}?`) && aggiorna({ stato: "DELR", confermato: true }, "delr")}><Trash2 />Annulla bozza (DELR)</Button>
        </div>
      ) : !chiusa && (
        <div className="space-y-2 rounded-lg border p-2">
          <div className="flex flex-wrap gap-1.5">
            {["BEGR", "AWTP", "AWTR", "RFPU"].map((s) => (
              <Button key={s} size="sm" variant={s === "RFPU" ? "default" : "outline"} disabled={!!busy || d.stato === s || d.nuova} onClick={() => aggiorna({ stato: s, nota: nota || undefined }, s)}>
                {busy === s && <Loader2 className="animate-spin" />}{info?.stati?.[s] || s}</Button>))}
            <Button size="sm" variant="destructive" disabled={!!busy || d.nuova} onClick={() => window.confirm(`Chiedere ad Apple l'ANNULLAMENTO di ${rid} (RCNC)? Vale solo se nessuna parte KBB/KGB è partita.`) && aggiorna({ stato: "RCNC", nota: nota || undefined, confermato: true }, "rcnc")}>Annulla riparazione (RCNC)</Button>
          </div>
          <textarea className={area} rows={2} placeholder="Nota del tecnico (si aggiunge con lo stato, o da sola)" value={nota} onChange={(e) => setNota(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={!!busy || !nota.trim()} onClick={() => aggiorna({ nota }, "nota")}>Aggiungi nota</Button>
            <select className={cn(campo, "w-64")} value="" onChange={(e) => e.target.value && aggiorna({ tecnico: e.target.value }, "tecnico")}>
              <option value="">Cambia tecnico GSX…</option>{tecnici.map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.id})</option>)}
            </select>
            {d.nuova && <span className="text-xs text-amber-700"><Loader2 className="inline size-3 animate-spin" /> NEWO: Apple la rilascia in 30-90 s, poi si aggiorna.</span>}
          </div>
        </div>)}

      <div className="rounded-lg border p-2">
        <div className="mb-1 font-semibold">Parti</div>
        {d.parti.map((p) => (
          <div key={p.sequenza} className="mb-1 flex flex-wrap items-center gap-2 border-b pb-1 last:border-0">
            <Pill>#{p.sequenza}</Pill><b className="font-mono">{p.codice}</b><span className="min-w-0 flex-1">{p.descrizione}</span>
            <Pill tono={p.a_pagamento ? "ambra" : "verde"}>{p.a_pagamento ? `a pagamento ${euro(p.prezzo)}` : "coperta"}</Pill>
            <span className="text-xs">{p.stato_ordine || ""}{p.tracking ? ` · ${p.tracking}` : ""}{p.reso ? ` · reso: ${p.reso}` : ""}{p.kgb ? ` · KGB ${p.kgb}` : ""}{p.kbb ? ` · KBB ${p.kbb}` : ""}</span>
            {!chiusa && !d.bozza && (
              <select className={cn(campo, "h-7 w-44 text-xs")} value="" onChange={(e) => {
                const c = e.target.value; if (!c) return;
                if (c === "GPR") { const m = window.prompt("GPR: motivo (PNN parte non necessaria, CRO cliente rifiuta, WRP parte sbagliata, CNC annullo, DUP doppia)", "PNN"); const t = window.prompt("Tipo: UOP scatola chiusa, DIA parte diagnostica", "UOP"); if (!m || !t) return;
                  aggiorna({ parti: [{ number: p.codice, sequenceNumber: p.sequenza, returnStatusCode: "GPR", returnStatusReasonCode: m.toUpperCase(), returnStatusSubtypeCode: t.toUpperCase() }] }, "parte"); return; }
                if (c === "DOA" || c === "SDOA") { if (!window.confirm(`Segnare la parte ${p.codice} come ${c}? Si aggiunge una parte nuova al suo posto.`)) return;
                  aggiorna({ parti: [{ number: p.codice, sequenceNumber: p.sequenza, returnStatusCode: c }, { number: p.codice, relatedSequenceNumber: p.sequenza }] }, "parte"); return; }
                aggiorna({ parti: [{ number: p.codice, sequenceNumber: p.sequenza, returnStatusCode: c }] }, "parte");
              }}>
                <option value="">Reso della parte…</option>{Object.entries(info?.resi_parte || {}).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>)}
          </div>))}
        {!chiusa && !d.bozza && (
          <div className="mt-2 rounded-md bg-muted/40 p-2">
            <div className="mb-1 text-xs font-semibold">Completa la riparazione (SPCM){serializzate.length ? " — seriali KGB (montata) e KBB (tolta) delle parti serializzate" : ""}</div>
            {serializzate.map((p) => (
              <div key={p.sequenza} className="mb-1 grid gap-1 sm:grid-cols-[1fr_1fr_1fr]">
                <span className="text-xs">#{p.sequenza} {p.codice}</span>
                <input className={cn(campo, "h-8")} placeholder="KGB (nuova)" value={kgb[p.sequenza]?.kgb || p.kgb || ""} onChange={(e) => setKgb({ ...kgb, [p.sequenza]: { kgb: e.target.value.toUpperCase(), kbb: kgb[p.sequenza]?.kbb || "" } })} />
                <input className={cn(campo, "h-8")} placeholder="KBB (guasta)" value={kgb[p.sequenza]?.kbb || p.kbb || ""} onChange={(e) => setKgb({ ...kgb, [p.sequenza]: { kbb: e.target.value.toUpperCase(), kgb: kgb[p.sequenza]?.kgb || "" } })} />
              </div>))}
            <Button size="sm" disabled={!!busy || d.nuova} onClick={() => window.confirm("Contrassegnare come COMPLETATA in GSX? Prima: diagnostica dopo la riparazione e (iPhone) configurazione di sistema; dopo non si modifica più nulla.")
              && aggiorna({ stato: "SPCM", parti: serializzate.filter((p) => kgb[p.sequenza]?.kgb || kgb[p.sequenza]?.kbb).map((p) => ({ number: p.codice, sequenceNumber: p.sequenza, kgb: kgb[p.sequenza]?.kgb || undefined, kbb: kgb[p.sequenza]?.kbb || undefined })) }, "spcm")}>
              {busy === "spcm" && <Loader2 className="animate-spin" />}Contrassegna come completata</Button>
          </div>)}
      </div>

      <div className="rounded-lg border p-2">
        <div className="mb-1 flex flex-wrap items-center gap-2 font-semibold">Resi ad Apple (KBB/DOA/GPR)
          <Button size="sm" variant="outline" disabled={!!busy} onClick={leggiResi}>{busy === "resi" && <Loader2 className="animate-spin" />}Leggi i resi</Button>
          <span className="text-xs font-normal text-muted-foreground">Italia: gratis entro 20 giorni dalla spedizione della parte nuova; solo UPS, ogni parte nella sua confezione.</span></div>
        {resi && !resi.length && <div className="text-xs">Nessuna parte da rendere per questa riparazione (o non ancora raggiungibile).</div>}
        {resi?.map((x) => (
          <div key={`${x.repairId}${x.sequenza}`} className="mb-1 flex flex-wrap items-center gap-2 border-b pb-1 text-xs">
            <b className="font-mono">{x.parte}</b> {x.descrizione} · {x.motivo} · stato {x.stato || "—"} · ordine reso {x.ordine_reso || "—"}
            <Pill tono={x.livello === "scaduto" ? "rosso" : x.livello === "urgente" ? "ambra" : "verde"}>{x.scade_il ? `scade ${x.scade_il.split("-").reverse().join("/")} (${x.giorni_rimasti} gg)` : "scadenza ?"}</Pill>
            <Button size="sm" variant="outline" onClick={() => ripDocumento(amb, "returnLabel", [{ repairId: x.repairId, returnType: x.tipo_reso || "CI_ON_REPAIR_RETURN_KBB", sequenceNumber: String(x.sequenza), ...(x.ordine_reso ? { returnOrderNumber: x.ordine_reso } : {}) }]).catch(toastErrore)}><Tag />Etichetta</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => {
              try { const r = await ripResiGestisci({ amb, bulkReturn: bulk || undefined, parti: [{ action: "CREATE", repairId: x.repairId, sequenceNumber: x.sequenza, returnOrderNumber: x.ordine_reso || undefined, partNumber: x.parte }], sid });
                if (r.bulkReturn) setBulk(r.bulkReturn); toast.success(`Parte nel reso ${r.bulkReturn || bulk}`); } catch (e) { toastErrore(e); } }}>Metti nel reso</Button>
          </div>))}
        {bulk && (
          <div className="mt-2 grid gap-1 sm:grid-cols-4">
            <span className="sm:col-span-4 text-xs font-semibold">Reso {bulk}: conferma la spedizione UPS</span>
            <input className={cn(campo, "h-8")} placeholder="Codice corriere GSX" value={sped.carrierCode} onChange={(e) => setSped({ ...sped, carrierCode: e.target.value })} />
            <input className={cn(campo, "h-8")} placeholder="Tracking" value={sped.trackingNumber} onChange={(e) => setSped({ ...sped, trackingNumber: e.target.value })} />
            <input className={cn(campo, "h-8")} placeholder="Peso (es. 1 kg)" value={sped.peso} onChange={(e) => setSped({ ...sped, peso: e.target.value })} />
            <input className={cn(campo, "h-8")} placeholder="L×L×A cm (30x20x10)" value={sped.lunghezza} onChange={(e) => setSped({ ...sped, lunghezza: e.target.value })} />
            <div className="flex gap-1 sm:col-span-4">
              <Button size="sm" disabled={!!busy || !sped.carrierCode || !sped.trackingNumber} onClick={async () => {
                const [l, w, h] = sped.lunghezza.split(/x|×/i).map((v) => v.trim());
                try { const r = await ripResiConferma({ amb, bulkReturn: bulk, spedizione: { carrierCode: sped.carrierCode, trackingNumber: sped.trackingNumber,
                  packageMeasurements: { weight: sped.peso || "1 kg", length: l || "30", width: w || "20", height: h || "10" } } }); toast.success(`Spedizione confermata${r.tracking_url ? ` · ${r.tracking_url}` : ""}`); } catch (e) { toastErrore(e); } }}>Conferma spedizione</Button>
              <Button size="sm" variant="outline" onClick={() => ripDocumento(amb, "returnsPackingList", [{ bulkReturnId: bulk }]).catch(toastErrore)}>Packing list</Button>
            </div>
          </div>)}
      </div>

      <div className="rounded-lg border p-2">
        <div className="mb-1 flex items-center gap-2 font-semibold">Note e storico Apple
          <Button size="sm" variant="outline" onClick={async () => { try { setAudit((await ripAudit(rid, amb)).voci); } catch (e) { toastErrore(e); } }}>Storico GSX</Button></div>
        {d.note.map((n, i) => <div key={i} className="text-xs"><Pill>{n.tipo}</Pill> {n.testo} <span className="text-muted-foreground">· {n.da} {dataOra(n.il)}</span></div>)}
        {audit && <div className="mt-1 max-h-48 overflow-auto text-xs">{audit.map((v, i) => <div key={i}>{dataOra(v.il)} · {v.da} · {v.azione} {v.cosa} {v.prima ? `${v.prima} → ` : ""}{v.dopo}</div>)}</div>}
      </div>
    </div>);
}
