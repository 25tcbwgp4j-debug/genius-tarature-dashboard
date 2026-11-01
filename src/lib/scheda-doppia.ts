// 01/11/2026 (Christian, schede doppie al banco): funzioni pure del 409 «scheda_doppia» e della chiave di idempotenza.
export interface SchedaEsistente { id: string; sigla: string; numero?: number; stato?: string; prodotto?: string | null; seriale?: string | null;
  cliente?: string | null; created_at?: string; perche: string }

/** L'errore è il 409 «scheda doppia» del server? Allora restituisce la scheda esistente. */
export function schedaDoppia(e: unknown): SchedaEsistente | null {
  const err = e as { status?: number; detail?: { codice?: string; scheda?: SchedaEsistente } };
  return err?.status === 409 && err.detail && typeof err.detail === "object" && err.detail.codice === "scheda_doppia" ? err.detail.scheda || null : null;
}

/** Chiave di idempotenza per un invio (un modulo aperto = una chiave: il doppio clic restituisce la stessa scheda). */
export function nuovaChiave(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

