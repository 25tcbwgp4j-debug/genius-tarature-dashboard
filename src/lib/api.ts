/**
 * Client API per il backend tarature
 */

// Per gli endpoint interattivi passiamo dal proxy /api/backend/*
// (route handler Next.js) che inoltra al backend Railway aggiungendo
// l'header X-API-Key lato server. L'API_KEY non e' mai esposta al client.
const API_PROXY = '/api/backend';


async function fetchAPI(path: string, options: RequestInit = {}) {
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
    throw new Error(typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((e: any) => e.msg || JSON.stringify(e)).join('; ') : `API Error: ${res.status}`));
  }
  return res.json();
}

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
