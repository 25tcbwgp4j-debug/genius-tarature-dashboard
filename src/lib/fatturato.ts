// FATTURATO (scontrini + fatture) e REPORT MENSILE PER IL COMMERCIALISTA — 01/10/2026, solo amministratore.
// Chiamate al backend via proxy /api/backend (il JWT lo aggiunge il proxy dal cookie).

export type Metodo = "contanti" | "pos" | "bonifico" | "paypal" | "stripe";
export type ImportiMetodo = Record<Metodo, number>;
/** Divisione per attività: tarature (laboratorio F-GAS) / Apple (riparazioni, vendite, accessori) / da classificare */
export type Categoria = "tarature" | "apple" | "da_classificare";
export type ImportiCategoria = Record<Categoria, number>;
interface ConCategorie { cat: ImportiCategoria; cat_scontrini: ImportiCategoria; cat_fatture: ImportiCategoria }
export interface DaClassificare { giorno: string; documento: string; numero: string; cliente: string; descrizione: string; importo: number }

export interface FattGiorno extends ConCategorie {
  giorno: string;
  scontrini: number; fatture: number; totale: number; imponibile: number; iva: number;
  n_scontrini: number; n_annulli: number; n_fatture: number; n_note_credito: number; note_credito: number;
  pagamenti: ImportiMetodo; pag_scontrini: ImportiMetodo; pag_fatture: ImportiMetodo;
  rt: number | null; differenza_rt: number | null;
  /** giorno di chiusura del negozio (04/10/2026): etichetta del motivo */
  chiuso?: string;
}
export interface FattMese extends ConCategorie {
  mese: string;
  scontrini: number; fatture: number; totale: number; imponibile: number; iva: number;
  n_scontrini: number; n_fatture: number; n_note_credito: number; note_credito: number;
  pagamenti: ImportiMetodo; pag_scontrini: ImportiMetodo; pag_fatture: ImportiMetodo;
  giorni_attivi: number; media_giorno: number; anno_prima?: number | null;
}
export interface FattTotali extends ConCategorie {
  scontrini: number; fatture: number; totale: number; imponibile: number; iva: number; note_credito: number;
  n_scontrini: number; n_annulli: number; n_fatture: number; n_note_credito: number;
  giorni_attivi: number; media_giorno: number; scontrino_medio: number; fattura_media: number;
  /** giorni del calendario fino a oggi: lavorati e di chiusura (04/10/2026) */
  giorni_lavorati?: number; giorni_chiusi?: number;
  pagamenti: ImportiMetodo; pag_scontrini: ImportiMetodo; pag_fatture: ImportiMetodo;
  giorno_migliore: { giorno: string; totale: number } | null;
}
export interface FattStatistiche {
  societa: string; dal: string; al: string;
  totali: FattTotali; giornaliero: FattGiorno[]; mensile: FattMese[];
  /** giorni di chiusura del periodo: giorno → motivo */
  chiusi?: Record<string, string>;
  confronto: null | { dal: string; al: string; scontrini: number; fatture: number; totale: number;
    var_totale_pct: number | null; var_scontrini_pct: number | null; var_fatture_pct: number | null };
  primo_dato: string | null; rt_totale: number; giorni_con_rt: number;
  da_classificare: DaClassificare[];
}
export interface ReportRiepilogo {
  mese: string; etichetta: string; totali: FattTotali; rt_totale: number; differenza_rt: number;
  giorni_differenza_rt: { giorno: string; scontrini: number; rt: number | null; differenza: number | null }[];
}
export interface ReportLink {
  zip_url: string; email_url?: string; email_a?: string; avvisi: string[];
  riepilogo: { nome_zip: string; pdf: number; xml: number; documenti_fattura: number; giornate_cassa: number; chiusure_z: number;
    totale: number; scontrini_totale: number; fatture_totale: number };
}

async function chiama<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/backend${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login?error=session_expired";
    const e = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof e.detail === "string" ? e.detail : (e.detail?.messaggio || `Errore ${res.status}`));
  }
  return res.json();
}

export function fatturatoStatistiche(dal: string, al: string, societa = "genius") {
  return chiama<FattStatistiche>(`/api/fatturato/statistiche?dal=${dal}&al=${al}&societa=${societa}`);
}
export function reportCommercialistaRiepilogo(mese: string, societa = "genius") {
  return chiama<ReportRiepilogo>(`/api/fatturato/report-commercialista/riepilogo?mese=${mese}&societa=${societa}`);
}
/** Genera lo ZIP del mese sul server e restituisce il link di download (valido 1 ora); con email=true anche la bozza .eml. */
export function reportCommercialistaLink(mese: string, email = false, societa = "genius") {
  return chiama<ReportLink>(`/api/fatturato/report-commercialista/link?mese=${mese}&societa=${societa}&email=${email}`, { method: "POST" });
}

export const NOMI_METODI: Record<Metodo, string> = {
  contanti: "Contanti", pos: "POS", bonifico: "Bonifico", paypal: "PayPal", stripe: "Stripe",
};
export const CATEGORIE: Categoria[] = ["tarature", "apple", "da_classificare"];
export const NOMI_CATEGORIE: Record<Categoria, string> = { tarature: "Tarature", apple: "Apple (non tarature)", da_classificare: "Da classificare" };
export const METODI: Metodo[] = ["contanti", "pos", "bonifico", "paypal", "stripe"];
