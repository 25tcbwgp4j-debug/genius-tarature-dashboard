// Modello «Canoni locazione Avantifiori Immobiliare → Gingy» — Viale di Valle Aurelia 118 (revisione 16/10/2026).
// Modulo puro (niente React, niente import): lo usano l'Editor e il test `tests/canoni.test.mjs` (node --test).
//
// Contratti veri (RLI nel cassetto dell'Immobiliare, 29/09/2026):
//   D1 — 18.000 €/anno = 1.500 €/mese dal 11/11/2024 (RLI 3T/015246)
//   D2 — 12.000 €/anno = 1.000 €/mese dal 01/02/2025 (RLI 3T/001155)
//   D3 — 12.000 €/anno, ma canone SOSPESO dal 01/02/2025 al 31/12/2027 (scrittura privata 01/02/2025, PEC 04/03/2026,
//        RLI 3T/001154 rinegoziato a 0,01 € dal 07/10/2025): si torna a fatturare solo da gennaio 2028
//   D4 — 16.200 €/anno = 1.350 €/mese dal 11/11/2024 (RLI 3T/015247)
// ⚠️ Fino al 15/10/2026 il modello aveva «D3 1.350»: era il canone del D4 scritto col nome sbagliato (errore delle
// fatture 1/EL e 2/EL). Il D4 ha un codice articolo nuovo (0010) per non confonderlo con lo 0009 usato per «D3».

export interface UnitaCanone {
  codice: string;
  app: string;
  /** canone mensile imponibile (IVA esclusa) */
  canone: number;
  /** primo mese fatturabile YYYY-MM (decorrenza del contratto o fine della sospensione) */
  da: string;
  /** ultimo mese fatturabile YYYY-MM (assente = senza termine) */
  a?: string;
  rli: string;
  /** nota mostrata nell'editor (es. sospensione) */
  nota?: string;
}

export const CANONI_AVANTIFIORI: UnitaCanone[] = [
  { codice: "0007", app: "D1", canone: 1500, da: "2024-11", rli: "3T/015246" },
  { codice: "0008", app: "D2", canone: 1000, da: "2025-02", rli: "3T/001155" },
  { codice: "0010", app: "D4", canone: 1350, da: "2024-11", rli: "3T/015247" },
  { codice: "0009", app: "D3", canone: 1000, da: "2028-01", rli: "3T/001154",
    nota: "canone sospeso 01/02/2025–31/12/2027 (lavori): si fattura da gennaio 2028" },
];

export function testoRigaCanone(app: string, anni: string): string {
  // stesso testo delle fatture 1/EL e 2/EL (il D1 ha il trattino, gli altri no: è così negli originali)
  return app === "D1"
    ? `Contratto di locazione appartamento D1, Viale di Valle Aurelia 118, Roma - Annualità ${anni}`
    : `Contratto di locazione appartamento ${app}, Viale di Valle Aurelia 118, Roma Annualità ${anni}`;
}

const MESI = ["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];
const TRIMESTRI = ["PRIMO", "SECONDO", "TERZO", "QUARTO"];

const indice = (ym: string): number => {
  const [y, m] = ym.split("-").map(Number);
  return y && m ? y * 12 + (m - 1) : NaN;
};

/** Mesi fra «da» e «a» (YYYY-MM inclusi) ed etichetta del periodo come in 2/EL («PRIMO TRIMESTRE 2026»). */
export function periodoCanoni(da: string, a: string): { mesi: number; etichetta: string; anni: string } {
  const [y1, m1] = da.split("-").map(Number);
  const [y2, m2] = a.split("-").map(Number);
  const mesi = (y2 - y1) * 12 + (m2 - m1) + 1;
  if (!y1 || !y2 || mesi < 1) return { mesi: 0, etichetta: "", anni: "" };
  const anni = y1 === y2 ? String(y1) : `${y1}-${y2}`;
  let etichetta: string;
  if (y1 === y2 && mesi === 12 && m1 === 1) etichetta = `ANNUALITÀ ${y1}`;
  else if (y1 === y2 && mesi === 3 && (m1 - 1) % 3 === 0) etichetta = `${TRIMESTRI[(m1 - 1) / 3]} TRIMESTRE ${y1}`;
  else if (mesi === 1) etichetta = `${MESI[m1 - 1]} ${y1}`;
  else etichetta = `DA ${MESI[m1 - 1]} ${y1} A ${MESI[m2 - 1]} ${y2}`;
  return { mesi, etichetta, anni };
}

/** Mesi del periodo [da, a] in cui l'unità è fatturabile (decorrenza, sospensione, fine). */
export function mesiFatturabili(u: UnitaCanone, da: string, a: string): number {
  const i1 = Math.max(indice(da), indice(u.da));
  const i2 = u.a ? Math.min(indice(a), indice(u.a)) : indice(a);
  return Number.isFinite(i1) && Number.isFinite(i2) && i2 >= i1 ? i2 - i1 + 1 : 0;
}

export interface RigaCanone {
  descrizione: string; quantita: number; prezzo_unitario: number; prezzo_ivato: null;
  aliquota: number; sconto: number; codice_articolo?: string;
}

/** Righe della fattura canoni del periodo: una per appartamento fatturabile (mesi × canone) + la riga del periodo a 0. */
export function righeCanoni(da: string, a: string, canoni: Record<string, number | null | undefined> = {}, aliquota = 10):
  { righe: RigaCanone[]; periodo: ReturnType<typeof periodoCanoni>; imponibile: number } {
  const periodo = periodoCanoni(da, a);
  if (!periodo.mesi) return { righe: [], periodo, imponibile: 0 };
  const righe: RigaCanone[] = [];
  for (const u of CANONI_AVANTIFIORI) {
    const canone = Number(canoni[u.codice] ?? u.canone);
    const mesi = mesiFatturabili(u, da, a);
    if (!(canone > 0) || !mesi) continue;
    righe.push({ descrizione: testoRigaCanone(u.app, periodo.anni), quantita: mesi, prezzo_unitario: canone,
      prezzo_ivato: null, aliquota, sconto: 0, codice_articolo: u.codice });
  }
  const imponibile = righe.reduce((s, r) => s + r.quantita * r.prezzo_unitario, 0);
  righe.push({ descrizione: periodo.etichetta, quantita: 1, prezzo_unitario: 0, prezzo_ivato: null, aliquota, sconto: 0 });
  return { righe, periodo, imponibile };
}
