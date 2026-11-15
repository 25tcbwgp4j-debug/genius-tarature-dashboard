// 15/11/2026 (B-34): risposta tenuta 60 s dalla CDN di Vercel (prima una funzione per ogni scheda ogni minuto).
// Versione della dashboard attualmente pubblicata (01/10/2026): le pagine già aperte la confrontano con la propria.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ v: process.env.NEXT_PUBLIC_BUILD_ID || "" }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } });
}
