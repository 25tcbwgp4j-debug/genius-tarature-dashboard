"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tarature-api-production.up.railway.app";

/**
 * Server Action: login
 * Riceve email+password dal form, chiama il backend FastAPI /api/auth/login,
 * salva il JWT ricevuto nel cookie httpOnly. Il JWT include sub/email/role
 * cosi' middleware e UI sanno chi e' loggato e con che ruolo.
 */
export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fromRaw = String(formData.get("from") || "/");
  const from = fromRaw.startsWith("/") && !fromRaw.startsWith("//") ? fromRaw : "/";

  if (!email || !password) {
    redirect("/login?error=invalid");
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    redirect("/login?error=backend_unreachable");
  }

  if (res.status === 401) {
    redirect(`/login?error=invalid${fromRaw !== "/" ? `&from=${encodeURIComponent(fromRaw)}` : ""}`);
  }
  if (!res.ok) {
    redirect("/login?error=server");
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    redirect("/login?error=server");
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, data.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 giorni — match TTL backend
    path: "/",
  });

  redirect(from);
}

/**
 * Server Action: logout
 * Cancella il cookie e notifica il backend (per audit log).
 */
export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    try {
      await fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch {
      // best-effort, non bloccare il logout su errore di rete
    }
  }
  cookieStore.delete(AUTH_COOKIE_NAME);
  redirect("/login");
}
