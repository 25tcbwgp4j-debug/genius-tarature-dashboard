import { NextRequest, NextResponse } from "next/server";
import { controllaSessione } from "@/lib/authRoute";

// RIEPILOGO AVVISI (15/11/2026, consumi Vercel DIGITALE-61 / B-34). Gli avvisi presenti su ogni pagina (bonifici, Stripe,
// da richiamare, notifiche da gestire) chiedevano ognuno il suo endpoint ogni minuto, per ogni scheda aperta: 4 funzioni
// Vercel al minuto. Ora il browser fa UNA chiamata qui e questa route interroga in parallelo gli STESSI endpoint del
// backend, con lo stesso JWT dell'utente: numeri e permessi identici a prima (ogni voce riporta il proprio esito HTTP).
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "https://tarature-api-production.up.railway.app";

const VOCI_RIEPILOGO = {
  bonifici: "/api/bonifici/stato",
  stripe: "/api/incassi/stripe/avvisi",
  richiamare: "/api/telefonate/da-richiamare",
  notifiche: "/api/assistenza/notifiche-gestire/conteggio",
} as const;
type Voce = keyof typeof VOCI_RIEPILOGO;

export async function GET(request: NextRequest) {
  const sessione = await controllaSessione(request);
  if (sessione instanceof NextResponse) return sessione;
  const richieste = (request.nextUrl.searchParams.get("voci") || "").split(",")
    .filter((v): v is Voce => Object.prototype.hasOwnProperty.call(VOCI_RIEPILOGO, v));
  const attivita = (request.headers.get("x-attivita") || "").replace(/[\r\n\0]/g, "").trim();
  const esiti = await Promise.all(richieste.map(async (voce) => {
    try {
      const r = await fetch(`${BACKEND_URL}${VOCI_RIEPILOGO[voce]}`, {
        headers: { Authorization: `Bearer ${sessione.token}`, Accept: "application/json", ...(attivita ? { "X-Attivita": attivita } : {}) },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      const dati = r.ok ? await r.json().catch(() => null) : null;
      return [voce, { status: r.status, dati }] as const;
    } catch {
      return [voce, { status: 502, dati: null }] as const;
    }
  }));
  return NextResponse.json(Object.fromEntries(esiti), { headers: { "Cache-Control": "no-store" } });
}
