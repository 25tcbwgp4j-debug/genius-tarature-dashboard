// Utilità condivise della sezione Fatturazione
import type { FattRiga } from "@/lib/api";

export const SOCIETA_LABEL: Record<string, string> = {
  genius: "Genius Lab",
  gingy: "Gingy",
  avantifiori: "Avantifiori Imm.",
};

export const STATI: Record<string, { label: string; cls: string }> = {
  bozza: { label: "Bozza", cls: "bg-muted text-muted-foreground" },
  inviata: { label: "Inviata allo SdI", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  consegnata: { label: "Consegnata", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  non_consegnata: { label: "Nel cassetto fiscale", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  scartata: { label: "Scartata", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
  errore: { label: "Errore invio", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
  ricevuta: { label: "Ricevuta", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
};

export const MODALITA_LABEL: Record<string, string> = {
  contanti: "Contanti",
  pos_sumup: "POS SumUp",
  carta_stripe: "Carta (Stripe)",
  bonifico: "Bonifico",
  non_pagato: "Da pagare",
};

export const TIPI_LABEL: Record<string, string> = {
  TD01: "Fattura",
  TD04: "Nota di credito",
  TD05: "Nota di debito",
  TD06: "Parcella",
  TD24: "Fattura differita",
};

export function eur(v: number | string | null | undefined) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));
}

export function dataIt(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, g] = d.slice(0, 10).split("-");
  return `${g}/${m}/${y}`;
}

// Stima dei totali lato client (il calcolo ufficiale lo rifà il backend al salvataggio)
export function stimaTotali(righe: FattRiga[]) {
  const gruppi = new Map<number, { imp: number; lordo: number; tuttiLordi: boolean }>();
  for (const r of righe) {
    if (!r.descrizione?.trim()) continue;
    const q = Number(r.quantita || 1);
    const al = Number(r.aliquota ?? 22);
    const sc = Number(r.sconto || 0);
    const ivato = r.prezzo_ivato !== null && r.prezzo_ivato !== undefined && String(r.prezzo_ivato) !== "";
    const pu = ivato ? Number(r.prezzo_ivato) / (1 + al / 100) : Number(r.prezzo_unitario || 0);
    const imp = Math.round(q * pu * (1 - sc / 100) * 100) / 100;
    const lordo = ivato ? Math.round(Number(r.prezzo_ivato) * q * (1 - sc / 100) * 100) / 100 : 0;
    const g = gruppi.get(al) || { imp: 0, lordo: 0, tuttiLordi: true };
    g.imp += imp;
    g.lordo += lordo;
    g.tuttiLordi = g.tuttiLordi && ivato;
    gruppi.set(al, g);
  }
  let imponibile = 0;
  let iva = 0;
  for (const [al, g] of gruppi) {
    if (g.tuttiLordi && al > 0) {
      const lordo = Math.round(g.lordo * 100) / 100;
      const imp = Math.round((lordo / (1 + al / 100)) * 100) / 100;
      imponibile += imp;
      iva += lordo - imp;
    } else {
      const imp = Math.round(g.imp * 100) / 100;
      imponibile += imp;
      iva += Math.round(imp * al) / 100;
    }
  }
  return { imponibile, iva, totale: Math.round((imponibile + iva) * 100) / 100 };
}
