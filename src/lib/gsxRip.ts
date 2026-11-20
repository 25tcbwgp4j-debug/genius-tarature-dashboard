// 20/11/2026 (OdL genius G-14) — RIPARAZIONI APPLE GSX dal gestionale (backend/gsx_riparazioni.py, via ponte sul VPS).
// Ambiente: «uat» = PROVA Apple, «prod» = produzione (scritture bloccate finché Christian non dà l'ok).
import { fetchAPI } from "@/lib/api";
const API_PROXY = "/api/backend";

export type Ambiente = "uat" | "prod";
const B = "/api/assistenza/gsx/rip";
const post = <T,>(p: string, b: unknown): Promise<T> => fetchAPI(`${B}${p}`, { method: "POST", body: JSON.stringify(b), timeoutMs: 170000 });
const get = <T,>(p: string): Promise<T> => fetchAPI(`${B}${p}`, { timeoutMs: 170000 });

export type InfoAmbiente = {
  predefinito: Ambiente; produzione_bloccata: boolean; scritture_produzione: string[]; tecnico_predefinito: Record<Ambiente, string>;
  tipi: Record<string, string>; non_riparazione: Record<string, string>; coperture: Record<string, string>; stati: Record<string, string>;
  stati_speciali: Record<string, string>; resi_parte: Record<string, string>;
};
export type Tecnico = { id: string; nome: string; certificati: string[]; predefinito: boolean };
export type Prodotto = {
  seriale: string | null; imei: string | null; descrizione: string | null; famiglia: string | null; configurazione: string | null; immagine: string | null;
  garanzia: string | null; garanzia_codice: string | null; fine_copertura: string | null; acquisto: string | null; giorni_rimasti: number | null;
  applecare: string | null; modalita_riparazione: boolean | null; messaggi: string[]; iphone: boolean; mac: boolean;
  consumer_law: { serviceType?: string; popRequired?: boolean; allowedPartType?: string }[];
};
export type Componente = { codice: string; nome: string; difetti: { codice: string; nome: string }[] };
export type Ricambio = {
  codice: string; descrizione: string; tipo: string | null; tipo_nome: string | null; prezzo_sostituzione: number | null; prezzo_stock: number | null;
  valuta: string | null; opzioni_prezzo: { codice: string; nome: string; prezzo: number | null }[]; serializzato: boolean | null; consigliato: boolean | null;
  unita_intera: boolean | null; sostituito_da: string | null; secondari: string[]; immagine: string | null; livello: string | null; manodopera: string | null;
};
export type Messaggio = { tipo: string; sotto?: string | null; testo: string; id?: string | null };
export type Esito = {
  azioni: string[]; stop: boolean; hold: boolean; da_confermare: Messaggio[]; modalita_riparazione: boolean; messaggi: Messaggio[];
  tipi_riparazione: { codice: string; nome: string; sotto: string | null; sotto_nome: string | null; priorita: number | null }[];
  limiti_copertura: { testo: string; parti: string[]; coperture: string[]; prezzi: string[] }[];
};
export type Idoneita = Esito & {
  copertura: string | null; codice_copertura: string | null; tecnico_obbligatorio: boolean | null; ricalcolo_prezzo: boolean | null;
  parti: { codice: string; a_pagamento: boolean | null; copertura: string | null; codice_copertura: string | null; tipo: string | null }[];
  riparazione_aperta: string | null; stato_riparazione_aperta: string | null; trova_il_mio: boolean; problemi?: string[];
};
export type Difetto = { componentCode: string; componentDescription?: string; issueCode: string; issueDescription?: string; type: "CUST" | "TECH"; reproducibility: string };
export type ParteScelta = { number: string; descrizione?: string; coverageOption?: string; pricingOption?: string; prezzo?: number | null; serializzato?: boolean | null };
export type ClienteGsx = { nome: string; cognome: string; azienda?: string | null; email: string; telefono: string;
  indirizzo: { via: string; citta: string; cap: string; provincia: string; paese: string } };
export type Pratica = {
  seriale: string; tipo: string; tecnico: string; po: string; riferimento?: string; ricevuta_il: string; copertura?: string; consumer_law?: string;
  non_riparazione?: string; difetti: Difetto[]; parti: ParteScelta[]; nota_cliente: string; nota_tecnico: string; nota_revisione?: string;
  richiedi_verifica_apple: boolean; completa_subito: boolean; scatola?: boolean; ricontatta_per_preventivo?: boolean;
  cliente: ClienteGsx; domande?: unknown[]; allegati?: { id: string; type: string; description?: string; nome?: string }[];
};
export type Dettaglio = {
  id: string; stato: string; stato_descrizione: string | null; stato_il: string | null; nota_stato: string | null; bozza: boolean; nuova: boolean;
  blocco_credito: boolean; annullata: boolean; tipo: string | null; tipo_descrizione: string | null; creata: string | null; chiusa: string | null;
  ricevuta_il: string | null; po: string | null; riferimento: string | null; notifica: string | null; tecnico_id: string | null; tecnico: string | null;
  copertura: string | null; codice_copertura: string | null; copertura_opzione: string | null; consumer_law: string | null;
  flag: { requestReviewByApple?: boolean; markComplete?: boolean }; totale: string | null; imponibile: string | null; iva: string | null; valuta: string | null;
  messaggi: { livello: string; codice: string; testo: string }[];
  difetti: { tipo: string; componente: string; difetto: string; codici: string; priorita: number; riproducibilita: string | null }[];
  parti: { codice: string; descrizione: string; sequenza: number; a_pagamento: boolean | null; prezzo: string | null; copertura: string | null;
    copertura_opzione: string | null; serializzato: boolean | null; stato_ordine: string | null; spedita_il: string | null; tracking: string | null;
    reso: string | null; reso_codice: string | null; ordine_reso: string | null; reso_tracking: string | null; reso_ricevuto_il: string | null;
    kgb: string | null; kbb: string | null }[];
  note: { tipo: string; testo: string; da: string; il: string }[]; cliente: string;
  dispositivo: { seriale: string | null; imei: string | null; nome: string | null; configurazione: string | null };
  escalation: { id: string; type: string }[]; allegati: { nome: string; tipo: string }[];
};
export type Riepilogo = {
  dispositivo: Partial<Prodotto> & { seriale?: string | null };
  riparazione: { tipo: string; tipo_nome: string; difetti: { componentCode: string; issueCode: string; type: string; priority: number; reproducibility?: string }[];
    tecnico: string; tecnico_nome: string | null; ricevuta_il: string; po: string; riferimento: string; copertura: string | null; non_riparazione: string | null };
  parti: { number: string; coverageOption?: string; pricingOption?: string }[]; note: { type: string; content: string }[];
  cliente: { firstName: string; lastName: string; emailAddress: string; primaryPhone: string; address: { line1: string; city: string; postalCode?: string; stateCode?: string; countryCode: string }[] };
  opzioni: { completa_subito: boolean; verifica_apple: boolean }; idoneita: Idoneita | null; dettaglio_apple: Dettaglio | null;
};
export type RigaRiparazione = { id: string; ambiente: Ambiente; repair_id: string; scheda_id: string | null; seriale: string | null; tipo: string | null;
  stato: string | null; stato_descrizione: string | null; bozza: boolean; tecnico_nome: string | null; po: string | null; created_at: string; inviata_il: string | null;
  riepilogo?: Riepilogo | null; corpo?: unknown };
export type Reso = { repairId: string; sequenza: number; ordine_reso: string | null; parte: string; descrizione: string | null; prodotto: string | null;
  tipo_reso: string | null; stato: string | null; motivo: string | null; motivo_codice: string | null; etichetta_stampata: string | null; atteso_il: string | null;
  creato_il: string | null; spedita_il: string | null; bulk: string | null; tracking: string | null; serializzata: boolean | null; merci_pericolose: string | null;
  magazzino: string | null; ricevuto_il: string | null; po: string | null; scade_il: string | null; giorni_rimasti: number | null; livello: string };

export const ripAmbiente = () => get<InfoAmbiente>("/ambiente");
export const ripTecnici = (amb: Ambiente) => get<{ tecnici: Tecnico[]; predefinito: string }>(`/tecnici?amb=${amb}`);
export const ripProdotto = (s: string, amb: Ambiente) => get<Prodotto>(`/prodotto?s=${encodeURIComponent(s)}&amb=${amb}`);
export const ripComponenti = (s: string, amb: Ambiente) => get<{ componenti: Componente[] }>(`/componenti?s=${encodeURIComponent(s)}&amb=${amb}`);
export const ripRicambi = (b: { amb: Ambiente; s: string; tipo?: string; difetti?: Difetto[]; testo?: string }) => post<{ ricambi: Ricambio[] }>("/ricambi", b);
export const ripProposta = (b: { amb: Ambiente; s: string; scorciatoia: string; variante?: string }) =>
  post<{ titolo: string; componente: { codice: string; nome: string } | null; difetto: { codice: string; nome: string } | null; ricambio: Ricambio | null;
    alternative: Ricambio[]; copertura: string | null; difetti_componente: { codice: string; nome: string }[] }>("/proposta", b);
export const ripScheda = (sid: string) => get<{ scheda: { id: string; sigla: string; seriale: string | null; modello: string | null; difetto: string | null; note: string | null;
  ricevuta_il: string | null; tecnico: string | null }; cliente: ClienteGsx; po: string; difetti_apple: { componentCode: string; componentDescription?: string; issueCode: string; issueDescription?: string; reproducibility?: string }[];
  riparazioni: RigaRiparazione[] }>(`/scheda/${sid}`);
export const ripDomande = (amb: Ambiente, pratica: Pratica) => post<{ domande: DomandeApple }>("/domande", { amb, pratica });
export const ripIdoneita = (amb: Ambiente, pratica: Pratica, sid?: string, operatore?: string) => post<Idoneita>("/idoneita", { amb, pratica, sid, operatore });
export const ripModalitaRiparazione = (amb: Ambiente, s: string, sid?: string) => post<{ messaggio: string }>("/modalita-riparazione", { amb, s, sid });
export const ripBozza = (b: { amb: Ambiente; pratica: Pratica; sid?: string; operatore?: string; repairId?: string; prodotto?: Prodotto | null; tecnico_nome?: string }) =>
  post<{ salvata: boolean; stop?: boolean; repairId?: string; riepilogo?: Riepilogo; idoneita: Idoneita; messaggio?: string }>("/bozza", b);
export const ripInvia = (b: { amb: Ambiente; repairId?: string; pratica?: Pratica; sid?: string; operatore?: string; conferme?: { id: string; value: string }[] }) =>
  post<{ creata: boolean; repairId?: string; esito: Esito; messaggio: string; stesso_numero_della_bozza?: boolean }>("/invia", b);
export const ripDettaglio = (rid: string, amb: Ambiente, sid = "") => get<Dettaglio>(`/riparazione?rid=${encodeURIComponent(rid)}&amb=${amb}&sid=${sid}`);
export const ripAudit = (rid: string, amb: Ambiente) => get<{ voci: { il: string; azione: string; da: string; cosa: string; prima: string; dopo: string }[] }>(`/riparazione/storico?rid=${encodeURIComponent(rid)}&amb=${amb}`);
export type Aggiornamento = { amb: Ambiente; repairId: string; sid?: string; operatore?: string; stato?: string; nota?: string; tecnico?: string; confermato?: boolean;
  parti?: { number: string; sequenceNumber?: number; kgb?: string; kbb?: string; returnStatusCode?: string; returnStatusReasonCode?: string; returnStatusSubtypeCode?: string;
    relatedSequenceNumber?: number; coverageOption?: string; delete?: boolean }[]; conferme?: { id: string; value: string }[]; allegati?: { id: string; type: string }[] };
export const ripAggiorna = (b: Aggiornamento) => post<{ aggiornata: boolean; esito: Esito; dettaglio: Dettaglio | null; messaggio: string; annullamento_da_verificare: boolean }>("/aggiorna", b);
export const ripAllegato = (b: { amb: Ambiente; nome: string; contenuto_b64: string; repairId?: string; s?: string; modulo?: string; sid?: string }) =>
  post<{ id: string; nome: string }>("/allegato", b);
export const ripResi = (b: { amb: Ambiente; repairId?: string; tipo?: string; dal?: string; al?: string }) => post<{ parti: Reso[]; totale: number }>("/resi/cerca", b);
export const ripResiGestisci = (b: { amb: Ambiente; bulkReturn?: string; parti: { action?: string; repairId: string; sequenceNumber?: number; returnOrderNumber?: string; partNumber?: string; overPackId?: string }[]; spedizione?: unknown; sid?: string }) =>
  post<{ bulkReturn: string | null; esito: Esito }>("/resi/gestisci", b);
export const ripResiConferma = (b: { amb: Ambiente; bulkReturn: string; spedizione: { carrierCode: string; trackingNumber: string; packageMeasurements?: Record<string, string>; notes?: string } }) =>
  post<{ bulkReturn: string; tracking_url: string | null; esito: Esito }>("/resi/conferma", b);
export const ripEscOpzioni = (amb: Ambiente, corpo: unknown) => post<EscOpzioni>("/escalation/opzioni", { amb, corpo });
export const ripEscCrea = (b: { amb: Ambiente; corpo: unknown; sid?: string; repairId?: string; operatore?: string }) => post<{ escalationId?: string }>("/escalation/crea", b);
export const ripEscAggiorna = (b: { amb: Ambiente; escalationId: string; nota?: string; stato?: string; disposizione?: string }) => post<{ escalationId?: string }>("/escalation/aggiorna", b);
export const ripEscDettaglio = (id: string, amb: Ambiente) => get<Record<string, unknown>>(`/escalation?id=${encodeURIComponent(id)}&amb=${amb}`);
export const ripFatture = (b: { amb: Ambiente; dal?: string; al?: string; repairId?: string }) => post<{ righe: Record<string, unknown>[] }>("/fatture", b);
export const ripOrdini = (azione: "ricambi" | "cerca" | "crea" | "aggiorna" | "elimina", amb: Ambiente, corpo: unknown) => post<{ dati: unknown }>(`/ordini/${azione}`, { amb, corpo });
export const ripOrdine = (id: string, amb: Ambiente) => get<{ dati: Record<string, unknown> }>(`/ordini/dettaglio?id=${encodeURIComponent(id)}&amb=${amb}`);
export const ripCerca = (b: { amb: Ambiente; modulo: string; filtri?: { operatorKey: string; columnKey: string; value: string[] }[]; colonne?: boolean; pagina?: number; ordina?: string }) =>
  post<{ totale: string | null; dati: unknown; colonne: { columnKey: string; type: string; operatorKey: string[]; filterableValues?: { key: string; text: string }[] }[] | null }>("/cerca", b);
export const ripElenco = (amb: Ambiente | "" = "") => get<{ riparazioni: RigaRiparazione[] }>(`/elenco?amb=${amb}`);
export const ripStorico = (sid: string) => get<{ azioni: { id: number; ambiente: string; repair_id: string | null; azione: string; esito: string; utente: string; operatore: string | null; created_at: string }[] }>(`/scheda/${sid}/storico`);

/** Scarica un documento GSX (etichetta reso, packing list…) come file. */
export async function ripDocumento(amb: Ambiente, tipo: string, identificativi: Record<string, unknown>[]) {
  const r = await fetch(`${API_PROXY}${B}/documento`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amb, tipo, identificativi }) });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(typeof e.detail === "string" ? e.detail : e.detail?.messaggio || `Errore ${r.status}`);
  }
  const blob = await r.blob();
  const nome = /filename="?([^";]+)/.exec(r.headers.get("content-disposition") || "")?.[1] || `${tipo}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---- domande Apple (repair/questions) ed escalation (escalation/options): stesso albero domande → risposte ----
export type DomandaApple = { questionId: string; questionPhrase?: string; answerType?: string; optional?: boolean; contextType?: string;
  answers?: { answerId?: string; answerPhrase?: string; questions?: DomandaApple[] }[] };
export type DomandeApple = { templateId: string; trees: { treeId: string; questions: DomandaApple[] }[] }[];
export type EscOpzioni = { escalationTemplateId?: string; correlationId?: string; options?: { optionId: string; optionDescription?: string; optionMessage?: string }[];
  trees?: { escalationTreeId: string; questions: DomandaApple[] }[] };
/** risposta per questionId: answerId scelto oppure testo libero */
export type Risposte = Record<string, { answerId?: string; answerPhrase?: string }>;

/** Le domande con risposta, con le figlie della risposta scelta (struttura che Apple vuole in questionDetails / trees). */
export function risposteAlbero(qs: DomandaApple[], r: Risposte): { questionId: string; answers: { answerId?: string; answerPhrase?: string; questions?: unknown[] }[] }[] {
  const out: { questionId: string; answers: { answerId?: string; answerPhrase?: string; questions?: unknown[] }[] }[] = [];
  for (const q of qs || []) {
    const x = r[q.questionId];
    if (!x || (!x.answerId && !x.answerPhrase)) continue;
    if (x.answerId) {
      const a = (q.answers || []).find((y) => y.answerId === x.answerId);
      const figlie = a?.questions?.length ? risposteAlbero(a.questions, r) : [];
      out.push({ questionId: q.questionId, answers: [{ answerId: x.answerId, ...(figlie.length ? { questions: figlie } : {}) }] });
    } else out.push({ questionId: q.questionId, answers: [{ answerPhrase: x.answerPhrase }] });
  }
  return out;
}
/** domande obbligatorie (optional=false) senza risposta, comprese le figlie delle risposte scelte */
export function domandeMancanti(qs: DomandaApple[], r: Risposte): string[] {
  const m: string[] = [];
  for (const q of qs || []) {
    if (q.answerType === "INT") continue;
    const x = r[q.questionId];
    if (!x || (!x.answerId && !x.answerPhrase)) { if (q.optional === false) m.push(q.questionPhrase || q.questionId); continue; }
    const a = (q.answers || []).find((y) => y.answerId === x.answerId);
    if (a?.questions?.length) m.push(...domandeMancanti(a.questions, r));
  }
  return m;
}
