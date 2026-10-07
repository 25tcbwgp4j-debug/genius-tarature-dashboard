// PAGAMENTI STRIPE RICEVUTI (07/10/2026): avviso in tutta la dashboard come per i bonifici → /api/incassi/stripe/avvisi
import { fetchAPI } from "@/lib/api";

export interface StripeDoc {
  tipo: "sessione" | "proforma" | "fattura";
  label: string;
  url: string;
  stato?: string | null;
}

export interface StripeAvviso {
  id: string;
  codice: string;
  data: string;
  importo: number;
  cliente: string;
  email?: string | null;
  abbinato: StripeDoc[];
  /** true = registrato automaticamente su sessione / pro forma / fattura */
  riconciliato: boolean;
  /** motivo per cui il pagamento NON è stato abbinato (avviso rosso) */
  errore: string | null;
  stato: string;
  esito: string | null;
  prossimo_passo: { testo: string; url?: string } | null;
}

export const stripeAvvisi = (): Promise<{ avvisi: StripeAvviso[] }> => fetchAPI("/api/incassi/stripe/avvisi", {}, false);
export const stripeVisto = (id: string): Promise<{ ok: boolean }> =>
  fetchAPI(`/api/incassi/stripe/avvisi/${id}/visto`, { method: "POST", body: "{}" });
