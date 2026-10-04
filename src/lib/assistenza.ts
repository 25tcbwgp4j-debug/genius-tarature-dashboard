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
  // 05/10/2026 (§10, migr. 092)
  famiglia?: string | null; anno?: number | null; tecnico_verifica?: string | null; tecnico_riparazione?: string | null;
  verifica_stato?: "da_assegnare" | "in_corso" | "chiusa" | null; riparazione_stato?: string | null;
}
export interface Evento { id: string; tipo: string; descrizione: string; operatore: string | null; creato_da: string | null; created_at: string; dati?: Record<string, unknown> }
export interface Anagrafica { id: string; denominazione: string; piva?: string | null; cf?: string | null; telefono?: string | null; email?: string | null;
  referente?: string | null; indirizzo?: string | null; cap?: string | null; comune?: string | null; provincia?: string | null; paese?: string | null;
  sdi?: string | null; pec?: string | null; tipo_cliente?: "privato" | "azienda" | "rivenditore" | null; vuole_fattura?: boolean | null;
  cellulare?: string | null; cellulare_whatsapp?: string | null; email_contabilita?: string | null; email_altre?: string | null;
  sped_presso?: string | null; sped_indirizzo?: string | null; sped_cap?: string | null; sped_comune?: string | null; sped_provincia?: string | null;
  note_cliente?: string | null; origine?: string | null }
export interface SchedaCliente extends Anagrafica { schede: { id: string; sigla: string; prodotto: string | null; modello: string | null; difetto: string | null; stato: string; created_at: string }[] }
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
  // v2 (04-05/10/2026)
  famiglia: string | null; modello_fonte: string | null; modello_da_scheda: string | null; con_alimentatore: boolean | null;
  preventivo: { diagnosi?: string; note?: string } | null; preventivo_stato: string | null; preventivo_operatore: string | null;
  preventivo_inviato_il: string | null; preventivo_inviato_da: string | null; ricambi_stato: string | null; ricambi_arrivo_previsto: string | null;
  ricambi_fornitore: string | null; ricambi_nota: string | null; esito_motivo: string | null; tecnico_verifica: string | null; note_verifica: string | null;
  tecnico_riparazione: string | null; note_riparazione: string | null; spedizione_tipo: string | null; spedizione_importo: number | null;
  chiusura: string | null; consegna_corriere: "noi" | "cliente" | null;
  verifica_assegnata_il: string | null; verifica_assegnata_da: string | null; verifica_chiusa_il: string | null; verifica_chiusa_da: string | null;
  riparazione_assegnata_il: string | null; preventivo_risposta_canale: string | null; preventivo_risposta_il: string | null;
  avanzamento: Avanzamento; saldo: number; pagata: boolean; comunicazioni: Comunicazione[]; wa_linea_attiva: boolean;
  preventivo_totale: number | null;
}
export interface Passo { codice: string; etichetta: string; stato: "fatto" | "attuale" | "da_fare" | "saltato"; dettaglio: string }
export interface Avanzamento { passi: Passo[]; attuale: string | null; prossimo: { azione?: string; testo?: string } }
export interface Comunicazione { id: string; tipo: string; canale: "mail" | "whatsapp"; descrizione: string; created_at: string; operatore: string | null;
  esito: string | null; a: string | null; testo: string | null; link: string | null; oggetto: string | null }
export interface VoceProposta { id: string; intervento: string; ipotesi: string | null; descrizione: string; prezzo: number | null; scontato_da: number | null;
  nota: string | null; da_verificare: boolean; fonte: string | null; modello: string | null; modello_chiave?: string | null; aggiornato_il: string | null; tipo_ricambio: string | null }
export interface ModelloVoci { chiave: string; nome: string; anno: number | null; pollici: number | null; voci: number }
/** COMBO «1ª + 2ª ipotesi abbinate» dello stesso intervento e modello (+ 3ª aggiungibile) — 05/10/2026 §10.2 */
export interface Combo { modello_chiave: string | null; modello: string | null; intervento: string; etichetta: string;
  uno: VoceProposta | null; due: VoceProposta | null; tre: VoceProposta | null }
export interface Proposte { modello_chiave: string | null; famiglia: string | null;
  fonte: "modello" | "famiglia" | "tutte" | "vicino" | "ricerca" | "modello_scelto" | "filtro" | ""; nota?: string; vicini?: ModelloVoci[];
  voci: VoceProposta[]; combo: Combo[]; pollici_scheda?: number | null; anno_scheda?: number | null;
  filtri?: { pollici: number[]; anni: number[]; modelli: ModelloVoci[] };
  interventi: { codice: string; etichetta: string; voci: number }[] }
export interface GruppoProdotti { gruppo: string; famiglia: string; voci: string[] }
export interface FaseCruscotto { codice: string; etichetta: string; n: number; tecnici: { tecnico: string; n: number }[] }
export interface TestoStandard { id: string; titolo: string; categoria: string; uso: "cliente" | "interno"; famiglie: string[]; interventi: string[]; testo: string;
  prezzi_da_verificare: boolean }
export interface ConfigAssistenza { operatori_abilitati: boolean; numerazione_live: boolean; ultimo_numero_filemaker: number | null; admin: boolean;
  visibile: boolean; email_test: string | null; stati: { codice: StatoScheda; etichetta: string }[];
  famiglie: { codice: string; etichetta: string }[]; tecnici: { codice: string; nome: string; attivo: boolean }[]; spedizione_default: { ar?: number };
  prodotti?: GruppoProdotti[]; riparazione_stati?: { codice: string; etichetta: string }[]; canali_risposta?: { codice: string; etichetta: string }[] }
export interface VoceListino { id: string; label: string; intervention: string; price: number | null; is_shipping: boolean }
export interface Coppia { id: string; label: string; first_line: { t: string; nota?: string }; second_line: { t: string; nota?: string } }
export interface Seriale { seriale: string; codice: string | null; modello: string | null; famiglia: string | null; visti: number; nota: string | null;
  precedenti: SchedaBreve[]; prezzi?: { intervention: string; price: number; basis: string; jobs: number }[];
  /** da dove viene il modello proposto: «scheda_precedente» (stesso seriale già passato) o «seriale» (decodifica) */
  fonte: "scheda_precedente" | "seriale" | null; fonte_testo: string; da_scheda: string | null; decodificato: string | null; famiglia_menu: string | null;
  prodotto_menu?: string | null; anno?: number | null }
export interface Esito { prova?: boolean; mail?: string; whatsapp?: string; whatsapp_testo?: string; whatsapp_link?: string | null }

const j = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const assConfig = (): Promise<ConfigAssistenza> => fetchAPI("/api/assistenza/config");
export const assSetConfig = (b: { operatori_abilitati: boolean }): Promise<ConfigAssistenza> => fetchAPI("/api/assistenza/config", { method: "PATCH", body: JSON.stringify(b) });
export const assCruscotto = (): Promise<{ fasi: FaseCruscotto[]; tecnici: { codice: string; nome: string }[] }> => fetchAPI("/api/assistenza/cruscotto");
export const assElencoFase = (fase: string, tecnico = ""): Promise<{ schede: SchedaBreve[]; totale: number }> =>
  fetchAPI(`/api/assistenza/schede?${new URLSearchParams({ fase, tecnico, limit: "500" })}`);
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
export type DocPdf = "auto" | "ricevuta" | "preventivo" | "pronto" | "consuntivo" | "interna";
export const assDocUrl = (id: string, doc: DocPdf, scarica = false) => `/api/backend/api/assistenza/schede/${id}/pdf?doc=${doc}${scarica ? "&scarica=1" : ""}`;
export const assSchedaCliente = (id: string): Promise<SchedaCliente> => fetchAPI(`/api/assistenza/clienti/${id}`);
export const assSalvaCliente = (id: string | null, b: Partial<Anagrafica>): Promise<SchedaCliente> =>
  id ? fetchAPI(`/api/assistenza/clienti/${id}`, { method: "PATCH", body: JSON.stringify(b) }) : fetchAPI("/api/assistenza/clienti", j(b));
export const assProposte = (id: string, intervento = "", f: { q?: string; modello?: string; pollici?: string; anno?: string } = {}): Promise<Proposte> =>
  fetchAPI(`/api/assistenza/schede/${id}/proposte?${new URLSearchParams({ intervento, q: f.q || "", modello: f.modello || "", pollici: f.pollici || "", anno: f.anno || "" })}`);
export const assTesti = (famiglia = "", intervento = ""): Promise<{ testi: TestoStandard[] }> => fetchAPI(`/api/assistenza/testi?famiglia=${famiglia}&intervento=${intervento}`);
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
  in_arrivo: "In arrivo", da_preventivare: "Da preventivare", preventivo_inviato: "Preventivo inviato", accettato: "In riparazione",
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

export const DOCUMENTI_PDF: [DocPdf, string][] = [["ricevuta", "Ricevuta d'ingresso"], ["preventivo", "Preventivo"], ["pronto", "Pronto per il ritiro"],
  ["consuntivo", "Consuntivo con bonifico"], ["interna", "Scheda interna (solo per noi)"]];
export const FAMIGLIE_DEFAULT: { codice: string; etichetta: string }[] = [
  { codice: "iphone", etichetta: "iPhone" }, { codice: "ipad", etichetta: "iPad" }, { codice: "airpods", etichetta: "AirPods" },
  { codice: "ipod", etichetta: "iPod" }, { codice: "macbook_air", etichetta: "MacBook Air" }, { codice: "macbook_pro", etichetta: "MacBook Pro" },
  { codice: "macbook", etichetta: "MacBook" }, { codice: "imac", etichetta: "iMac" }, { codice: "mac_mini", etichetta: "Mac mini" },
  { codice: "mac_studio", etichetta: "Mac Studio" }, { codice: "mac_pro", etichetta: "Mac Pro" }, { codice: "watch", etichetta: "Apple Watch" },
  { codice: "altro_apple", etichetta: "Altro Apple" }, { codice: "non_apple", etichetta: "Non Apple" }];
export const SPEDIZIONI: [string, string][] = [["nessuna", "Nessuna"], ["ar", "A/R (ritiro e riconsegna)"], ["solo_ritiro", "Solo ritiro"], ["solo_ritorno", "Solo ritorno"]];
export const TIPI_CLIENTE: [string, string][] = [["privato", "Privato"], ["azienda", "Azienda"], ["rivenditore", "Rivenditore"]];
export const STATI_RIPARAZIONE: [string, string][] = [["in_corso", "In lavorazione"], ["attesa_ricambi", "Attesa ricambi"],
  ["aggiornamento_cliente", "Aggiornamento da fare al cliente"], ["piu_tempo", "Serve più tempo"],
  ["disabilitare_trova", "Disabilitare «Trova il mio dispositivo»"], ["finita", "Finita"]];
export const CANALI_RISPOSTA: [string, string][] = [["telefono", "Telefono"], ["whatsapp", "WhatsApp"], ["mail", "Mail"], ["negozio", "In negozio"], ["online", "Online"]];
/** Nome del tecnico dal codice (ALEX → Alex). */
export const nomeTecnico = (cod: string | null | undefined, tecnici: { codice: string; nome: string }[] = []) =>
  !cod ? "" : tecnici.find((t) => t.codice.toUpperCase() === cod.toUpperCase())?.nome || cod;
