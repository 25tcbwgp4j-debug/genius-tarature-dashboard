// Configurazione stati sessione condivisa tra pagine.
// NOTA: payment_status è INDIPENDENTE dallo status sessione.
// "attesa_pagamento" indica che è stata inviata la proforma — NON che non è stato pagato.
export const STATUS_CONFIG: Record<string, { label: string; color: string; step: number }> = {
  // 01/10/2026: sessione aperta ma il cliente deve ancora portare gli strumenti — arancione ben visibile
  attesa_strumenti: { label: "ATTESA STRUMENTI", color: "bg-orange-500 text-white font-bold border border-orange-600 hover:bg-orange-500", step: 0 },
  registrazione:    { label: "Registrazione",    color: "bg-yellow-100 text-yellow-800", step: 0 },
  in_lavorazione:   { label: "In lavorazione",   color: "bg-blue-100 text-blue-800",    step: 1 },
  pronto_ritiro:    { label: "Pronto al ritiro",  color: "bg-green-100 text-green-800",  step: 2 },
  attesa_pagamento: { label: "Pronto al ritiro",  color: "bg-green-100 text-green-800",  step: 2 },
  completata:       { label: "Completata",        color: "bg-gray-100 text-gray-800",    step: 4 },
};

// Configurazione badge pagamento — sempre mostrato separatamente dallo stato sessione
export const PAYMENT_CONFIG: Record<string, { label: string; color: string }> = {
  non_richiesto: { label: "Pag. non richiesto", color: "bg-gray-100 text-gray-500" },
  in_attesa:     { label: "In attesa pag.",      color: "bg-orange-100 text-orange-800" },
  parziale:      { label: "Pag. parziale",       color: "bg-yellow-100 text-yellow-800" },
  pagato:        { label: "Pagato",              color: "bg-emerald-100 text-emerald-800" },
};

export function getPaymentConfig(
  paymentStatus: string | null | undefined,
  paymentMethod?: string | null,
): { label: string; color: string } {
  const key = paymentStatus || "in_attesa";
  const base = PAYMENT_CONFIG[key] || PAYMENT_CONFIG.in_attesa;
  if (key === "pagato" && paymentMethod) {
    return { ...base, label: `Pagato (${paymentMethod})` };
  }
  return base;
}

/** Campi della sessione che decidono come tornano gli strumenti al cliente. */
export type SpedizioneSessione = {
  shipping_included?: boolean | null;
  shipping_amount_gross?: number | string | null;
  return_by_courier?: boolean | null;
  return_by_customer?: boolean | null;
  shipping_by_customer?: boolean | null;
};

/**
 * Gli strumenti tornano al cliente con un corriere (nostro o suo) e non vengono ritirati in negozio.
 * Stessa regola di backend/etichetta_ritorno.py `variante()`: ritorno a carico del cliente, spedizione
 * addebitata oppure «da rispedire con corriere» (12/10/2026: prima guardava solo shipping_included).
 */
export function siSpedisce(s?: SpedizioneSessione | null): boolean {
  if (!s) return false;
  if (s.return_by_customer || s.shipping_by_customer) return true;
  const addebitata = !!s.shipping_included && Number(s.shipping_amount_gross || 0) > 0;
  return addebitata || !!s.return_by_courier;
}

/**
 * Restituisce il config di stato sessione considerando la modalità di consegna.
 * Lo stato a DB resta "pronto_ritiro" (nessuna migrazione dell'enum): se gli strumenti
 * tornano col corriere l'etichetta diventa "Pronto alla spedizione", in azzurro.
 */
export function getStatusConfig(
  status: string,
  sessione?: SpedizioneSessione | null,
): { label: string; color: string; step: number } {
  const base = STATUS_CONFIG[status] || { label: status, color: "bg-gray-100 text-gray-800", step: 0 };
  if ((status === "pronto_ritiro" || status === "attesa_pagamento") && siSpedisce(sessione)) {
    return { ...base, label: "Pronto alla spedizione", color: "bg-cyan-100 text-cyan-800" };
  }
  return base;
}
