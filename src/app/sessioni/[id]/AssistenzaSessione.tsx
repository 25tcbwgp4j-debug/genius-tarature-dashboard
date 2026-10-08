"use client";

// ASSISTENZA / RIPARAZIONI nella sessione di taratura — 08/10/2026 (Christian):
// «oltre a tarare, a volte facciamo la verifica e l'assistenza sui dispositivi arrivati per la taratura».
// - riga di tipo assistenza (tabella sessione_assistenze): NON emette rapporto, niente etichetta né scadenza;
// - descrizione predefinita «Assistenza per manutenzione o riparazione», integrabile (es. «— verifica sensore»);
// - strumento della sessione a cui si riferisce (opzionale: la matricola va in pro forma/fattura);
// - IMPORTO LIBERO IVA inclusa: vuoto = «da preventivare», si scrive dopo la verifica;
// - stato (da verificare · preventivo inviato · approvato · eseguita) e note interne (esito verifica, non vanno al cliente);
// - entra nel totale, nel pro forma, nello scontrino e nella fattura SENZA «Taratura» davanti; con importo 0 pro forma
//   e fattura si fermano; importo e descrizione si cambiano finché la sessione non è fatturata.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, Save, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { useOperatore } from "@/components/Operatore";

export interface Assistenza {
  id: string;
  instrument_id: string | null;
  descrizione: string;
  importo: number | null;
  stato: "da_verificare" | "preventivo_inviato" | "approvato" | "eseguita";
  note_interne: string | null;
}

interface StrumentoBreve { id: string; instrument_name?: string | null; manufacturer?: string | null; model?: string | null; serial_number?: string | null }

const STATI: { v: Assistenza["stato"]; l: string; cls: string }[] = [
  { v: "da_verificare", l: "da verificare", cls: "bg-gray-100 text-gray-700 border-gray-300" },
  { v: "preventivo_inviato", l: "preventivo inviato", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  { v: "approvato", l: "approvato", cls: "bg-blue-50 text-blue-800 border-blue-300" },
  { v: "eseguita", l: "eseguita", cls: "bg-emerald-50 text-emerald-800 border-emerald-300" },
];
const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const nomeStrumento = (s?: StrumentoBreve) =>
  s ? [s.instrument_name, [s.manufacturer, s.model].filter(Boolean).join(" "), s.serial_number ? `s/n ${s.serial_number}` : ""].filter(Boolean).join(" · ") : "";

interface Props {
  sessionId: string;
  instruments: StrumentoBreve[];
  /** cresce a ogni clic su «Aggiungi assistenza» nell'intestazione degli strumenti */
  richiestaNuova: number;
  /** totale delle righe di assistenza (per il totale della sessione in alto) */
  onTotale?: (totale: number) => void;
}

export function AssistenzaSessione({ sessionId, instruments, richiestaNuova, onTotale }: Props) {
  const [righe, setRighe] = useState<Assistenza[]>([]);
  const [bloccata, setBloccata] = useState<string | null>(null);
  const [modifica, setModifica] = useState<string | null>(null);
  const [bozza, setBozza] = useState<{ descrizione: string; importo: string; instrument_id: string; note_interne: string }>({ descrizione: "", importo: "", instrument_id: "", note_interne: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [op] = useOperatore();

  const carica = useCallback(async () => {
    try {
      const r = await fetchAPI(`/api/sessions/${sessionId}/assistenze`, { cache: "no-store" }, false) as { assistenze: Assistenza[]; totale: number; bloccata: string | null };
      setRighe(r.assistenze || []);
      setBloccata(r.bloccata);
      onTotale?.(Number(r.totale || 0));
    } catch { /* sezione non disponibile: la pagina resta usabile */ }
  }, [sessionId, onTotale]);
  useEffect(() => { carica(); }, [carica]);

  const apri = (a: Assistenza) => {
    setModifica(a.id);
    setBozza({ descrizione: a.descrizione, importo: a.importo != null && Number(a.importo) > 0 ? String(a.importo).replace(".", ",") : "",
      instrument_id: a.instrument_id || "", note_interne: a.note_interne || "" });
  };

  const avviso = (r: { avviso?: string | null }) => { if (r?.avviso) toast.warning(r.avviso, { duration: 9000 }); };

  // «Aggiungi assistenza»: crea subito la riga (da preventivare) e la apre in modifica
  const ultimaRichiesta = useRef(richiestaNuova);
  useEffect(() => {
    if (richiestaNuova === ultimaRichiesta.current) return;
    ultimaRichiesta.current = richiestaNuova;
    (async () => {
      if (bloccata) { toast.error(`Non si aggiunge più l'assistenza: ${bloccata}`); return; }
      setBusy("nuova");
      try {
        const r = await fetchAPI(`/api/sessions/${sessionId}/assistenze`, { method: "POST", body: JSON.stringify({ operatore: op || undefined, instrument_id: instruments.length === 1 ? instruments[0].id : undefined }) });
        await carica();
        apri(r.assistenza);
        avviso(r);
        setTimeout(() => document.getElementById("assistenza")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
    })();
  }, [richiestaNuova]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function salva(id: string) {
    setBusy(id);
    try {
      const body: Record<string, unknown> = { note_interne: bozza.note_interne };
      if (!bloccata) Object.assign(body, { descrizione: bozza.descrizione, importo: bozza.importo.trim() || null, instrument_id: bozza.instrument_id || null });
      const r = await fetchAPI(`/api/sessions/${sessionId}/assistenze/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      setModifica(null);
      toast.success("Assistenza salvata");
      avviso(r);
      await carica();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  async function cambiaStato(a: Assistenza, stato: Assistenza["stato"]) {
    setBusy(a.id);
    try {
      await fetchAPI(`/api/sessions/${sessionId}/assistenze/${a.id}`, { method: "PATCH", body: JSON.stringify({ stato }) });
      await carica();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  async function togli(a: Assistenza) {
    if (!confirm(`Togliere la riga «${a.descrizione}»${a.importo ? ` (${eur(Number(a.importo))})` : ""}?`)) return;
    setBusy(a.id);
    try {
      const r = await fetchAPI(`/api/sessions/${sessionId}/assistenze/${a.id}`, { method: "DELETE" });
      if (modifica === a.id) setModifica(null);
      avviso(r);
      await carica();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  if (!righe.length && busy !== "nuova") return null;
  const perId = Object.fromEntries(instruments.map((s) => [s.id, s]));
  const totale = righe.reduce((t, a) => t + Number(a.importo || 0), 0);

  return (
    <div id="assistenza" className="mt-3 rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 sm:p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="flex items-center gap-1.5 font-semibold text-violet-900"><Wrench className="size-4" /> Assistenza / riparazioni ({righe.length})</h4>
        <span className="text-sm font-bold text-violet-800">{eur(totale)}</span>
        <span className="text-[11px] text-gray-500">nessun rapporto di taratura · IVA 22% inclusa</span>
        {bloccata && <span className="text-[11px] text-gray-500">· bloccata: {bloccata}</span>}
      </div>
      {busy === "nuova" && !righe.length && <Loader2 className="size-4 animate-spin text-violet-700" />}
      <div className="divide-y divide-violet-100">
        {righe.map((a) => {
          const daPrev = !(Number(a.importo) > 0);
          const st = STATI.find((x) => x.v === a.stato) || STATI[0];
          if (modifica === a.id) {
            return (
              <div key={a.id} className="space-y-2 py-2">
                <div>
                  <label className="text-xs text-gray-600">Descrizione (va in pro forma e fattura, senza «Taratura» davanti)</label>
                  <textarea className="min-h-16 w-full rounded border bg-white px-2 py-1 text-sm disabled:bg-gray-100" disabled={!!bloccata}
                    value={bozza.descrizione} onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-gray-600">Strumento della sessione (matricola)</label>
                    <select className="h-9 w-full rounded border bg-white px-2 text-sm disabled:bg-gray-100" disabled={!!bloccata}
                      value={bozza.instrument_id} onChange={(e) => setBozza({ ...bozza, instrument_id: e.target.value })}>
                      <option value="">— nessuno in particolare —</option>
                      {instruments.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {nomeStrumento(s)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Importo € IVA inclusa (preventivo)</label>
                    <Input inputMode="decimal" placeholder="da preventivare" className="h-9 text-sm" disabled={!!bloccata}
                      value={bozza.importo} onChange={(e) => setBozza({ ...bozza, importo: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Note interne — esito della verifica (non vanno al cliente)</label>
                  <textarea className="min-h-12 w-full rounded border bg-white px-2 py-1 text-sm"
                    value={bozza.note_interne} onChange={(e) => setBozza({ ...bozza, note_interne: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setModifica(null)}><X className="mr-1 size-4" /> Annulla</Button>
                  <Button size="sm" className="bg-violet-700 hover:bg-violet-800" disabled={busy === a.id} onClick={() => salva(a.id)}>
                    {busy === a.id ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />} Salva
                  </Button>
                </div>
              </div>
            );
          }
          return (
            <div key={a.id} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">{a.descrizione}</p>
                {a.instrument_id && perId[a.instrument_id] && <p className="text-xs text-gray-600">Strumento: {nomeStrumento(perId[a.instrument_id])}</p>}
                {a.note_interne && <p className="text-xs italic text-gray-500">Verifica: {a.note_interne}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <select title="Stato dell'assistenza" className={`h-8 rounded border px-1.5 text-xs ${st.cls}`} disabled={busy === a.id}
                  value={a.stato} onChange={(e) => cambiaStato(a, e.target.value as Assistenza["stato"])}>
                  {STATI.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                </select>
                <span className={`min-w-24 text-right text-sm font-semibold ${daPrev ? "text-red-600" : "text-gray-900"}`}>
                  {daPrev ? "da preventivare" : eur(Number(a.importo))}
                </span>
                <Button variant="ghost" size="sm" title={bloccata ? "Note interne (importo e descrizione bloccati)" : "Modifica importo, descrizione, strumento, note"} onClick={() => apri(a)}>
                  <Pencil className="size-4" />
                </Button>
                {!bloccata && (
                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" title="Togli la riga" disabled={busy === a.id} onClick={() => togli(a)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
