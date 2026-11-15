import { NextRequest, NextResponse } from "next/server";
import { verifyJwt, AUTH_COOKIE_NAME } from "@/lib/auth";

// 15/11/2026 (consumi Vercel DIGITALE-61 / B-34): le route /api/backend e /api/riepilogo non passano più dal proxy
// (ogni chiamata contava due volte: proxy + route). Il controllo del JWT lo fanno loro, con le stesse risposte del proxy:
// senza cookie 401 «Non autenticato», cookie non valido o scaduto 401 «Sessione scaduta».
export async function controllaSessione(request: NextRequest): Promise<{ token: string } | NextResponse> {
  const secret = process.env.AUTH_JWT_SECRET || process.env.AUTH_SECRET || "";
  if (!secret) return NextResponse.json({ detail: "Autenticazione non configurata" }, { status: 401 });
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ detail: "Non autenticato" }, { status: 401 });
  const payload = await verifyJwt(token, secret);
  if (!payload) return NextResponse.json({ detail: "Sessione scaduta" }, { status: 401 });
  return { token };
}
