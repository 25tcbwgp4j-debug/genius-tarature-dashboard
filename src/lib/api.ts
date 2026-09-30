/**
 * Client API per il backend tarature
 */

// Per gli endpoint interattivi passiamo dal proxy /api/backend/*
// (route handler Next.js) che inoltra al backend Railway aggiungendo
// l'header X-API-Key lato server. L'API_KEY non e' mai esposta al client.
const API_PROXY = '/api/backend';


/** Errore del backend con codice HTTP e dettaglio (es. 409 «fattura già esistente» con la fattura trovata).
 *  `inAttesa` = operazione protetta mandata all'amministratore per l'approvazione (non è un vero errore). */
export type ApiError = Error & { status?: number; detail?: any; inAttesa?: boolean; autorizzazioneId?: string };  // eslint-disable-line @typescript-eslint/no-explicit-any

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

async function fetchAPI(path: string, options: RequestInit = {}, conDialog = true): Promise<any> {  // eslint-disable-line @typescript-eslint/no-explicit-any
  const url = `${API_PROXY}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  const res = await fetch(url, {
    ...options,
    headers,
  });
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
          return fetchAPI(path, { ...options, headers: { ...(options.headers as Record<string, string> | undefined), ...extra } }, false);
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
export async function createSession(customerId: string, operator?: string) {
  return fetchAPI('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ customer_id: customerId, operator }),
  });
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

export async function sendProforma(
  sessionId: string,
  proformaSuffix = "",
  shipping?: { included: boolean; amount?: number },
  channel: 'email' | 'whatsapp' | 'both' = 'both',
  dryRun = false,
) {
  const payload: Record<string, unknown> = { proforma_suffix: proformaSuffix, channel };
  if (shipping?.included) {
    payload.shipping_included = true;
    if (typeof shipping.amount === "number" && !Number.isNaN(shipping.amount)) {
      payload.shipping_amount = shipping.amount;
    }
  }
  if (dryRun) payload.dry_run = true;
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

export async function createShipment(sessionId: string, body: ShipmentRequest) {
  return fetchAPI(`/api/sessions/${sessionId}/shipments`, {
    method: 'POST', body: JSON.stringify(body),
  });
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

// === FATTURAZIONE (Openapi SDI) — 30/09/2026 ===
export type FattSocieta = 'genius' | 'gingy' | 'avantifiori';
export type FattModalita = 'contanti' | 'pos_sumup' | 'carta_stripe' | 'paypal' | 'bonifico' | 'non_pagato';
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
}
export interface FattControparte {
  denominazione?: string; nome?: string; cognome?: string;
  piva?: string; cf?: string; sdi?: string; pec?: string;
  indirizzo?: string; civico?: string; cap?: string; comune?: string; provincia?: string;
  paese?: string; email?: string; telefono?: string;
}
export interface Fattura {
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
  origine?: string; anagrafica_id?: string | null;
  esiti?: { id: string; tipo: string; descrizione: string; data: string }[];
  controlli?: string[];
  collegata?: { id: string; numero: string; data: string; totale: number } | null;
  note_credito?: { id: string; numero: string; data: string; totale: number; stato: string }[];
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
export async function fattEmetti(id: string): Promise<{ ok: boolean; numero?: string | null; errore?: string | null }> { return fetchAPI(`/api/fatturazione/fatture/${id}/emetti`, { method: 'POST' }); }
export async function fattPagamento(id: string, body: { modalita?: FattModalita; data?: string; riferimento?: string; annulla?: boolean }) {
  return fetchAPI(`/api/fatturazione/fatture/${id}/pagamento`, { method: 'POST', body: JSON.stringify(body) });
}
export async function fattLinkStripe(id: string) { return fetchAPI(`/api/fatturazione/fatture/${id}/link-stripe`, { method: 'POST' }); }
export async function fattNotaCredito(id: string): Promise<Fattura> { return fetchAPI(`/api/fatturazione/fatture/${id}/nota-credito`, { method: 'POST' }); }
export async function fattDuplica(id: string): Promise<Fattura> { return fetchAPI(`/api/fatturazione/fatture/${id}/duplica`, { method: 'POST' }); }
export async function fattDaSessione(sessionId: string, emetti = false, forza = false) { return fetchAPI(`/api/fatturazione/fatture/da-sessione/${sessionId}`, { method: 'POST', body: JSON.stringify({ emetti, forza }) }); }
export async function fattCollegaSessione(sessionId: string, fatturaId: string) { return fetchAPI(`/api/fatturazione/sessione/${sessionId}/collega`, { method: 'POST', body: JSON.stringify({ fattura_id: fatturaId }) }); }
export async function fattStatoSessione(sessionId: string) { return fetchAPI(`/api/fatturazione/sessione/${sessionId}`); }
export async function fattSincronizza() { return fetchAPI('/api/fatturazione/sincronizza', { method: 'POST' }); }
export function fattUrlXml(id: string) { return `${API_PROXY}/api/fatturazione/fatture/${id}/xml`; }
export function fattUrlStampa(id: string) { return `${API_PROXY}/api/fatturazione/fatture/${id}/stampa`; }

// Anagrafiche di fatturazione (clienti/fornitori per società; Genius importata da SimplyFatt) — 30/09/2026
export interface FattAnagrafica {
  id: string; societa: FattSocieta; tipo: 'cliente' | 'fornitore'; origine: string; codice?: string | null;
  denominazione: string | null; piva: string | null; cf: string | null; sdi: string | null; pec: string | null;
  indirizzo: string | null; cap: string | null; comune: string | null; provincia: string | null; paese: string | null;
  email: string | null; telefono: string | null; referente?: string | null; attivo?: boolean;
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

// Crediti per cliente, estratto conto, incassi multipli, export CSV — 30/09/2026
export interface FattCredito {
  chiave: string; nome: string | null; piva: string | null; cf: string | null; email: string | null;
  anagrafica_id: string | null; n: number; totale: number; scaduto: number; piu_vecchia: string | null;
  fatture: { id: string; numero: string | null; data: string | null; scadenza: string | null; totale: number; stato: string; pagamento_modalita: string | null }[];
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
export async function fattEstrattoInvia(body: { societa: string; chiave: string; email: string; ids?: string[]; messaggio?: string; mittente?: string; dal?: string; al?: string; allega_fatture?: boolean }) {
  return fetchAPI('/api/fatturazione/estratto/invia', { method: 'POST', body: JSON.stringify(body) });
}
export function fattUrlPdf(id: string, download = false) { return `${API_PROXY}/api/fatturazione/fatture/${id}/pdf${download ? '?download=true' : ''}`; }
export async function fattInvia(id: string, body: { canale: 'email' | 'whatsapp'; email?: string; telefono?: string; messaggio?: string }) {
  return fetchAPI(`/api/fatturazione/fatture/${id}/invia`, { method: 'POST', body: JSON.stringify(body) });
}
export interface FattVoceCatalogo { gruppo: string; codice: string | null; descrizione: string; prezzo_ivato: number | null; aliquota: number }
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
export async function incAzione(id: string, body: { azione: string; fattura_ids?: string[]; session_id?: string | null; proforma_id?: string; modalita?: string; emetti?: boolean; nota?: string; forza?: boolean }):
  Promise<{ incasso?: { esito?: string | null }; da_spedire?: DaSpedire | null; [k: string]: unknown }> {
  return fetchAPI(`/api/incassi/${id}/azione`, { method: 'POST', body: JSON.stringify(body) });
}
export async function incSessione(sessionId: string): Promise<{ incassi: { id: string; fonte: IncFonte; data: string; importo: number; ordinante: string | null; stato: string; esito: string | null }[]; da_spedire: DaSpedire | null }> {
  return fetchAPI(`/api/incassi/sessione/${sessionId}`);
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
  movimenti?: { id: string; tipo: string; quantita: number; causale: string | null; created_at: string; creato_da: string | null }[];
}
export interface RigaCassa { prodotto_id?: string | null; descrizione: string; quantita: number; prezzo: number; aliquota: number; sconto?: number }
export interface Scontrino {
  id: string; stato: string; righe: RigaCassa[]; totale: number; pagamenti: { modalita: string; importo: number }[];
  codice_lotteria: string | null; numero_rt: string | null; errore: string | null; risposta_rt: string | null; created_at: string;
  /** vendita (default) · reso · annullo: i documenti di reso/annullo hanno importi da leggere in NEGATIVO */
  tipo_documento?: 'vendita' | 'reso' | 'annullo' | null; rif_scontrino_id?: string | null; motivo?: string | null; creato_da?: string | null;
}
export async function magProdotti(q = '', sottoScorta = false, limit = 300): Promise<{ prodotti: Prodotto[]; totale_righe: number | null; valore_magazzino: number }> {
  return fetchAPI(`/api/magazzino/prodotti?q=${encodeURIComponent(q)}&sotto_scorta=${sottoScorta}&limit=${limit}`);
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
export async function cassaScontrino(body: { righe: RigaCassa[]; pagamenti: { modalita: string; importo: number }[]; codice_lotteria?: string }): Promise<Scontrino> {
  return fetchAPI('/api/cassa/scontrini', { method: 'POST', body: JSON.stringify(body) });
}
export async function cassaScontrini(giorno = '') { return fetchAPI(`/api/cassa/scontrini?giorno=${giorno}`); }
export async function cassaAnnulla(id: string) { return fetchAPI(`/api/cassa/scontrini/${id}/annulla`, { method: 'POST' }); }
/** Reso (anche parziale) o annullo di uno scontrino GIÀ EMESSO: nasce un documento negativo nella cassa di oggi. */
export async function cassaStornoScontrino(id: string, body: { tipo: 'reso' | 'annullo'; righe?: { indice: number; quantita: number }[]; modalita?: string; motivo: string; numero_rt?: string }): Promise<Scontrino> {
  return fetchAPI(`/api/cassa/scontrini/${id}/storno`, { method: 'POST', body: JSON.stringify(body) });
}
export async function cassaRiprova(id: string) { return fetchAPI(`/api/cassa/scontrini/${id}/riprova`, { method: 'POST' }); }
export async function cassaFattura(body: { righe: RigaCassa[]; pagamenti?: { modalita: string }[]; pagata?: boolean }): Promise<Fattura> {
  return fetchAPI('/api/cassa/fattura', { method: 'POST', body: JSON.stringify(body) });
}

// === CASSA DEL GIORNO (ex Excel BASE CASSA) — 30/09/2026 ===
export type Tagli = Record<string, number>;
export interface RigaGiornata {
  id: string; tipo: string; numero: string; descrizione: string; modello: string; fonte: 'fattura' | 'fattura_prec' | 'scontrino' | 'manuale';
  contanti: number; pos: number; stripe: number; bonifico: number; paypal: number; totale: number;
}
export interface ControlloCassa { chiave: string; nome: string; atteso: number | null; trovato: number; differenza: number | null; ok: boolean; mancante: boolean; nota: string }
export interface FoglioCassa {
  giornata: {
    giorno: string; stato: 'aperta' | 'chiusa'; apertura_tagli: Tagli; chiusura_tagli: Tagli; prelievi: { importo: number; nota: string; tipo?: string }[];
    pos_terminale: number | null; rt_scontrini: number | null; note: string | null; chiusa_il?: string | null; chiusa_da?: string | null;
    file_scaricato_il?: string | null; nuova?: boolean; apertura_da?: string | null; futura?: boolean; origine?: string; file_excel?: string | null;
    reintegro_tagli?: Tagli; reintegro_nota?: string | null; apertura_confermata_il?: string | null; apertura_confermata_da?: string | null; apertura_differenza?: number | null;
  };
  righe: RigaGiornata[]; totali: Record<'contanti' | 'pos' | 'stripe' | 'bonifico' | 'paypal', number>; totale_giorno: number;
  riepilogo: {
    apertura: number; prelievi: number; chiusura_teorica: number; chiusura_contata: number; pos_terminale: number | null; pos_da_sumup: number | null;
    fatture_n: number; fatture_totale: number; fatture_prec_totale: number; scontrini_n: number; scontrini_totale: number; altro_totale: number;
    acconti_n: number; acconti_totale: number; note_credito_n: number; note_credito_totale: number; rimborsi_contanti: number; storni_totale: number;
    reintegro: number; cassa_per_domani: number; apertura_attesa: number | null; apertura_attesa_tagli: Tagli | null; apertura_attesa_da: string | null;
  };
  controlli: ControlloCassa[]; conti_tornano: boolean; tagli: string[]; tagli_apertura: string[]; tagli_chiusura: string[];
}
export async function cassaGiornata(giorno: string): Promise<FoglioCassa> { return fetchAPI(`/api/cassa/giornata?giorno=${giorno}`); }
export async function cassaGiornataSalva(giorno: string, body: Partial<FoglioCassa['giornata']>): Promise<FoglioCassa> {
  return fetchAPI(`/api/cassa/giornata?giorno=${giorno}`, { method: 'PUT', body: JSON.stringify(body) });
}
export async function cassaGiornataRiga(body: Record<string, string | number>): Promise<FoglioCassa> {
  return fetchAPI('/api/cassa/giornata/movimenti', { method: 'POST', body: JSON.stringify(body) });
}
export async function cassaGiornataElimina(id: string): Promise<FoglioCassa> { return fetchAPI(`/api/cassa/giornata/movimenti/${id}`, { method: 'DELETE' }); }
/** Storno (anche parziale) o annullo di una riga «scontrino» battuta a mano: riga negativa nella cassa di OGGI. */
export async function cassaGiornataStorno(id: string, body: { tipo: 'storno' | 'annullo'; numero: string; importo?: number; modalita?: string; motivo: string }): Promise<FoglioCassa & { ok: boolean }> {
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
export function cassaGiornataUrlExcel(giorno: string) { return `${API_PROXY}/api/cassa/giornata/excel?giorno=${giorno}`; }

// === PREVENTIVI E ORDINI CLIENTE — 30/09/2026 ===
export interface RigaDoc { descrizione: string; quantita: number; prezzo_ivato: number; aliquota: number; sconto?: number; prodotto_id?: string | null }
export interface PagamentoDoc {
  id: string; data: string; tipo: 'acconto' | 'saldo'; importo: number; modalita: string; certificato: 'scontrino' | 'fattura';
  scontrino_numero: string | null; fattura_id: string | null;
}
export interface DocumentoCliente {
  id: string; tipo: 'preventivo' | 'ordine'; anno: number; numero: number; sigla: string; data: string;
  stato: 'aperto' | 'convertito' | 'saldato' | 'annullato'; anagrafica_id: string | null; controparte: FattControparte;
  cliente_nome: string | null; cliente?: string; telefono: string | null; email: string | null; righe: RigaDoc[]; totale: number;
  rif: string | null; note: string | null; convertito_in: { tipo: string; id?: string; sigla?: string; numero?: string } | null;
  pagamenti?: PagamentoDoc[]; pagato: number; residuo: number; created_at: string;
}
export async function docElenco(tipo: 'preventivo' | 'ordine', stato = '', q = ''): Promise<DocumentoCliente[]> {
  return fetchAPI(`/api/documenti?tipo=${tipo}&stato=${stato}&q=${encodeURIComponent(q)}`);
}
export async function docDettaglio(id: string): Promise<DocumentoCliente> { return fetchAPI(`/api/documenti/${id}`); }
export async function docCrea(body: Partial<DocumentoCliente>): Promise<DocumentoCliente> {
  return fetchAPI('/api/documenti', { method: 'POST', body: JSON.stringify(body) });
}
export async function docModifica(id: string, body: Partial<DocumentoCliente>): Promise<DocumentoCliente> {
  return fetchAPI(`/api/documenti/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export async function docAnnulla(id: string): Promise<DocumentoCliente> { return fetchAPI(`/api/documenti/${id}/annulla`, { method: 'POST' }); }
export async function docAcconto(id: string, body: { importo: number; modalita: string; certificato: 'scontrino' | 'fattura'; scontrino_numero?: string }):
  Promise<DocumentoCliente & { fattura?: { id: string } }> {
  return fetchAPI(`/api/documenti/${id}/acconto`, { method: 'POST', body: JSON.stringify(body) });
}
export async function docConverti(id: string, body: { a: 'ordine' | 'fattura' | 'scontrino'; modalita?: string; scontrino_numero?: string; pagata?: boolean }):
  Promise<DocumentoCliente & { fattura?: { id: string }; ordine?: { id: string; sigla: string } }> {
  return fetchAPI(`/api/documenti/${id}/converti`, { method: 'POST', body: JSON.stringify(body) });
}
export async function docDaFattura(fid: string, body: { a: 'ordine' | 'preventivo' | 'scontrino'; modalita?: string; scontrino_numero?: string }):
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
