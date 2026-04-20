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
