/**
 * Client API per il backend tarature
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tarature-api-production.up.railway.app';

async function fetchAPI(path: string, options: RequestInit = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API Error: ${res.status}`);
  }
  return res.json();
}

// === CLIENTI ===
export async function searchCustomers(query: string, limit = 10) {
  return fetchAPI(`/api/customers/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function getCustomer(id: string) {
  return fetchAPI(`/api/customers/${id}`);
}

// === SESSIONI ===
export async function createSession(customerId: string, operator?: string) {
  return fetchAPI('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ customer_id: customerId, operator }),
  });
}

export async function listSessions(params?: { status?: string; date?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.date) qs.set('date', params.date);
  if (params?.limit) qs.set('limit', String(params.limit));
  return fetchAPI(`/api/sessions?${qs.toString()}`);
}

export async function getSession(id: string) {
  return fetchAPI(`/api/sessions/${id}`);
}

// === STRUMENTI ===
export async function addInstrument(data: {
  session_id: string;
  customer_id: string;
  instrument_name: string;
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

// === 4 PULSANTI AZIONE ===
export async function registerComplete(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/register-complete`, { method: 'POST' });
}

export async function notifyReady(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/notify-ready`, { method: 'POST' });
}

export async function sendProforma(sessionId: string) {
  return fetchAPI(`/api/sessions/${sessionId}/send-proforma`, { method: 'POST' });
}

export async function markDelivered(sessionId: string, notes?: string) {
  return fetchAPI(`/api/sessions/${sessionId}/mark-delivered`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, notes }),
  });
}

// === RAPPORTI ===
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

export async function sendCustomerNotification(customerName: string) {
  return fetchAPI(`/api/schedule/notify-customer/${encodeURIComponent(customerName)}`, { method: 'POST' });
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
