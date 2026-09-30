"use client";

// Campo importo/quantità «all'italiana»: accetta la virgola (e il punto), tiene il testo mentre si scrive
// e passa fuori il numero. Niente type="number": su Safari/iPad la virgola darebbe un valore vuoto.

import { useState } from "react";
import { Input } from "@/components/ui/input";

/** «12,50» · «12.50» · «1.234,50» · «1 234,5» → numero; stringa vuota → null; testo non valido → NaN. */
export function parseDec(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  let t = String(s).trim().replace(/\s/g, "").replace(/€/g, "");
  if (t === "") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");          // virgola decimale, punti = migliaia
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, "");    // «1.234.567» = migliaia
  if (!/^-?\d*\.?\d*$/.test(t) || t === "-" || t === ".") return NaN;
  return Number(t);
}

/** Numero valido o 0 (per i totali). */
export const dec0 = (s: string | number | null | undefined) => {
  const v = parseDec(s);
  return v === null || Number.isNaN(v) ? 0 : v;
};

/** Numero → testo con la virgola. */
export const fmtDec = (v: number | null | undefined, vuotoSeZero = false) =>
  v === null || v === undefined || Number.isNaN(v) || (vuotoSeZero && v === 0) ? "" : String(v).replace(".", ",");

export function DecInput({ value, onValue, vuotoSeZero = false, ...props }: {
  value: number | null | undefined; onValue: (v: number | null) => void; vuotoSeZero?: boolean;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  const [t, setT] = useState(fmtDec(value, vuotoSeZero));
  const [prec, setPrec] = useState(value);
  if (value !== prec) {   // valore cambiato da fuori (altro giorno, server, riga tolta): riallineo il testo
    setPrec(value);
    if (parseDec(t) !== (value ?? null)) setT(fmtDec(value, vuotoSeZero));
  }
  const v = parseDec(t);
  return (
    <Input type="text" inputMode="decimal" autoComplete="off" aria-invalid={v !== null && Number.isNaN(v) ? true : undefined} {...props} value={t}
      onChange={(e) => {
        setT(e.target.value);
        const n = parseDec(e.target.value);
        if (n === null || !Number.isNaN(n)) onValue(n);
      }} />
  );
}
