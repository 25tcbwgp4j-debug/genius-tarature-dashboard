// 11/11/2026 — GSX Apple via ponte sul server (backend/gsx_api.py): dati del dispositivo e ricambi dal seriale.
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
};

export type GsxSostituzione = { data: string | null; stato: string | null; codice_stato?: string; seriale_vecchio: string | null; imei_vecchio: string | null; seriale_nuovo: string | null; imei_nuovo: string | null };
export type GsxRiparazione = { id: string; tipo: string; stato: string; codice_stato: string; creata: string | null; chiusa: string | null; po: string | null; applecare_consumato: boolean | null; cliente: string; difetti: string[]; ricambi: { codice: string; descrizione: string }[] };
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

export type GsxPrincipale = {
  categoria: string; codice: string; descrizione: string; ipotesi: string; nota?: string | null; altri_codici: number;
  prezzi: { gsx?: number; costo?: number; proposto: number; listino: number };
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
export const gsxReport = (evento: string): Promise<{ customerReportUrl?: string }> => fetchAPI(`/api/assistenza/gsx/report?evento=${encodeURIComponent(evento)}`);
