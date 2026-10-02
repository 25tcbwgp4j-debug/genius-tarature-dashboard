// BONIFICI IN ENTRATA sul conto SumUp (02/10/2026): pulsante rosso in tutta la dashboard → /api/bonifici
import { fetchAPI } from "@/lib/api";

export type BonTipo = "fattura" | "fatture" | "bozza" | "proforma" | "pf" | "sessione" | "ordine" | "preventivo";

export interface BonProposta {
  tipo: BonTipo;
  id: string | null;
  ids?: string[];
  numero: string | null;
  nome: string | null;
  importo: number;
  data?: string | null;
  session_id?: string | null;
  punti?: number;
  perche?: string;
  manuale?: boolean;
}

export interface Bonifico {
  id: string;
  codice: string;
  data: string;
  data_valuta: string | null;
  importo: number;
  ordinante: string | null;
  causale: string | null;
  iban: string | null;
  stato: string;
  proposte: BonProposta[];
  proposta_accettata: BonProposta | null;
  accettata_da?: string | null;
  esito?: string | null;
}

export interface BonControllo {
  id: string;
  eseguito_il: string;
  origine: string;
  fonte: string | null;
  esito: "ok" | "errore" | "mancato";
  letti: number;
  nuovi: number;
  gia_incassati: number;
  nota: string | null;
}

export interface BonStato {
  da_gestire: number;
  ultimo_controllo: BonControllo | null;
  prossimo_controllo: string | null;
  orari: string;
}

export const NOME_TIPO: Record<BonTipo, string> = {
  fattura: "Fattura", fatture: "Fatture", bozza: "Fattura in bozza", proforma: "Pro forma (sessione)", pf: "Pro forma",
  sessione: "Sessione di taratura", ordine: "Ordine cliente", preventivo: "Preventivo",
};

export const bonStato = (): Promise<BonStato> => fetchAPI("/api/bonifici/stato");
export const bonElenco = (): Promise<BonStato & { bonifici: Bonifico[]; controlli: BonControllo[] }> => fetchAPI("/api/bonifici");
export const bonDettaglio = (id: string): Promise<{ bonifico: Bonifico }> => fetchAPI(`/api/bonifici/${id}`);
export const bonCerca = (q: string): Promise<{ documenti: BonProposta[] }> => fetchAPI(`/api/bonifici/cerca?q=${encodeURIComponent(q)}`);
export const bonAccetta = (id: string, proposta: BonProposta, manuale = false): Promise<{ url: string; bonifico: Bonifico }> =>
  fetchAPI(`/api/bonifici/${id}/accetta`, { method: "POST", body: JSON.stringify({ proposta, manuale }) });
export const bonAnnullaAccettazione = (id: string) => fetchAPI(`/api/bonifici/${id}/annulla-accettazione`, { method: "POST", body: "{}" });
export const bonIgnora = (id: string, motivo: string) =>
  fetchAPI(`/api/bonifici/${id}/ignora`, { method: "POST", body: JSON.stringify({ motivo }) });
export const bonConferma = (id: string, body: { operatore: string; emetti?: boolean; crea_fattura?: boolean }):
  Promise<{ bonifico: Bonifico; fattura_id?: string; invio?: { ok: boolean; numero?: string; errore?: string } }> =>
  fetchAPI(`/api/bonifici/${id}/conferma`, { method: "POST", body: JSON.stringify(body) });
export const bonControlla = (): Promise<BonStato & { live: boolean; nota?: string; nuovi?: number }> =>
  fetchAPI("/api/bonifici/controlla", { method: "POST", body: "{}" });
