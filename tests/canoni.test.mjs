// Test del modello canoni Avantifiori → Gingy (16/10/2026). Esegui: npm test  (node --test, Node ≥ 22.6)
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANONI_AVANTIFIORI, mesiFatturabili, periodoCanoni, righeCanoni } from "../src/app/fatturazione/canoni.ts";

const unita = (app) => CANONI_AVANTIFIORI.find((u) => u.app === app);

test("canoni veri: D1 1.500, D2 1.000, D4 1.350; il D3 non si fattura prima del 2028", () => {
  assert.equal(unita("D1").canone, 1500);
  assert.equal(unita("D2").canone, 1000);
  assert.equal(unita("D4").canone, 1350);
  assert.equal(unita("D3").da, "2028-01");
  assert.notEqual(unita("D4").codice, unita("D3").codice);
});

test("trimestre 2026 = 2/EL corretta: D1 4.500 + D2 3.000 + D4 4.050 = 11.550, nessuna riga D3", () => {
  const { righe, imponibile, periodo } = righeCanoni("2026-04", "2026-06");
  assert.equal(periodo.etichetta, "SECONDO TRIMESTRE 2026");
  assert.equal(imponibile, 11550);
  assert.ok(righe.some((r) => r.descrizione.includes("appartamento D4") && r.quantita === 3 && r.prezzo_unitario === 1350));
  assert.ok(!righe.some((r) => r.descrizione.includes("appartamento D3")));
  assert.equal(righe.at(-1).prezzo_unitario, 0);
});

test("annualità 2025 = 1/EL corretta: D2 solo 11 mesi (da febbraio), D4 12 mesi", () => {
  const { righe, imponibile } = righeCanoni("2025-01", "2025-12");
  assert.equal(righe.find((r) => r.codice_articolo === "0008").quantita, 11);
  assert.equal(righe.find((r) => r.codice_articolo === "0010").quantita, 12);
  assert.equal(imponibile, 45200);
});

test("novembre-dicembre 2024: solo D1 e D4 (D2 parte a febbraio 2025) = 5.700", () => {
  const { righe, imponibile } = righeCanoni("2024-11", "2024-12");
  assert.deepEqual(righe.filter((r) => r.codice_articolo).map((r) => r.codice_articolo), ["0007", "0010"]);
  assert.equal(imponibile, 5700);
});

test("dal 2028 torna il D3 (1.000/mese)", () => {
  assert.equal(mesiFatturabili(unita("D3"), "2027-11", "2028-02"), 2);
  assert.equal(righeCanoni("2028-01", "2028-01").imponibile, 1500 + 1000 + 1350 + 1000);
});

test("canone a zero o periodo invertito: nessuna riga", () => {
  assert.equal(righeCanoni("2026-10", "2026-10", { "0008": 0 }).righe.filter((r) => r.codice_articolo).length, 2);
  assert.equal(periodoCanoni("2026-05", "2026-04").mesi, 0);
  assert.equal(righeCanoni("2026-05", "2026-04").righe.length, 0);
});
