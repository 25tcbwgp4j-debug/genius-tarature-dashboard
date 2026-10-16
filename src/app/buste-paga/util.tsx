// Utilità della sezione Buste paga (formati italiani: 1.234,56 €, date gg/mm/aaaa)

import type { StatoBusta } from "@/lib/buste-paga";

export const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

const FMT_EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const FMT_NUM = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

export const eur = (v: number | string | null | undefined) => FMT_EUR.format(Number(v || 0));
export const num = (v: number | string | null | undefined) => FMT_NUM.format(Number(v || 0));

export function dataIt(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, g] = d.slice(0, 10).split("-");
  return `${g}/${m}/${y}`;
}

export const STATI_BUSTA: Record<StatoBusta | "anteprima", { label: string; cls: string }> = {
  anteprima: { label: "Anteprima", cls: "bg-muted text-muted-foreground" },
  bozza: { label: "Bozza", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  confermata: { label: "Confermata", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  pagata: { label: "Pagata", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};

export function BadgeStato({ stato }: { stato: string | null | undefined }) {
  const s = STATI_BUSTA[(stato || "anteprima") as StatoBusta] || STATI_BUSTA.anteprima;
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

/** Numero da un campo di testo (accetta la virgola): «6,5» → 6.5; vuoto → 0. */
export function numDa(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export const selCls = "h-8 rounded-md border border-input bg-background px-2 text-sm";
