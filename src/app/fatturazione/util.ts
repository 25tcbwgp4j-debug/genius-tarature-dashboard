// Utilità condivise della sezione Fatturazione
import type { FattRiga } from "@/lib/api";

export const SOCIETA_LABEL: Record<string, string> = {
  genius: "Genius Lab",
  gingy: "Gingy",
  avantifiori: "Avantifiori Imm.",
};

export const STATI: Record<string, { label: string; cls: string }> = {
  bozza: { label: "Bozza", cls: "bg-muted text-muted-foreground" },
  in_invio: { label: "In invio allo SdI…", cls: "bg-sky-100 text-sky-800" },
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
  paypal: "PayPal",
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

// Regime del margine (beni usati, art. 36 DL 41/1995): l'IVA è COMPRESA nel margine (prezzo - costo) e si calcola
// come margine × 22/122; con margine negativo niente IVA (metodo analitico).
export function ivaMargine(prezzo: number, costo: number | null | undefined, aliquota = 22) {
  const m = Math.round((Number(prezzo || 0) - Number(costo || 0)) * 100) / 100;
  const iva = m > 0 ? Math.round((m * aliquota / (100 + aliquota)) * 100) / 100 : 0;
  return { margine: m, iva };
}

// Nature IVA per le righe senza imposta, con il riferimento normativo proposto (FatturaPA 1.2.3, guida AdE v1.10)
export const NATURE_IVA: Record<string, { label: string; rif: string }> = {
  "N4": { label: "N4 esente (art. 10)", rif: "Operazione esente art. 10 DPR 633/1972" },
  "N3.4": { label: "N3.4 non imponibile art. 72 (ambasciate, organismi internaz.)", rif: "Operazione non imponibile art. 72 DPR 633/1972" },
  "N3.1": { label: "N3.1 non imponibile esportazione (art. 8)", rif: "Operazione non imponibile art. 8 c. 1 DPR 633/1972" },
  "N3.2": { label: "N3.2 cessione intracomunitaria", rif: "Operazione non imponibile art. 41 DL 331/1993" },
  "N2.2": { label: "N2.2 fuori campo / non soggetta (altri casi)", rif: "Operazione non soggetta" },
  "N2.1": { label: "N2.1 non soggetta art. 7 (servizi UE/extra UE)", rif: "Operazione non soggetta artt. 7-7septies DPR 633/1972" },
  "N1": { label: "N1 esclusa art. 15", rif: "Esclusa art. 15 DPR 633/1972" },
  "N7": { label: "N7 IVA assolta in altro Stato UE", rif: "" },
};
