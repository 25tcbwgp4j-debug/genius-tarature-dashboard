import { NextRequest, NextResponse } from "next/server";
import { verifyJwt, AUTH_COOKIE_NAME } from "@/lib/auth";

// Proxy Next.js 16 (ex middleware): protegge tutte le route tranne /login e static.
// Verifica il JWT HS256 nel cookie httpOnly, redirige a /login se mancante o invalido.
// La pagina /utenti e' admin-only — controllo aggiuntivo qui.

const PUBLIC_PATHS = ["/login"];
const ADMIN_ONLY_PATHS = ["/utenti"];

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
  return res;
}

export const config = {
  // Escludi asset statici e favicon dal proxy (non servono auth)
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml|manifest.json|sw.js|workbox-.*|icon-.*\\.png|apple-touch-icon.*\\.png).*)"],
};
