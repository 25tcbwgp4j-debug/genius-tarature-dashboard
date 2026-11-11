// 11/11/2026 — GSX Apple via ponte sul server (backend/gsx_api.py): dati del dispositivo e ricambi dal seriale.
import { fetchAPI } from "@/lib/api";

export type GsxDispositivo = {
  seriale: string; modello: string | null; configurazione: string | null; configurazione_completa: string | null;
  famiglia_apple: string | null; immagine: string | null; imei: string | null; imei2: string | null;
  garanzia: string | null; garanzia_codice: string | null; giorni_garanzia: number | null; fine_copertura: string | null;
  applecare: string | null; data_acquisto: string | null; paese_acquisto: string | null;
  ricambi_coperti: boolean | null; manodopera_coperta: boolean | null; coperture: string[]; dati_nascosti: boolean;
  prima_attivazione: string | null; sbloccato_operatore: boolean | null; operatore_telefonico: string | null; prestito: boolean | null;
  pratiche_apple: { caseId?: string; createdDateTime?: string; summary?: string }[]; sostituzioni: unknown[]; messaggi: string[];
  prodotto_menu: string | null; famiglia_menu: string | null; anno: number | null; letto_il: string;
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
