// 16/11/2026 (Christian: «Attesa ricambi non me la fa selezionare»). Esegui: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { faseMadre } from "../src/lib/cruscotto-fase.ts";

const FASI = [
  { codice: "in_riparazione", sotto: [{ codice: "attesa_ricambi" }, { codice: "rip_copia_dati" }] },
  { codice: "attesa_ricambi", sotto: [] },
  { codice: "da_ritirare", sotto: [{ codice: "da_ritirare_pagati" }] },
];

test("il chip «Attesa ricambi» seleziona la SUA voce, non il sotto-filtro di «In riparazione»", () => {
  assert.equal(faseMadre(FASI, "attesa_ricambi")?.codice, "attesa_ricambi");
});

test("un sotto-filtro senza voce propria resta della sua voce madre", () => {
  assert.equal(faseMadre(FASI, "rip_copia_dati")?.codice, "in_riparazione");
  assert.equal(faseMadre(FASI, "da_ritirare_pagati")?.codice, "da_ritirare");
  assert.equal(faseMadre(FASI, "nessuna"), undefined);
  assert.equal(faseMadre(null, "attesa_ricambi"), undefined);
});
