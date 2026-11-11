// 11/11/2026 — GSX Apple via ponte sul server (backend/gsx_api.py): dati del dispositivo e ricambi dal seriale.
// 12/11/2026 — lettura COMPLETA alla Decodifica (dispositivo + ricambi con preventivo pronto + riparazioni GSX), salvata nella
// scheda (campo gsx) così resta parte della scheda; confronto col listino (Prezzi ufficiali); schede del gestionale col seriale.
import { fetchAPI } from "@/lib/api";

export type GsxDispositivo = {
  seriale: string; modello: string | null; configurazione: string | null; configurazione_completa: string | null;
  famiglia_apple: string | null; immagine: string | null; imei: string | null; imei2: string | null;
  garanzia: string | null; garanzia_codice: string | null; giorni_garanzia: number | null; fine_copertura: string | null;
  applecare: string | null; data_acquisto: string | null; paese_acquisto: string | null;
  ricambi_coperti: boolean | null; manodopera_coperta: boolean | null; coperture: string[]; dati_nascosti: boolean;
  prima_attivazione: string | null; sbloccato_operatore: boolean | null; operatore_telefonico: string | null; prestito: boolean | null;
  pratiche_apple: { caseId?: string; createdDateTime?: string; summary?: string }[]; sostituzioni: GsxSostituzione[]; messaggi: string[];
  prodotto_menu: string | null; famiglia_menu: string | null; anno: number | null; letto_il: string;
  garanzia_legale?: { dal: string; fonte: string; fino: string; attiva: boolean; giorni: number; nota: string } | null;
  /** 12/11/2026: altri dati Apple utili al banco */
  dep?: boolean | null; modalita_riparazione?: boolean | null; ship_mode?: boolean | null; codice_config?: string | null; linea_prodotto?: string | null;
  sold_to_nome?: string | null; garanzia_limitata?: boolean | null; tipo_contratto?: string | null; contratto_fine?: string | null; registrato_il?: string | null;
  inizio_copertura?: string | null; personalizzato?: boolean | null;
  codici_cs?: { codice: string; nota?: string | null; ricambi?: boolean | null; manodopera?: boolean | null }[];
  consumer_law?: { tipo?: string | null; pop_obbligatoria?: boolean | null; ricambi_ammessi?: string | null }[];
  applecare_contratti?: unknown[]; messaggi_tipo?: { tipo: string; testo: string }[];
  /** il dispositivo è stato SOSTITUITO da Apple: il seriale nuovo */
  sostituito?: { seriale_nuovo: string; imei_nuovo: string | null; data: string | null; stato: string | null } | null;
  trova_il_mio_probabile?: boolean;
  schede_gestionale?: { id: string; sigla: string; stato: string | null; prodotto: string | null; modello: string | null; creata: string }[];
  /** presenti solo nella lettura completa (Decodifica della scheda) */
  ricambi?: GsxRicambi | null; riparazioni?: GsxRiparazione[] | null; errori?: Record<string, string> | null;
  idoneita?: GsxIdoneita | null; articoli?: { programmi: GsxArticolo[]; del_modello: GsxArticolo[]; totale: number; letto_il: string } | null;
};

export type GsxSostituzione = { data: string | null; stato: string | null; codice_stato?: string; seriale_vecchio: string | null; imei_vecchio: string | null; seriale_nuovo: string | null; imei_nuovo: string | null };
export type GsxRiparazioneDettaglio = {
  notifica: string | null; stato: string | null; stato_il: string | null; tipo: string | null; copertura: string | null; applecare: string | null; consumer_law: string | null;
  riferimento: string | null; po: string | null; tecnico: string | null; creata: string | null; chiusa: string | null; servizio_reso_il: string | null;
  totale: number | null; imponibile: number | null; fattura_disponibile: boolean | null; seriale_nuovo: string | null; imei_nuovo: string | null;
  ricambi: { codice: string | null; usato: string | null; descrizione: string | null; tipo: string | null; a_pagamento: boolean | null; prezzo_netto: number | null; copertura: string | null;
    ordine: string | null; stato_ordine: string | null; consegna_tracking: string | null; consegna_il: string | null; corriere: string | null;
    reso_stato: string | null; reso_codice: string | null; reso_tracking: string | null; reso_ordine: string | null; reso_ricevuto_il: string | null; seriale_nuovo: string | null; difetto: string }[];
  messaggi: string[]; note: { tipo: string | null; il: string | null; da: string | null; testo: string | null }[]; errore?: string;
};
export type GsxRiparazione = { id: string; tipo: string; stato: string; codice_stato: string; creata: string | null; chiusa: string | null; po: string | null; applecare_consumato: boolean | null; cliente: string; difetti: string[]; ricambi: { codice: string; descrizione: string }[]; aperta?: boolean; dettaglio?: GsxRiparazioneDettaglio | null };
export type GsxDifetti = { seriale: string; totale_difetti: number; componenti: { codice: string; componente: string; difetti: { codice: string; descrizione: string }[] }[] };
export const gsxDifetti = (s: string): Promise<GsxDifetti> => fetchAPI(`/api/assistenza/gsx/difetti?s=${encodeURIComponent(s)}`);
/** 12/11/2026: copertura dell'intervento scelta nella sezione «Intervento» della scheda */
export type CoperturaScheda = { tipo: "apple" | "pagamento" | "danno" | "applecare_franchigia" | "programma"; franchigia?: number | null; nota?: string | null; scelta_da?: string | null; scelta_il?: string | null };
export const COPERTURE: { tipo: CoperturaScheda["tipo"]; nome: string; testo: string; copre: boolean | "apple" }[] = [
  { tipo: "apple", nome: "Come dice Apple", copre: "apple", testo: "La copertura la decide l'idoneità GSX: ricambio coperto → 0 €, altrimenti a pagamento." },
  { tipo: "programma", nome: "Programma Apple / garanzia sulla riparazione", copre: true, testo: "Programma di assistenza Apple per questo difetto, oppure garanzia sulla riparazione già fatta: al cliente 0 €." },
  { tipo: "applecare_franchigia", nome: "Danno accidentale con AppleCare+", copre: true, testo: "Ricambi coperti da AppleCare+: il cliente paga solo la franchigia (importo letto su GSX)." },
  { tipo: "danno", nome: "Danno accertato dal tecnico", copre: false, testo: "Liquido, urto, manomissione: la garanzia non vale, a pagamento anche se Apple indica il dispositivo in garanzia." },
  { tipo: "pagamento", nome: "A pagamento", copre: false, testo: "Fuori garanzia o il cliente paga a listino comunque." },
];
/** difetto Apple scelto nella scheda (componentissue), max 3 */
export type DifettoApple = { componentCode: string; componentDescription?: string | null; issueCode: string; issueDescription?: string | null; reproducibility?: string };
/** codici Apple di riproducibilità del difetto (repair/eligibility · repair/create) */
export const RIPRODUCIBILITA: [string, string][] = [["A", "non indicata"], ["B", "sempre (continuo)"], ["C", "a volte (intermittente)"], ["D", "dopo un po' (a caldo)"], ["E", "solo in certe condizioni"], ["F", "non riprodotto dal tecnico"]];
/** idoneità e copertura Apple (repair/eligibility) */
export type GsxIdoneita = {
  seriale: string; tipo: string; difetti: DifettoApple[]; copertura: string | null; codice_copertura: string | null; coperto: boolean;
  tecnico_obbligatorio: boolean | null; ricalcolo_prezzo: boolean | null; bloccata: boolean; blocchi: string[]; trova_il_mio: boolean; problema_software: boolean;
  esiti: { azione: string | null; tipo: string | null; sotto: string | null; messaggi: string[]; limiti_copertura: unknown[] }[];
  tipi_riparazione: { codice: string; nome: string; priorita: number | null; sotto: string | null }[];
  parti: { codice: string; coperto: boolean; a_pagamento: boolean | null; copertura: string | null; codice_copertura: string | null; tipo: string | null }[];
  stato_riparazione: string | null; letto_il: string;
};
export type GsxArticolo = { id: string; titolo: string; sommario: string | null; priorita: string | null; modificato_il: string | null; da_leggere: boolean | null; del_modello: boolean; programma: boolean };
export type GsxArticoli = { seriale: string; modello: string | null; programmi: GsxArticolo[]; del_modello: GsxArticolo[]; altri: GsxArticolo[]; totale: number; letto_il: string };
export const gsxIdoneita = (b: { s: string; difetti: DifettoApple[]; parti?: string[]; tipo?: string }): Promise<GsxIdoneita> =>
  fetchAPI(`/api/assistenza/gsx/idoneita`, { method: "POST", body: JSON.stringify(b) });
export const gsxSchedaIdoneita = <T,>(sid: string, b: { difetti?: DifettoApple[]; parti?: string[]; tipo?: string; operatore?: string | null }): Promise<T> =>
  fetchAPI(`/api/assistenza/gsx/scheda/${sid}/idoneita`, { method: "POST", body: JSON.stringify(b) });
export const gsxArticoli = (s: string, modello = ""): Promise<GsxArticoli> => fetchAPI(`/api/assistenza/gsx/articoli?s=${encodeURIComponent(s)}&modello=${encodeURIComponent(modello)}`);
export const gsxArticolo = (id: string): Promise<{ id: string; html: string }> => fetchAPI(`/api/assistenza/gsx/articolo?id=${encodeURIComponent(id)}`);
export const gsxKnownIssues = (): Promise<{ known_issues: { id: string; titolo: string; sommario: string; stato: string; risoluzione: string | null }[] }> => fetchAPI(`/api/assistenza/gsx/known-issues`);
export type GsxDiagnosi = {
  seriale: string; console: string | null; errore_test?: string | null; lanciare_test: string;
  test_disponibili: { id: string; nome: string; minuti: { minimum?: string; maximum?: string } }[];
  eventi: { evento: string; suite: string; esito: string; inizio: string; fine: string; canale: string; sistema: string; report_cliente: boolean; test: { nome: string; esito: string; codice: string }[] }[];
};

export type GsxRicambio = {
  codice: string; descrizione: string; categoria: string; esatta: boolean; variante: boolean; serializzato?: boolean;
  sostituito_da?: string | null; immagine?: string | null; codici_eee: string[];
  costo_stock?: number | null; costo_sostituzione?: number | null; opzioni_prezzo?: { voce: string; prezzo: number | null }[];
};

/** riga di preventivo pronta (stesso formato delle righe della scheda: testo, prezzo, «scontato da», nota recupero dati) */
export type GsxRigaPreventivo = { t: string; p: number; listino: number | null; nota: string | null; fonte?: string };

export type GsxPrincipale = {
  categoria: string; codice: string; descrizione: string; ipotesi: string; nota?: string | null; altri_codici: number;
  prezzi: { gsx?: number; costo?: number; proposto: number; listino: number };
  /** 12/11/2026: il LISTINO della pagina Prezzi ufficiali per lo stesso componente e il confronto con GSX di oggi */
  ufficiale?: { modello: string | null; prezzo: number | null; scontato_da: number | null; stato: string | null; costo_gsx: number | null; aggiornato_il: string | null; costo_diverso: boolean; prezzo_diverso: boolean } | null;
  preventivo?: { uno: GsxRigaPreventivo | null; due: GsxRigaPreventivo; due_touch_id: GsxRigaPreventivo | null; totale_2: number; etichetta: string } | null;
};

export type GsxRicambi = {
  principali: GsxPrincipale[];
  seriale: string; modello: string | null; configurazione: string | null; configurazione_riconosciuta: string[];
  categorie: Record<string, string>; scheda_logica: GsxRicambio | null; ricambi: GsxRicambio[]; costi_visibili: boolean; letto_il: string;
};

export const gsxDispositivo = (s: string): Promise<GsxDispositivo> => fetchAPI(`/api/assistenza/gsx/dispositivo?s=${encodeURIComponent(s)}`);
export const gsxRicambi = (s: string): Promise<GsxRicambi> => fetchAPI(`/api/assistenza/gsx/ricambi?s=${encodeURIComponent(s)}`);
export const gsxRiparazioni = (s: string): Promise<{ seriale: string; riparazioni: GsxRiparazione[] }> => fetchAPI(`/api/assistenza/gsx/riparazioni?s=${encodeURIComponent(s)}`);
export const gsxRiparazione = (id: string): Promise<{ id: string; dettaglio: Record<string, unknown>; cronologia: unknown }> => fetchAPI(`/api/assistenza/gsx/riparazione?id=${encodeURIComponent(id)}`);
export const gsxDiagnosi = (s: string): Promise<GsxDiagnosi> => fetchAPI(`/api/assistenza/gsx/diagnosi?s=${encodeURIComponent(s)}`);
export type GsxStatoTest = { seriale: string; stato: string | null; stato_it: string | null; test: string | null; suite: string | null; percento: number };
export const gsxAvviaTest = (s: string, suite: string): Promise<{ avviato: boolean; apple: unknown }> =>
  fetchAPI(`/api/assistenza/gsx/diagnosi/avvia`, { method: "POST", body: JSON.stringify({ s, suite }) });
export const gsxStatoTest = (s: string): Promise<GsxStatoTest> => fetchAPI(`/api/assistenza/gsx/diagnosi/stato?s=${encodeURIComponent(s)}`);
export const gsxReport = (evento: string): Promise<{ customerReportUrl?: string }> => fetchAPI(`/api/assistenza/gsx/report?evento=${encodeURIComponent(evento)}`);
/** lettura completa senza scheda (scheda nuova): dispositivo + ricambi con preventivo + riparazioni */
export const gsxCompleto = (s: string): Promise<GsxDispositivo> => fetchAPI(`/api/assistenza/gsx/completo?s=${encodeURIComponent(s)}`);
/** DECODIFICA sulla scheda esistente: legge GSX e lo SALVA nella scheda (gsx, modello, anno, prodotto, IMEI, seriale nuovo); torna la scheda aggiornata */
export const gsxAggiornaScheda = <T,>(sid: string, operatore?: string | null, s?: string | null): Promise<T> =>
  fetchAPI(`/api/assistenza/gsx/scheda/${sid}`, { method: "POST", body: JSON.stringify({ operatore: operatore || null, s: s || null }) });
export const gsxSincronizzaPrezzi = (): Promise<{ codici_listino: number; trovati_nel_catalogo: number; aggiornati: number; cambi: unknown[] }> =>
  fetchAPI(`/api/assistenza/gsx/catalogo/sincronizza-prezzi`, { method: "POST" });
