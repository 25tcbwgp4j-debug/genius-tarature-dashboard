"use client";

// ETICHETTE DEL MAGAZZINO RICAMBI (29/10/2026) — backend ricambi_etichette.py.
// Christian: «per display, top case e schede logiche mi serve la stampa dell'etichetta per ogni pezzo, nella relativa
// quantità, con tutta la descrizione (display 12 pollici rosa usato con fascia verticale rotta); anche in blocco».
// Una riga o tante (selezione / tutta la sezione): copie = pezzi in giacenza (si cambiano), formato Brother 50x22 del
// banco (coda «etichette», come tarature e magazzino), A4 a griglia sulla laser, o 62x29 solo PDF.
// Agente di stampa spento → si apre il PDF da stampare a mano (come per le altre etichette).

import { useState } from "react";
import { Eye, Loader2, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { fetchAPI, magUrlEtichettePdf } from "@/lib/api";

export interface RigaEtichetta {
  id: number; tipo: string; etichetta: string | null; codice: string | null; descrizione: string; modelli: string | null;
  colore: string | null; grado: string | null; stato: string | null; condizioni: string | null; qta_nuovo: number; qta_usato: number;
}
type Formato = "50x22" | "a4" | "62x29";
type Esito = { ok: boolean; etichette: number; righe: number; formato: Formato; pdf: string[]; pdf_unico: string; lavori: string[]; agente_attivo: boolean };

const FORMATI: { k: Formato; t: string }[] = [
  { k: "50x22", t: "Brother del banco 50x22 mm" }, { k: "a4", t: "Foglio A4 sulla laser (24 per foglio)" },
  { k: "62x29", t: "Rotolo 62x29 mm (solo PDF)" },
];
const MAX = 1500;
const giacenza = (r: RigaEtichetta) => Math.max(1, (r.qta_nuovo || 0) + (r.qta_usato || 0));
const riassunto = (r: RigaEtichetta) => [r.descrizione, r.colore?.toLowerCase(), r.grado && `grado ${r.grado}`, r.condizioni]
  .filter(Boolean).join(" · ");

export function StampaEtichetteRicambi({ righe, titolo, onClose }: { righe: RigaEtichetta[]; titolo?: string; onClose: () => void }) {
  const [copie, setCopie] = useState<Record<number, string>>(() => Object.fromEntries(righe.map((r) => [r.id, String(giacenza(r))])));
  const [formato, setFormato] = useState<Formato>("50x22");
  const [busy, setBusy] = useState<"" | "stampa" | "anteprima">("");
  const n = (id: number) => Math.max(0, Math.round(Number((copie[id] || "0").replace(",", "."))) || 0);
  const totale = righe.reduce((s, r) => s + n(r.id), 0);
  const soloPdf = formato === "62x29";

  async function esegui(anteprima: boolean) {
    if (busy) return;
    if (!totale) { toast.error("Scrivi quante etichette stampare"); return; }
    if (totale > MAX) { toast.error(`Massimo ${MAX} etichette per volta`); return; }
    setBusy(anteprima ? "anteprima" : "stampa");
    try {
      const r: Esito = await fetchAPI("/api/ricambi-apple/etichette/stampa", {
        method: "POST",
        body: JSON.stringify({ righe: righe.map((x) => ({ id: x.id, copie: n(x.id) })).filter((x) => x.copie > 0), formato, solo_pdf: anteprima }),
      });
      if (anteprima || soloPdf) {
        window.open(magUrlEtichettePdf(r.pdf_unico), "_blank");
      } else if (r.agente_attivo) {
        toast.success(`${r.etichette} ${r.etichette === 1 ? "etichetta mandata" : "etichette mandate"} alla ${formato === "a4" ? "laser" : "Brother del banco"}`);
        onClose();
      } else {
        toast.warning("Agente di stampa del banco spento: apro il PDF da stampare a mano. Il lavoro resta in coda 15 minuti.", { duration: 8000 });
        window.open(magUrlEtichettePdf(r.pdf_unico), "_blank");
      }
    } catch (e) { toast.error(String((e as Error)?.message || e)); } finally { setBusy(""); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 print:hidden" onClick={() => !busy && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 rounded-lg bg-white p-4 shadow-xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape" && !busy) onClose(); }}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold"><Printer className="h-4 w-4" />
            {titolo || (righe.length === 1 ? "Stampa etichetta" : `Stampa etichette di ${righe.length} righe`)}</h3>
          <button type="button" onClick={onClose} disabled={!!busy} className="p-1"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-gray-500">
          Sull&apos;etichetta: sigla, posizione, la descrizione completa (modello, colore, grado, nuovo/usato, difetti) e il codice a barre
          del pezzo: sparato col lettore in questa pagina va dritto sulla riga. Copie = pezzi in giacenza (si possono cambiare).
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">Formato
            <select className="rounded border bg-white px-2 py-1 text-sm dark:bg-gray-900" value={formato} onChange={(e) => setFormato(e.target.value as Formato)}>
              {FORMATI.map((f) => <option key={f.k} value={f.k}>{f.t}</option>)}
            </select>
          </label>
          {righe.length > 1 && (<>
            <label className="flex items-center gap-2">Copie per tutte
              <input className="w-16 rounded border px-2 py-1 text-right" inputMode="numeric" placeholder="n."
                onChange={(e) => { const v = e.target.value; if (v) setCopie(Object.fromEntries(righe.map((x) => [x.id, v]))); }} />
            </label>
            <button type="button" className="text-xs text-blue-600 underline"
              onClick={() => setCopie(Object.fromEntries(righe.map((x) => [x.id, String(giacenza(x))])))}>copie = giacenza</button>
          </>)}
        </div>
        <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded border text-sm">
          {righe.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-2">
              <div className="w-16 shrink-0 font-mono text-xs font-bold">{r.etichetta || r.codice || `RA${r.id}`}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate" title={riassunto(r)}>{riassunto(r)}</div>
                {r.modelli && <div className="truncate text-xs text-gray-500">{r.modelli.split("\n")[0]}</div>}
              </div>
              <label className="flex items-center gap-1 text-xs text-gray-500">copie
                <input autoFocus={righe.length === 1} className="h-8 w-16 rounded border px-2 text-right text-base" inputMode="numeric"
                  value={copie[r.id] ?? ""} onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setCopie((c) => ({ ...c, [r.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); esegui(false); } }} />
              </label>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-sm text-gray-500">{totale} {totale === 1 ? "etichetta" : "etichette"}</span>
          <button type="button" disabled={!!busy} onClick={() => esegui(true)} title="Apre il PDF delle etichette senza stamparle"
            className="inline-flex items-center gap-1 rounded border px-3 py-2 text-sm">
            {busy === "anteprima" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Anteprima</button>
          {!soloPdf && (
            <button type="button" disabled={!!busy || !totale} onClick={() => esegui(false)}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">
              {busy === "stampa" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Stampa {totale > 0 ? totale : ""}</button>
          )}
        </div>
      </div>
    </div>
  );
}
