"use client";

// SCHEDA MODIFICATA DA UN ALTRO OPERATORE (15/11/2026, piano Genius 5.2 — backend 9e074b9).
// fetchAPI manda «X-Scheda-Versione» (lib/versioneScheda); se il server risponde 409 «modificata da un altro operatore»
// qui si apre il dialogo dell'app (Conferma.tsx) «Qualcuno ha modificato la scheda: ricarica» con, in un riquadro da
// copiare, quello che l'operatore stava scrivendo (bozza della scheda + testi del dialogo che stava inviando).
// «Ricarica» rilegge la scheda; il testo non salvato resta in un riquadro sopra la scheda finché non lo si chiude.
import { useEffect, useRef, useState } from "react";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { conferma } from "@/components/Conferma";
import { apriScheda, chiudiScheda, EVENTO_SCHEDA_CAMBIATA, type DettaglioSchedaCambiata } from "@/lib/versioneScheda";
import { copia } from "./Comunicazioni";

const NOMI: Record<string, string> = {
  difetto: "Difetto", note: "Note", note_interne: "Note interne", lavorazione: "Lavorazione", accessori: "Accessori",
  nota: "Nota", nota_cliente: "Nota per il cliente", nota_cliente_esito: "Nota per il cliente", messaggio: "Messaggio al tecnico",
  testo: "Testo", motivo: "Motivo", forza_motivo: "Motivo", pagamento_fuori_motivo: "Motivo", motivo_accettazione: "Motivo",
  motivo_testi: "Motivo", diagnosi: "Diagnosi", indirizzo_spedizione: "Indirizzo di spedizione", riconsegna_nota: "Cosa si riconsegna",
  comunicazione_cliente: "Comunicazione al cliente", nominativo: "Nominativo", azienda: "Azienda", referente: "Referente",
  telefono: "Telefono", email: "Email", modello: "Modello", seriale: "Seriale", imei: "IMEI", totale_lavorazione: "Totale lavorazione",
};
// valori «di scelta» del corpo delle azioni: non sono testo scritto dall'operatore
const NON_TESTO = new Set(["operatore", "tipo", "modo", "azione", "canale", "passo", "stato", "esito", "consegna_modo", "consegna_corriere",
  "pagamento_modo", "programma_il", "data", "ok_cliente", "hw_model", "hw_model_annunciato_il", "tecnico", "riparazione_stato",
  "updated_at_letto", "chiave_idempotenza", "documento", "spedizione_tipo", "famiglia", "prodotto", "anno", "copertura"]);
const nome = (k: string) => NOMI[k] || k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function righe(o: Record<string, unknown> | null | undefined, gia: Set<string>, tutto: boolean): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(o || {})) {
    if (gia.has(k) || NON_TESTO.has(k) || v === null || v === undefined || v === "" || typeof v === "boolean") continue;
    if (k === "preventivo_righe" && Array.isArray(v)) {
      const r = v.map((x) => { const y = x as { t?: string; p?: number | string }; return `  - ${y.t || ""}${y.p !== undefined && y.p !== null && y.p !== "" ? ` · € ${y.p}` : ""}`; });
      if (r.length) { out.push("Voci del preventivo:", ...r); gia.add(k); }
      continue;
    }
    if (k === "preventivo" && typeof v === "object") { out.push(...righe(v as Record<string, unknown>, gia, false)); gia.add(k); continue; }
    if (typeof v === "string") {
      if (!tutto && v.trim().length < 3) continue;
      out.push(`${nome(k)}: ${v.trim()}`);
    } else if (typeof v === "number") {
      if (!tutto) continue;
      out.push(`${nome(k)}: ${v}`);
    } else if (tutto) {
      out.push(`${nome(k)}: ${JSON.stringify(v)}`);
    } else continue;
    gia.add(k);
  }
  return out;
}

/** Il testo da conservare: tutti i campi della bozza + i testi del corpo dell'azione che il server ha rifiutato. */
export function testoDaConservare(bozza: Record<string, unknown>, corpo: Record<string, unknown> | null): string {
  const gia = new Set<string>();
  return [...righe(bozza, gia, true), ...righe(corpo, gia, false)].join("\n");
}

/** Registra la scheda come aperta (versione mandata dalle scritture) e gestisce il 409 di concorrenza. */
export function useSchedaCambiata(id: string, bozza: Record<string, unknown>, ricarica: () => Promise<unknown>) {
  const [nonSalvato, setNonSalvato] = useState("");
  const rifBozza = useRef(bozza);
  const rifRicarica = useRef(ricarica);
  const aperto = useRef(false);
  useEffect(() => { rifBozza.current = bozza; rifRicarica.current = ricarica; });
  useEffect(() => { apriScheda(id); return () => chiudiScheda(id); }, [id]);
  useEffect(() => {
    const h = async (ev: Event) => {
      const d = (ev as CustomEvent<DettaglioSchedaCambiata>).detail;
      if (!d || d.sid !== id || aperto.current) return;
      aperto.current = true;
      const testo = testoDaConservare(rifBozza.current, d.corpo);
      try {
        const ok = await conferma({
          titolo: "Qualcuno ha modificato la scheda: ricarica",
          testo: "Un altro operatore ha salvato questa scheda mentre l'avevi aperta. Per non cancellare il suo lavoro il server non ha salvato niente.\n"
            + "Premi «Ricarica» per vedere la scheda aggiornata, poi rifai la modifica." + (testo ? "\nQuello che avevi scritto resta qui sotto e sopra la scheda, da copiare." : ""),
          ok: "Ricarica", annulla: "Non ora", daCopiare: testo || undefined,
        });
        if (ok) { await rifRicarica.current(); if (testo) setNonSalvato(testo); }
      } finally { aperto.current = false; }
    };
    window.addEventListener(EVENTO_SCHEDA_CAMBIATA, h);
    return () => window.removeEventListener(EVENTO_SCHEDA_CAMBIATA, h);
  }, [id]);
  // cambiando scheda il riquadro non si porta dietro il testo dell'altra
  useEffect(() => () => setNonSalvato(""), [id]);
  return { nonSalvato, chiudiNonSalvato: () => setNonSalvato("") };
}

/** Riquadro sopra la scheda ricaricata con il testo che non era stato salvato. */
export function RiquadroNonSalvato({ testo, onChiudi }: { testo: string; onChiudi: () => void }) {
  if (!testo) return null;
  return (
    <div role="status" data-testid="riquadro-non-salvato" className="space-y-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex flex-wrap items-center gap-2">
        <b>📋 Scheda ricaricata: questo l&apos;avevi scritto tu e NON è stato salvato</b>
        <span className="text-xs opacity-80">copialo nei campi giusti e salva di nuovo</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => copia(testo)}><Copy />Copia</Button>
          <Button size="icon-sm" variant="ghost" onClick={onChiudi} aria-label="Chiudi il riquadro"><X /></Button>
        </div>
      </div>
      <textarea readOnly value={testo} rows={Math.min(10, testo.split("\n").length + 1)} onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-md border border-amber-300 bg-background px-2.5 py-1.5 font-mono text-xs outline-none" />
    </div>
  );
}
