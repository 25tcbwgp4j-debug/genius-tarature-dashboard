// SCHEDE DI ASSISTENZA Apple (ex FileMaker) — client delle API /api/assistenza (02/10/2026).
import { fetchAPI } from "@/lib/api";
import type { EstimateLine } from "@/lib/assistenza-preventivo";

export type StatoScheda = "in_arrivo" | "da_preventivare" | "preventivo_inviato" | "accettato" | "rifiutato" | "pronto" | "consegnato" | "annullata";
export interface Fase { il: string; operatore?: string | null; sede?: string | null }
export interface SchedaBreve {
  id: string; numero: number; sigla: string; origine: string; sola_lettura: boolean; azienda: string | null; nominativo: string | null;
  telefono: string | null; email: string | null; prodotto: string | null; modello: string | null; seriale: string | null; difetto: string | null;
  stato: StatoScheda; preventivo_esito: string; preventivo_totale: number | null; totale_lavorazione: number | null; acconto: number | null;
  ritirato: string | null; consegna_modo: string | null; tecnico: string | null; fasi: Record<string, Fase>; created_at: string;
}
export interface Evento { id: string; tipo: string; descrizione: string; operatore: string | null; creato_da: string | null; created_at: string; dati?: Record<string, unknown> }
export interface Anagrafica { id: string; denominazione: string; piva?: string | null; cf?: string | null; telefono?: string | null; email?: string | null;
  referente?: string | null; indirizzo?: string | null; cap?: string | null; comune?: string | null; provincia?: string | null }
export interface Scheda extends SchedaBreve {
  anagrafica_id: string | null; referente: string | null; telefono_referente: string | null; indirizzo_spedizione: string | null; imei: string | null;
  acquistato_il: string | null; anno_garanzia: string | null; password_dispositivo: string | null; apple_id: string | null; password_apple_id: string | null;
  accessori: string | null; note: string | null; note_interne: string | null; preventivo_righe: EstimateLine[]; preventivo_testo: string | null;
  lavorazione: string | null; esito: string | null; ricambi: string | null; pagamento_modo: string | null; operatore_accettazione: string | null;
  scontrino_id: string | null; fattura_id: string | null; documento_id: string | null; numero_interno: string | null; token_pubblico: string;
  eventi: Evento[]; preventivi: { id: string; tipo: string; testo: string; totale: number; inviato_a: string | null; inviato_il: string | null; operatore: string | null; created_at: string }[];
  spedizioni: { id: string; carrier: "UPS" | "DHL" | null; direction: string; tracking: string; pickup_prn: string | null; pickup_date: string | null;
    pickup_location: "cliente" | "lab" | null; status: string | null; test_mode: boolean; tracking_url: string | null; created_at: string; pickup_error: string | null;
    cost: number | null }[];
  precedente: { id: string; sigla: string } | null; successiva: { id: string; sigla: string } | null;
  collegamenti: { scontrino?: { id: string; stato: string; totale: number } | null; fattura?: { id: string; numero: string | null; stato: string; totale: number } | null;
    documento?: { id: string; sigla: string; stato: string; totale: number } | null };
  anagrafica: Anagrafica | null; etichetta_stato: string; prova: boolean;
}
export interface ConfigAssistenza { operatori_abilitati: boolean; numerazione_live: boolean; ultimo_numero_filemaker: number | null; admin: boolean;
  visibile: boolean; email_test: string | null; stati: { codice: StatoScheda; etichetta: string }[] }
export interface VoceListino { id: string; label: string; intervention: string; price: number | null; is_shipping: boolean }
export interface Coppia { id: string; label: string; first_line: { t: string; nota?: string }; second_line: { t: string; nota?: string } }
export interface Seriale { seriale: string; codice: string | null; modello: string | null; famiglia: string | null; visti: number; nota: string | null;
  precedenti: SchedaBreve[]; prezzi?: { intervention: string; price: number; basis: string; jobs: number }[] }
export interface Esito { prova?: boolean; mail?: string; whatsapp?: string }

const j = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const assConfig = (): Promise<ConfigAssistenza> => fetchAPI("/api/assistenza/config");
export const assSetConfig = (b: { operatori_abilitati: boolean }): Promise<ConfigAssistenza> => fetchAPI("/api/assistenza/config", { method: "PATCH", body: JSON.stringify(b) });
export const assElenco = (q: string, stato: string, origine = "", limit = 150, offset = 0): Promise<{ schede: SchedaBreve[]; totale: number }> =>
  fetchAPI(`/api/assistenza/schede?q=${encodeURIComponent(q)}&stato=${stato}&origine=${origine}&limit=${limit}&offset=${offset}`);
export const assContatori = (): Promise<{ contatori: Record<string, number> }> => fetchAPI("/api/assistenza/contatori");
export const assPerNumero = (n: string): Promise<{ id: string; sigla: string; esatta: boolean }> => fetchAPI(`/api/assistenza/schede/numero/${encodeURIComponent(n)}`);
export const assScheda = (id: string): Promise<Scheda> => fetchAPI(`/api/assistenza/schede/${id}`);
export const assCrea = (b: Record<string, unknown>): Promise<Scheda & { esiti: Record<string, unknown> }> => fetchAPI("/api/assistenza/schede", j(b));
export const assModifica = (id: string, b: Record<string, unknown>): Promise<Scheda> => fetchAPI(`/api/assistenza/schede/${id}`, { method: "PATCH", body: JSON.stringify(b) });
export const assAzione = (id: string, azione: string, b: Record<string, unknown>) => fetchAPI(`/api/assistenza/schede/${id}/${azione}`, j(b));
export const assAnteprimaMail = (id: string, b: Record<string, unknown>): Promise<{ tipo: string; oggetto: string; corpo: string; prova: boolean; destinatario: string | null; whatsapp: string }> =>
  fetchAPI(`/api/assistenza/anteprima-mail/${id}`, j(b));
export const assListino = (): Promise<{ voci: VoceListino[]; coppie: Coppia[] }> => fetchAPI("/api/assistenza/listino");
export const assSeriale = (s: string): Promise<Seriale> => fetchAPI(`/api/assistenza/seriale?s=${encodeURIComponent(s)}`);
export const assClienti = (q: string): Promise<{ clienti: Anagrafica[] }> => fetchAPI(`/api/assistenza/clienti?q=${encodeURIComponent(q)}`);
export const assStessoModello = (id: string): Promise<{ criterio: string; schede: (SchedaBreve & { preventivo_testo: string | null })[] }> =>
  fetchAPI(`/api/assistenza/stesso-modello?scheda_id=${id}`);
export const assPreventivi = (q: string): Promise<{ preventivi: (SchedaBreve & { preventivo_testo: string | null })[]; sintesi: { n: number; min: number; max: number; mediana: number } | null }> =>
  fetchAPI(`/api/assistenza/preventivi?q=${encodeURIComponent(q)}`);
export const assPdfUrl = (id: string, tipo: "cliente" | "interna" = "cliente") => `/api/backend/api/assistenza/schede/${id}/pdf?tipo=${tipo}`;
/** Pagina pubblica di tracciamento (servita dal backend: nessun login, nessun dato personale). */
export const assTrackUrl = (token: string) => `${process.env.NEXT_PUBLIC_API_URL || "https://tarature-api-production.up.railway.app"}/api/assistenza/pubblico/${token}/pagina`;
export const assEtichettaUrl = (id: string) => `/api/backend/api/assistenza/schede/${id}/etichetta.pdf`;

export const COLORE_STATO: Record<string, string> = {
  in_arrivo: "bg-slate-100 text-slate-800 border-slate-300",
  da_preventivare: "bg-amber-100 text-amber-900 border-amber-300",
  preventivo_inviato: "bg-sky-100 text-sky-900 border-sky-300",
  accettato: "bg-indigo-100 text-indigo-900 border-indigo-300",
  rifiutato: "bg-rose-100 text-rose-900 border-rose-300",
  pronto: "bg-emerald-100 text-emerald-900 border-emerald-300",
  consegnato: "bg-gray-100 text-gray-600 border-gray-300",
  annullata: "bg-gray-100 text-gray-400 border-gray-300 line-through",
};
export const ETICHETTA_STATO: Record<string, string> = {
  in_arrivo: "In arrivo", da_preventivare: "Da preventivare", preventivo_inviato: "Preventivo inviato", accettato: "In lavorazione",
  rifiutato: "Rifiutato", pronto: "Pronto", consegnato: "Consegnato", annullata: "Annullata",
};
export const FASI: [string, string][] = [["accettazione", "Accettazione"], ["preventivo", "Preventivo"], ["aggiornamento", "Aggiorn."],
  ["pronto", "Pronto"], ["pagamento", "Pagamento"], ["consegna", "Consegna"]];

export function dataOra(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export const eur = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v) || 0);
