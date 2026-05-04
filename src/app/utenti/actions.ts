"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

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
  const role = (await headers()).get("x-user-role");
  if (role !== "admin") {
    throw new Error("Solo l'admin puo' gestire gli utenti");
  }
}

export async function listUsersAction() {
  await ensureAdmin();
  const r = await authedFetch("/api/admin/users");
  if (!r.ok) throw new Error(`Backend ${r.status}`);
  const data = (await r.json()) as { users: unknown[] };
  return data.users || [];
}

export async function createUserAction(formData: FormData) {
  await ensureAdmin();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "operator");
  const full_name = String(formData.get("full_name") || "").trim() || null;
  const r = await authedFetch("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, role, full_name }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Errore creazione: ${detail.slice(0, 200)}`);
  }
  revalidatePath("/utenti");
}

export async function toggleActiveAction(userId: string, active: boolean) {
  await ensureAdmin();
  const r = await authedFetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Errore aggiornamento: ${detail.slice(0, 200)}`);
  }
  revalidatePath("/utenti");
}

export async function changeRoleAction(userId: string, role: "admin" | "operator") {
  await ensureAdmin();
  const r = await authedFetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Errore aggiornamento: ${detail.slice(0, 200)}`);
  }
  revalidatePath("/utenti");
}

export async function resetPasswordAction(userId: string, newPassword: string) {
  await ensureAdmin();
  const r = await authedFetch(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Errore reset: ${detail.slice(0, 200)}`);
  }
  revalidatePath("/utenti");
}
