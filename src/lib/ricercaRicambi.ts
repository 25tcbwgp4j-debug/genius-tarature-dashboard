// Ricerca dei ricambi Apple in italiano e in inglese (24/10/2026, Christian): «dissipatore» trova anche «Heat Sink»,
// «ventola» anche «Fan» e viceversa. Il confronto ignora maiuscole, accenti, spazi e trattini («heatsink» = «Heat Sink»,
// «8202850» = «820-2850»).

const GRUPPI: string[][] = [
  ["dissipatore", "heatsink", "heat sink", "radiatore"],
  ["ventola", "ventilatore", "fan"],
  ["batteria", "battery", "batt"],
  ["display", "schermo", "lcd", "screen", "pannello", "panel", "monitor"],
  ["scheda logica", "logica", "logic board", "logicboard", "mlb", "motherboard", "scheda madre"],
  ["tastiera", "keyboard"],
  ["trackpad", "touchpad"],
  ["top case", "topcase", "scocca superiore"],
  ["bottom case", "fondo", "scocca inferiore", "lower case"],
  ["scocca", "housing", "enclosure", "case"],
  ["altoparlante", "cassa", "casse", "speaker", "speakers"],
  ["microfono", "microphone", "mic"],
  ["fotocamera", "camera", "webcam"],
  ["cavo", "cable", "flex", "flat"],
  ["connettore", "connector", "porta", "port", "dock"],
  ["alimentatore", "power supply", "psu", "adattatore", "adapter"],
  ["caricatore", "charger"],
  ["cerniera", "cerniere", "hinge", "clutch"],
  ["antenna", "antenne"],
  ["vetro", "glass"],
  ["retroilluminazione", "backlight"],
  ["tasto", "pulsante", "button"],
  ["sensore", "sensor"],
  ["memoria", "ram", "memory"],
  ["disco", "ssd", "storage", "hard disk", "hdd"],
  ["viti", "vite", "screw", "screws"],
  ["staffa", "bracket"],
  ["guarnizione", "gasket", "adesivo", "adhesive"],
  ["impronta", "touch id", "touchid"],
  ["scheda", "board"],
];

export const norma = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const INDICE: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const g of GRUPPI) {
    const varianti = g.map(norma);
    for (const v of varianti) m.set(v, [...new Set([...(m.get(v) || []), ...varianti])]);
  }
  return m;
})();

/** Varianti (normalizzate) di un termine digitato: il termine stesso + sinonimi italiano/inglese. */
export function varianti(termine: string): string[] {
  const t = norma(termine);
  if (!t) return [];
  const fuori = INDICE.get(t) || [];
  // anche i prefissi: «dissip», «vent» (mentre si scrive)
  const prefissi = t.length >= 4 ? [...INDICE.entries()].filter(([k]) => k.startsWith(t)).flatMap(([, v]) => v) : [];
  return [...new Set([t, ...fuori, ...prefissi])];
}

/** La query (più parole, anche frasi tipo «heat sink») è soddisfatta dal testo? Ogni parola deve trovarsi, in qualche variante. */
export function corrisponde(testo: string, query: string): boolean {
  const s = norma(testo);
  const q = query.trim();
  if (!q) return true;
  // prima la frase intera (es. «logic board», «heat sink»), poi parola per parola
  if (varianti(q).some((v) => s.includes(v))) return true;
  return q.split(/\s+/).filter(Boolean).every((w) => varianti(w).some((v) => s.includes(v)));
}
