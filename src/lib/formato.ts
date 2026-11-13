// FORMATO ALL'ITALIANA (13/11/2026, revisione grafica): un solo posto per importi, numeri, percentuali e date.
// Prima convivevano «EUR 200.08», «1868,84 €», «4144 €», «-58.7%», «2026-11-12»: ora tutto esce come
// «200,08 €», «1.868,84 €», «4.144 €», «−58,7%», «12/11/2026».

// it-IT senza «useGrouping: always» non mette il punto delle migliaia sotto 10.000 (4144 → «4144»): lo forziamo.
// Stessa opzione aggiunta (13/11/2026) a tutti i formattatori «currency EUR» delle pagine.
const NUM_OPZ = (dec: number): Intl.NumberFormatOptions => ({ minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: "always" });

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** 1868.84 → «1.868,84 €» · null → «—» */
export function euro(v: unknown, vuoto = "—"): string {
  const n = numero(v);
  if (n === null) return vuoto;
  // Intl it-IT: «1868,84 €» senza punto sotto i 10.000 → si rifà con il raggruppamento forzato
  return `${n < 0 ? "−" : ""}${new Intl.NumberFormat("it-IT", NUM_OPZ(2)).format(Math.abs(n))} €`;
}

/** 4144 → «4.144 €» (senza decimali) */
export function euroTondo(v: unknown, vuoto = "—"): string {
  const n = numero(v);
  if (n === null) return vuoto;
  return `${n < 0 ? "−" : ""}${new Intl.NumberFormat("it-IT", NUM_OPZ(0)).format(Math.abs(Math.round(n)))} €`;
}

/** 4144 → «4.144» · 12.5 con dec=1 → «12,5» */
export function numeroIt(v: unknown, dec = 0, vuoto = "—"): string {
  const n = numero(v);
  if (n === null) return vuoto;
  return `${n < 0 ? "−" : ""}${new Intl.NumberFormat("it-IT", NUM_OPZ(dec)).format(Math.abs(n))}`;
}

/** -58.7 → «−58,7%» (segno meno tipografico) · con segno=true anche «+12,0%» */
export function percentuale(v: unknown, dec = 1, segno = false, vuoto = "—"): string {
  const n = numero(v);
  if (n === null) return vuoto;
  const s = n < 0 ? "−" : segno && n > 0 ? "+" : "";
  return `${s}${new Intl.NumberFormat("it-IT", NUM_OPZ(dec)).format(Math.abs(n))}%`;
}

/** «2026-11-12» o ISO completo → «12/11/2026» (giorno di calendario, senza spostamenti di fuso) */
export function data(v: string | null | undefined, vuoto = "—"): string {
  if (!v) return vuoto;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m && v.length <= 10) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** ISO → «12/11/2026, 18:43» (ora di Roma) */
export function dataOra(v: string | null | undefined, vuoto = "—"): string {
  if (!v) return vuoto;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 13/11/2026 (revisione): nei testi di notifiche e registro non si mostra l'identificativo tecnico di WhatsApp
 *  («393331234567@c.us», «12345678901234@lid», «…@s.whatsapp.net»): un numero diventa «+39 333 123 4567»,
 *  un identificativo anonimo «@lid» (non è un numero di telefono) diventa «contatto WhatsApp». */
export function senzaIdWhatsApp<T extends string | null | undefined>(testo: T): T {
  if (!testo) return testo;
  return testo
    .replace(/\+?(\d{6,16})@(?:c\.us|s\.whatsapp\.net)\b/g, (_, n: string) => telefonoLeggibile(n))
    .replace(/\+?\d{6,20}@lid\b/g, "contatto WhatsApp")
    .replace(/@(?:c\.us|lid|s\.whatsapp\.net)\b/g, "") as T;
}

/** «393331234567» → «+39 333 123 4567» (numeri italiani); gli altri con il + davanti */
export function telefonoLeggibile(n: string): string {
  const d = n.replace(/\D/g, "");
  if (d.startsWith("39") && d.length >= 11 && d.length <= 13) {
    const r = d.slice(2);
    return `+39 ${r.slice(0, 3)} ${r.slice(3, 6)} ${r.slice(6)}`.trim();
  }
  return `+${d}`;
}
