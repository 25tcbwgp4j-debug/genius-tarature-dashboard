/**
 * Client API per Chat Dashboard WhatsApp Web-like.
 * Tutte le chiamate passano dal proxy /api/backend/* che aggiunge X-API-Key.
 */

const BASE = "/api/backend/api/chat";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API ${res.status}`);
  }
  return res.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API ${res.status}`);
  }
  return res.json();
}

// ===== Types =====

export type LeadSource = "customer" | "fgas" | "cold" | "staff" | "unknown";
export type Direction = "inbound" | "outbound";
export type MessageType = "text" | "image" | "document" | "audio" | "video" | "template" | "system";
export type MessageStatus = "sent" | "delivered" | "read" | "failed" | "pending";

export interface Conversation {
  phone_number: string;
  customer_id: string | null;
  lead_source: LeadSource;
  sender_name: string | null;
  last_message_body: string | null;
  last_direction: Direction;
  last_message_type: MessageType;
  last_message_at: string;
  unread_count: number;
  last_inbound_at: string | null;
}

export interface ChatMessage {
  id: string;
  wa_message_id: string | null;
  phone_number: string;
  direction: Direction;
  message_type: MessageType;
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_filename: string | null;
  media_size_bytes: number | null;
  status: MessageStatus;
  error_msg: string | null;
  customer_id: string | null;
  lead_source: LeadSource;
  sender_name: string | null;
  operator_email: string | null;
  session_id: string | null;
  reply_to_wa_id: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ChatTemplate {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationContext {
  phone: string;
  lead_source: LeadSource;
  sender_name: string | null;
  customer_id: string | null;
  lead_id: string | null;
  customer: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  recent_rdts: Array<Record<string, unknown>>;
}

// ===== API =====

export async function listConversations(params: {
  source?: string;
  search?: string;
  unreadOnly?: boolean;
} = {}) {
  const qs = new URLSearchParams();
  if (params.source) qs.set("source", params.source);
  if (params.search) qs.set("search", params.search);
  if (params.unreadOnly) qs.set("unread_only", "true");
  return apiGet<{ conversations: Conversation[]; count: number }>(
    `/conversations?${qs.toString()}`,
  );
}

export async function listMessages(phone: string, before?: string) {
  const qs = new URLSearchParams({ phone });
  if (before) qs.set("before", before);
  return apiGet<{ messages: ChatMessage[]; count: number }>(
    `/messages?${qs.toString()}`,
  );
}

export async function sendText(payload: {
  phone: string;
  text: string;
  operator_email?: string;
  reply_to_wa_id?: string;
  template_id?: string;
}) {
  return apiPost<{ ok: boolean; reason?: string; result?: unknown }>("/send", payload);
}

export async function sendMedia(payload: {
  phone: string;
  file: File;
  caption?: string;
  operator_email?: string;
}) {
  const fd = new FormData();
  fd.append("phone", payload.phone);
  fd.append("file", payload.file);
  if (payload.caption) fd.append("caption", payload.caption);
  if (payload.operator_email) fd.append("operator_email", payload.operator_email);
  const res = await fetch(`${BASE}/send-media`, { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; reason?: string; result?: unknown }>;
}

export async function markRead(phone: string, upToId?: string) {
  return apiPost<{ ok: boolean }>("/mark-read", { phone, up_to_id: upToId });
}

export async function searchMessages(q: string) {
  return apiGet<{ results: ChatMessage[]; count: number }>(
    `/search?q=${encodeURIComponent(q)}`,
  );
}

export async function listTemplates() {
  return apiGet<{ templates: ChatTemplate[] }>("/templates");
}

export async function upsertTemplate(t: Partial<ChatTemplate> & { title: string; body: string }) {
  return apiPost<{ ok: boolean; template: ChatTemplate }>("/templates", t);
}

export async function deleteTemplate(id: string) {
  const res = await fetch(`${BASE}/templates/${id}`, { method: "DELETE" });
  return res.ok;
}

export async function getContext(phone: string) {
  return apiGet<ConversationContext>(`/context?phone=${encodeURIComponent(phone)}`);
}

export async function getStats() {
  return apiGet<{ unread_count: number }>("/stats");
}

export function exportUrl(phone: string, format: "txt" | "json" = "txt") {
  return `${BASE}/export?phone=${encodeURIComponent(phone)}&format=${format}`;
}

// ===== v2: Types =====

export interface ConversationState {
  phone_number: string;
  assigned_to: string | null;
  archived: boolean;
  archived_at: string | null;
  snoozed_until: string | null;
  tags: string[];
  priority: number;
  last_operator_response_at: string | null;
  first_response_time_seconds: number | null;
  notes: string | null;
  updated_at: string;
}

export interface ChatTag {
  id: string;
  slug: string;
  label: string;
  color: string;
}

export interface ScheduledMessage {
  id: string;
  phone_number: string;
  body: string | null;
  send_at: string;
  operator_email: string | null;
  status: string;
  sent_at: string | null;
  error: string | null;
  broadcast_id: string | null;
}

export interface Broadcast {
  id: string;
  title: string;
  segment: Record<string, unknown>;
  body: string | null;
  total_targets: number;
  sent_count: number;
  failed_count: number;
  status: string;
  scheduled_for: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Analytics {
  days: number;
  totals: { inbound: number; outbound: number };
  sla_avg_seconds: number | null;
}

// ===== v2: API =====

export async function setConversationState(payload: {
  phone: string;
  assigned_to?: string | null;
  archived?: boolean;
  snoozed_until?: string | null;
  tags?: string[];
  priority?: number;
  notes?: string;
}) {
  return apiPost<{ ok: boolean; state: ConversationState }>("/conversation-state", payload);
}

export async function getConversationState(phone: string) {
  return apiGet<{ state: ConversationState | null }>(
    `/conversation-state?phone=${encodeURIComponent(phone)}`,
  );
}

export async function starMessage(messageId: string, starred: boolean) {
  return apiPost<{ ok: boolean }>("/star", { message_id: messageId, starred });
}

export async function listStarred() {
  return apiGet<{ messages: ChatMessage[]; count: number }>("/starred");
}

export async function forwardMessage(payload: {
  source_message_id: string;
  to_phone: string;
  operator_email?: string;
}) {
  return apiPost<{ ok: boolean; result: unknown }>("/forward", payload);
}

export async function addInternalNote(payload: {
  phone: string;
  body: string;
  operator_email?: string;
}) {
  return apiPost<{ ok: boolean; note: ChatMessage }>("/note", payload);
}

export async function listTags() {
  return apiGet<{ tags: ChatTag[] }>("/tags");
}

export async function upsertTag(tag: Partial<ChatTag> & { label: string }) {
  return apiPost<{ ok: boolean; tag: ChatTag }>("/tags", tag);
}

export async function deleteTag(tagId: string) {
  const res = await fetch(`${BASE}/tags/${tagId}`, { method: "DELETE" });
  return res.ok;
}

export async function aiClassify(body: string, messageId?: string) {
  return apiPost<{ intent?: string; sentiment?: string; urgency?: boolean }>(
    "/ai/classify",
    { body, message_id: messageId },
  );
}

export async function aiSuggest(phone: string) {
  return apiPost<{ suggestion: string | null }>("/ai/suggest", { phone });
}

export async function aiSummarize(phone: string) {
  return apiPost<{ summary: string | null }>("/ai/summarize", { phone });
}

export async function scheduleSend(payload: {
  phone: string;
  body?: string;
  send_at: string;
  operator_email?: string;
  template_id?: string;
}) {
  return apiPost<{ ok: boolean; scheduled: ScheduledMessage }>("/schedule-send", payload);
}

export async function listScheduled(status = "pending") {
  return apiGet<{ scheduled: ScheduledMessage[]; count: number }>(
    `/scheduled?status=${status}`,
  );
}

export async function cancelScheduled(id: string) {
  const res = await fetch(`${BASE}/scheduled/${id}`, { method: "DELETE" });
  return res.ok;
}

export async function createBroadcast(payload: {
  title: string;
  segment: Record<string, unknown>;
  body?: string;
  template_id?: string;
  scheduled_for?: string;
  operator_email?: string;
}) {
  return apiPost<{
    ok: boolean;
    broadcast: Broadcast;
    preview_count: number;
    preview_sample: Array<Record<string, unknown>>;
  }>("/broadcast", payload);
}

export async function sendBroadcast(id: string) {
  return apiPost<{ ok: boolean; scheduled: number; total: number }>(
    `/broadcast/${id}/send`,
    {},
  );
}

export async function listBroadcasts() {
  return apiGet<{ broadcasts: Broadcast[] }>("/broadcast");
}

export async function sendRdt(payload: {
  phone: string;
  rdt_id: string;
  caption?: string;
  operator_email?: string;
}) {
  return apiPost<{ ok: boolean; result: unknown }>("/send-rdt", payload);
}

export async function sendQuote(payload: {
  phone: string;
  instruments: Array<{ type: string; brand?: string; qty: number }>;
  operator_email?: string;
  discount_percent?: number;
}) {
  return apiPost<{ ok: boolean; body: string; total: number }>("/send-quote", payload);
}

export async function promoteLead(phone: string) {
  return apiPost<{ ok: boolean; customer_id?: string; already_customer?: boolean }>(
    "/promote-lead",
    { phone },
  );
}

export async function sendEmail(payload: {
  phone: string;
  subject: string;
  body: string;
  operator_email?: string;
}) {
  return apiPost<{ ok: boolean; email: string }>("/send-email", payload);
}

export async function getAnalytics(days = 30) {
  return apiGet<Analytics>(`/analytics?days=${days}`);
}

export async function registerCustomer(payload: {
  phone: string;
  company_name: string;
  vat_number?: string;
  tax_id?: string;
  email?: string;
  address?: string;
  zip_code?: string;
  city?: string;
  province?: string;
  notes?: string;
}) {
  return apiPost<{ ok: boolean; created?: boolean; already_exists?: boolean; customer: Record<string, unknown> }>(
    "/register-customer",
    payload,
  );
}

export async function startSession(payload: { phone: string; customer_id?: string; operator?: string }) {
  return apiPost<{ ok: boolean; session: { id: string; status: string } }>(
    "/start-session",
    payload,
  );
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}g`;
}

// ===== Utility =====

export function sourceBadge(source: LeadSource) {
  switch (source) {
    case "customer":
      return { label: "Cliente", bg: "bg-emerald-100", text: "text-emerald-700" };
    case "fgas":
      return { label: "F-GAS", bg: "bg-blue-100", text: "text-blue-700" };
    case "cold":
      return { label: "Lead", bg: "bg-purple-100", text: "text-purple-700" };
    case "staff":
      return { label: "Staff", bg: "bg-amber-100", text: "text-amber-700" };
    default:
      return { label: "Sconosciuto", bg: "bg-gray-100", text: "text-gray-600" };
  }
}

export function initials(name: string | null, phone: string) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
  }
  return phone.slice(-2);
}

export function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const wasYesterday = d.toDateString() === yesterday.toDateString();
  if (sameDay) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (wasYesterday) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

export function formatPhone(phone: string) {
  if (!phone) return "";
  const n = phone.startsWith("39") ? phone.slice(2) : phone;
  if (n.length === 10) return `+39 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  return `+${phone}`;
}


// ===== Rubrica CardDAV sync iPhone staff =====

export interface Contact {
  id: string;
  company_name: string | null;
  email: string | null;
  mobile: string | null;
  phone1: string | null;
  whatsapp_phone: string | null;
  vat_number: string | null;
  whatsapp_active: boolean | null;
  created_at: string;
}

export async function listContacts(q?: string, limit = 200, offset = 0) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));
  return apiGet<{ contacts: Contact[]; total: number; limit: number; offset: number }>(
    `/contacts?${qs.toString()}`
  );
}

export async function renameContact(phone: string, newName: string) {
  const res = await fetch(`${BASE}/contacts/${encodeURIComponent(phone)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_name: newName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; customer: Contact | null }>;
}

export async function reconcileContacts(limit = 5000) {
  return apiPost<{ ok: boolean; stats: { total: number; ok: number; failed: number; skipped: number } }>(
    `/reconcile-contacts?limit=${limit}`,
    {}
  );
}

// ===== Meta Templates (outbound) =====

export interface MetaTemplate {
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  params: string[];
  description: string;
}

export async function listMetaTemplates() {
  return apiGet<{ templates: MetaTemplate[] }>("/templates");
}

export async function sendMetaTemplate(payload: {
  phone: string;
  template_name: string;
  parameters: string[];
  language?: string;
  operator_email?: string;
}) {
  return apiPost<{ ok: boolean; result: unknown }>("/send-template", payload);
}
