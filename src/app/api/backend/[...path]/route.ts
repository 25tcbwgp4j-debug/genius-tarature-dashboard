import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

/**
 * Proxy server-side: inoltra le richieste del frontend al backend Railway.
 *
 * Auth a 2 livelli:
 *   1) Bearer JWT — letto dal cookie httpOnly "gt-auth" (utente loggato).
 *      Il backend identifica l'utente e applica il ruolo (admin/operator).
 *   2) Fallback X-API-Key (env API_KEY senza prefisso NEXT_PUBLIC_) per
 *      endpoint che il frontend chiama prima del login (es. health probe)
 *      o per backward compat durante migrazione.
 *
 * Cosi' la dashboard fa azioni come l'utente loggato (con audit log corretto)
 * e i DELETE admin-only fallano per gli operatori, non per la chiave globale.
 */

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tarature-api-production.up.railway.app";

const API_KEY = process.env.API_KEY || "";

// Headers della richiesta originale che inoltriamo al backend
const FORWARDED_REQ_HEADERS = new Set([
  "content-type",
  "accept",
  "accept-language",
  "cache-control",
]);

// Headers della risposta backend che restituiamo al client
const FORWARDED_RES_HEADERS = new Set([
  "content-type",
  "content-disposition",
  "content-length",
  "cache-control",
  "etag",
  "last-modified",
]);

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  const pathname = "/" + (path || []).join("/");
  const search = request.nextUrl.search || "";
  const url = `${BACKEND_URL}${pathname}${search}`;

  // Prepara headers da inoltrare al backend
  const outHeaders = new Headers();
  for (const [k, v] of request.headers.entries()) {
    if (FORWARDED_REQ_HEADERS.has(k.toLowerCase())) {
      outHeaders.set(k, v);
    }
  }
  // Auth: preferisci JWT utente (cookie) → identifica l'utente lato backend.
  // Fallback X-API-Key per chiamate pre-login (health) o legacy compat.
  const userJwt = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (userJwt) {
    outHeaders.set("Authorization", `Bearer ${userJwt}`);
  }
  if (API_KEY) {
    outHeaders.set("X-API-Key", API_KEY);
  }

  // Corpo richiesta (solo per POST/PUT/PATCH/DELETE con body)
  let body: BodyInit | undefined = undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers: outHeaders,
      body,
      // Edge runtime: disabilita cache
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "upstream error";
    return NextResponse.json(
      { detail: `Backend non raggiungibile: ${msg}` },
      { status: 502 },
    );
  }

  // Prepara response per il client
  const resHeaders = new Headers();
  for (const [k, v] of upstream.headers.entries()) {
    if (FORWARDED_RES_HEADERS.has(k.toLowerCase())) {
      resHeaders.set(k, v);
    }
  }
  const resBody = await upstream.arrayBuffer();

  return new NextResponse(resBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context);
}
