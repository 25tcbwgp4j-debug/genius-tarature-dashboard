"use server";

import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifyJwt } from "@/lib/auth";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tarature-api-production.up.railway.app";

async function authedFetch(path: string, init: RequestInit = {}) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const h = new Headers(init.headers);
  if (token) h.set("Authorization", `Bearer ${token}`);
  if (!h.has("Content-Type") && init.body) h.set("Content-Type", "application/json");
  return fetch(`${BACKEND_URL}${path}`, { ...init, headers: h, cache: "no-store" });
}

async function ensureAdmin() {
  // Ruolo dal JWT firmato nel cookie, non da un header controllabile dal client
  // (e che, com'era scritto il proxy, arrivava sempre null). Audit 16/07.
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const secret = process.env.AUTH_JWT_SECRET || process.env.AUTH_SECRET || "";
  if (!token || !secret) throw new Error("Sessione non valida: rifai il login");
  const payload = await verifyJwt(token, secret);
  if (!payload || payload.role !== "admin") {
    throw new Error("Solo l'admin può accedere all'audit log");
  }
}

export type AuditEvent = {
  id: number;
  table_name: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  row_id: string | null;
  user_email: string | null;
  changed_keys: string[] | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

export async function listAuditEventsAction(params: {
  table?: string;
  operation?: string;
  row_id?: string;
  user_email?: string;
  days?: number;
  limit?: number;
}) {
  await ensureAdmin();
  const qs = new URLSearchParams();
  if (params.table) qs.set("table", params.table);
  if (params.operation) qs.set("operation", params.operation);
  if (params.row_id) qs.set("row_id", params.row_id);
  if (params.user_email) qs.set("user_email", params.user_email);
  if (params.days) qs.set("days", String(params.days));
  if (params.limit) qs.set("limit", String(params.limit));
  const r = await authedFetch(`/api/admin/audit-events?${qs}`);
  if (!r.ok) throw new Error(`Backend ${r.status}`);
  const data = (await r.json()) as { events: AuditEvent[]; count: number };
  return data;
}

export async function auditEventsSummaryAction(days = 7) {
  await ensureAdmin();
  const r = await authedFetch(`/api/admin/audit-events/summary?days=${days}`);
  if (!r.ok) throw new Error(`Backend ${r.status}`);
  return (await r.json()) as {
    summary: Record<string, Record<string, number>>;
    total_events: number;
    days: number;
  };
}
