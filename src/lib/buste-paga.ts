// BUSTE PAGA — lavoro domestico (CCNL Collaboratori familiari), 16/10/2026. Solo amministratore.
// Chiamate al backend /api/buste-paga tramite fetchAPI (proxy /api/backend col JWT dal cookie).

import { fetchAPI } from "@/lib/api";

const PROXY = "/api/backend";

export type Causale = "lavoro" | "ferie" | "festivita" | "malattia" | "permesso_retribuito" | "assenza_non_retribuita" | "trasferta" | "non_richiesto";
export const CAUSALI: { codice: Causale; label: string }[] = [
  { codice: "lavoro", label: "Lavoro" },
  { codice: "non_richiesto", label: "Ore pattuite non richieste" },
  { codice: "ferie", label: "Ferie" },
  { codice: "festivita", label: "Festività" },
  { codice: "malattia", label: "Malattia" },
  { codice: "permesso_retribuito", label: "Permesso retribuito" },
  { codice: "trasferta", label: "Trasferta" },
  { codice: "assenza_non_retribuita", label: "Assenza non retribuita" },
];
export const GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"] as const;
export type Giorno = (typeof GIORNI)[number];
export const GIORNI_LABEL: Record<Giorno, string> = { lun: "Lunedì", mar: "Martedì", mer: "Mercoledì", gio: "Giovedì", ven: "Venerdì", sab: "Sabato", dom: "Domenica" };

export interface BpDatore {
  id: string; cognome: string; nome: string; codice_fiscale: string; data_nascita: string | null; luogo_nascita: string | null;
  indirizzo: string | null; cap: string | null; comune: string | null; provincia: string | null; luogo_lavoro: string | null;
  santo_patrono: string; tipo: string; email: string | null; telefono: string | null; note: string | null; attivo: boolean;
}
export interface BpDocumento { tipo: string; numero: string; scadenza: string | null; note?: string }
export type BpOrario = Partial<Record<Giorno, { ore: number; dalle?: string; alle?: string }>>;
export interface BpAvviso { tipo: "contratto" | "permesso_soggiorno" | "documento"; livello: "alto" | "medio"; scadenza: string; giorni: number; testo: string; lavoratore_id?: string }
export interface BpLavoratore {
  id: string; datore_id: string; cognome: string; nome: string; codice_fiscale: string; data_nascita: string | null;
  luogo_nascita: string | null; cittadinanza: string | null; domicilio: string | null; email: string | null; telefono: string | null;
  iban: string | null; documenti: BpDocumento[]; mansione: string | null; livello: string | null; convivente: boolean;
  tipo_contratto: "determinato" | "indeterminato"; data_assunzione: string; data_fine: string | null;
  paga_oraria: number; ore_settimanali: number; orario_tipo: BpOrario; rapporto_inps: string | null; sede_inps: string | null;
  note_contratto: string | null; stato: "attivo" | "cessato"; data_cessazione: string | null; motivo_cessazione: string | null;
  avvisi?: BpAvviso[];
}
export interface BpPresenza {
  data: string; causale: Causale | ""; ore_ordinarie: number; ore_extra_diurne: number; ore_extra_notturne: number;
  ore_extra_festive: number; note: string | null;
  // solo lettura (calcolati dal backend)
  salvata?: boolean; fuori_rapporto?: boolean; festivita?: string | null; giorno?: string; ore_pattuite?: number;
}
export type StatoBusta = "bozza" | "confermata" | "pagata";
export interface BpBustaBreve { id: string; stato: StatoBusta; netto?: number; data_pagamento?: string | null; riferimento_bonifico?: string | null }
export interface BpPresenzeMese {
  righe: BpPresenza[]; salvate: number; periodo: { dal: string; al: string } | null; busta: BpBustaBreve | null; bloccata: boolean;
}
export interface BpVoce { codice: string; descrizione: string; quantita: number; unita: string; unitario: number; importo: number; nota: string; ore_inps: number }
export interface BpRatei {
  tredicesima: { rateo_mese: number; maturata_anno: number; erogata_anno: number };
  ferie: { maturate_mese: number; godute_mese: number; maturate_tot: number; godute_tot: number; liquidate?: number; residue: number };
  permessi: { maturati_mese: number; goduti_mese: number; maturati_tot: number; goduti_tot: number; liquidati?: number; residui: number };
  tfr: { quota_mese: number; progressivo: number; liquidato: number; maturato_anno?: number };
  malattia: { giorni_anno: number; giorni_retribuiti_anno: number; limite: number };
}
export interface BpContributiMese {
  fascia: string | null; contributo_orario_totale: number; quota_lavoratore_oraria: number; totale: number;
  a_carico_lavoratore: number; a_carico_datore: number; addizionale_td_percent: number; addizionale_td: number; da_verificare: boolean;
}
export interface BpCalcolo {
  anno: number; mese: number; periodo: { dal: string; al: string } | null; cessazione: boolean; mese_utile: boolean;
  voci: BpVoce[]; ore_retribuite: number; lordo: number; trattenuta_inps: number; netto: number; ratei: BpRatei;
  contributi: BpContributiMese; costo_datore: number; avvisi: string[]; stato?: StatoBusta;
}
export interface BpBustaRiga {
  id: string; anno: number; mese: number; stato: StatoBusta; ore_retribuite: number; lordo: number; trattenuta_inps: number; netto: number;
  data_pagamento: string | null; riferimento_bonifico: string | null; confermata_il: string | null;
}
export interface BpTrimestre {
  trimestre: number; mesi: number[]; ore_retribuite: number; contributi_totali: number; quota_lavoratore: number; quota_datore: number;
  addizionale_td: number; da_versare: number; scadenza: string; nota: string; stati: string[];
}
export interface BpContributi {
  anno: number; trimestri: BpTrimestre[]; tempo_determinato: boolean;
  mesi: { mese: number; stato: string; ore_retribuite: number; lordo: number; trattenuta_inps: number; contributi: BpContributiMese }[];
}
export interface BpTariffa {
  id?: string; anno: number; fascia: "fino_24" | "oltre_24"; retrib_oraria_min: number | null; retrib_oraria_max: number | null;
  contributo_orario_totale: number; quota_lavoratore: number; addizionale_td_percent: number; cuaf: boolean; da_verificare: boolean; note_fonte: string | null;
}
export interface BpDichiarazione {
  anno: number; mesi: number[]; retribuzione_lorda: number; tfr_liquidato: number; totale_lordo: number; contributi_lavoratore: number;
  netto: number; tfr_maturato_anno: number; tfr_progressivo: number; ore_retribuite: number;
}

const q = (p: Record<string, string | number>) => new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)])).toString();

export const bpDatori = (): Promise<{ datori: BpDatore[] }> => fetchAPI("/api/buste-paga/datori");
export const bpLavoratori = (datoreId = ""): Promise<{ lavoratori: BpLavoratore[] }> =>
  fetchAPI(`/api/buste-paga/lavoratori${datoreId ? `?${q({ datore_id: datoreId })}` : ""}`);
export const bpNuovoLavoratore = (b: Partial<BpLavoratore>): Promise<BpLavoratore> =>
  fetchAPI("/api/buste-paga/lavoratori", { method: "POST", body: JSON.stringify(b) });
export const bpModificaLavoratore = (id: string, b: Partial<BpLavoratore>): Promise<BpLavoratore> =>
  fetchAPI(`/api/buste-paga/lavoratori/${id}`, { method: "PUT", body: JSON.stringify(b) });
export const bpNuovoDatore = (b: Partial<BpDatore>): Promise<BpDatore> =>
  fetchAPI("/api/buste-paga/datori", { method: "POST", body: JSON.stringify(b) });
export const bpModificaDatore =(id: string, b: Partial<BpDatore>): Promise<BpDatore> =>
  fetchAPI(`/api/buste-paga/datori/${id}`, { method: "PUT", body: JSON.stringify(b) });

export const bpPresenze = (lavoratoreId: string, anno: number, mese: number): Promise<BpPresenzeMese> =>
  fetchAPI(`/api/buste-paga/presenze?${q({ lavoratore_id: lavoratoreId, anno, mese })}`, { cache: "no-store" });
export const bpSalvaPresenze = (lavoratoreId: string, anno: number, mese: number, righe: BpPresenza[]): Promise<{ ok: boolean; salvate: number; tolte: number }> =>
  fetchAPI("/api/buste-paga/presenze", { method: "PUT", body: JSON.stringify({ lavoratore_id: lavoratoreId, anno, mese, righe }) });

export const bpCalcola = (lavoratoreId: string, anno: number, mese: number): Promise<{ calcolo: BpCalcolo; salvata: BpBustaRiga | null }> =>
  fetchAPI("/api/buste-paga/calcola", { method: "POST", body: JSON.stringify({ lavoratore_id: lavoratoreId, anno, mese }) });
export const bpSalvaBusta = (lavoratoreId: string, anno: number, mese: number, conferma: boolean): Promise<BpBustaRiga> =>
  fetchAPI("/api/buste-paga/buste", { method: "POST", body: JSON.stringify({ lavoratore_id: lavoratoreId, anno, mese, conferma }) });
export const bpRiportaInBozza = (id: string): Promise<BpBustaRiga> => fetchAPI(`/api/buste-paga/buste/${id}/bozza`, { method: "POST" });
export const bpSegnaPagata = (id: string, data_pagamento: string, riferimento_bonifico: string): Promise<BpBustaRiga> =>
  fetchAPI(`/api/buste-paga/buste/${id}/pagata`, { method: "POST", body: JSON.stringify({ data_pagamento, riferimento_bonifico }) });
export const bpAnnullaPagamento = (id: string): Promise<BpBustaRiga> => fetchAPI(`/api/buste-paga/buste/${id}/annulla-pagamento`, { method: "POST" });
export const bpStorico = (lavoratoreId: string, anno = 0): Promise<{ buste: BpBustaRiga[] }> =>
  fetchAPI(`/api/buste-paga/buste?${q({ lavoratore_id: lavoratoreId, anno })}`, { cache: "no-store" });

export const bpContributi = (lavoratoreId: string, anno: number): Promise<BpContributi> =>
  fetchAPI(`/api/buste-paga/contributi?${q({ lavoratore_id: lavoratoreId, anno })}`, { cache: "no-store" });
export const bpDichiarazione = (lavoratoreId: string, anno: number): Promise<BpDichiarazione> =>
  fetchAPI(`/api/buste-paga/dichiarazione?${q({ lavoratore_id: lavoratoreId, anno })}`, { cache: "no-store" });

export const bpTariffe = (): Promise<{ tariffe: BpTariffa[] }> => fetchAPI("/api/buste-paga/tariffe");
export const bpSalvaTariffe = (tariffe: BpTariffa[], elimina: string[] = []): Promise<{ tariffe: BpTariffa[]; salvate: number }> =>
  fetchAPI("/api/buste-paga/tariffe", { method: "PUT", body: JSON.stringify({ tariffe, elimina }) });
export const bpAvvisi = (): Promise<{ avvisi: BpAvviso[]; tariffe_da_verificare: boolean; tariffe_mancanti: boolean }> =>
  fetchAPI("/api/buste-paga/avvisi", { cache: "no-store" });

/** URL apribili dal browser (il proxy aggiunge il JWT). */
export const bpUrlPdfBusta = (lavoratoreId: string, anno: number, mese: number, download = false) =>
  `${PROXY}/api/buste-paga/buste/pdf?${q({ lavoratore_id: lavoratoreId, anno, mese, ...(download ? { download: "true" } : {}) })}`;
export const bpUrlPdfDichiarazione = (lavoratoreId: string, anno: number) =>
  `${PROXY}/api/buste-paga/dichiarazione/pdf?${q({ lavoratore_id: lavoratoreId, anno })}`;
