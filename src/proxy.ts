import { NextRequest, NextResponse } from "next/server";
import { verifyJwt, AUTH_COOKIE_NAME } from "@/lib/auth";

// Proxy Next.js 16 (ex middleware): protegge tutte le route tranne /login e static.
// Verifica il JWT HS256 nel cookie httpOnly, redirige a /login se mancante o invalido.
// La pagina /utenti e' admin-only — controllo aggiuntivo qui.
//
// Audit P1.15 (06/05/2026): refresh sliding del JWT. Se il token e' a meno
// di 7 giorni dalla scadenza (TTL totale 30gg backend), chiamiamo
// /api/auth/refresh per ottenere un nuovo cookie con TTL fresco. Evita
// che operatori trovino logout improvviso al 31° giorno di uso silenzioso.

const PUBLIC_PATHS = ["/login"];
const ADMIN_ONLY_PATHS = ["/utenti"];
// Soglia refresh: rinnova se mancano <7gg alla scadenza
const REFRESH_THRESHOLD_SEC = 7 * 24 * 60 * 60;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Route pubbliche (pagina login)
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_JWT_SECRET || process.env.AUTH_SECRET || "";

  // Se l'auth non e' configurata sul deploy, blocca tutto per sicurezza
  if (!secret) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "not_configured");
    return NextResponse.redirect(url);
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  const payload = await verifyJwt(token, secret);
  if (!payload) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Gating admin-only su rotte server-rendered (oltre al backend che gia' rifiuta)
  if (ADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (payload.role !== "admin") {
      const url = new URL("/", request.url);
      return NextResponse.redirect(url);
    }
  }

  // Espone dati utente alle pagine via header (lette solo lato server, non esposte al browser)
  const res = NextResponse.next();
  res.headers.set("x-user-email", payload.email);
  res.headers.set("x-user-role", payload.role);
  res.headers.set("x-user-id", payload.sub);

  // Refresh sliding (audit P1.15): se il token scade entro 7gg, chiamiamo
  // backend /api/auth/refresh e settiamo nuovo cookie. Best-effort: se la
  // chiamata fallisce, l'utente continua con il vecchio token finche' valido.
  const nowSec = Math.floor(Date.now() / 1000);
  const msToExp = (payload.exp || 0) - nowSec;
  if (msToExp > 0 && msToExp < REFRESH_THRESHOLD_SEC) {
    try {
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        "https://tarature-api-production.up.railway.app";
      const refreshRes = await fetch(`${apiUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        // edge runtime fetch: no body needed
      });
      if (refreshRes.ok) {
        const data = (await refreshRes.json()) as { token?: string };
        if (data.token) {
          // Setta nuovo cookie httpOnly. TTL coerente con backend (30gg).
          res.cookies.set({
            name: AUTH_COOKIE_NAME,
            value: data.token,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 30 * 24 * 60 * 60,
          });
        }
      }
    } catch {
      // Best-effort: se Railway e' irraggiungibile dal Edge runtime,
      // l'utente continua con il vecchio token finche' valido.
    }
  }

  return res;
}

export const config = {
  // Escludi asset statici e favicon dal proxy (non servono auth)
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml|manifest.json|sw.js|workbox-.*|icon-.*\\.png|apple-touch-icon.*\\.png).*)"],
};
