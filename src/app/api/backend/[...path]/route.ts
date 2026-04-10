import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy server-side: inoltra le richieste del frontend al backend Railway
 * aggiungendo l'header X-API-Key lato server (mai esposto al client).
 *
 * Il frontend chiama /api/backend/api/prospects/send-batch invece di
 * https://tarature-api-production.up.railway.app/api/prospects/send-batch
 * Così la chiave API resta segreta nel server Next.js (env var API_KEY
 * senza prefisso NEXT_PUBLIC_).
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
