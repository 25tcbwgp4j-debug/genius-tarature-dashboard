// Date nel fuso di Roma (il negozio lavora in Europe/Rome, non in UTC).

// un solo formattatore (crearne uno a ogni chiamata costa, soprattutto su Safari e sugli iMac vecchi — 04/10/2026)
const FMT_ROMA = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" });

/** Oggi a Roma come «AAAA-MM-GG» secondo l'orologio di QUESTO computer (dove conta, meglio l'«oggi» del server). */
export const oggiRoma = () => FMT_ROMA.format(new Date());

/** Anno in corso a Roma. */
export const annoRoma = () => Number(oggiRoma().slice(0, 4));

/** Sposta una data «AAAA-MM-GG» di n giorni (calcolo a mezzogiorno UTC: niente salti per l'ora legale). */
export function spostaGiorno(g: string, n: number) {
  const d = new Date(`${g}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
