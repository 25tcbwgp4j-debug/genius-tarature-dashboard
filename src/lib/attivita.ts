// Genius Lab Gestionale (02/10/2026): attività scelta nella postazione (Tarature / Apple).
// File senza "use client": lo usa anche lib/api.ts per l'header X-Attivita.
export type Attivita = "tarature" | "apple";
// 14/10/2026: chiave nuova → tutte le postazioni ripartono da APPLE (prima il default era Tarature e restava salvato)
export const CHIAVE_ATTIVITA = "gl-attivita-v2";

/** Attività scelta nel selettore in alto (ricordata nel browser della postazione); di default APPLE (14/10/2026). */
export function attivitaSalvata(): Attivita {
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(CHIAVE_ATTIVITA) : null;
    return v === "tarature" ? "tarature" : "apple";
  } catch {
    return "apple";
  }
}

/** Riconoscimento dal contenuto (stessa regola del database, trigger genius_attivita_default): righe di taratura →
 *  Tarature, tutto il resto → Apple. Serve a MOSTRARE la proposta; se nessuno sceglie a mano decide il database. */
const RE_TARATURE = /(TARAT|\bRDT\b|RAPPORTO DI|F-?GAS|CERCAFUGHE|MANOMETR|VACUOMETR|CALIBRAZIONE)/i;
export function attivitaDaTesto(testi: (string | null | undefined)[]): Attivita {
  return testi.some((t) => t && RE_TARATURE.test(t)) ? "tarature" : "apple";
}
