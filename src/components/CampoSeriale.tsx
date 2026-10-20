"use client";

// MAGAZZINO (20/10/2026): campo per sparare il SERIALE di un pezzo con lo scanner (carico da scanner e finestra
// «Quanti ne carichi?»). Usato da /magazzino e /magazzino/carico.

import { useRef } from "react";
import { Input } from "@/components/ui/input";

/** Campo del seriale: va avanti da solo con l'Invio dello scanner o, per gli scanner senza Invio, quando il codice
 *  arriva «sparato» (tasti a meno di 50 ms) e poi c'è una pausa di 300 ms. */
export function CampoSeriale({ id, value, onChange, onFatto }: { id: string; value: string; onChange: (v: string) => void; onFatto: () => void }) {
  const tempi = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Input id={id} data-seriale-carico="" className="h-8 w-44 font-mono text-xs uppercase" placeholder="seriale" value={value}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (value.trim()) onFatto(); } }}
      onChange={(e) => {
        const v = e.target.value, ora = Date.now();
        tempi.current = v.length <= 1 ? [ora] : [...tempi.current, ora];
        onChange(v);
        if (timer.current) clearTimeout(timer.current);
        const t = tempi.current;
        if (v.trim().length >= 8 && t.length >= 6 && t.slice(1).every((x, i) => x - t[i] < 50)) timer.current = setTimeout(onFatto, 300);
      }} />
  );
}
