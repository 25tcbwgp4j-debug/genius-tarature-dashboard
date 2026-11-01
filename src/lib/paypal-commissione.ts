// 01/11/2026 (Christian): commissione PayPal a carico del cliente. Funzione pura (testata in tests/schede.test.mjs);
// percentuale e fisso arrivano dal backend (/api/assistenza/config → paypal_fee, unica fonte paypal_commissione.py).
export interface PaypalFee { pct: number; fisso: number }
/** 01/11/2026: importo da chiedere col PayPal perché a noi arrivi NETTO il dovuto — stessa formula del backend
 *  (paypal_commissione.lordo): ceil al centesimo di (dovuto + fisso) / (1 − pct). Percentuale e fisso arrivano da /config. */
export function lordoPaypal(dovuto: number, fee: PaypalFee): number {
  const d = Math.round((dovuto || 0) * 100) / 100;
  if (d <= 0) return 0;
  let c = Math.ceil(Math.round(((d + fee.fisso) / (1 - fee.pct / 100)) * 1e6) / 1e4);
  const netto = (cent: number) => cent - Math.round(cent * fee.pct / 100 + fee.fisso * 100);
  while (netto(c) < Math.round(d * 100)) c += 1;
  return c / 100;
}
