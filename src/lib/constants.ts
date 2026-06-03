// Configurazione stati sessione condivisa tra pagine
export const STATUS_CONFIG: Record<string, { label: string; color: string; step: number }> = {
  registrazione: { label: "Registrazione", color: "bg-yellow-100 text-yellow-800", step: 0 },
  in_lavorazione: { label: "In lavorazione", color: "bg-blue-100 text-blue-800", step: 1 },
  pronto_ritiro: { label: "Pronto ritiro", color: "bg-green-100 text-green-800", step: 2 },
  attesa_pagamento: { label: "Attesa pagamento", color: "bg-orange-100 text-orange-800", step: 3 },
  completata: { label: "Completata", color: "bg-gray-100 text-gray-800", step: 4 },
};

/**
 * Restituisce il config di stato considerando la modalità di consegna.
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
