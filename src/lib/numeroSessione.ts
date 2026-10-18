/**
 * Numero di sessione DEFINITIVO e PROVVISORIO (18/10/2026, migrazione 119 del backend).
 *
 * Regola: le sessioni «in attesa strumenti» hanno solo un numero provvisorio «P-007»; il numero definitivo
 * (session_number) nasce quando gli strumenti arrivano (pulsante «Strumenti arrivati – conferma»).
 * Così una sessione annunciata e poi cancellata non lascia buchi nella numerazione.
 */
export interface ConNumero {
  session_number?: number | null;
  provisional_number?: string | null;
}

/** true se la sessione non ha ancora il numero definitivo */
export function eProvvisoria(s?: ConNumero | null): boolean {
  return !!s && (s.session_number === null || s.session_number === undefined);
}

/** «225» oppure «P-007» (stringa vuota se non c'è niente) */
export function numeroSessione(s?: ConNumero | null): string {
  if (!s) return "";
  if (s.session_number !== null && s.session_number !== undefined) return String(s.session_number);
  return s.provisional_number || "";
}

/** «n. 225» oppure «P-007 (provvisorio)» */
export function etichettaSessione(s?: ConNumero | null): string {
  const n = numeroSessione(s);
  if (!n) return "";
  return eProvvisoria(s) ? `${n} (provvisorio)` : `n. ${n}`;
}

/** «P-7», «p007», «P 12» → «P-007» / «P-012»; null se il testo non è un numero provvisorio */
export function cercaProvvisorio(q: string): string | null {
  const m = /^\s*p\s*-?\s*(\d{1,6})\s*$/i.exec(q || "");
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return `P-${n < 1000 ? String(n).padStart(3, "0") : n}`;
}

/** confronto per ordinare: prima le definitive per numero, poi le provvisorie */
export function confrontaNumero(a: ConNumero, b: ConNumero): number {
  const pa = eProvvisoria(a), pb = eProvvisoria(b);
  if (pa !== pb) return pa ? 1 : -1;
  if (!pa) return (a.session_number as number) - (b.session_number as number);
  const na = parseInt((a.provisional_number || "").replace(/\D/g, "") || "0", 10);
  const nb = parseInt((b.provisional_number || "").replace(/\D/g, "") || "0", 10);
  return na - nb;
}
