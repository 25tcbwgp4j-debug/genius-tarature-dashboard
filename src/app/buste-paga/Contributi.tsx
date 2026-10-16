"use client";

// Contributi INPS trimestrali (pagoPA) e dichiarazione annuale per il lavoratore (al posto della CU).
// I mesi con la busta confermata valgono come salvati, gli altri sono in anteprima (presenze o orario del contratto).

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Landmark, Loader2 } from "lucide-react";
import { bpContributi, bpDichiarazione, bpUrlPdfDichiarazione, type BpContributi, type BpDichiarazione } from "@/lib/buste-paga";
import { oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";
import { BadgeStato, MESI, dataIt, eur, num } from "./util";

const NOMI_TRIMESTRE = ["gennaio – marzo", "aprile – giugno", "luglio – settembre", "ottobre – dicembre"];

export function Contributi({ lavoratoreId, anno }: { lavoratoreId: string; anno: number }) {
  const [dati, setDati] = useState<{ c: BpContributi; d: BpDichiarazione } | null>(null);
  const [errore, setErrore] = useState(false);
  useEffect(() => {
    let annullato = false;
    Promise.all([bpContributi(lavoratoreId, anno), bpDichiarazione(lavoratoreId, anno)])
      .then(([c, d]) => { if (!annullato) setDati({ c, d }); })
      .catch((e) => { if (!annullato) { setErrore(true); toastErrore(e); } });
    return () => { annullato = true; };
  }, [lavoratoreId, anno]);

  if (errore) return <div className="p-6 text-center text-muted-foreground">Riepilogo non disponibile</div>;
  if (!dati) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;
  const { c, d } = dati;
  const oggi = oggiRoma();

  return (
    <div className="space-y-4">
      <Card className="gap-0 overflow-x-auto p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Landmark className="size-4" /><span className="font-medium">Contributi INPS {anno} — versamento trimestrale con pagoPA</span>
          {c.tempo_determinato && <span className="text-xs text-muted-foreground">tempo determinato: compresa l&apos;addizionale NASpI a carico del datore</span>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Trimestre</th><th className="p-2">Mesi</th><th className="p-2 text-right">Ore retribuite</th>
              <th className="p-2 text-right">Contributi</th><th className="p-2 text-right">di cui lavoratore (trattenuti)</th>
              <th className="p-2 text-right">di cui datore</th><th className="p-2 text-right">Addiz. TD</th>
              <th className="p-2 text-right">Da versare</th><th className="p-2">Scadenza</th>
            </tr>
          </thead>
          <tbody>
            {c.trimestri.map((t) => {
              const vuoto = !t.mesi.length;
              const scaduto = !vuoto && t.scadenza < oggi;
              return (
                <tr key={t.trimestre} className={`border-b last:border-0 ${vuoto ? "text-muted-foreground" : ""}`}>
                  <td className="p-2 font-medium">{t.trimestre}° <span className="text-xs font-normal text-muted-foreground">{NOMI_TRIMESTRE[t.trimestre - 1]}</span></td>
                  <td className="p-2 text-xs">
                    {vuoto ? "—" : t.mesi.map((m, i) => <span key={m} className="mr-1 inline-flex items-center gap-1">{MESI[m - 1].slice(0, 3)} <BadgeStato stato={t.stati[i]} /></span>)}
                  </td>
                  <td className="p-2 text-right tabular-nums">{num(t.ore_retribuite)}</td>
                  <td className="p-2 text-right tabular-nums">{eur(t.contributi_totali)}</td>
                  <td className="p-2 text-right tabular-nums">{eur(t.quota_lavoratore)}</td>
                  <td className="p-2 text-right tabular-nums">{eur(t.quota_datore)}</td>
                  <td className="p-2 text-right tabular-nums">{eur(t.addizionale_td)}</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{eur(t.da_versare)}</td>
                  <td className={`p-2 text-xs ${scaduto ? "font-medium text-red-600" : ""}`}>
                    {dataIt(t.scadenza)}{t.nota && <div className="text-orange-700 dark:text-orange-300">{t.nota}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t p-3 text-xs text-muted-foreground">
          Contributi = ore retribuite × contributo orario della fascia; la quota del lavoratore è già trattenuta in busta.
          Le tariffe vanno verificate ogni anno con la circolare INPS (scheda Impostazioni).
        </div>
      </Card>

      <Card className="gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Dichiarazione annuale {anno} per il lavoratore</span>
          <span className="text-xs text-muted-foreground">al posto della CU: da consegnare entro fine febbraio {anno + 1}</span>
          <a className="ml-auto" href={bpUrlPdfDichiarazione(lavoratoreId, anno)} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline"><Download /> PDF dichiarazione</Button>
          </a>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[["Retribuzione lorda", eur(d.retribuzione_lorda)], ["TFR liquidato", eur(d.tfr_liquidato)],
            ["Contributi lavoratore", eur(d.contributi_lavoratore)], ["Netto corrisposto", eur(d.netto)],
            ["Ore retribuite", num(d.ore_retribuite)], ["TFR maturato nell'anno", eur(d.tfr_maturato_anno)],
            ["TFR maturato complessivo", eur(d.tfr_progressivo)], ["Mesi", d.mesi.map((m) => MESI[m - 1].slice(0, 3)).join(", ") || "—"]].map(([l, v]) => (
            <div key={l} className="rounded border p-2"><div className="text-xs text-muted-foreground">{l}</div><div className="font-semibold tabular-nums">{v}</div></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
