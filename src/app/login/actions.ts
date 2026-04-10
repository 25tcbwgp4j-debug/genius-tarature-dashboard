"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signToken, AUTH_COOKIE_NAME } from "@/lib/auth";

/**
 * Server Action: login
 * Riceve password dal form, verifica contro DASHBOARD_PASSWORD env var,
 * firma un token HMAC con AUTH_SECRET e setta il cookie httpOnly.
 */
export async function login(formData: FormData) {
  const password = String(formData.get("password") || "");
  const fromRaw = String(formData.get("from") || "/");
  // Valida il redirect: solo path interni, no URL assoluti
  const from = fromRaw.startsWith("/") && !fromRaw.startsWith("//") ? fromRaw : "/";

  const expected = process.env.DASHBOARD_PASSWORD || "";
  const secret = process.env.AUTH_SECRET || "";

  if (!expected || !secret) {
    redirect("/login?error=not_configured");
  }

  if (password !== expected) {
    redirect(`/login?error=invalid${fromRaw !== "/" ? `&from=${encodeURIComponent(fromRaw)}` : ""}`);
  }

  const token = await signToken(secret);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 giorni
    path: "/",
  });

  redirect(from);
}

/**
 * Server Action: logout
 * Elimina il cookie di sessione e redirige a /login.
 */
export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  redirect("/login");
}
