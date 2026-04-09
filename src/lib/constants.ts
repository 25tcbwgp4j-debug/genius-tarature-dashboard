// Configurazione stati sessione condivisa tra pagine
export const STATUS_CONFIG: Record<string, { label: string; color: string; step: number }> = {
  registrazione: { label: "Registrazione", color: "bg-yellow-100 text-yellow-800", step: 0 },
  in_lavorazione: { label: "In lavorazione", color: "bg-blue-100 text-blue-800", step: 1 },
  pronto_ritiro: { label: "Pronto ritiro", color: "bg-green-100 text-green-800", step: 2 },
  attesa_pagamento: { label: "Attesa pagamento", color: "bg-orange-100 text-orange-800", step: 3 },
  completata: { label: "Completata", color: "bg-gray-100 text-gray-800", step: 4 },
};
