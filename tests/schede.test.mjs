// 01/11/2026 (Christian): commissione PayPal vera e schede doppie. Esegui: npm test (node --test, Node ≥ 22.6)
import { test } from "node:test";
import assert from "node:assert/strict";
import { lordoPaypal } from "../src/lib/paypal-commissione.ts";
import { nuovaChiave, schedaDoppia } from "../src/lib/scheda-doppia.ts";

const FEE = { pct: 3.4, fisso: 0.35 };

test("PayPal: 197,00 → 204,30 (netto 197,00), uguale al backend su una serie di importi", () => {
  assert.equal(lordoPaypal(197, FEE), 204.3);
  // valori calcolati da backend/paypal_commissione.lordo
  for (const [d, l] of [[10, 10.72], [23.52, 24.72], [46.92, 48.94], [99.99, 103.88], [197, 204.3], [277, 287.12], [457, 473.45],
    [1234.56, 1278.38], [4999.99, 5176.34], [5000, 5176.35]]) assert.equal(lordoPaypal(d, FEE), l, `dovuto ${d}`);
  assert.equal(lordoPaypal(0, FEE), 0);
});

test("PayPal: il netto non scende mai sotto il dovuto (10-5000 €)", () => {
  for (let cent = 1000; cent <= 500000; cent += 37) {
    const l = Math.round(lordoPaypal(cent / 100, FEE) * 100);
    const commissione = Math.round(l * FEE.pct / 100 + FEE.fisso * 100);
    assert.ok(l - commissione >= cent, `dovuto ${cent / 100}`);
  }
});

test("409 scheda doppia: riconosciuto solo col codice giusto", () => {
  const es = { id: "x", sigla: "63236", perche: "stesso seriale" };
  assert.deepEqual(schedaDoppia({ status: 409, detail: { codice: "scheda_doppia", scheda: es } }), es);
  assert.equal(schedaDoppia({ status: 409, detail: "La scheda ha già una fattura collegata" }), null);
  assert.equal(schedaDoppia({ status: 400, detail: { codice: "scheda_doppia", scheda: es } }), null);
  assert.notEqual(nuovaChiave(), nuovaChiave());
});
