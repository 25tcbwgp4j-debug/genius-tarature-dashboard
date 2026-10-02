// Genius Lab Gestionale (02/10/2026): attività scelta nella postazione (Tarature / Apple).
// File senza "use client": lo usa anche lib/api.ts per l'header X-Attivita.
export type Attivita = "tarature" | "apple";
export const CHIAVE_ATTIVITA = "gl-attivita";

/** Attività scelta nel selettore in alto (ricordata nel browser della postazione); di default Tarature. */
export function attivitaSalvata(): Attivita {
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(CHIAVE_ATTIVITA) : null;
    return v === "apple" ? "apple" : "tarature";
  } catch {
    return "tarature";
  }
}
