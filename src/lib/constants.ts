// Configurazione stati sessione condivisa tra pagine.
// NOTA: payment_status è INDIPENDENTE dallo status sessione.
// "attesa_pagamento" indica che è stata inviata la proforma — NON che non è stato pagato.
export const STATUS_CONFIG: Record<string, { label: string; color: string; step: number }> = {
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

/**
 * Restituisce il config di stato sessione considerando la modalità di consegna.
 * Quando una sessione ha `shipping_included=true`, lo step "pronto_ritiro" viene
 * etichettato come "Pronto alla spedizione" (cosmetico, no migration DB enum).
 */
export function getStatusConfig(
  status: string,
  opts?: { shippingIncluded?: boolean },
): { label: string; color: string; step: number } {
  const base = STATUS_CONFIG[status] || { label: status, color: "bg-gray-100 text-gray-800", step: 0 };
  if (status === "pronto_ritiro" && opts?.shippingIncluded) {
    return { ...base, label: "Pronto alla spedizione" };
  }
  return base;
}
