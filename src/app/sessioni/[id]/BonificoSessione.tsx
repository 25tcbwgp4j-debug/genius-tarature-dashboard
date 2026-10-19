"use client";

// Pulsante verde «BONIFICO» della sessione (19/10/2026, Christian: «deve funzionare bene»).
// Prima segnava SUBITO la sessione pagata senza guardare il conto. Ora:
// 1. cerca il bonifico tra quelli ARRIVATI sul conto SumUp (letti dall'iMac del negozio) con lo stesso importo di quanto
//    resta da incassare; cliente, numero di sessione, pro forma o fattura nella causale lo rendono «chiaro»;
// 2. trovato → mostra data, ordinante, causale, importo; «Conferma» lo abbina (fattura quietanzata o sessione pagata) e
//    il bonifico sparisce dal pulsante rosso;
// 3. non trovato → chiede subito una lettura all'iMac e offre «Aspetta e ricontrolla» oppure «Segna comunque pagato
//    (bonifico dichiarato)»: resta «da riscontrare» e si abbina da solo quando arriva sul conto.
// Pulsanti alti ≥ 44 px per iPad e iPhone.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Euro, Landmark, Loader2, PenLine, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchAPI, type ApiError } from "@/lib/api";
import { bonRichiesta, type BonRichiesta } from "@/lib/bonifici";
import { toastErrore } from "@/lib/errori";

const eur = (v: number | string | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));
const oggiIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const giorno = (s: string | null | undefined) => (s ? new Date(s.length <= 10 ? `${s}T12:00:00` : s).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "—");
const ora = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }) : "mai");
const APERTA = ["in_attesa", "in_corso"];

interface Candidato {
  id: string; codice: string; data: string; data_valuta: string | null; importo: number | string; ordinante: string | null;
  causale: string | null; motivi: string[]; avviso: string | null;
}
interface Dichiarato { id: string; data_bonifico: string; importo: number | string; ordinante: string | null; dichiarato_da: string | null; operatore: string | null; stato: string }
interface Ricerca {
  esito: "trovato" | "piu_candidati" | "non_trovato" | "gia_pagata";
  candidati: Candidato[];
  consigliato: string | null;
  documento: { numero: string; cliente: string; importo: number; pf: { sigla: string } | null; fattura: { numero: string | null } | null };
  ultima_lettura: string | null;
  ultima_lettura_esito: string | null;
  richiesta_aperta: BonRichiesta | null;
  dichiarato: Dichiarato | null;
}

export function BonificoSessione({ sessionId, operatore, disabled, className = "", onFatto }: {
  sessionId: string;
  /** CHR / DUMY scelto in alto nella pagina sessione */
  operatore: string;
  disabled?: boolean;
  className?: string;
  onFatto?: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [r, setR] = useState<Ricerca | null>(null);
  const [cerca, setCerca] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scelto, setScelto] = useState("");
  const [nessuno, setNessuno] = useState(false);          // «non è nessuno di questi»
  const [ric, setRic] = useState<BonRichiesta | null>(null);
  const [notaLettura, setNotaLettura] = useState("");
  const [dichiara, setDichiara] = useState(false);
  const [dich, setDich] = useState({ data: oggiIso(), ordinante: "", causale: "" });
  const richiestaFatta = useRef(false);

  const carica = useCallback(async () => {
    setCerca(true);
    try {
      const x: Ricerca = await fetchAPI(`/api/bonifici/sessione/${sessionId}`);
      setR(x);
      setScelto(x.consigliato || "");
      if (x.richiesta_aperta && APERTA.includes(x.richiesta_aperta.stato)) setRic((v) => (v && APERTA.includes(v.stato) ? v : x.richiesta_aperta));
      return x;
    } catch (e) { toastErrore(e); return null; } finally { setCerca(false); }
  }, [sessionId]);

  // lettura immediata del conto all'iMac (una ogni 2 minuti: se è stato letto da poco si usa quella lettura)
  const leggiConto = useCallback(async (ricerca = false) => {
    setNotaLettura("");
    if (ricerca) await carica();
    try {
      const { richiesta } = await fetchAPI("/api/bonifici/richiesta", { method: "POST", body: JSON.stringify({ origine: "sessione", operatore: operatore || undefined }) }, false);
      setRic(richiesta);
    } catch (e) {
      const err = e as ApiError;
      setNotaLettura(err.status === 429 ? `${err.message}.` : `Lettura del conto non richiesta: ${err.message}`);
    }
  }, [operatore, carica]);

  function apri() {
    if (!operatore) { toast.error("Scegli chi sta facendo l'operazione (Christian o Dumy) in alto, accanto a «Genera rapporti»"); return; }
    setR(null); setScelto(""); setNessuno(false); setRic(null); setNotaLettura(""); setDichiara(false);
    richiestaFatta.current = false;
    setAperto(true);
    carica();
  }

  const nonTrovato = !!r && (r.esito === "non_trovato" || nessuno);
  // non trovato → si chiede subito una lettura all'iMac (una volta per apertura)
  useEffect(() => {
    if (aperto && nonTrovato && r?.esito !== "gia_pagata" && !richiestaFatta.current) {
      richiestaFatta.current = true;
      if (!(r?.richiesta_aperta && APERTA.includes(r.richiesta_aperta.stato))) leggiConto();
    }
  }, [aperto, nonTrovato, r, leggiConto]);

  // si segue la lettura ogni 3 s; a fine giro si ripete la ricerca
  const inLettura = !!ric && APERTA.includes(ric.stato);
  const rid = ric?.id;
  useEffect(() => {
    if (!aperto || !inLettura || !rid) return;
    const t = setInterval(async () => {
      try {
        const { richiesta } = await bonRichiesta(rid);
        setRic(richiesta);
        if (!APERTA.includes(richiesta.stato)) {
          window.dispatchEvent(new Event("bonifici:aggiorna"));
          const x = await carica();
          if (x && x.esito !== "non_trovato") { setNessuno(false); toast.success("Bonifico trovato sul conto SumUp"); }
        }
      } catch { /* rete: si riprova */ }
    }, 3000);
    return () => clearInterval(t);
  }, [aperto, inLettura, rid, carica]);

  async function abbina() {
    const b = r?.candidati.find((c) => c.id === scelto);
    if (!b) return;
    setBusy(true);
    try {
      await fetchAPI(`/api/bonifici/sessione/${sessionId}/abbina`, { method: "POST", body: JSON.stringify({ bonifico_id: b.id, operatore }) });
      toast.success(`Bonifico di ${eur(b.importo)} da ${b.ordinante || "—"} abbinato: sessione pagata`);
      window.dispatchEvent(new Event("bonifici:aggiorna"));
      setAperto(false);
      onFatto?.();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  async function segnaDichiarato() {
    if (!dich.data) { toast.error("Indica la data del bonifico"); return; }
    if (dich.data > oggiIso()) { toast.error("La data del bonifico non può essere futura"); return; }
    setBusy(true);
    try {
      const x = await fetchAPI(`/api/bonifici/sessione/${sessionId}/dichiara`, { method: "POST", body: JSON.stringify({ operatore, ...dich }) });
      if (x.gia_presente) toast.info("Il bonifico era già stato dichiarato per questa sessione");
      else if (x.verificato) toast.success("Bonifico trovato sul conto e abbinato: sessione pagata");
      else toast.success("Sessione segnata pagata con bonifico DICHIARATO: si abbina da solo quando arriva sul conto SumUp", { duration: 8000 });
      window.dispatchEvent(new Event("bonifici:aggiorna"));
      setAperto(false);
      onFatto?.();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  const doc = r?.documento;
  const lista = r?.candidati || [];
  return (
    <>
      <Button disabled={disabled} className={className} onClick={apri}
        title="Cerca il bonifico arrivato sul conto SumUp e lo abbina alla sessione">
        <Euro className="size-3.5" /> BONIFICO
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => { if (!busy) setAperto(v); }}>
        <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Landmark className="size-5" /> Bonifico{doc ? ` · ${eur(doc.importo)}` : ""}</DialogTitle>
            <DialogDescription>
              {doc ? <>Sessione {doc.numero} · {doc.cliente || "cliente"}{doc.fattura ? ` · fattura ${doc.fattura.numero || "(bozza)"}` : doc.pf ? ` · ${doc.pf.sigla}` : ""}</> : "Cerco il bonifico sul conto SumUp…"}
            </DialogDescription>
          </DialogHeader>

          {!r && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cerco il bonifico sul conto SumUp…</div>}

          {r?.dichiarato && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              Bonifico già <b>dichiarato</b> il {giorno(r.dichiarato.data_bonifico)} ({eur(r.dichiarato.importo)}{r.dichiarato.ordinante ? ` da ${r.dichiarato.ordinante}` : ""}):
              non ancora visto sul conto SumUp.
            </div>
          )}

          {r?.esito === "gia_pagata" && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> La sessione risulta già pagata: non resta nulla da incassare.
            </div>
          )}

          {/* TROVATO: uno chiaro o più candidati con lo stesso importo */}
          {r && !nonTrovato && lista.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {r.esito === "trovato" ? "Bonifico trovato sul conto SumUp:" : `${lista.length} bonifici con lo stesso importo: scegli quello giusto`}
              </p>
              <div className="max-h-72 divide-y overflow-y-auto rounded border bg-background">
                {lista.map((b) => (
                  <label key={b.id} className={`flex min-h-11 cursor-pointer items-start gap-2 p-2 text-sm ${scelto === b.id ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                    <input type="radio" className="mt-1 size-4" name="bonifico-sessione" checked={scelto === b.id} onChange={() => setScelto(b.id)} />
                    <span className="flex-1 space-y-0.5">
                      <span className="block"><b className="tabular-nums">{eur(b.importo)}</b> · {giorno(b.data_valuta || b.data)}</span>
                      <span className="block text-xs"><span className="text-muted-foreground">Ordinante:</span> <b>{b.ordinante || "non indicato"}</b></span>
                      <span className="block text-xs"><span className="text-muted-foreground">Causale:</span> {b.causale || "—"}</span>
                      {b.motivi.map((m) => <span key={m} className="mr-1 inline-block rounded bg-emerald-600 px-1 text-[10px] text-white">{m}</span>)}
                      {b.avviso && <span className="block text-[11px] text-amber-700 dark:text-amber-300">⚠️ {b.avviso}</span>}
                    </span>
                  </label>
                ))}
              </div>
              <Button className="h-11 w-full bg-emerald-600 font-bold text-white hover:bg-emerald-700" disabled={busy || !scelto} onClick={abbina}>
                {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Conferma: abbina questo bonifico
              </Button>
              <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" disabled={busy}
                onClick={() => setNessuno(true)}>Non è nessuno di questi</button>
            </div>
          )}

          {/* NON TROVATO: lettura del conto e due scelte */}
          {r && r.esito !== "gia_pagata" && nonTrovato && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>Bonifico <b>non ancora arrivato</b> sul conto SumUp (ultima lettura {ora(r.ultima_lettura)}{r.ultima_lettura_esito && r.ultima_lettura_esito !== "ok" ? `, ${r.ultima_lettura_esito}` : ""}).</span>
              </div>
              {inLettura ? (
                <div className="flex items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-2 py-2 text-xs dark:bg-sky-950/30">
                  <Loader2 className="size-4 animate-spin" /> Sto rileggendo il conto SumUp ({ric!.stato === "in_attesa" ? "in attesa dell'iMac del negozio" : "l'iMac sta leggendo il conto"}): ci vogliono 1-2 minuti, poi ricontrollo da solo.
                </div>
              ) : ric && ric.stato !== "evasa" ? (
                <div className="text-xs text-red-700 dark:text-red-300">{ric.stato === "scaduta" ? "L'iMac del negozio non ha risposto: il conto non è stato riletto." : ric.esito}</div>
              ) : ric ? (
                <div className="text-xs text-emerald-700 dark:text-emerald-300">{ric.esito} · ricontrollato</div>
              ) : notaLettura ? <div className="text-xs text-muted-foreground">{notaLettura}</div> : null}

              {!dichiara ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="outline" className="h-11 border-sky-400 text-sky-800 dark:text-sky-200" disabled={busy || inLettura || cerca}
                    onClick={() => leggiConto(true)}>
                    {inLettura || cerca ? <Loader2 className="animate-spin" /> : <Clock />} Aspetta e ricontrolla
                  </Button>
                  <Button className="h-11 bg-amber-600 font-semibold text-white hover:bg-amber-700" disabled={busy}
                    onClick={() => { setDich({ data: oggiIso(), ordinante: doc?.cliente || "", causale: "" }); setDichiara(true); }}>
                    <PenLine /> Segna comunque pagato
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 rounded-md border border-amber-300 p-2">
                  <p className="text-sm font-medium">Segna pagato con bonifico <b>dichiarato</b> ({eur(doc?.importo)})</p>
                  <label className="block text-xs">Data del bonifico *
                    <input type="date" className="mt-0.5 block h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={dich.data} max={oggiIso()}
                      onChange={(e) => setDich((d) => ({ ...d, data: e.target.value }))} /></label>
                  <label className="block text-xs">Chi l&apos;ha fatto (ordinante)
                    <Input className="mt-0.5 h-10" value={dich.ordinante} onChange={(e) => setDich((d) => ({ ...d, ordinante: e.target.value }))} /></label>
                  <label className="block text-xs">Causale o CRO (se lo sai)
                    <Input className="mt-0.5 h-10" value={dich.causale} onChange={(e) => setDich((d) => ({ ...d, causale: e.target.value }))} /></label>
                  <p className="text-[11px] text-amber-800 dark:text-amber-200">
                    La sessione risulta pagata con la nota «bonifico dichiarato, da riscontrare». Quando il bonifico arriva sul conto SumUp si abbina da solo.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-11" disabled={busy} onClick={() => setDichiara(false)}>Indietro</Button>
                    <Button className="h-11 bg-amber-600 font-bold text-white hover:bg-amber-700" disabled={busy || !dich.data} onClick={segnaDichiarato}>
                      {busy ? <Loader2 className="animate-spin" /> : null} Conferma: pagato (dichiarato)
                    </Button>
                  </div>
                </div>
              )}
              {nessuno && lista.length > 0 && (
                <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => setNessuno(false)}>
                  <RefreshCw className="mr-1 inline size-3" />Torna ai bonifici con lo stesso importo</button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
