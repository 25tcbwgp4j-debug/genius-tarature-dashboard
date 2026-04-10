import { NextRequest, NextResponse } from "next/server";
import { verifyToken, AUTH_COOKIE_NAME } from "@/lib/auth";

// Proxy Next.js 16 (ex middleware): protegge tutte le route tranne /login e static.
// Verifica il token HMAC nel cookie httpOnly, redirige a /login se mancante o invalido.

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Route pubbliche (pagina login)
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET || "";

  // Se l'auth non e' configurata sul deploy, blocca tutto per sicurezza
  if (!secret) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "not_configured");
    return NextResponse.redirect(url);
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token, secret))) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Escludi asset statici e favicon dal proxy (non servono auth)
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml).*)"],
};
