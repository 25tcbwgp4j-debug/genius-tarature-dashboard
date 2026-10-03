"use client";

// BONIFICO al banco (01/10/2026, rifatto il 02/10/2026 su richiesta di Christian): si usa in cassa (scontrino) e nella
// fattura. Due modi:
// (a) «Cerca il bonifico»: i bonifici arrivati sul conto SumUp ancora da gestire (quelli del pulsante rosso), i più simili
//     per importo e nome prima, dal giorno scelto (di default 30 giorni fa). Scelto ed emesso il documento, il bonifico
//     risulta abbinato e sparisce dal pulsante rosso. Se il conto è collegato in diretta (Open Banking) si legge anche lì.
// (b) «Già ricevuto: inserisco io i dati»: data del bonifico (obbligatoria), ordinante e causale/CRO (facoltativi).
//     Il documento parte con modalità bonifico; il bonifico resta «da riscontrare» finché il controllo orario non trova
//     il movimento (abbinamento automatico). Consentito anche agli operatori: resta scritto chi l'ha dichiarato.

import { useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2, PenLine, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOperatore } from "@/components/Operatore";
import { ControllaSumUp } from "@/components/ControllaSumUp";
import { fetchAPI } from "@/lib/api";
import type { BonRichiesta } from "@/lib/bonifici";
import { toastErrore } from "@/lib/errori";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const oggiIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const giorniFa = (n: number) => new Date(Date.now() - n * 86400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
function quando(s: string) {
  if (!s) return "";
  if (s.length <= 10) return new Date(s + "T12:00:00").toLocaleDateString("it-IT");
  return new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface BonificoArrivato {
  id: string; codice: string; data: string; data_valuta: string | null; importo: number; ordinante: string | null;
  causale: string | null; iban: string | null; stesso_importo: boolean; nome_corrisponde: boolean; differenza: number;
}
/** Quello che il chiamante ha emesso: id e descrizione del documento (per l'abbinamento). null/undefined = non emesso. */
export type EsitoDocumento = { id?: string | null; descrizione?: string } | null | undefined | void;
/** Dati del bonifico scelto/dichiarato, per abbinarlo DOPO l'emissione del documento (componente Incassa, 03/10/2026). */
export type InfoBonifico = { data: string; bonificoId?: string; dichiarato?: boolean; ordinante?: string; causale?: string };

/** Abbina al documento appena emesso il bonifico scelto (o dichiarato) con VerificaBonifico in modalità «differito». */
export async function abbinaBonifico(info: InfoBonifico, opz: { importo: number; documentoTipo: string; documentoId?: string | null; descrizione?: string; operatore?: string | null }) {
  const body: Record<string, unknown> = { importo: opz.importo, documento_tipo: opz.documentoTipo, documento_id: opz.documentoId || null,
    descrizione: opz.descrizione || opz.documentoTipo, operatore: opz.operatore || undefined };
  if (info.bonificoId) body.bonifico_id = info.bonificoId;
  else body.dichiarato = { data: info.data, ordinante: info.ordinante || "", causale: info.causale || "" };
  try {
    await fetchAPI("/api/bonifici/al-banco/usa", { method: "POST", body: JSON.stringify(body) });
    window.dispatchEvent(new Event("bonifici:aggiorna"));
  } catch (e) {
    toast.warning(`Documento emesso, ma il bonifico non è stato registrato: ${(e as Error).message}`, { duration: 15000 });
  }
}

export function VerificaBonifico({ importo, testo: testoIniziale = "", etichettaConferma, disabled, onConfermato, size = "sm", className = "",
  documentoTipo = "documento", descrizione = "", differito = false, etichetta = "Bonifico" }: {
  /** true = il documento si emette DOPO (pagamento misto): qui si sceglie solo il bonifico, l'abbinamento lo fa chi chiama con abbinaBonifico */
  differito?: boolean;
  /** testo del pulsante */
  etichetta?: string;
  importo: number;
  /** nome del cliente / causale attesa: serve a riconoscere il bonifico giusto */
  testo?: string;
  /** es. «Emetti scontrino» / «Segna pagata» */
  etichettaConferma: string;
  disabled?: boolean;
  /** riferimento da salvare, se è stato forzato (sempre false: c'è la dichiarazione) e la data del bonifico (data di incasso) */
  onConfermato: (riferimento: string, forzato: boolean, info: InfoBonifico) => Promise<EsitoDocumento> | EsitoDocumento;
  size?: "sm" | "default";
  className?: string;
  /** scontrino · fattura · ordine: dove finisce il bonifico */
  documentoTipo?: string;
  /** descrizione del documento per il registro (es. «Fattura 789 — Rossi») */
  descrizione?: string;
}) {
  const [operatore] = useOperatore();
  const [aperto, setAperto] = useState(false);
  const [modo, setModo] = useState<"cerca" | "dichiara">("cerca");
  const [testo, setTesto] = useState(testoIniziale);
  const [dal, setDal] = useState(giorniFa(30));
  const [busy, setBusy] = useState(false);
  const [lista, setLista] = useState<BonificoArrivato[] | null>(null);
  const [ultimo, setUltimo] = useState<string>("");
  const [aperta, setAperta] = useState<BonRichiesta | null>(null);
  const [scelto, setScelto] = useState<string>("");
  const [dich, setDich] = useState({ data: oggiIso(), ordinante: testoIniziale, causale: "" });

  async function cerca(t = testo, d = dal) {
    setBusy(true);
    try {
      const r = await fetchAPI("/api/bonifici/al-banco/cerca", { method: "POST", body: JSON.stringify({ importo, testo: t.trim(), dal: d || undefined }) });
      setLista(r.bonifici);
      setAperta(r.richiesta_aperta || null);
      const u = r.ultimo_controllo;
      setUltimo(u ? `Ultimo controllo del conto: ${quando(u.eseguito_il)}${u.esito !== "ok" ? ` (${u.esito})` : ""}` : "");
      const primo = (r.bonifici as BonificoArrivato[]).find((b) => b.stesso_importo);
      setScelto(primo ? primo.id : "");
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  function apri() {
    setTesto(testoIniziale); setLista(null); setScelto(""); setModo("cerca");
    const d = giorniFa(30); setDal(d);
    setDich({ data: oggiIso(), ordinante: testoIniziale, causale: "" });
    setAperto(true);
    cerca(testoIniziale, d);
  }

  async function registra(body: Record<string, unknown>) {
    try {
      await fetchAPI("/api/bonifici/al-banco/usa", { method: "POST", body: JSON.stringify({ importo, documento_tipo: documentoTipo, operatore: operatore || undefined, ...body }) });
      window.dispatchEvent(new Event("bonifici:aggiorna"));
    } catch (e) {
      // il documento è già emesso: si avvisa ma non si blocca
      toast.warning(`Documento emesso, ma il bonifico non è stato registrato: ${(e as Error).message}`, { duration: 15000 });
    }
  }

  async function confermaScelto() {
    const b = lista?.find((x) => x.id === scelto);
    if (!b) return;
    if (!b.stesso_importo && !confirm(`Il bonifico è di ${eur(b.importo)}, il documento di ${eur(importo)}. Procedere comunque?`)) return;
    const giorno = (b.data_valuta || b.data).slice(0, 10);
    const rif = `Bonifico ${b.ordinante || ""} del ${quando(giorno)} (SumUp ${b.codice.split(":").pop()})`.replace(/\s+/g, " ").trim();
    setBusy(true);
    try {
      const doc = await onConfermato(rif.slice(0, 200), false, { data: giorno, bonificoId: b.id, ordinante: b.ordinante || "", causale: b.causale || "" });
      if (differito) { setAperto(false); return; }
      if (doc) {
        await registra({ bonifico_id: b.id, documento_id: doc.id || null, descrizione: doc.descrizione || descrizione || documentoTipo });
        setAperto(false);
      }
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  async function confermaDichiarato() {
    if (!dich.data) { toast.error("Indica la data del bonifico"); return; }
    if (dich.data > oggiIso()) { toast.error("La data del bonifico non può essere futura"); return; }
    const rif = [`Bonifico del ${quando(dich.data)}`, dich.ordinante.trim() && `da ${dich.ordinante.trim()}`, dich.causale.trim() && `rif. ${dich.causale.trim()}`,
      "(dichiarato, da riscontrare)"].filter(Boolean).join(" ");
    setBusy(true);
    try {
      const doc = await onConfermato(rif.slice(0, 200), false, { data: dich.data, dichiarato: true, ordinante: dich.ordinante.trim(), causale: dich.causale.trim() });
      if (differito) { setAperto(false); return; }
      if (doc) {
        await registra({ dichiarato: { data: dich.data, ordinante: dich.ordinante.trim(), causale: dich.causale.trim() },
                         documento_id: doc.id || null, descrizione: doc.descrizione || descrizione || documentoTipo });
        toast.info("Bonifico dichiarato: verrà riscontrato da solo quando arriva sul conto SumUp");
        setAperto(false);
      }
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  const stessi = (lista || []).filter((b) => b.stesso_importo).length;

  return (
    <>
      <Button size={size} variant="outline" className={className} disabled={disabled || !(importo > 0)} onClick={apri}>
        <Landmark /> {etichetta}
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => { if (!busy) setAperto(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bonifico · {eur(importo)}</DialogTitle>
            <DialogDescription>Scegli il bonifico arrivato sul conto SumUp di GENIUS LAB, oppure inserisci i dati di un bonifico già ricevuto.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
            <button type="button" onClick={() => setModo("cerca")} className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 ${modo === "cerca" ? "bg-background font-medium shadow" : ""}`}>
              <Search className="size-4" /> Cerca il bonifico</button>
            <button type="button" onClick={() => setModo("dichiara")} className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 ${modo === "dichiara" ? "bg-background font-medium shadow" : ""}`}>
              <PenLine className="size-4" /> Già ricevuto: inserisco io</button>
          </div>

          {modo === "cerca" ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input className="h-8" placeholder="Nome di chi paga o causale (aiuta a riconoscerlo)" value={testo}
                  onChange={(e) => setTesto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") cerca(); }} />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => cerca()}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}</Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">Arrivato dopo il
                <input type="date" className="h-7 rounded-md border border-input bg-background px-1 text-xs" value={dal} max={oggiIso()}
                  onChange={(e) => { setDal(e.target.value); cerca(testo, e.target.value); }} /></label>
              {lista && (
                <div className="max-h-72 divide-y overflow-y-auto rounded border bg-background">
                  {!lista.length && <div className="p-3 text-xs text-muted-foreground">Nessun bonifico da abbinare in questo periodo. Se il cliente l&apos;ha già fatto, usa «Già ricevuto: inserisco io».</div>}
                  {lista.map((b) => (
                    <label key={b.id} className={`flex cursor-pointer items-start gap-2 p-2 text-xs ${scelto === b.id ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                      <input type="radio" className="mt-0.5" name="bonifico" checked={scelto === b.id} onChange={() => setScelto(b.id)} />
                      <span className="flex-1">
                        <span className="font-semibold tabular-nums">{eur(b.importo)}</span> · <span className="font-medium">{b.ordinante || "ordinante non indicato"}</span> · {quando(b.data)}
                        {b.stesso_importo && <span className="ml-1 rounded bg-emerald-600 px-1 text-[10px] text-white">stesso importo</span>}
                        {b.nome_corrisponde && <span className="ml-1 rounded bg-sky-600 px-1 text-[10px] text-white">nome giusto</span>}
                        {b.causale && <div className="text-muted-foreground">{b.causale}</div>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <ControllaSumUp origine={documentoTipo === "scontrino" ? "cassa" : documentoTipo} aperta={aperta} onFinito={() => cerca()} />
              <div className="text-[11px] text-muted-foreground">{ultimo}{lista && !stessi && lista.length ? " · nessuno con lo stesso importo" : ""}</div>
              <Button className="w-full" disabled={busy || !scelto} onClick={confermaScelto}>{etichettaConferma} con questo bonifico</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs">Data del bonifico *
                <input type="date" className="mt-0.5 block h-8 w-full rounded-md border border-input bg-background px-2 text-sm" value={dich.data} max={oggiIso()}
                  onChange={(e) => setDich((d) => ({ ...d, data: e.target.value }))} /></label>
              <label className="block text-xs">Ordinante (chi l&apos;ha fatto)
                <Input className="mt-0.5 h-8" value={dich.ordinante} onChange={(e) => setDich((d) => ({ ...d, ordinante: e.target.value }))} /></label>
              <label className="block text-xs">Causale o CRO / riferimento
                <Input className="mt-0.5 h-8" value={dich.causale} onChange={(e) => setDich((d) => ({ ...d, causale: e.target.value }))} /></label>
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:bg-amber-950/30">
                Il documento si emette con modalità <b>bonifico</b> e data di incasso <b>{quando(dich.data)}</b>. Resta «da riscontrare»:
                quando il bonifico compare sul conto SumUp viene abbinato da solo. Resta scritto chi l&apos;ha dichiarato{operatore ? ` (${operatore})` : ""}.
              </div>
              <Button className="w-full" disabled={busy || !dich.data} onClick={confermaDichiarato}>
                {busy ? <Loader2 className="animate-spin" /> : null}{etichettaConferma} (bonifico già ricevuto)</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
