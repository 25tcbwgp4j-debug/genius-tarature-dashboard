"use client";

// Storico delle buste salvate del lavoratore: mese, stato, netto, pagamento, PDF.

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { bpStorico, bpUrlPdfBusta, type BpBustaRiga } from "@/lib/buste-paga";
import { toastErrore } from "@/lib/errori";
import { BadgeStato, MESI, dataIt, eur, num } from "./util";

export function Storico({ lavoratoreId, onApri }: { lavoratoreId: string; onApri: (anno: number, mese: number) => void }) {
  const [buste, setBuste] = useState<BpBustaRiga[] | null>(null);
  useEffect(() => {
    let annullato = false;
    bpStorico(lavoratoreId).then((r) => { if (!annullato) setBuste(r.buste); }).catch((e) => { if (!annullato) { setBuste([]); toastErrore(e); } });
    return () => { annullato = true; };
  }, [lavoratoreId]);

  if (!buste) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;
  return (
    <Card className="gap-0 overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="p-2">Mese</th><th className="p-2">Stato</th><th className="p-2 text-right">Ore retribuite</th>
            <th className="p-2 text-right">Lordo</th><th className="p-2 text-right">Trattenuta INPS</th><th className="p-2 text-right">Netto</th>
            <th className="p-2">Pagamento</th><th />
          </tr>
        </thead>
        <tbody>
          {buste.map((b) => (
            <tr key={b.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => onApri(b.anno, b.mese)}>
              <td className="p-2 font-medium">{MESI[b.mese - 1]} {b.anno}</td>
              <td className="p-2"><BadgeStato stato={b.stato} /></td>
              <td className="p-2 text-right tabular-nums">{num(b.ore_retribuite)}</td>
              <td className="p-2 text-right tabular-nums">{eur(b.lordo)}</td>
              <td className="p-2 text-right tabular-nums">{eur(b.trattenuta_inps)}</td>
              <td className="p-2 text-right font-semibold tabular-nums">{eur(b.netto)}</td>
              <td className="p-2 text-xs">{b.data_pagamento ? `${dataIt(b.data_pagamento)}${b.riferimento_bonifico ? ` · ${b.riferimento_bonifico}` : ""}` : "—"}</td>
              <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                <a href={bpUrlPdfBusta(lavoratoreId, b.anno, b.mese)} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost"><Download /> PDF</Button></a>
              </td>
            </tr>
          ))}
          {!buste.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nessuna busta salvata: calcola e conferma il mese dalla scheda «Presenze e busta»</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}
