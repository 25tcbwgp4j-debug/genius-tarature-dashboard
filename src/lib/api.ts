/**
 * Client API per il backend tarature
 */

// Per gli endpoint interattivi passiamo dal proxy /api/backend/*
// (route handler Next.js) che inoltra al backend Railway aggiungendo
// l'header X-API-Key lato server. L'API_KEY non e' mai esposta al client.
import { attivitaSalvata } from '@/lib/attivita';

const API_PROXY = '/api/backend';


/** Errore del backend con codice HTTP e dettaglio (es. 409 «fattura già esistente» con la fattura trovata).
 *  `inAttesa` = operazione protetta mandata all'amministratore per l'approvazione (non è un vero errore). */
export type ApiError = Error & { status?: number; detail?: any; inAttesa?: boolean; autorizzazioneId?: string; timeout?: boolean };  // eslint-disable-line @typescript-eslint/no-explicit-any

// === AUTORIZZAZIONE DELL'AMMINISTRATORE (livelli di accesso, 01/10/2026) ===
// Un'operazione protetta (cancellazione, storno, riapertura cassa…) chiamata da un operatore risponde
// 403 {codice:"autorizzazione_richiesta", id, messaggio}. Qui la intercettiamo UNA volta per tutte le chiamate:
// il dialog globale (montato nel layout) chiede la password dell'admin e ripete la STESSA chiamata con gli header
// X-Admin-Email / X-Admin-Password / X-Motivo, oppure lascia la richiesta in attesa dell'approvazione.
export type HeaderAutorizzazione = { 'X-Admin-Email': string; 'X-Admin-Password': string; 'X-Motivo'?: string };
export interface RichiestaAutorizzazione {
  id: string;
  messaggio: string;
  metodo: string;
  percorso: string;
  /** Ripete la chiamata originale con le credenziali dell'amministratore. */
  esegui: (h: HeaderAutorizzazione) => Promise<any>;  // eslint-disable-line @typescript-eslint/no-explicit-any
}
type GestoreAutorizzazione = (r: RichiestaAutorizzazione) => Promise<any>;  // eslint-disable-line @typescript-eslint/no-explicit-any
let gestoreAutorizzazione: GestoreAutorizzazione | null = null;
/** Il dialog globale si registra qui (e si toglie allo smontaggio). */
export function registraGestoreAutorizzazione(g: GestoreAutorizzazione | null) { gestoreAutorizzazione = g; }

/** Gli header HTTP accettano solo caratteri Latin-1: il resto (emoji, €…) si sostituisce. */
function latin1(v: string) { return v.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'); }
/** Testo libero negli header (motivo, email): accenti tolti (così → cosi), resto in ASCII. */
function ascii(v: string) { return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?'); }

/** Opzioni di fetchAPI: `timeoutMs` = oltre questo tempo la richiesta si annulla con un errore chiaro (04/10/2026:
 *  sugli iMac una richiesta rimasta appesa — Safari dopo lo stop, backend occupato — lasciava la rotellina per sempre). */
export type OpzioniAPI = RequestInit & { timeoutMs?: number };

export async function fetchAPI(path: string, opzioni: OpzioniAPI = {}, conDialog = true): Promise<any> {  // eslint-disable-line @typescript-eslint/no-explicit-any
  const { timeoutMs, ...options } = opzioni;
  const url = `${API_PROXY}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // attività del selettore in alto (Tarature / Apple): i nuovi documenti nascono con questa (02/10/2026)
    'X-Attivita': attivitaSalvata(),
    ...(options.headers as Record<string, string> | undefined),
  };
  // timeout: un AbortController nostro, collegato a quello del chiamante (AbortSignal.timeout/any non ci sono su Safari 15)
  let ctl: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let scaduto = false;
  const esterno = options.signal;
  const inoltra = () => ctl?.abort();
  if (timeoutMs) {
    ctl = new AbortController();
    if (esterno) { if (esterno.aborted) ctl.abort(); else esterno.addEventListener('abort', inoltra); }
    timer = setTimeout(() => { scaduto = true; ctl?.abort(); }, timeoutMs);
  }
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers, signal: ctl ? ctl.signal : esterno });
  } catch (e) {
    if (scaduto) {
      const err = new Error(`Il server non ha risposto entro ${Math.round((timeoutMs || 0) / 1000)} secondi`) as ApiError;
      err.status = 0; err.timeout = true;
      throw err;
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    if (esterno) esterno.removeEventListener('abort', inoltra);
  }
  if (!res.ok) {
    if (res.status === 401) {
      // Sessione scaduta: redirect a login (solo lato client)
      if (typeof window !== 'undefined') {
        window.location.href = '/login?error=session_expired';
      }
      throw new Error('Sessione scaduta — effettua di nuovo il login');
    }
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = error.detail;
    // operazione protetta: serve l'amministratore → dialog globale (una sola volta: la ripetizione non lo riapre)
    if (res.status === 403 && conDialog && detail && typeof detail === 'object' && detail.codice === 'autorizzazione_richiesta'
        && typeof window !== 'undefined' && gestoreAutorizzazione) {
      return gestoreAutorizzazione({
        id: String(detail.id || ''), messaggio: String(detail.messaggio || ''), metodo: (options.method || 'GET').toUpperCase(), percorso: path,
        esegui: (h) => {
          const extra: Record<string, string> = { 'X-Admin-Email': ascii(h['X-Admin-Email'].trim()), 'X-Admin-Password': latin1(h['X-Admin-Password']) };
          if (h['X-Motivo']?.trim()) extra['X-Motivo'] = ascii(h['X-Motivo'].trim()).slice(0, 300);
          return fetchAPI(path, { ...options, timeoutMs, headers: { ...(options.headers as Record<string, string> | undefined), ...extra } }, false);
        },
      });
    }
    const err = new Error(typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((e: { msg?: string }) => e.msg || JSON.stringify(e)).join('; ')
      : (detail && typeof detail === 'object' && 'messaggio' in detail ? String(detail.messaggio) : `API Error: ${res.status}`))) as ApiError;
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.json();
}

export interface Permessi {
  ruolo: string; admin: boolean;
  puo: { statistiche: boolean; fatturato: boolean; magazzino_modifica: boolean; utenti: boolean; senza_autorizzazione: boolean };
  richiedono_autorizzazione?: string[];
}
export interface Autorizzazione {
  id: string; tipo: string; descrizione: string | null; metodo: string; percorso: string; corpo?: unknown;
  richiesta_da: string | null; stato: 'in_attesa' | 'approvata' | 'eseguita' | 'rifiutata' | 'errore' | string;
  decisa_da: string | null; decisa_il: string | null; motivo: string | null; esito?: unknown; created_at: string;
}
export const TIPI_AUTORIZZAZIONE: Record<string, string> = {
  elimina_fattura: "Eliminare una fattura", nota_credito: "Fare una nota di credito", annulla_incasso: "Annullare l'incasso di una fattura",
  annulla_scontrino: "Annullare uno scontrino", storno_scontrino: "Stornare (reso) uno scontrino", elimina_riga_cassa: "Cancellare una riga della cassa del giorno",
  riapri_cassa: "Riaprire una cassa già chiusa", annulla_documento: "Annullare un ordine/preventivo",
  sblocca_conteggio: "Sbloccare un conteggio di cassa già confermato",
  calendario_cassa: "Cambiare i giorni di chiusura della cassa (sabati, domeniche, festivi, chiusure)",
};
export async function autIo(): Promise<Permessi> { return fetchAPI('/api/autorizzazioni/io'); }
/** stato: 'in_attesa' oppure '' per tutte (storico). L'operatore vede solo le sue. */
export async function autElenco(stato = 'in_attesa'): Promise<Autorizzazione[]> {
  return fetchAPI(`/api/autorizzazioni?stato=${encodeURIComponent(stato)}`);
}
export async function autApprova(id: string): Promise<{ ok: boolean; stato: string }> { return fetchAPI(`/api/autorizzazioni/${id}/approva`, { method: 'POST' }); }
export async function autRifiuta(id: string): Promise<{ ok: boolean }> { return fetchAPI(`/api/autorizzazioni/${id}/rifiuta`, { method: 'POST' }); }

// === CLIENTI ===
export async function searchCustomers(query: string, limit = 10) {
  return fetchAPI(`/api/customers/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

// Ricerca unificata: customers + fgas_prospects + cold_leads.
// Ogni risultato ha un campo `source` ('customer' | 'fgas_prospect' | 'cold_lead')
// e un `lead_id` (usabile con promoteLead per i non-customer).
export async function searchLeads(query: string, limit = 15) {
  return fetchAPI(`/api/search-leads?q=${encodeURIComponent(query)}&limit=${limit}`);
}

// Promuove un fgas_prospect o cold_lead a customer. Ritorna {customer_id, name}.
// Idempotente: se gia' promosso ritorna il customer esistente.
export async function promoteLead(source: 'fgas_prospect' | 'cold_lead', leadId: string | number) {
  return fetchAPI(`/api/leads/${source}/${leadId}/promote`, { method: 'POST' });
}

export async function getCustomer(id: string) {
  return fetchAPI(`/api/customers/${id}`);
}

export async function deleteCustomer(id: string) {
  return fetchAPI(`/api/customers/${id}`, { method: 'DELETE' });
}

// === SESSIONI ===
export async function createSession(
  customerId: string,
  operator?: string,
  opts?: { attesaStrumenti?: boolean; confermaDuplicato?: boolean },
) {
  // 409 con detail.code === 'sessione_in_attesa_strumenti' se il cliente ha gia' una sessione
  // in ATTESA STRUMENTI: la UI chiede se aprire quella o creare comunque (confermaDuplicato).
  return fetchAPI('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: customerId,
      operator,
      attesa_strumenti: !!opts?.attesaStrumenti,
      conferma_duplicato: !!opts?.confermaDuplicato,
    }),
  });
}

/** Gli strumenti sono arrivati: attesa_strumenti -> registrazione (nessuna notifica al cliente). */
export async function strumentiArrivati(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/strumenti-arrivati`, { method: 'POST' });
}

/** «Acquisisci» (02/10/2026): foto di uno strumento (fotocamera iPad/iPhone o immagine incollata) → riga nella
 *  sessione, con lo stesso motore delle foto WhatsApp (fronte/retro uniti, niente doppioni sulla matricola).
 *  esito: nuovo | unito | doppione | illeggibile. Se la sessione era in attesa strumenti passa in registrazione. */
export interface EsitoAcquisizione {
  esito: 'nuovo' | 'unito' | 'doppione' | 'illeggibile';
  strumento: { id: string; instrument_name?: string; manufacturer?: string; model?: string; serial_number?: string | null;
    probe_model?: string | null; price?: number } | null;
  descrizione: string | null;
  n_strumenti?: number;
  totale?: number;
}
export async function acquisisciStrumentoDaFoto(sessionId: string, imageDataUrl: string): Promise<EsitoAcquisizione> {
  return fetchAPI(`/api/sessions/${sessionId}/instruments/da-foto`, {
    method: 'POST',
    body: JSON.stringify({ image_base64: imageDataUrl }),
  });
}

/** Riporta in ATTESA STRUMENTI una sessione in registrazione senza ricevuta inviata. */
export async function mettiInAttesaStrumenti(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/attesa-strumenti`, { method: 'POST' });
}

export async function listSessions(params?: {
  status?: string;
  date?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.date) qs.set('date', params.date);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  return fetchAPI(`/api/sessions?${qs.toString()}`);
}

export async function getSession(id: string) {
  return fetchAPI(`/api/sessions/${id}`);
}

// === SESSIONI (estese) ===
export async function updateSession(id: string, data: Record<string, unknown>) {
  return fetchAPI(`/api/sessions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSession(id: string) {
  return fetchAPI(`/api/sessions/${id}`, { method: 'DELETE' });
}

// === STRUMENTI ===
export async function updateInstrument(id: string, data: Record<string, unknown>) {
  return fetchAPI(`/api/instruments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteInstrument(id: string, sessionId?: string) {
  const qs = sessionId ? `?session_id=${sessionId}` : '';
  return fetchAPI(`/api/instruments/${id}${qs}`, { method: 'DELETE' });
}

export async function generateRdts(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/generate-rdts`, { method: 'POST' });
}

export async function addInstrument(data: {
  session_id: string;
  customer_id: string;
  instrument_name: string;
  instrument_type_id?: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  price?: number;
  // Unita' base + sonda = un solo rapporto: serial_number e' la base
  probe_model?: string;
  probe_serial_number?: string;
  // Lavorazione esterna (es. laboratorio Testo) o fornitura: niente RDT nostro
  external_processing?: boolean;
}) {
  return fetchAPI('/api/instruments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getSessionInstruments(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/instruments`);
}

// === CATALOGO ===
export async function getInstrumentTypes() {
  return fetchAPI('/api/instrument-types');
}

export async function createInstrumentType(data: {
  code: string;
  name: string;
  price: number;
  template_type?: string;
  category?: string;
  measurement_unit?: string;
  calibration_validity_months?: number;
  notes?: string;
}) {
  return fetchAPI('/api/instrument-types', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateInstrumentType(id: string, data: {
  code?: string;
  name?: string;
  price?: number;
  template_type?: string;
  category?: string;
  measurement_unit?: string;
  calibration_validity_months?: number;
  notes?: string;
  active?: boolean;
}) {
  return fetchAPI(`/api/instrument-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteInstrumentType(id: string) {
  return fetchAPI(`/api/instrument-types/${id}`, { method: 'DELETE' });
}

export async function getCustomerPastInstruments(customerId: string) {
  return fetchAPI(`/api/customers/${customerId}/past-instruments`);
}

export function getReceiptPdfUrl(sessionId: string): string {
  return `${API_PROXY}/api/sessions/${sessionId}/receipt-pdf`;
}

export function getSessionReportsZipUrl(sessionId: string): string {
  return `${API_PROXY}/api/sessions/${sessionId}/reports-zip`;
}

export function getLabelsPdfUrl(sessionId: string, fmt: "default" | "brother_ql710" = "default"): string {
  const ts = Date.now();
  const params = fmt === "default" ? `?t=${ts}` : `?fmt=${fmt}&t=${ts}`;
  return `${API_PROXY}/api/sessions/${sessionId}/labels-pdf${params}`;
}

export function getFatturaXmlUrl(sessionId: string): string {
  return `${API_PROXY}/api/sessions/${sessionId}/fattura-xml`;
}

// PDF di un documento pro forma (PF n/AAAA)
export function getProformaAnteprimaPdfUrl(sessionId: string): string {
  return `${API_PROXY}/api/sessions/${sessionId}/proforma-documento/anteprima.pdf?t=${Date.now()}`;
}
export function getDocumentoPdfUrl(documentoId: string): string {
  return `${API_PROXY}/api/documenti/${documentoId}/pdf?t=${Date.now()}`;
}

// === PRO FORMA DELLA SESSIONE (documento PF) ===
export interface ProformaRigaCalcolata { descrizione: string; quantita: number; prezzo_unitario: number; aliquota: number; prezzo_totale: number; lordo: number | null }
/** Pro forma ↔ sessione (08/10/2026): se la sessione è cambiata dopo il pro forma e cosa si può fare. */
export interface ProformaAllineamento {
  diverso: boolean; totale_sessione: number; totale_proforma: number; righe_sessione: number; righe_proforma: number;
  assistenze_senza_importo: number;
  /** aggiorna = pro forma aperto · aggiorna_con_fattura = convertito in fattura BOZZA · fatturazione = fattura già numerata/inviata/pagata · scontrino */
  azione: 'aggiorna' | 'aggiorna_con_fattura' | 'fatturazione' | 'scontrino' | null;
  fattura: { id: string; numero: string | null; stato: string; totale: number; link: string; motivo: string | null } | null;
}
export interface ProformaSessioneStato {
  documento: (DocumentoCliente & { righe_calcolate: ProformaRigaCalcolata[]; imponibile: number; iva: number; allineamento?: ProformaAllineamento | null }) | null;
  anteprima: { righe?: RigaDoc[]; session_number?: number | null; righe_calcolate: ProformaRigaCalcolata[]; imponibile: number; iva: number; totale: number; causale: string; shipping_by_customer?: boolean } | null;
}
export async function proformaSessioneStato(sessionId: string): Promise<ProformaSessioneStato> {
  return fetchAPI(`/api/sessions/${sessionId}/proforma-documento`, { cache: 'no-store' });
}
export interface ProformaAggiornato {
  documento: DocumentoCliente; totale_prima: number; totale_nuovo: number; pagato: number; residuo: number; nota: string;
  fattura: { id: string; numero: string | null; totale: number; totale_prima: number; link: string } | null;
  stripe: { vecchio?: Record<string, unknown>; nuovo?: string; nuovo_errore?: string };
}
/** «Aggiorna il pro forma» (08/10/2026): righe e totali di nuovo dalla sessione, stesso numero. */
export async function proformaSessioneAggiorna(sessionId: string, operatore: string, aggiornaFattura = false): Promise<ProformaAggiornato> {
  return fetchAPI(`/api/sessions/${sessionId}/proforma-documento/aggiorna`, { method: 'POST', body: JSON.stringify({ operatore, aggiorna_fattura: aggiornaFattura }) });
}
export async function proformaSessioneCrea(sessionId: string, operatore: string): Promise<{ gia_presente: boolean; documento: DocumentoCliente }> {
  return fetchAPI(`/api/sessions/${sessionId}/proforma-documento`, { method: 'POST', body: JSON.stringify({ operatore }) });
}

// === STAMPA DIRETTA (coda + agente sul Mac del banco) ===
export async function stampaSessione(sessionId: string, tipo: 'etichette' | 'ricevuta' | 'rapporti'): Promise<{ ok: boolean; id: string; agente_attivo: boolean; copie: number }> {
  return fetchAPI(`/api/stampa/sessione/${sessionId}`, { method: 'POST', body: JSON.stringify({ tipo }) });
}
export async function stampaStato(): Promise<{ agente_attivo: boolean }> {
  return fetchAPI(`/api/stampa/stato`, {}, false);
}
export async function stampaLavoro(id: string): Promise<{ stato: string; errore: string | null }> {
  return fetchAPI(`/api/stampa/lavori/${id}`, {}, false);
}
export async function stampaAnnulla(id: string) {
  return fetchAPI(`/api/stampa/lavori/${id}/annulla`, { method: 'POST', body: '{}' }, false);
}

// === 4 PULSANTI AZIONE ===
export async function registerComplete(
  sessionId: string,
  channel: 'email' | 'whatsapp' | 'both' = 'both'
) {
  return fetchAPI(`/api/sessions/${sessionId}/register-complete`, {
    method: 'POST',
    body: JSON.stringify({ channel }),
  });
}

export async function notifyReady(
  sessionId: string,
  channel: 'email' | 'whatsapp' | 'both' = 'both',
) {
  return fetchAPI(`/api/sessions/${sessionId}/notify-ready`, {
    method: 'POST',
    body: JSON.stringify({ channel }),
  });
}

// === PRONTO PROGRAMMATO (01/10/2026): il pronto al cliente parte da solo al giorno/ora scelti ===
export type CanalePronto = 'email' | 'whatsapp';
export interface EsitoCanalePronto { ok: boolean; il?: string; destinatario?: string | null; errore?: string | null; modo?: string; saltato?: boolean; nota?: string }
export interface ProgrammazionePronto {
  stato: 'programmato' | 'in_corso' | 'eseguito' | 'errore' | 'annullato' | null;
  quando: string | null;
  canali: CanalePronto[];
  esito: (Partial<Record<CanalePronto, EsitoCanalePronto>> & { errore?: string; rimanda?: boolean }) | null;
  da: string | null;
  creato_il: string | null;
  eseguito_il: string | null;
}
export interface StatoPronto {
  programmazione: ProgrammazionePronto;
  destinatari: { email: string | null; whatsapp: string | null; motivo_no_whatsapp: string | null; do_not_contact: boolean; cliente?: string; contatto?: string | null };
  suggerito: string;
  /** prossimo giorno lavorativo dal calendario della cassa (venerdì → lunedì, ferie saltate) — 04/10/2026 */
  prossimo_lavorativo?: string;
  gia_inviato: Record<CanalePronto, boolean>;
}
export async function getProntoProgrammato(sessionId: string): Promise<StatoPronto> {
  return fetchAPI(`/api/sessions/${sessionId}/pronto-programmato`);
}
/** quando: {data:"AAAA-MM-GG", ora:"HH:MM"} in ora di Roma, oppure {quando: ISO}. */
export async function programmaPronto(sessionId: string, body: { canali: CanalePronto[]; data?: string; ora?: string; quando?: string; rimanda?: boolean }) {
  return fetchAPI(`/api/sessions/${sessionId}/pronto-programmato`, { method: 'POST', body: JSON.stringify(body) });
}
export async function annullaProntoProgrammato(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/pronto-programmato`, { method: 'DELETE' });
}

export async function sendProforma(
  sessionId: string,
  proformaSuffix = "",
  shipping?: { included: boolean; amount?: number },
  channel: 'email' | 'whatsapp' | 'both' = 'both',
  dryRun = false,
  aggiornata = false,
) {
  const payload: Record<string, unknown> = { proforma_suffix: proformaSuffix, channel };
  if (shipping?.included) {
    payload.shipping_included = true;
    if (typeof shipping.amount === "number" && !Number.isNaN(shipping.amount)) {
      payload.shipping_amount = shipping.amount;
    }
  }
  if (dryRun) payload.dry_run = true;
  if (aggiornata) payload.aggiornata = true;   // «versione aggiornata» nell'oggetto e in testa al messaggio (08/10/2026)
  return fetchAPI(`/api/sessions/${sessionId}/send-proforma`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function sendLatCertificates(sessionId: string, overrideTo?: string) {
  return fetchAPI(`/api/sessions/${sessionId}/send-lat-certificates`, {
    method: 'POST',
    body: JSON.stringify(overrideTo ? { to: overrideTo } : {}),
  });
}

export async function markDelivered(sessionId: string, notes?: string) {
  // Operazione interna: nessuna comunicazione al cliente.
  return fetchAPI(`/api/sessions/${sessionId}/mark-delivered`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, notes }),
  });
}

// === BLACKLIST DO NOT CONTACT ===
export async function markCustomerDoNotContact(
  customerId: string,
  enabled: boolean,
  reason?: string,
) {
  return fetchAPI(`/api/customers/${customerId}/mark-do-not-contact`, {
    method: 'POST',
    body: JSON.stringify({ enabled, reason: reason || '' }),
  });
}

export async function listDoNotContact() {
  return fetchAPI('/api/customers/do-not-contact-list');
}

// === RICHIESTA RECENSIONE ===
export async function getReviewStatus(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/review-status`);
}

export async function sendReviewRequest(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/send-review-request`, {
    method: 'POST',
    body: JSON.stringify({ channels: ['email', 'whatsapp'] }),
  });
}

export async function markReviewReceived(
  sessionId: string,
  received: boolean,
  score?: number,
) {
  return fetchAPI(`/api/sessions/${sessionId}/mark-review-received`, {
    method: 'POST',
    body: JSON.stringify({ received, score }),
  });
}

// === RAPPORTI ===
export async function listReports(params?: {
  limit?: number;
  offset?: number;
  customer_id?: string;
  search?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  if (params?.customer_id) qs.set('customer_id', params.customer_id);
  if (params?.search) qs.set('search', params.search);
  return fetchAPI(`/api/reports?${qs.toString()}`);
}

export async function deleteReport(id: string) {
  return fetchAPI(`/api/reports/${id}`, { method: 'DELETE' });
}

export async function getSessionReports(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/reports`);
}

// === SCADENZARIO ===
export async function getExpiringCalibrations(days = 90) {
  return fetchAPI(`/api/schedule/expiring?days=${days}`);
}

export async function getScheduleStats() {
  return fetchAPI('/api/schedule/stats');
}

export async function sendScheduleNotification(scheduleId: string) {
  return fetchAPI(`/api/schedule/${scheduleId}/notify`, { method: 'POST' });
}

export async function sendCustomerNotification(customerName: string, customerId?: string) {
  // Fix F13: passa customer_id come query param se disponibile per evitare ambiguita su omonimi
  const qs = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : '';
  return fetchAPI(
    `/api/schedule/notify-customer/${encodeURIComponent(customerName)}${qs}`,
    { method: 'POST' }
  );
}

export async function markScheduleRenewed(scheduleId: string) {
  return fetchAPI(`/api/schedule/${scheduleId}/mark-renewed`, { method: 'POST' });
}

export async function unmarkScheduleRenewed(scheduleId: string) {
  return fetchAPI(`/api/schedule/${scheduleId}/unmark-renewed`, { method: 'POST' });
}

export async function getWhatsAppQR() {
  return fetchAPI('/api/whatsapp-qr');
}

export async function getStaffWhatsAppQR() {
  return fetchAPI('/api/staff-whatsapp-qr');
}

export async function getCustomerHistory(customerName: string) {
  return fetchAPI(`/api/schedule/customer-history/${encodeURIComponent(customerName)}`);
}

// === CLIENTI (estesi) ===
export async function listCustomers(page = 1, perPage = 50, filter?: string) {
  const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (filter) qs.set('filter', filter);
  return fetchAPI(`/api/customers?${qs.toString()}`);
}

export async function updateCustomer(id: string, data: Record<string, unknown>) {
  return fetchAPI(`/api/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getCustomerDuplicates() {
  return fetchAPI('/api/customers/duplicates');
}

export async function getCustomerStats() {
  return fetchAPI('/api/customers/stats');
}

// === IMPOSTAZIONI ===
export async function getSettings() {
  return fetchAPI('/api/settings');
}

export async function updateSettings(data: Record<string, unknown>) {
  return fetchAPI('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// === TEMPLATE MESSAGGI ===
export async function listTemplates() {
  return fetchAPI('/api/templates');
}

export async function updateTemplate(
  templateKey: string,
  data: { subject?: string; body?: string; notes?: string },
) {
  return fetchAPI(`/api/templates/${encodeURIComponent(templateKey)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// === PROSPECT FGAS ===
export async function listProspects(params: {
  page?: number;
  per_page?: number;
  status?: string;
  provincia?: string;
  search?: string;
  has_email?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.per_page) qs.set('per_page', String(params.per_page));
  if (params.status) qs.set('status', params.status);
  if (params.provincia) qs.set('provincia', params.provincia);
  if (params.search) qs.set('search', params.search);
  // il backend accetta has_email da sempre, il client non lo passava mai:
  // il select "Con/Senza email" in pagina era inerte. (20/08/2026)
  if (params.has_email !== undefined) qs.set('has_email', String(params.has_email));
  return fetchAPI(`/api/prospects?${qs.toString()}`);
}

export async function getProspectStats() {
  return fetchAPI('/api/prospects/stats');
}

export async function updateProspect(id: string, data: Record<string, unknown>) {
  return fetchAPI(`/api/prospects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function sendProspectEmail(id: string) {
  return fetchAPI(`/api/prospects/${id}/send-email`, { method: 'POST' });
}

export async function sendProspectBatch(limit: number, provincia?: string) {
  return fetchAPI('/api/prospects/send-batch', {
    method: 'POST',
    body: JSON.stringify({ limit, provincia }),
  });
}

// === NOTIFICHE EMAIL AUTOMATICHE ===
export async function getEmailQuota() {
  return fetchAPI('/api/notifications/quota');
}

export async function dispatchEmailNow() {
  return fetchAPI('/api/notifications/dispatch-now', { method: 'POST' });
}

export async function getAutomationDailyLog(days = 7) {
  return fetchAPI(`/api/automation/daily-log?days=${days}`);
}

// === MARK PAID + STATISTICHE ===
export async function markSessionPaid(
  sessionId: string,
  data: { payment_method?: string; payment_notes?: string; payment_date?: string } = {},
) {
  return fetchAPI(`/api/sessions/${sessionId}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getStatistics() {
  return fetchAPI('/api/statistics');
}

// Contatore bozze mail per casella (solo titolare). Alimentato dal publisher
// locale che legge l'Envelope Index di Apple Mail (skill mail-apple/tarature-mail).
export async function getMailDraftsCount() {
  return fetchAPI('/api/mail-drafts/count');
}

export async function parseCustomerText(text: string, create = false) {
  return fetchAPI('/api/customers/parse-text', {
    method: 'POST',
    body: JSON.stringify({ text, create }),
  });
}

export async function applyCustomerParsedUpdate(customerId: string, fields: Record<string, string>) {
  return fetchAPI(`/api/customers/${customerId}/apply-parsed-update`, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
}

export async function parseCustomerImage(imageBase64: string, create = false) {
  return fetchAPI('/api/customers/parse-image', {
    method: 'POST',
    body: JSON.stringify({ image_base64: imageBase64, create }),
  });
}

// === ENRICHMENT CONTATTI ===
export async function getEnrichmentStats() {
  return fetchAPI('/api/enrichment/stats');
}

export async function runEnrichmentProspects(limit = 40) {
  return fetchAPI('/api/enrichment/prospects/run', {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}

export async function runEnrichmentCustomers(limit = 30) {
  return fetchAPI('/api/enrichment/customers/run', {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}

export async function getColdLeadsStats() {
  return fetchAPI('/api/cold-leads/stats');
}

export async function runEnrichmentColdLeads(limit = 30) {
  return fetchAPI('/api/cold-leads/enrich', {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}

// === RICONCILIAZIONE CLIENTI ===
export async function getReconciliationToday() {
  return fetchAPI('/api/reconciliation/today');
}

// === RICONCILIAZIONE CLIENTI ===
export async function findDuplicateCustomers() {
  return fetchAPI('/api/customers/duplicates');
}

export async function dismissDuplicateGroup(customerIds: string[]) {
  return fetchAPI('/api/customers/duplicates/dismiss', {
    method: 'POST',
    body: JSON.stringify({ customer_ids: customerIds }),
  });
}

export async function mergeCustomers(masterId: string, duplicateIds: string[], fieldsToImport: Record<string, string>) {
  return fetchAPI('/api/customers/merge', {
    method: 'POST',
    body: JSON.stringify({
      master_id: masterId,
      duplicate_ids: duplicateIds,
      fields_to_import: fieldsToImport,
    }),
  });
}

export async function changeSessionCustomer(sessionId: string, customerId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/change-customer`, {
    method: 'POST',
    body: JSON.stringify({ customer_id: customerId }),
  });
}

export async function moveProspectToCustomer(id: string) {
  return fetchAPI(`/api/prospects/${id}/move-to-customers`, { method: 'POST' });
}

export async function moveBatchProspectsToCustomers() {
  return fetchAPI('/api/prospects/move-batch-to-customers', { method: 'POST' });
}

// ===========================================================================
// Partner B2B: rivenditori termoidraulica + centri certificazione F-Gas
// ===========================================================================

export interface Partner {
  id: number;
  partner_type: 'rivenditore' | 'centro_fgas';
  name: string;
  city?: string;
  province?: string;
  phone?: string;
  email?: string;
  website?: string;
  rating?: number;
  enrichment_status?: string;
  email_status?: string;
  email_sent_at?: string;
  partnership_status?: string;
  commission_tier?: number;
  do_not_contact?: boolean;
  notes?: string;
  created_at?: string;
}

export async function listPartners(params: {
  partner_type?: string;
  partnership_status?: string;
  enrichment_status?: string;
  city?: string;
  page?: number;
  per_page?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.partner_type) qs.set('partner_type', params.partner_type);
  if (params.partnership_status) qs.set('partnership_status', params.partnership_status);
  if (params.enrichment_status) qs.set('enrichment_status', params.enrichment_status);
  if (params.city) qs.set('city', params.city);
  if (params.page) qs.set('page', String(params.page));
  if (params.per_page) qs.set('per_page', String(params.per_page));
  return fetchAPI(`/api/partners?${qs.toString()}`);
}

export async function getPartnersStats() {
  return fetchAPI('/api/partners/stats');
}

export async function triggerPartnerDiscovery() {
  return fetchAPI('/api/partners/discover', { method: 'POST' });
}

export async function triggerPartnerEnrich() {
  return fetchAPI('/api/partners/enrich', { method: 'POST' });
}

export async function triggerPartnerSendBatch() {
  return fetchAPI('/api/partners/send-batch', { method: 'POST' });
}

export async function sendPartnerEmailSingle(partnerId: number) {
  return fetchAPI(`/api/partners/${partnerId}/send-email`, { method: 'POST' });
}

export async function updatePartner(partnerId: number, data: {
  commission_tier?: number;
  partnership_status?: string;
  notes?: string;
  do_not_contact?: boolean;
  do_not_contact_reason?: string;
}) {
  return fetchAPI(`/api/partners/${partnerId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// === SPEDIZIONI UPS (ritiro / riconsegna) — 29/09/2026 ===
export type ShipmentDirection = 'ritiro' | 'riconsegna';

export interface ShipmentAddress {
  name: string; attention: string; phone: string; street: string;
  city: string; zip: string; province: string;
}

export interface ShipmentRequest {
  direction: ShipmentDirection;
  /** UPS (default) o DHL: una società, due divisioni, stessi corrieri (02/10/2026) */
  carrier?: 'UPS' | 'DHL';
  operator?: string;
  pickup_date?: string | null;
  book_pickup?: boolean;
  packages?: number;
  weight_kg?: number;
  email?: string;
  whatsapp_phone?: string;
  address?: Partial<ShipmentAddress>;
  send_email?: boolean;
  send_whatsapp?: boolean;
  test?: boolean;
  force?: boolean;
}

export async function previewShipment(sessionId: string, body: ShipmentRequest) {
  return fetchAPI(`/api/sessions/${sessionId}/shipments/preview`, {
    method: 'POST', body: JSON.stringify(body),
  });
}

export async function createShipment(sessionId: string, body: ShipmentRequest & { forza_pagamento?: boolean }): Promise<any> {  // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    return await fetchAPI(`/api/sessions/${sessionId}/shipments`, {
      method: 'POST', body: JSON.stringify(body),
    });
  } catch (e) {
    // Riconsegna senza pagamento (03/10/2026): il backend blocca, qui si può forzare con una conferma esplicita
    const err = e as ApiError;
    if (err.status === 409 && err.detail?.codice === 'pagamento_mancante' && typeof window !== 'undefined' && !body.forza_pagamento) {
      if (window.confirm(`⚠️ ${err.message}\n\nOK = spedisci lo stesso (pagamento concordato dopo)\nAnnulla = non spedire`)) {
        return createShipment(sessionId, { ...body, forza_pagamento: true });
      }
    }
    throw e;
  }
}

export async function listShipments(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/shipments`);
}

export function getShipmentLabelUrl(shipmentId: string): string {
  return `${API_PROXY}/api/shipments/${shipmentId}/label-pdf`;
}

export async function cancelShipment(shipmentId: string) {
  return fetchAPI(`/api/shipments/${shipmentId}/cancel`, { method: 'POST', body: '{}' });
}

// === SEZIONE SPEDIZIONI (UPS + DHL, Tarature + Apple) — 02/10/2026 ===
export type SpedTipo = 'ritiro_prenotato' | 'ritiro_senza' | 'spedizione' | 'spedizione_ritiro';
export type SpedIndirizzo = ShipmentAddress;
export interface SpedStato {
  dhl_configurato: boolean; dhl_produzione: boolean; ups_configurato: boolean; vede_assistenza: boolean; email_test: string; operatori: string[];
}
export interface SpedPratica { id: string; tipo: 'sessione' | 'scheda'; titolo: string; cliente: string; dettaglio: string; data: string | null }
export interface SpedRubrica { fonte: 'clienti' | 'anagrafiche'; customer_id?: string; anagrafica_id?: string; email: string; indirizzo: SpedIndirizzo }
export interface SpedRiga {
  id: string; session_id: string | null; scheda_id: string | null; attivita: string | null; carrier: 'UPS' | 'DHL';
  direction: ShipmentDirection; tipo: SpedTipo | null; riferimento: string | null; contenuto: string | null; note: string | null;
  test_mode: boolean; tracking: string | null; pickup_prn: string | null; pickup_date: string | null; pickup_location: string | null;
  pickup_error: string | null; packages: number; cost: number | null; currency: string | null; address: Partial<ShipmentAddress> | null;
  email_to: string | null; email_sent_at: string | null; email_error: string | null; status: string; created_by: string | null; created_at: string;
  pratica: { tipo: 'sessione' | 'scheda' | 'libera'; id: string | null; titolo: string }; controparte: string; tracking_url: string | null; label_url: string;
}
const postJ = (b: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(b) });
export const spedStato = (): Promise<SpedStato> => fetchAPI('/api/spedizioni/stato');
export const spedRubrica = (q: string): Promise<{ risultati: SpedRubrica[] }> => fetchAPI(`/api/spedizioni/rubrica?q=${encodeURIComponent(q)}`);
export const spedPratiche = (tipo: 'sessione' | 'scheda', q: string): Promise<{ risultati: SpedPratica[] }> =>
  fetchAPI(`/api/spedizioni/pratiche?tipo=${tipo}&q=${encodeURIComponent(q)}`);
export const spedElenco = (f: { attivita?: string; pratica?: string; corriere?: string; prove?: boolean; q?: string }): Promise<{ spedizioni: SpedRiga[] }> => {
  const p = new URLSearchParams();
  if (f.attivita) p.set('attivita', f.attivita);
  if (f.pratica) p.set('pratica', f.pratica);
  if (f.corriere) p.set('corriere', f.corriere);
  if (f.prove === false) p.set('prove', 'false');
  if (f.q?.trim()) p.set('q', f.q.trim());
  return fetchAPI(`/api/spedizioni?${p.toString()}`);
};
export const spedAnteprimaLibera = (b: Record<string, unknown>): Promise<{
  indirizzo: SpedIndirizzo; mancanti: string[]; oggetto: string; corpo: string; email: string | null; mittente_lab: SpedIndirizzo;
  dhl_configurato: boolean; dhl_produzione: boolean; fonti?: string[];
}> => fetchAPI('/api/spedizioni/libera/anteprima', postJ(b));
export const spedCreaLibera = (b: Record<string, unknown>): Promise<{
  id: string; corriere: string; tracking: string; prn: string | null; test: boolean; pickup_error: string | null; mail: string;
  stampa: { agente_attivo: boolean; copie: number } | null; label_url: string; tracking_url: string;
}> => fetchAPI('/api/spedizioni/libera', postJ(b));
export const spedStampaBanco = (id: string): Promise<{ id: string; copie: number; agente_attivo: boolean }> =>
  fetchAPI(`/api/spedizioni/${id}/stampa`, postJ({}));

// === FATTURAZIONE (Openapi SDI) — 30/09/2026 ===
export type FattSocieta = 'genius' | 'gingy' | 'avantifiori';
export type FattModalita = 'contanti' | 'pos_sumup' | 'carta_stripe' | 'paypal' | 'bonifico' | 'assegno' | 'non_pagato';
export interface FattRiga {
  descrizione: string;
  quantita: number;
  prezzo_unitario?: number | null;
  prezzo_ivato?: number | null;
  aliquota: number;
  natura?: string | null;
  sconto?: number | null;
  riferimento_normativo?: string | null;
  prezzo_totale?: number;
  /** totale riga IVA inclusa, presente se la riga è nata a prezzo ivato */
  lordo?: number | null;
  /** 'margine' = regime del margine beni usati (art. 36 DL 41/1995): aliquota 0 + natura N5 */
  regime?: 'margine' | null;
  /** prezzo di acquisto per pezzo (regime del margine): non va nell'XML, serve per l'IVA sul margine */
  costo_acquisto?: number | null;
  prodotto_id?: string | null;
}
export interface FattControparte {
  denominazione?: string; nome?: string; cognome?: string;
  piva?: string; cf?: string; sdi?: string; pec?: string;
  indirizzo?: string; civico?: string; cap?: string; comune?: string; provincia?: string;
  paese?: string; email?: string; telefono?: string;
}
/** Riga di fattura trovata dalla sotto-ricerca «Cerca dentro le fatture» (07/10/2026). */
export interface FattRigaTrovata {
  indice: number; descrizione: string; codice?: string | null; seriale?: string | null; note?: string | null;
  quantita: number; prezzo_unitario: number | null; prezzo_unitario_ivato: number | null; sconto: number;
  aliquota: number; natura?: string | null; totale_riga: number | null; totale_riga_ivato: number | null;
}
/** Voce dello «storico prezzi» (righe trovate, dalla più recente). */
export interface FattStoricoPrezzo {
  fattura_id: string; numero: string | null; data: string | null; tipo_documento: string; controparte_nome: string | null;
  descrizione: string; quantita: number; prezzo_unitario: number | null; prezzo_unitario_ivato: number | null;
  sconto: number; aliquota: number; natura?: string | null;
}
export interface Fattura {
  righe_trovate?: FattRigaTrovata[];
  recapiti?: { email: string; telefono: string };
  id: string; societa: FattSocieta; direzione: 'emessa' | 'ricevuta'; tipo_documento: string;
  numero: string | null; data: string | null; controparte_nome: string | null;
  controparte_piva: string | null; controparte_cf: string | null; controparte?: FattControparte;
  righe?: FattRiga[]; imponibile: number; iva: number; totale: number;
  stato: string; ambiente: string | null; sdi_uuid: string | null; sdi_file_name?: string | null;
  pagamento_modalita: FattModalita | null; pagamento_stato: string; pagato_il: string | null;
  pagamento_rif?: string | null; scadenza: string | null; causale?: string | null; note?: string | null;
  session_id: string | null; errore: string | null; inviata_il: string | null; created_at: string;
  fattura_collegata_id?: string | null;
  /** estremi della dichiarazione/attestazione del cliente (es. modulo dell'ambasciata, art. 72): stampati in fattura */
  estremi_esenzione?: string | null;
  origine?: string; anagrafica_id?: string | null; operatore?: string | null; vista_il?: string | null;
  /** Genius Lab Gestionale: tarature | apple (solo indicazione, numerazione unica) */
  attivita?: 'tarature' | 'apple' | null; attivita_nota?: string | null;
  esiti?: { id: string; tipo: string; descrizione: string; data: string }[];
  controlli?: string[];
  collegata?: { id: string; numero: string; data: string; totale: number } | null;
  note_credito?: { id: string; numero: string; data: string; totale: number; stato: string }[];
  /** sessione di taratura collegata (03/10/2026): stesso stato di pagamento ovunque */
  session_number?: number | null;
  sessione?: { id: string; session_number: number | null; status: string; payment_status: string; payment_method: string | null;
    payment_date: string | null; delivered_at: string | null; termini: TerminiCliente } | null;
  da_proforma?: { id: string; numero: number; anno: number; tipo: string; stato: string } | null;
  /** registro pagamenti (03/10/2026): quanto è stato incassato, righe con metodo/data, residuo */
  pagato?: number; incassi?: RiepilogoPagamenti | null; rate?: { importo: number; scadenza: string | null; modalita: string }[] | null;
  /** scontrino ANNULLATO sul registratore che questa fattura sostituisce («annulla scontrino e fai fattura») */
  scontrino_id?: string | null; scontrino?: { id: string; numero_rt: string | null; data_rt: string | null; created_at: string; totale: number } | null;
  /** fatture d'acconto (TD02) scalate da questa fattura di saldo */
  acconti_ids?: string[] | null; acconti?: { id: string; numero: string; data: string; totale: number; pagamento_stato: string }[];
}
// ---------------------------------------------------------------------------------------------------------------
// Registro pagamenti: misti, parziali, acconti e saldi (03/10/2026, migrazione 087)
export type ModalitaIncasso = 'contanti' | 'pos_sumup' | 'carta_stripe' | 'paypal' | 'bonifico' | 'assegno';
export interface RigaPagamento {
  id: string; data: string; importo: number; modalita: ModalitaIncasso | string; tipo: 'acconto' | 'saldo' | 'parziale' | 'intero' | 'rimborso' | 'recupero';
  stato: 'valido' | 'annullato'; fattura_id?: string | null; scontrino_id?: string | null; documento_id?: string | null; session_id?: string | null;
  riferimento?: string | null; transaction_code?: string | null; origine?: string; operatore?: string | null; creato_da?: string | null;
  annullato_il?: string | null; annullo_motivo?: string | null; created_at?: string;
}
export interface RiepilogoPagamenti {
  totale: number; pagato: number; residuo: number; eccedenza?: number; stato: 'da_pagare' | 'parziale' | 'pagata';
  per_modalita: Record<string, number>; descrizione: string; badge: string; righe: RigaPagamento[];
}
export async function pagRiepilogo(tipo: 'fattura' | 'sessione' | 'scontrino' | 'documento' | 'scheda', id: string): Promise<RiepilogoPagamenti> {
  return fetchAPI(`/api/pagamenti/riepilogo/${tipo}/${id}`, { cache: 'no-store' });
}
export async function pagIncassaFattura(fid: string, body: { importo: number; modalita: ModalitaIncasso; data?: string; riferimento?: string;
  pos_incasso_id?: string; incasso_id?: string; transaction_code?: string; tipo?: string; operatore: string }): Promise<RiepilogoPagamenti & { pagamento: RigaPagamento }> {
  return fetchAPI(`/api/pagamenti/fattura/${fid}`, { method: 'POST', body: JSON.stringify(body) });
}
/** Movimento PayPal/POS già arrivato, proposto per «Già pagato» (05/10/2026) */
export interface MovimentoProposto { id: string; fonte: string; codice: string; data: string; importo: number; ordinante?: string | null;
  causale?: string | null; registra: number; differenza: number; punti: number; perche: string }
export async function pagMovimentiFattura(fid: string, metodo: 'paypal' | 'pos_sumup', aggiorna = false):
  Promise<{ residuo: number; movimenti: MovimentoProposto[]; nota?: string | null; avviso?: string | null }> {
  return fetchAPI(`/api/pagamenti/fattura/${fid}/movimenti?metodo=${metodo}${aggiorna ? '&aggiorna=1' : ''}`);
}
export async function pagTerminiFattura(fid: string): Promise<{ testo: string | null; modalita: string; scadenza: string | null;
  differito: boolean; descrizione: string; scadenza_fattura?: string | null }> {
  return fetchAPI(`/api/pagamenti/fattura/${fid}/termini`);
}
export async function pagRate(fid: string, rate: { importo: number; scadenza: string | null; modalita: string }[]): Promise<RiepilogoPagamenti> {
  return fetchAPI(`/api/pagamenti/fattura/${fid}/rate`, { method: 'PUT', body: JSON.stringify({ rate }) });
}
export async function pagAnnulla(pid: string, motivo: string) {
  return fetchAPI(`/api/pagamenti/${pid}/annulla`, { method: 'POST', body: JSON.stringify({ motivo }) });
}
export async function cassaRecupero(sid: string, body: { pagamenti: { modalita: string; importo: number; pos_incasso_id?: string }[]; operatore: string }): Promise<Scontrino & { resta: number; a_mano?: boolean }> {
  return fetchAPI(`/api/cassa/scontrini/${sid}/recupero`, { method: 'POST', body: JSON.stringify(body) });
}
// «Annulla scontrino e fai fattura» (03/10/2026): O scontrino O fattura. Si annulla lo scontrino sul registratore e,
// SOLO quando l'agente conferma l'annullo, nasce la fattura (bozza) già pagata con gli stessi pagamenti.
export interface StatoAnnullaEFattura {
  stato: 'nessuna' | 'in_attesa' | 'fatta' | 'fallita' | 'annullata'; errore?: string | null; fattura_id?: string | null;
  annullo_id?: string; annullo_stato?: string; chiesta_il?: string;
}
export async function cassaAnnullaEFattura(sid: string, body: { operatore: string; controparte: FattControparte; anagrafica_id?: string | null;
  customer_id?: string | null; salva_anagrafica?: boolean; numero_originale?: string; motivo?: string }): Promise<StatoAnnullaEFattura & { ok: boolean }> {
  return fetchAPI(`/api/cassa/scontrini/${sid}/annulla-e-fattura`, { method: 'POST', body: JSON.stringify(body) });
}
export async function cassaAnnullaEFatturaStato(sid: string): Promise<StatoAnnullaEFattura> {
  return fetchAPI(`/api/cassa/scontrini/${sid}/annulla-e-fattura`, { cache: 'no-store' });
}
export async function cassaAnnullaEFatturaRiprovaFattura(annulloId: string): Promise<Fattura> {
  return fetchAPI(`/api/cassa/scontrini/${annulloId}/annulla-e-fattura/riprova-fattura`, { method: 'POST' });
}
/** Ricerca degli scontrini emessi senza fattura (numero 2312-0004, importo 12,50 o descrizione) — creazione della fattura. */
export async function cassaScontriniDaFatturare(q: string, societa = 'genius'): Promise<{ scontrini: Scontrino[] }> {
  return fetchAPI(`/api/cassa/scontrini-da-fatturare?q=${encodeURIComponent(q)}&societa=${societa}`, { cache: 'no-store' });
}
export async function fattConfig() { return fetchAPI('/api/fatturazione/config'); }
export async function fattElenco(params: Record<string, string>) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return fetchAPI(`/api/fatturazione/fatture?${q}`);
}
export async function fattRiepilogo(societa = '', anno = 0) {
  return fetchAPI(`/api/fatturazione/riepilogo?societa=${societa}&anno=${anno || 0}`);
}
export async function fattEsiti(limit = 100) { return fetchAPI(`/api/fatturazione/esiti?limit=${limit}`); }
export async function fattDettaglio(id: string): Promise<Fattura> { return fetchAPI(`/api/fatturazione/fatture/${id}`); }
export async function fattCrea(body: Record<string, unknown>): Promise<Fattura> {
  return fetchAPI('/api/fatturazione/fatture', { method: 'POST', body: JSON.stringify(body) });
}
export async function fattModifica(id: string, body: Record<string, unknown>): Promise<Fattura> {
  return fetchAPI(`/api/fatturazione/fatture/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function fattElimina(id: string) { return fetchAPI(`/api/fatturazione/fatture/${id}`, { method: 'DELETE' }); }
/** Invio allo SdI (05/10/2026): una bozza da incassare parte solo con `da_pagare: true` + scadenza (conferma esplicita) */
export async function fattEmetti(id: string, operatore: string, daPagare?: { scadenza: string; modalita?: string }): Promise<{ ok: boolean; numero?: string | null; errore?: string | null }> {
  return fetchAPI(`/api/fatturazione/fatture/${id}/emetti`, { method: 'POST', body: JSON.stringify(daPagare ? { operatore, da_pagare: true, ...daPagare } : { operatore }) });
}
export async function fattPagamento(id: string, body: { modalita?: FattModalita; data?: string; riferimento?: string; annulla?: boolean }) {
  return fetchAPI(`/api/fatturazione/fatture/${id}/pagamento`, { method: 'POST', body: JSON.stringify(body) });
}
export async function fattLinkStripe(id: string, importo?: number) { return fetchAPI(`/api/fatturazione/fatture/${id}/link-stripe`, { method: 'POST', body: JSON.stringify(importo ? { importo } : {}) }); }
export async function fattNotaCredito(id: string, operatore: string): Promise<Fattura> { return fetchAPI(`/api/fatturazione/fatture/${id}/nota-credito`, { method: 'POST', body: JSON.stringify({ operatore }) }); }
export async function fattDuplica(id: string, operatore: string): Promise<Fattura> { return fetchAPI(`/api/fatturazione/fatture/${id}/duplica`, { method: 'POST', body: JSON.stringify({ operatore }) }); }
// dalla sessione si prepara SOLO la bozza (anche dal pro forma): pagamento ed emissione si fanno in Fatturazione
export async function fattDaSessione(sessionId: string, forza = false, operatore = '') { return fetchAPI(`/api/fatturazione/fatture/da-sessione/${sessionId}`, { method: 'POST', body: JSON.stringify({ forza, operatore }) }); }
export async function fattCollegaSessione(sessionId: string, fatturaId: string) { return fetchAPI(`/api/fatturazione/sessione/${sessionId}/collega`, { method: 'POST', body: JSON.stringify({ fattura_id: fatturaId }) }); }
// Pagamento della sessione = pagamento della FATTURA collegata (03/10/2026, pagamento_sessione.py)
export interface PagamentoSessione {
  fonte: 'fattura' | 'sessione'; pagata: boolean; modalita: string | null; modalita_label: string | null;
  pagato_il: string | null; riferimento: string | null; termine: 'immediato' | 'differito'; scadenza: string | null; scaduta: boolean;
  /** registro pagamenti: pagato in parte (acconto) */
  parziale?: boolean; pagato?: number; residuo?: number; totale?: number; descrizione?: string; badge?: string;
}
export interface TerminiCliente { testo: string | null; differito: boolean; giorni: number; fine_mese: boolean; sconto: number; descrizione: string }
export interface AvvisoPagamento { livello: 'errore' | 'avviso'; codice: string; testo: string }
export interface StatoPagamentoSessione {
  fattura: { id: string; numero: string | null; data: string; stato: string; totale: number; pagamento_stato: string; pagamento_modalita: string | null;
    pagato_il: string | null; pagamento_rif: string | null; scadenza: string | null; origine: string | null; numero_altre: number } | null;
  sessione: { status?: string; payment_status?: string; payment_method?: string; payment_date?: string | null; total_amount?: number; proforma_sent_at?: string | null };
  pagamento: PagamentoSessione;
  termini: TerminiCliente;
  proforma_doc: { id: string; sigla: string; stato: string; totale: number; convertito_in: { tipo: string; id?: string; numero?: string; pagata?: boolean } | null } | null;
  proforma: { proforma_number: string; total: number; payment_status: string } | null;
  avvisi: AvvisoPagamento[];
  /** tutto quello che è arrivato per la sessione (fatture, acconti col pro forma, scontrini) */
  riepilogo?: RiepilogoPagamenti | null;
}
export async function fattStatoSessione(sessionId: string): Promise<StatoPagamentoSessione> { return fetchAPI(`/api/fatturazione/sessione/${sessionId}`, { cache: 'no-store' }); }
export interface CoerenzaVoce { session_id: string; session_number: number | null; cliente: string | null; status: string; payment_status: string;
  codice: string; testo: string; certo: boolean; fattura: { id: string; numero: string; data: string; totale: number; pagamento_stato: string } | null }
export async function fattCoerenzaSessioni(anno = 0): Promise<{ anno: number; sessioni: number; voci: CoerenzaVoce[]; per_codice: Record<string, number> }> {
  return fetchAPI(`/api/fatturazione/coerenza-sessioni${anno ? `?anno=${anno}` : ''}`, { cache: 'no-store' });
}
export async function fattCoerenzaCorreggi(anno = 0) { return fetchAPI('/api/fatturazione/coerenza-sessioni/correggi', { method: 'POST', body: JSON.stringify({ anno }) }); }
export async function fattSincronizza() { return fetchAPI('/api/fatturazione/sincronizza', { method: 'POST' }); }
// Fatture ricevute dallo SdI (01/10/2026): ultimo controllo (fonte, esito) e badge «nuove»
export interface FattSyncLog { quando: string; fonte: string; trigger: string; ok: boolean; controllate: number; nuove: number; messaggio: string }
export interface FattRicevuteStato { ultimo: FattSyncLog | null; ultimo_con_novita: FattSyncLog | null; nuove_da_vedere: number }
export async function fattRicevuteStato(societa = ''): Promise<FattRicevuteStato> { return fetchAPI(`/api/fatturazione/ricevute/stato?societa=${encodeURIComponent(societa)}`, { cache: 'no-store' }); }
export async function fattRicevuteViste(societa = '') { return fetchAPI(`/api/fatturazione/ricevute/viste?societa=${encodeURIComponent(societa)}`, { method: 'POST' }); }
export function fattUrlXml(id: string) { return `${API_PROXY}/api/fatturazione/fatture/${id}/xml`; }
export function fattUrlStampa(id: string) { return `${API_PROXY}/api/fatturazione/fatture/${id}/stampa`; }

// Anagrafiche di fatturazione (clienti/fornitori per società; Genius importata da SimplyFatt) — 30/09/2026
export interface FattAnagrafica {
  id: string; societa: FattSocieta; tipo: 'cliente' | 'fornitore'; origine: string; codice?: string | null;
  denominazione: string | null; piva: string | null; cf: string | null; sdi: string | null; pec: string | null;
  indirizzo: string | null; cap: string | null; comune: string | null; provincia: string | null; paese: string | null;
  email: string | null; telefono: string | null; referente?: string | null; attivo?: boolean;
  resoconto?: FattResocontoCfg | null;
  fatture?: { id: string; direzione: string; tipo_documento: string; numero: string | null; data: string | null;
    totale: number; stato: string; pagamento_stato: string; origine: string }[];
  totale_fatturato?: number;
}
export async function fattAnagrafiche(societa: string, tipo: string, q = '', limit = 100, offset = 0) {
  return fetchAPI(`/api/fatturazione/anagrafiche?societa=${societa}&tipo=${tipo}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);
}
export async function fattAnagrafica(id: string): Promise<FattAnagrafica> { return fetchAPI(`/api/fatturazione/anagrafiche/${id}`); }
export async function fattAnagraficaCrea(body: Partial<FattAnagrafica>): Promise<FattAnagrafica> {
  return fetchAPI('/api/fatturazione/anagrafiche', { method: 'POST', body: JSON.stringify(body) });
}
export async function fattAnagraficaModifica(id: string, body: Partial<FattAnagrafica>): Promise<FattAnagrafica> {
  return fetchAPI(`/api/fatturazione/anagrafiche/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

// «Estrai dati» della controparte (05/10/2026): testo incollato e/o foto/PDF → campi normalizzati
export type TipoControparte = 'azienda' | 'privato' | 'estero';
export interface CampiEstratti {
  tipo: TipoControparte; denominazione: string; nome: string; cognome: string; piva: string; cf: string; sdi: string;
  pec: string; email: string; telefono: string; indirizzo: string; cap: string; comune: string; provincia: string;
  paese: string; referente: string;
}
export interface EsistenteEstratto {
  fonte: 'fatturazione' | 'tarature'; id: string;
  record: Record<string, string | null | undefined> & { id: string };
}
export interface EsitoEstrai {
  campi: CampiEstratti;
  /** testo · ai · vies · regola (es. SDI 0000000 messo perché c'è solo la PEC) */
  fonti: Partial<Record<keyof CampiEstratti, 'testo' | 'ai' | 'vies' | 'regola'>>;
  incerti: (keyof CampiEstratti)[]; mancanti: string[]; avvisi: string[];
  vies: { disponibile: boolean; valida?: boolean; nome?: string; indirizzo?: string; messaggio?: string } | null;
  esistenti: EsistenteEstratto[]; ai: { usata: boolean; errore?: string }; vuoto: boolean;
}
export async function fattEstraiControparte(body: { testo?: string; file_base64?: string; media_type?: string; societa: string }): Promise<EsitoEstrai> {
  return fetchAPI('/api/fatturazione/estrai-controparte', { method: 'POST', body: JSON.stringify(body), timeoutMs: 90000 });
}
export async function fattEstraiSalva(societa: string, controparte: Partial<CampiEstratti>): Promise<FattAnagrafica & { _nuova?: boolean }> {
  return fetchAPI('/api/fatturazione/estrai-controparte/salva', { method: 'POST', body: JSON.stringify({ societa, controparte }) });
}

// Crediti per cliente, estratto conto, incassi multipli, export CSV — 30/09/2026
export interface FattCredito {
  chiave: string; nome: string | null; piva: string | null; cf: string | null; email: string | null;
  anagrafica_id: string | null; n: number; totale: number; scaduto: number; piu_vecchia: string | null;
  fatture: { id: string; numero: string | null; data: string | null; scadenza: string | null; totale: number; stato: string; pagamento_modalita: string | null;
    /** pagamenti parziali: già incassato e quanto resta (03/10/2026) */
    pagato?: number; residuo?: number; pagamento_stato?: string }[];
}
export async function fattCrediti(societa: string, direzione = 'emessa', anno = 0, dal = '', al = ''): Promise<{ clienti: FattCredito[]; totale: number; scaduto: number }> {
  return fetchAPI(`/api/fatturazione/crediti?societa=${societa}&direzione=${direzione}&anno=${anno || 0}&dal=${dal}&al=${al}`);
}
export function fattUrlEstratto(societa: string, chiave: string, ids: string[] = [], messaggio = '', dal = '', al = '') {
  return `${API_PROXY}/api/fatturazione/estratto?societa=${societa}&chiave=${encodeURIComponent(chiave)}&ids=${ids.join(',')}&messaggio=${encodeURIComponent(messaggio)}&dal=${dal}&al=${al}`;
}
export function fattUrlEstrattoPdf(societa: string, chiave: string, ids: string[] = [], messaggio = '', dal = '', al = '') {
  return `${API_PROXY}/api/fatturazione/estratto.pdf?societa=${societa}&chiave=${encodeURIComponent(chiave)}&ids=${ids.join(',')}&messaggio=${encodeURIComponent(messaggio)}&dal=${dal}&al=${al}`;
}
export async function fattEstrattoInvia(body: { societa: string; chiave: string; email: string; ids?: string[]; messaggio?: string; mittente?: string; dal?: string; al?: string; allega_fatture?: boolean; resoconto?: { anagrafica_id: string; periodo: string } }) {
  return fetchAPI('/api/fatturazione/estratto/invia', { method: 'POST', body: JSON.stringify(body) });
}
export async function fattEstrattoAnteprimaTesto(body: { societa: string; chiave: string; email: string; dal?: string; al?: string; allega_fatture?: boolean; resoconto?: boolean; messaggio?: string }):
  Promise<{ da: string; a: string; ccn: string | null; oggetto: string; testo: string; allegati: string[]; totale: number; fatture: number }> {
  return fetchAPI('/api/fatturazione/estratto/anteprima-testo', { method: 'POST', body: JSON.stringify(body) });
}

// Resoconto mensile (clienti a fatturazione cumulativa: Bagnetti, Flaminia Computer) — 01/10/2026
export interface FattResocontoCfg { attivo: boolean; email: string; giorno: number }
export interface FattResocontoDaInviare {
  anagrafica_id: string; nome: string; email: string; giorno: number; periodo: string; label: string; dal: string; al: string;
  chiave: string; n: number; totale: number; n_mese: number; totale_mese: number; avvisi: string[];
  fatture: { id: string; numero: string | null; data: string | null; totale: number; pagamento_stato: string; tipo_documento: string }[];
}
export async function fattResocontiDaInviare(societa: string): Promise<{ periodo: string; label: string; resoconti: FattResocontoDaInviare[] }> {
  return fetchAPI(`/api/fatturazione/resoconti/da-inviare?societa=${societa}`);
}
export async function fattResocontoSalta(body: { societa: string; anagrafica_id: string; periodo: string; nota?: string }) {
  return fetchAPI('/api/fatturazione/resoconti/salta', { method: 'POST', body: JSON.stringify(body) });
}
export function fattUrlPdf(id: string, download = false) { return `${API_PROXY}/api/fatturazione/fatture/${id}/pdf${download ? '?download=true' : ''}`; }
export async function fattInvia(id: string, body: { canale: 'email' | 'whatsapp'; email?: string; telefono?: string; messaggio?: string; link_pagamento?: string }) {
  return fetchAPI(`/api/fatturazione/fatture/${id}/invia`, { method: 'POST', body: JSON.stringify(body) });
}
export interface FattVoceCatalogo { gruppo: string; codice: string | null; descrizione: string; prezzo_ivato: number | null; aliquota: number;
  natura?: string | null; regime?: 'margine' | null; costo_acquisto?: number | null }
export async function fattCatalogo(societa: string): Promise<{ voci: FattVoceCatalogo[] }> {
  return fetchAPI(`/api/fatturazione/catalogo?societa=${societa}`);
}

// === INCASSI: verifica pagamenti arrivati (banca SumUp, POS, PayPal, Stripe) — 30/09/2026 ===
export type IncFonte = 'banca' | 'pos' | 'paypal' | 'stripe' | 'manuale';
export interface IncProposta { tipo: 'fattura' | 'fatture' | 'proforma' | 'sessione'; id?: string; ids?: string[]; numero: string | null;
  nome: string | null; importo: number; data?: string | null; session_id: string | null; punti: number; perche: string }
export interface Incasso { id: string; fonte: IncFonte; codice: string; data: string; importo: number; ordinante: string | null;
  causale: string | null; stato: string; proposte: IncProposta[] }
export interface DaSpedire { session_id: string; numero: number | null; stato: string; pagata_il: string | null; cliente: string | null;
  citta: string | null; motivo: string }
export interface IncFontiStato { [k: string]: { api: boolean; nota: string } }
export async function incElenco(): Promise<{ incassi: Incasso[]; da_spedire: DaSpedire[]; fonti: IncFontiStato }> {
  return fetchAPI('/api/incassi');
}
export async function incVerifica(fonti: IncFonte[]): Promise<{ fonti: Record<string, { ok: boolean; nuovi?: number; nota?: string }>; incassi: Incasso[]; da_spedire: DaSpedire[]; stato_fonti: IncFontiStato }> {
  return fetchAPI('/api/incassi/verifica', { method: 'POST', body: JSON.stringify({ fonti }) });
}
export async function incImportaCsv(file: File): Promise<{ nuovi: number; gia_presenti: number; letti: number; incassi: Incasso[] }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_PROXY}/api/incassi/importa-csv`, { method: 'POST', body: fd });
  if (!res.ok) {
    const t = await res.text();
    let m = t;
    try { m = JSON.parse(t).detail || t; } catch { /* testo semplice */ }
    throw new Error(m || `Errore ${res.status}`);
  }
  return res.json();
}
export async function incAzione(id: string, body: { azione: string; fattura_ids?: string[]; session_id?: string | null; proforma_id?: string; modalita?: string; emetti?: boolean; nota?: string; forza?: boolean; operatore?: string }):
  Promise<{ incasso?: { esito?: string | null }; da_spedire?: DaSpedire | null; [k: string]: unknown }> {
  return fetchAPI(`/api/incassi/${id}/azione`, { method: 'POST', body: JSON.stringify(body) });
}
export async function incSessione(sessionId: string): Promise<{ incassi: { id: string; fonte: IncFonte; data: string; importo: number; ordinante: string | null; stato: string; esito: string | null }[]; da_spedire: DaSpedire | null }> {
  return fetchAPI(`/api/incassi/sessione/${sessionId}`);
}
// Bonifico istantaneo: verifica in diretta sul conto SumUp (01/10/2026)
export interface MovimentoBonifico {
  data: string; importo: number; ordinante: string; causale: string; stato_banca: string;
  nome_corrisponde: boolean; parole_comuni: string[]; gia_usato: boolean;
}
export interface EsitoVerificaBonifico {
  trovato: boolean; live: boolean; fonte: 'open_banking' | 'archivio'; nota: string; controllato_il: string; dal: string;
  importo: number; movimenti_nel_periodo: number; movimenti_candidati: MovimentoBonifico[];
}
export async function incVerificaBonifico(body: { importo: number; dal?: string; testo?: string }): Promise<EsitoVerificaBonifico> {
  return fetchAPI('/api/incassi/verifica-bonifico', { method: 'POST', body: JSON.stringify(body) });
}
export async function incBancaStato(): Promise<{ open_banking_configurato: boolean; collegato: boolean; valid_until: string | null; iban: string | null; nota: string }> {
  return fetchAPI('/api/incassi/banca/stato');
}
export async function incBancaCollega(): Promise<{ url: string; valid_until: string }> {
  return fetchAPI('/api/incassi/banca/collega', { method: 'POST' });
}
export async function fattPagamentoMultiplo(body: { ids: string[]; modalita: FattModalita; data?: string; riferimento?: string }) {
  return fetchAPI('/api/fatturazione/pagamento-multiplo', { method: 'POST', body: JSON.stringify(body) });
}
export function fattUrlExport(params: Record<string, string>) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return `${API_PROXY}/api/fatturazione/export.csv?${q}`;
}
export function fattUrlChiusura(societa: string, periodo: 'giorno' | 'mese', giorno: string) {
  return `${API_PROXY}/api/fatturazione/chiusura/stampa?societa=${societa}&periodo=${periodo}&giorno=${giorno}`;
}
export function fattUrlPacchetto(societa: string, giorno: string) {
  return `${API_PROXY}/api/fatturazione/pacchetto-commercialista.zip?societa=${societa}&giorno=${giorno}`;
}
export async function fattChiusura(societa: string, periodo: 'giorno' | 'mese', giorno: string) {
  return fetchAPI(`/api/fatturazione/chiusura?societa=${societa}&periodo=${periodo}&giorno=${giorno}`);
}

// === MAGAZZINO E CASSA — 30/09/2026 ===
export interface Prodotto {
  id: string; societa: string; codice: string | null; barcode: string | null; descrizione: string;
  categoria: string | null; marca: string | null; ubicazione: string | null; unita: string | null;
  prezzo: number; aliquota: number; costo: number; giacenza: number; scorta_minima: number;
  gestisce_giacenza: boolean; attivo: boolean; origine: string;
  /** ordinario = aliquota · margine = usato / conto vendita (regime del margine) · esente = esente/non imponibile */
  regime_iva?: 'ordinario' | 'margine' | 'esente';
  movimenti?: { id: string; tipo: string; quantita: number; causale: string | null; created_at: string; creato_da: string | null }[];
  /** Genius Lab Gestionale (02/10/2026): attività e magazzino Apple */
  attivita?: 'tarature' | 'apple' | null;
  categoria_merce?: CategoriaMerce | null; modello?: string | null; fornitore_id?: string | null; fornitore_nome?: string | null;
  serializzato?: boolean; sottocategoria?: string | null;
  /** Magazzino professionale (08/10/2026): colonne calcolate dal database */
  e_merce?: boolean; sotto_scorta?: boolean; valore_vendita?: number | null; ultimo_movimento_at?: string | null;
  /** PLU del registratore (05/10/2026): sullo scontrino stampa il nome (1 CUFFIE, 2 ALIMENTATORE 20W, 3 CAVO USB-C, 4 CAVO LIGHTNING, 5 SCHEDA ASSISTENZA) */
  plu_rt?: number | null;
  /** codici a barre / sigle alternative (versione precedente della stessa confezione): li usano scanner e ricerca (08/10/2026) */
  barcode_alt?: string[];
  /** letto con lo scanner un seriale/IMEI: il pezzo già scelto */
  pezzo?: Pezzo;
}
export interface RigaCassa { prodotto_id?: string | null; /** pezzo serializzato venduto (iPhone, Mac…) */ pezzo_id?: string | null; descrizione: string; quantita: number; prezzo: number; aliquota: number; sconto?: number;
  /** regime IVA della riga: margine (N5) o esente (N4/N3.x); senza = aliquota */
  regime?: 'margine' | 'esente' | null; natura?: string | null; costo_acquisto?: number | null;
  /** PLU del registratore dell'articolo (solo righe 22%): lo decide il server dal prodotto, qui serve a mostrarlo */
  plu_rt?: number | null }
/** nome stampato sullo scontrino per ogni PLU del registratore (programmati il 05/10/2026, P220) */
export const PLU_RT_NOMI: Record<number, string> = { 1: 'CUFFIE', 2: 'ALIMENTATORE 20W', 3: 'CAVO USB-C', 4: 'CAVO LIGHTNING', 5: 'SCHEDA ASSISTENZA' };
export interface PagamentoScontrino { modalita: string; importo: number; consegnato?: number; pos_incasso_id?: string; transaction_code?: string | null; riferimento?: string;
  /** bonifico arrivato sul conto (incassi.id): la riga del registro pagamenti lo collega (05/10/2026) */ bonifico_id?: string }
export interface Scontrino {
  id: string; stato: string; righe: RigaCassa[]; totale: number; pagamenti: PagamentoScontrino[];
  /** «non riscosso»: quanto resta da recuperare (RECUPERO CREDITI) · fattura che ha sostituito lo scontrino annullato */
  credito_residuo?: number; fattura_id?: string | null; resto?: number; consegnato?: number;
  /** scontrino della giornata fiscale ancora aperta (oggi / Z non chiusa): niente RESO sul registratore, si annulla e si riemette (08/10/2026) */
  giornata_aperta?: boolean;
  /** «annulla scontrino e fai fattura»: a che punto è (sullo scontrino originale) */
  annulla_e_fattura?: StatoAnnullaEFattura | null;
  codice_lotteria: string | null; numero_rt: string | null; errore: string | null; risposta_rt: string | null; created_at: string;
  /** vendita (default) · reso · annullo: i documenti di reso/annullo hanno importi da leggere in NEGATIVO */
  tipo_documento?: 'vendita' | 'reso' | 'annullo' | 'recupero_credito' | null; rif_scontrino_id?: string | null; motivo?: string | null; creato_da?: string | null;
  /** CHR · VALE · DUMY · ALTRO: chi l'ha battuto */
  operatore?: string | null; data_rt?: string | null;
  /** Genius Lab Gestionale: tarature | apple */
  attivita?: 'tarature' | 'apple' | null;
}
export async function magProdotti(q = '', sottoScorta = false, limit = 300, attivita = '', categoriaMerce = ''): Promise<{ prodotti: Prodotto[]; totale_righe: number | null; valore_magazzino: number }> {
  return fetchAPI(`/api/magazzino/prodotti?q=${encodeURIComponent(q)}&sotto_scorta=${sottoScorta}&limit=${limit}&attivita=${attivita}&categoria_merce=${categoriaMerce}`);
}
/** Pagina Magazzino (08/10/2026): filtri lato server, riepilogo con albero delle categorie, sposta in categoria, export. */
export type FiltroGiacenza = 'tutti' | 'disponibili' | 'esauriti' | 'sotto_scorta' | 'negativi';
export interface MagFiltri {
  q?: string; categoria?: string; sottocategoria?: string; giacenza?: FiltroGiacenza | ''; attivita?: string; marca?: string;
  ordina?: string; verso?: 'asc' | 'desc'; limit?: number; offset?: number;
}
export interface MagNodo { categoria: string; articoli: number; pezzi: number; sottocategorie: { nome: string; articoli: number; pezzi: number }[] }
export interface MagRiepilogo {
  albero: MagNodo[]; marche: string[];
  totali: { articoli: number; pezzi: number; valore_vendita: number; valore_costo: number; disponibili: number; esauriti: number; negativi: number; sotto_scorta: number };
}
export const MAG_SENZA_CATEGORIA = '__nessuna__';
function magQuery(f: MagFiltri & Record<string, string | number | undefined>) {
  return new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '' && v !== 'tutti').map(([k, v]) => [k, String(v)])).toString();
}
export async function magElenco(f: MagFiltri): Promise<{ prodotti: Prodotto[]; totale_righe: number | null; riepilogo: MagRiepilogo; limit: number; offset: number }> {
  return fetchAPI(`/api/magazzino/prodotti?${magQuery({ ...f, riepilogo: 'true' })}`);
}
export async function magTassonomia(): Promise<{ tassonomia: Record<string, string[]> }> { return fetchAPI('/api/magazzino/tassonomia'); }
export async function magSposta(ids: string[], categoria: string, sottocategoria: string | null): Promise<{ ok: boolean; aggiornati: number }> {
  return fetchAPI('/api/magazzino/prodotti/sposta', { method: 'POST', body: JSON.stringify({ ids, categoria, sottocategoria }) });
}
export function magUrlExport(f: MagFiltri, formato: 'xlsx' | 'csv') {
  const { q, categoria, sottocategoria, giacenza, attivita, marca } = f;
  return `${API_PROXY}/api/magazzino/export?${magQuery({ q, categoria, sottocategoria, giacenza, attivita, marca, formato })}`;
}
export async function magPerCodice(codice: string): Promise<Prodotto> { return fetchAPI(`/api/magazzino/codice/${encodeURIComponent(codice)}`); }
export async function magProdotto(id: string): Promise<Prodotto> { return fetchAPI(`/api/magazzino/prodotti/${id}`); }
export async function magCrea(body: Partial<Prodotto> & { giacenza_iniziale?: number }): Promise<Prodotto> {
  return fetchAPI('/api/magazzino/prodotti', { method: 'POST', body: JSON.stringify(body) });
}
export async function magModifica(id: string, body: Partial<Prodotto>): Promise<Prodotto> {
  return fetchAPI(`/api/magazzino/prodotti/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function magMovimento(id: string, body: { tipo: string; quantita: number; causale?: string; costo?: number }) {
  return fetchAPI(`/api/magazzino/prodotti/${id}/movimento`, { method: 'POST', body: JSON.stringify(body) });
}
export async function cassaScontrino(body: { righe: RigaCassa[]; pagamenti: PagamentoScontrino[]; codice_lotteria?: string; pos_incasso_id?: string; operatore: string; session_id?: string; attivita?: string; scheda_id?: string;
  /** incasso di un ordine cliente (/cassa?ordine=…): lo scontrino diventa acconto/saldo dell'ordine */ documento_id?: string }): Promise<Scontrino & { ordine?: { id: string; sigla: string } }> {
  return fetchAPI('/api/cassa/scontrini', { method: 'POST', body: JSON.stringify(body) });
}
export async function cassaScontrini(giorno = '', attivita = '') { return fetchAPI(`/api/cassa/scontrini?giorno=${giorno}&attivita=${attivita}`); }
export async function cassaAnnulla(id: string) { return fetchAPI(`/api/cassa/scontrini/${id}/annulla`, { method: 'POST' }); }
/** Reso (anche parziale) o annullo di uno scontrino GIÀ EMESSO: nasce un documento negativo nella cassa di oggi. */
export async function cassaStornoScontrino(id: string, body: { tipo: 'reso' | 'annullo'; righe?: { indice: number; quantita: number }[]; modalita?: string; motivo: string; numero_rt?: string; numero_originale?: string; operatore: string }): Promise<Scontrino> {
  return fetchAPI(`/api/cassa/scontrini/${id}/storno`, { method: 'POST', body: JSON.stringify(body) });
}
export async function cassaRiprova(id: string) { return fetchAPI(`/api/cassa/scontrini/${id}/riprova`, { method: 'POST' }); }
export async function cassaFattura(body: { righe: RigaCassa[]; pagamenti?: { modalita: string }[]; pagata?: boolean; operatore: string; attivita?: string }): Promise<Fattura> {
  return fetchAPI('/api/cassa/fattura', { method: 'POST', body: JSON.stringify(body) });
}

// === CASSA DEL GIORNO (ex Excel BASE CASSA) — 30/09/2026 ===
export type Tagli = Record<string, number>;
export interface RigaGiornata {
  id: string; tipo: string; numero: string; descrizione: string; modello: string; fonte: 'fattura' | 'fattura_prec' | 'scontrino' | 'manuale';
  contanti: number; pos: number; stripe: number; bonifico: number; paypal: number; totale: number;
  /** orario HH:MM della registrazione ("" = senza orario, in coda alla giornata) e operatore */
  orario?: string; ts?: string | null; operatore?: string;
  /** Genius Lab Gestionale: tarature | apple */
  attivita?: 'tarature' | 'apple' | null;
  /** a chi è intestato il documento (fattura: controparte; scontrino solo se fatturato; vuoto = nessuno) — 05/10/2026 */
  intestato?: string;
  /** righe a mano: ordine/documento collegato (acconti e saldi) */
  documento_id?: string | null; certificato?: string | null;
}
export interface ControlloCassa { chiave: string; nome: string; atteso: number | null; trovato: number; differenza: number | null; ok: boolean; mancante: boolean; nota: string }
export interface FoglioCassa {
  giornata: {
    giorno: string; stato: 'aperta' | 'chiusa' | 'non_lavorata'; apertura_tagli: Tagli; non_lavorata?: boolean; motivo_chiusura?: string | null; chiusura_tagli: Tagli; prelievi: { importo: number; nota: string; tipo?: string }[];
    pos_terminale: number | null; rt_scontrini: number | null; note: string | null; chiusa_il?: string | null; chiusa_da?: string | null;
    file_scaricato_il?: string | null; nuova?: boolean; apertura_da?: string | null; futura?: boolean; origine?: string; file_excel?: string | null;
    reintegro_tagli?: Tagli; reintegro_nota?: string | null; apertura_confermata_il?: string | null; apertura_confermata_da?: string | null; apertura_differenza?: number | null;
    chiusura_confermata_il?: string | null; chiusura_confermata_da?: string | null; reintegro_confermata_il?: string | null; reintegro_confermata_da?: string | null;
  };
  righe: RigaGiornata[]; totali: Record<'contanti' | 'pos' | 'stripe' | 'bonifico' | 'paypal', number>; totale_giorno: number;
  riepilogo: {
    apertura: number; prelievi: number; versamenti?: number; chiusura_teorica: number; chiusura_contata: number; pos_terminale: number | null; pos_da_sumup: number | null;
    fatture_n: number; fatture_totale: number; fatture_prec_totale: number; scontrini_n: number; scontrini_totale: number; altro_totale: number;
    acconti_n: number; acconti_totale: number; note_credito_n: number; note_credito_totale: number; rimborsi_contanti: number; storni_totale: number;
    reintegro: number; cassa_per_domani: number; apertura_attesa: number | null; apertura_attesa_tagli: Tagli | null; apertura_attesa_da: string | null;
  };
  controlli: ControlloCassa[]; conti_tornano: boolean; tagli: string[]; tagli_apertura: string[]; tagli_chiusura: string[];
  calendario?: CalendarioGiorno;
  /** «oggi» secondo il server (Roma): la pagina non si fida dell'orologio del Mac (04/10/2026) */
  oggi_roma?: string;
}

// === GIORNI DI CHIUSURA della cassa (04/10/2026) ===
export interface StatoGiornoCal {
  giorno: string; nome: string; lavorativo: boolean; motivo: string | null; etichetta: string; fonte: string; nota: string | null;
  festivita_proposta?: string | null;
}
export interface CalendarioGiorno extends StatoGiornoCal {
  precedente_lavorativo: string | null; successivo_lavorativo: string; prossimo_lavorativo: string; oggi_lavorativo: boolean;
  /** giorni chiusi subito prima i cui incassi elettronici sono in questa cassa */
  assorbiti: { giorno: string; nome: string; etichetta: string }[];
  /** giorno chiuso: movimenti fisici (anomalia) ed elettronici (passano al giorno lavorativo successivo) */
  anomalie: string[]; elettronici: { testo: string; importo: number; modalita: string }[]; passano_al?: string | null;
}
export interface RegolaCal { id: string; giorno_settimana: 5 | 6; giorno_nome: string; dal: string | null; al: string | null; nota: string | null; creato_da: string | null; created_at: string }
export interface DataCal { giorno: string; giorno_nome: string; stato: 'chiuso' | 'aperto'; motivo: string | null; motivo_nome: string; nota: string | null; passato: boolean; creato_da: string | null }
export interface FestivitaProposta { giorno: string; nome: string; giorno_nome: string; gia_chiuso: boolean; etichetta: string }
export interface VistaCalendario {
  oggi: StatoGiornoCal; prossimo_lavorativo: string; regole: RegolaCal[]; date: DataCal[]; festivita: FestivitaProposta[];
  motivi: Record<string, string>; sabato_sbloccato_oggi: boolean; domenica_sbloccata_oggi: boolean;
}
export interface DaChiudere { giornate: { giorno: string; nome: string; tipo: 'da_chiudere' | 'anomalia'; testo: string; elenco?: string[] }[]; prossimo_lavorativo: string; oggi: StatoGiornoCal }
export async function calendarioCassa(): Promise<VistaCalendario> { return fetchAPI('/api/cassa/calendario'); }
export async function calendarioAnteprima(giorno: string): Promise<StatoGiornoCal & { fisici: string[]; elettronici: { testo: string }[]; si_puo_chiudere: boolean; passano_al: string }> {
  return fetchAPI(`/api/cassa/calendario/anteprima/${giorno}`);
}
export async function calendarioChiudi(giorno: string, motivo: string, nota = ''): Promise<{ ok: boolean; successivo_lavorativo: string }> {
  return fetchAPI(`/api/cassa/calendario/giorni/${giorno}/chiuso`, { method: 'POST', body: JSON.stringify({ motivo, nota }) });
}
export async function calendarioApri(giorno: string, nota = ''): Promise<{ ok: boolean }> {
  return fetchAPI(`/api/cassa/calendario/giorni/${giorno}/aperto`, { method: 'POST', body: JSON.stringify({ nota }) });
}
export async function calendarioRimuovi(giorno: string): Promise<{ ok: boolean }> {
  return fetchAPI(`/api/cassa/calendario/giorni/${giorno}`, { method: 'DELETE' });
}
export async function calendarioSblocca(giornoSettimana: 5 | 6, dal: string, al: string, nota = ''): Promise<{ ok: boolean }> {
  return fetchAPI(`/api/cassa/calendario/sblocca/${giornoSettimana}`, { method: 'POST', body: JSON.stringify({ dal: dal || null, al: al || null, nota }) });
}
export async function calendarioBlocca(giornoSettimana: 5 | 6, regolaId?: string): Promise<{ ok: boolean; disattivate: number }> {
  return fetchAPI(`/api/cassa/calendario/blocca/${giornoSettimana}`, { method: 'POST', body: JSON.stringify(regolaId ? { regola_id: regolaId } : {}) });
}
export async function calendarioFestivita(giorni: string[], aperti: string[] = []): Promise<{ ok: boolean; chiusi: string[]; errori: { giorno: string; errore: string }[] }> {
  return fetchAPI('/api/cassa/calendario/festivita', { method: 'POST', body: JSON.stringify({ giorni, aperti }) });
}
/** Cassa del giorno: letture con timeout (20 s) e annullabili quando si cambia giorno (04/10/2026). */
export const CASSA_TIMEOUT_MS = 20_000;
export async function cassaDaChiudere(signal?: AbortSignal): Promise<DaChiudere> { return fetchAPI('/api/cassa/calendario/da-chiudere', { signal, timeoutMs: CASSA_TIMEOUT_MS }); }
export async function cassaGiornata(giorno: string, signal?: AbortSignal): Promise<FoglioCassa> {
  return fetchAPI(`/api/cassa/giornata?giorno=${giorno}`, { signal, timeoutMs: CASSA_TIMEOUT_MS });
}
export async function cassaGiornataSalva(giorno: string, body: Partial<FoglioCassa['giornata']>): Promise<FoglioCassa> {
  return fetchAPI(`/api/cassa/giornata?giorno=${giorno}`, { method: 'PUT', body: JSON.stringify(body), timeoutMs: CASSA_TIMEOUT_MS });
}
export async function cassaGiornataRiga(body: Record<string, string | number>): Promise<FoglioCassa> {
  return fetchAPI('/api/cassa/giornata/movimenti', { method: 'POST', body: JSON.stringify(body) });
}
export async function cassaGiornataElimina(id: string): Promise<FoglioCassa> { return fetchAPI(`/api/cassa/giornata/movimenti/${id}`, { method: 'DELETE' }); }
/** Storno (anche parziale) o annullo di una riga «scontrino» battuta a mano: riga negativa nella cassa di OGGI. */
export async function cassaGiornataStorno(id: string, body: { tipo: 'storno' | 'annullo'; numero: string; importo?: number; modalita?: string; motivo: string; operatore: string }): Promise<FoglioCassa & { ok: boolean }> {
  return fetchAPI(`/api/cassa/giornata/movimenti/${id}/storno`, { method: 'POST', body: JSON.stringify(body) });
}
export async function cassaGiornataChiudi(giorno: string, forza = false, nota = ''): Promise<FoglioCassa> {
  return fetchAPI('/api/cassa/giornata/chiudi', { method: 'POST', body: JSON.stringify({ giorno, forza, nota }) });
}
export async function cassaGiornataRiapri(giorno: string): Promise<FoglioCassa> {
  return fetchAPI('/api/cassa/giornata/riapri', { method: 'POST', body: JSON.stringify({ giorno }) });
}
export async function cassaGiornataConfermaApertura(giorno: string): Promise<FoglioCassa> {
  return fetchAPI('/api/cassa/giornata/conferma-apertura', { method: 'POST', body: JSON.stringify({ giorno }) });
}
export type BloccoCassa = 'apertura' | 'chiusura' | 'reintegro';
/** Conferma (blocca) un conteggio: dopo non si modifica più, salvo sblocco autorizzato dall'amministratore. */
export async function cassaGiornataConferma(giorno: string, blocco: BloccoCassa): Promise<FoglioCassa> {
  return fetchAPI('/api/cassa/giornata/conferma', { method: 'POST', body: JSON.stringify({ giorno, blocco }) });
}
export async function cassaGiornataSblocca(giorno: string, blocco: BloccoCassa): Promise<FoglioCassa> {
  return fetchAPI('/api/cassa/giornata/sblocca', { method: 'POST', body: JSON.stringify({ giorno, blocco }) });
}
/** Apre il cassetto del registratore (lo fa l'agente sul Mac del negozio). */
export async function cassaApriCassetto(motivo = ''): Promise<{ ok: boolean; id: string }> {
  return fetchAPI('/api/cassa/apri-cassetto', { method: 'POST', body: JSON.stringify({ motivo }) });
}

// === POS SUMUP (Cloud API) — 01/10/2026 ===
export interface LettorePos { id: string; nome: string; abbinamento: string; modello?: string; seriale?: string; online: boolean | null; stato?: string | null; batteria?: number | null }
export interface IncassoPos { id: string; stato: 'in_attesa' | 'pagato' | 'fallito' | 'annullato' | 'errore'; importo?: number; lettore_id?: string | null;
  checkout_id?: string | null; client_transaction_id?: string | null; dettaglio?: unknown; metodo?: 'pos' | 'paypal'; modo?: 'lettore' | 'transazioni' | 'paypal';
  transaction_code?: string | null; link_pagamento?: string | null; paypal_order_id?: string | null; confermato_manualmente?: boolean; created_at?: string }
export async function posLettori(): Promise<{ lettori: LettorePos[] }> { return fetchAPI('/api/pos/lettori'); }
export async function posAbbina(codice: string, nome: string): Promise<{ ok: boolean }> {
  return fetchAPI('/api/pos/abbina', { method: 'POST', body: JSON.stringify({ codice, nome }) });
}
export async function posRimuovi(id: string): Promise<{ ok: boolean }> { return fetchAPI(`/api/pos/lettori/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function posIncassa(body: { lettore_id?: string; lettore_nome?: string; importo: number; descrizione?: string; rif_tipo?: string; rif_id?: string; metodo?: 'pos' | 'paypal' }): Promise<IncassoPos> {
  return fetchAPI('/api/pos/incassa', { method: 'POST', body: JSON.stringify(body) });
}
export async function posStato(id: string): Promise<IncassoPos> { return fetchAPI(`/api/pos/incassi/${id}`); }
export async function posAnnulla(id: string): Promise<IncassoPos> { return fetchAPI(`/api/pos/incassi/${id}/annulla`, { method: 'POST' }); }
export async function posConfermaManuale(id: string, body: { transaction_code?: string; nota?: string }): Promise<IncassoPos> {
  return fetchAPI(`/api/pos/incassi/${id}/conferma-manuale`, { method: 'POST', body: JSON.stringify(body) });
}

export function cassaGiornataUrlExcel(giorno: string) { return `${API_PROXY}/api/cassa/giornata/excel?giorno=${giorno}`; }

// === PREVENTIVI E ORDINI CLIENTE — 30/09/2026 ===
export interface RigaDoc { descrizione: string; quantita: number; prezzo_ivato: number; aliquota: number; sconto?: number; prodotto_id?: string | null }
export interface PagamentoDoc { /** pagamento misto dello scontrino (03/10/2026) */ dettaglio?: { modalita: string; importo: number }[] | null;
  id: string; data: string; tipo: 'acconto' | 'saldo'; importo: number; modalita: string; certificato: 'scontrino' | 'fattura';
  scontrino_numero: string | null; fattura_id: string | null;
  /** scontrino battuto dal registratore: da_stampare · in_stampa · emesso · simulato · errore */
  scontrino_id?: string | null; scontrino_stato?: string; scontrino_errore?: string | null; riferimento?: string | null; operatore?: string | null;
  /** fattura collegata ma non ancora pagata: non conta nel pagato dell'ordine */
  in_attesa?: boolean; fattura_numero?: string | null; fattura_stato?: string | null; fattura_tipo?: string | null;
}
export type FaseOrdine = 'da_ordinare' | 'ordinato' | 'arrivato' | 'ritirato';
export interface AvvisoOrdine { canale: 'email' | 'whatsapp'; il: string; destinatario: string; operatore?: string; da?: string;
  /** invio del pro forma (05/10/2026): inviata · in_coda · wa.me (linea Apple in sola lettura) */
  tipo?: string; modo?: string; mittente?: string; linea?: string }
export interface DocumentoCliente {
  id: string; tipo: TipoDocumento; anno: number; numero: number; sigla: string; data: string;
  stato: 'aperto' | 'convertito' | 'saldato' | 'annullato'; anagrafica_id: string | null; controparte: FattControparte;
  cliente_nome: string | null; cliente?: string; telefono: string | null; email: string | null; righe: RigaDoc[]; totale: number;
  rif: string | null; note: string | null; convertito_in: { tipo: string; id?: string; sigla?: string; numero?: string } | null;
  pagamenti?: PagamentoDoc[]; pagato: number; residuo: number; created_at: string; session_id?: string | null;
  /** CHR · VALE · DUMY · ALTRO */
  operatore?: string | null;
  // percorso dell'ordine a cliente (01/10/2026)
  fase?: FaseOrdine; ordinato_il?: string | null; arrivato_il?: string | null; ritirato_il?: string | null;
  avvisi?: AvvisoOrdine[]; messaggio_arrivo?: string; whatsapp_link?: string | null; whatsapp_auto?: boolean;
  /** fatture emesse sull'ordine e non ancora pagate · quanto resta da certificare (residuo − in_attesa) */
  in_attesa?: number; da_certificare?: number;
  /** fornitore da cui è stato ordinato (rubrica fornitori o testo libero) */
  fornitore_id?: string | null; fornitore_nome?: string | null;
  /** Genius Lab Gestionale: tarature | apple */
  attivita?: 'tarature' | 'apple' | null;
  /** pro forma di una sessione già pagata (link Stripe, POS, bonifico): la fattura nasce quietanzata con questo (05/10/2026) */
  pagamento_sessione?: PagamentoGiaArrivato | null;
  /** scadenza del pagamento del pro forma (05/10/2026) */
  scadenza?: string | null;
  attivita_nota?: string | null;
}
export interface PagamentoGiaArrivato {
  pagata: boolean; fonte: 'registro' | 'sessione'; modalita: FattModalita; modalita_label: string;
  data: string | null; riferimento: string | null; importo: number;
}
export type TipoDocumento = 'preventivo' | 'ordine' | 'proforma' | 'ddt';
export type VistaOrdini = 'aperti' | 'arrivati' | 'completati' | 'annullati' | 'tutti';
export async function docElenco(tipo: TipoDocumento, stato = '', q = '', vista = '', attivita = ''): Promise<DocumentoCliente[]> {
  return fetchAPI(`/api/documenti?tipo=${tipo}&stato=${stato}&q=${encodeURIComponent(q)}&vista=${vista}&attivita=${attivita}`);
}
export type EsitoIncassoOrdine = DocumentoCliente & { fattura?: { id: string; tipo_documento: string }; scontrino?: { id: string; stato: string } };
/** Acconto (importo) o intero/saldo dell'ordine con FATTURA: bozza TD02/TD01 da pagare in Fatturazione.
 *  Con lo scontrino si va invece alla Cassa: /cassa?ordine=<id>&importo=<x>&tipo=acconto|saldo */
export async function docIncassa(id: string, body: { importo?: number; intero?: boolean; certificato: 'fattura'; operatore: string }): Promise<EsitoIncassoOrdine> {
  return fetchAPI(`/api/documenti/${id}/incassa`, { method: 'POST', body: JSON.stringify(body) });
}
export async function docFase(id: string, fase: 'da_ordinare' | 'ordinato' | 'arrivato', operatore: string,
  fornitore?: { fornitore_id?: string | null; fornitore_nome?: string }): Promise<DocumentoCliente> {
  return fetchAPI(`/api/documenti/${id}/fase`, { method: 'POST', body: JSON.stringify({ fase, operatore, ...(fornitore || {}) }) });
}
export async function docAvvisa(id: string, canale: 'email' | 'whatsapp', operatore: string, automatico = false): Promise<DocumentoCliente> {
  return fetchAPI(`/api/documenti/${id}/avvisa`, { method: 'POST', body: JSON.stringify({ canale, operatore, automatico }) });
}
export async function docRitira(id: string, operatore: string): Promise<DocumentoCliente> {
  return fetchAPI(`/api/documenti/${id}/ritira`, { method: 'POST', body: JSON.stringify({ operatore }) });
}
export async function docDettaglio(id: string): Promise<DocumentoCliente> { return fetchAPI(`/api/documenti/${id}`); }
export async function docCrea(body: Partial<DocumentoCliente>): Promise<DocumentoCliente> {
  return fetchAPI('/api/documenti', { method: 'POST', body: JSON.stringify(body) });
}
export async function docModifica(id: string, body: Partial<DocumentoCliente>): Promise<DocumentoCliente> {
  return fetchAPI(`/api/documenti/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function docAnnulla(id: string): Promise<DocumentoCliente> { return fetchAPI(`/api/documenti/${id}/annulla`, { method: 'POST' }); }
export async function docAcconto(id: string, body: { importo: number; modalita: string; certificato: 'scontrino' | 'fattura'; scontrino_numero?: string; operatore: string }):
  Promise<DocumentoCliente & { fattura?: { id: string } }> {
  return fetchAPI(`/api/documenti/${id}/acconto`, { method: 'POST', body: JSON.stringify(body) });
}
export async function docConverti(id: string, body: { a: 'ordine' | 'fattura' | 'scontrino'; modalita?: string; scontrino_numero?: string; pagata?: boolean; operatore: string;
  /** sessione già pagata: metodo confermato (o corretto) nella finestra di conversione */ metodo_sessione?: string }):
  Promise<DocumentoCliente & { fattura?: { id: string }; ordine?: { id: string; sigla: string } }> {
  return fetchAPI(`/api/documenti/${id}/converti`, { method: 'POST', body: JSON.stringify(body) });
}
export async function docDaFattura(fid: string, body: { a: 'ordine' | 'preventivo' | 'scontrino'; modalita?: string; scontrino_numero?: string; operatore: string }):
  Promise<{ ok: boolean; documento?: { id: string; sigla: string; tipo: string } }> {
  return fetchAPI(`/api/documenti/da-fattura/${fid}`, { method: 'POST', body: JSON.stringify(body) });
}

// === MAGAZZINO: carico con scanner, riconoscimento barcode, inventario — 30/09/2026 ===
export interface InfoBarcode { descrizione: string | null; marca?: string | null; categoria?: string | null; fonte?: string | null; certezza?: string | null }
export interface Riconoscimento { barcode: string; trovato: 'magazzino' | 'online' | null; prodotto?: Prodotto; info?: InfoBarcode; quantita?: number }
export async function magRiconosci(codice: string): Promise<Riconoscimento> {
  return fetchAPI(`/api/magazzino/riconosci/${encodeURIComponent(codice)}`);
}
export async function magImportTesto(testo: string): Promise<{ righe: Riconoscimento[]; codici: number; pezzi: number }> {
  return fetchAPI('/api/magazzino/import-testo', { method: 'POST', body: JSON.stringify({ testo }) });
}
export async function magCaricoLotto(body: { modo: 'carico' | 'inventario'; causale?: string; righe: { barcode: string; quantita: number; descrizione?: string; marca?: string | null; prezzo?: number; costo?: number; aliquota?: number }[] }):
  Promise<{ esiti: { barcode: string; ok: boolean; errore?: string; creato?: boolean; descrizione?: string; giacenza?: number }[]; ok: number; errori: number }> {
  return fetchAPI('/api/magazzino/carico-lotto', { method: 'POST', body: JSON.stringify(body) });
}

// === CHIUSURA FISCALE dal pulsante della cassa del giorno (01/10/2026) ===
export interface ChiusuraRt { z: number; data: string; ora: string; totale: number; contanti: number; elettronico: number; annulli: number; resi: number; documenti: number; id_operazione?: string | null; nota?: string }
export interface RichiestaChiusura { id: string; stato: string; errore?: string | null; risposta_rt?: string | null; created_at: string; updated_at?: string; operatore?: string | null }
/** Mette in coda la chiusura fiscale (Z01): la esegue l'agente di cassa sul server del negozio. */
export async function cassaChiusuraFiscale(operatore: string): Promise<{ ok: boolean; id: string }> {
  return fetchAPI('/api/cassa/chiusura-fiscale', { method: 'POST', body: JSON.stringify({ operatore }) });
}
export async function cassaChiusureFiscali(giorno: string, signal?: AbortSignal): Promise<{ richieste: RichiestaChiusura[]; chiusure: ChiusuraRt[]; rt_scontrini: number | null }> {
  return fetchAPI(`/api/cassa/chiusure-fiscali?giorno=${encodeURIComponent(giorno)}`, { signal, timeoutMs: CASSA_TIMEOUT_MS });
}


// === GENIUS LAB GESTIONALE: attività Tarature / Apple (02/10/2026) ===
/** Cambia l'attività di un documento (in bozza: tutti; emesso: solo il titolare). */
export async function cambiaAttivita(tabella: 'fatture' | 'documenti' | 'scontrini' | 'cassa_movimenti' | 'prodotti' | 'incassi', id: string, attivita: 'tarature' | 'apple') {
  return fetchAPI(`/api/attivita/${tabella}/${id}`, { method: 'PATCH', body: JSON.stringify({ attivita }) });
}

// === MAGAZZINO APPLE: pezzi serializzati e carico dalle fatture ricevute (02/10/2026) ===
export type CategoriaMerce = 'nuovo' | 'ricondizionato' | 'usato_margine' | 'accessorio' | 'ricambio' | 'servizio';
export const CATEGORIE_MERCE: Record<CategoriaMerce, string> = {
  nuovo: 'Nuovo', ricondizionato: 'Ricondizionato', usato_margine: 'Usato (margine)', accessorio: 'Accessorio', ricambio: 'Ricambio', servizio: 'Servizio',
};
export type StatoPezzo = 'in_stock' | 'venduto' | 'reso' | 'in_conto_vendita';
export const STATI_PEZZO: Record<StatoPezzo, string> = { in_stock: 'Disponibile', venduto: 'Venduto', reso: 'Reso al fornitore', in_conto_vendita: 'In conto vendita' };
export interface Pezzo {
  id: string; prodotto_id: string; seriale: string | null; imei: string | null; condizione: string | null; costo: number | null;
  fornitore_id: string | null; fornitore_nome: string | null; fattura_acquisto_id: string | null; data_carico: string;
  stato: StatoPezzo; venduto_scontrino_id: string | null; venduto_fattura_id: string | null; venduto_il: string | null;
  cliente_nome: string | null; note: string | null;
  prodotti?: { descrizione: string; codice: string | null; categoria_merce: CategoriaMerce | null; regime_iva: string | null; prezzo: number } | null;
}
export async function magPezzi(params: { prodotto_id?: string; stato?: string; q?: string; disponibili?: boolean }): Promise<{ pezzi: Pezzo[] }> {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false).map(([k, v]) => [k, String(v)])).toString();
  return fetchAPI(`/api/magazzino/pezzi?${q}`);
}
export async function magCaricaPezzo(body: Partial<Pezzo> & { prodotto_id: string }): Promise<Pezzo> {
  return fetchAPI('/api/magazzino/pezzi', { method: 'POST', body: JSON.stringify(body) });
}
export async function magModificaPezzo(id: string, body: Partial<Pezzo>): Promise<Pezzo> {
  return fetchAPI(`/api/magazzino/pezzi/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export interface RigaCaricoFattura {
  indice: number; descrizione: string; descrizione_articolo: string; quantita: number; costo: number; aliquota: number | null; codice: string | null;
  serializzato: boolean; seriale: string | null; imei: string | null; categoria_merce: CategoriaMerce;
  prodotto: { id: string; descrizione: string; codice: string | null; serializzato: boolean; categoria_merce: CategoriaMerce | null } | null;
  gia_caricata: boolean; proposta: 'carica' | 'salta';
}
export async function magPropostaCaricoFattura(fid: string): Promise<{ fattura: { id: string; numero: string; data: string; controparte_nome: string }; righe: RigaCaricoFattura[] }> {
  return fetchAPI(`/api/magazzino/carico-fattura/${fid}`);
}
export async function magCaricoFattura(fid: string, righe: Record<string, unknown>[]): Promise<{ ok: boolean; esiti: { indice: number; ok: boolean; errore?: string; pezzi?: number; quantita?: number }[] }> {
  return fetchAPI(`/api/magazzino/carico-fattura/${fid}`, { method: 'POST', body: JSON.stringify({ righe }) });
}


// === AZIONI SUL PRO FORMA (05/10/2026, caso PF 10/2026): stampa, invio email/WhatsApp, divisione, spedisci ===
export interface InvioAnteprima {
  canale: 'email' | 'whatsapp'; attivita: 'tarature' | 'apple'; destinatario: string; testo: string; invii: AvvisoOrdine[];
  mittente?: string; firma?: string; oggetto?: string; allegato?: string;
  numero?: string | null; link_pdf?: string; wa_link?: string | null; linea?: string; etichetta?: string; automatica?: boolean; avviso?: string | null;
}
export const docStampa = (id: string): Promise<{ ok: boolean; id: string; copie: number; agente_attivo: boolean }> =>
  fetchAPI(`/api/documenti/${id}/stampa`, { method: 'POST', body: '{}' });
export const docInvioAnteprima = (id: string, canale: 'email' | 'whatsapp'): Promise<InvioAnteprima> =>
  fetchAPI(`/api/documenti/${id}/invio?canale=${canale}`);
export const docInvia = (id: string, b: { canale: 'email' | 'whatsapp'; destinatario: string; testo: string; oggetto?: string; operatore: string; solo_link?: boolean }):
  Promise<{ ok: boolean; canale: string; a: string; modo?: string; wa_link?: string | null; avviso?: string | null; mittente?: string }> =>
  fetchAPI(`/api/documenti/${id}/invia`, { method: 'POST', body: JSON.stringify(b) });
export const docSposta = (id: string, b: { attivita: 'tarature' | 'apple'; conferma?: boolean; anche_collegati?: boolean }):
  Promise<DocumentoCliente & { collegati_spostati: string[] }> =>
  fetchAPI(`/api/documenti/${id}/attivita`, { method: 'POST', body: JSON.stringify(b) });
export type LinkDocumento = { documento_id?: string | null; fattura_id?: string | null; scontrino_id?: string | null };
export interface SpedPrecompilata {
  attivita: 'tarature' | 'apple'; controparte: SpedIndirizzo; email: string; riferimento: string; contenuto: string; mancanti: string[];
  link: LinkDocumento; mittente: string;
  /** P.IVA della controparte e fonti che hanno completato i campi vuoti (rubrica spedizioni unica, 08/10/2026) */
  piva?: string; fonti?: string[];
}
export const spedPrecompila = (l: LinkDocumento): Promise<SpedPrecompilata> => {
  const p = new URLSearchParams();
  Object.entries(l).forEach(([k, v]) => { if (v) p.set(k, v); });
  return fetchAPI(`/api/spedizioni/precompila?${p.toString()}`);
};
export const spedDelDocumento = (l: LinkDocumento): Promise<{ spedizioni: SpedRiga[] }> => {
  const p = new URLSearchParams();
  Object.entries(l).forEach(([k, v]) => { if (v) p.set(k, v); });
  return fetchAPI(`/api/spedizioni?${p.toString()}`);
};
