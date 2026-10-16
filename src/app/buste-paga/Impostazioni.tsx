"use client";

// Tariffe contributive INPS del lavoro domestico per anno (circolare annuale). Fascia in base alle ore settimanali
// del rapporto: fino a 24 h (con eventuali soglie di retribuzione oraria) oppure oltre 24 h.

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { bpSalvaTariffe, bpTariffe, type BpTariffa } from "@/lib/buste-paga";
import { annoRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";
import { numDa } from "./util";

type Riga = Omit<BpTariffa, "retrib_oraria_min" | "retrib_oraria_max" | "contributo_orario_totale" | "quota_lavoratore" | "addizionale_td_percent"> & {
  retrib_oraria_min: string; retrib_oraria_max: string; contributo_orario_totale: string; quota_lavoratore: string; addizionale_td_percent: string;
};
const testo = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
const aRiga = (t: BpTariffa): Riga => ({
  ...t, retrib_oraria_min: testo(t.retrib_oraria_min), retrib_oraria_max: testo(t.retrib_oraria_max),
  contributo_orario_totale: testo(t.contributo_orario_totale), quota_lavoratore: testo(t.quota_lavoratore), addizionale_td_percent: testo(t.addizionale_td_percent),
});

export function Impostazioni({ onSalvate }: { onSalvate: () => void }) {
  const [righe, setRighe] = useState<Riga[] | null>(null);
  const [elimina, setElimina] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    bpTariffe().then((r) => setRighe(r.tariffe.map(aRiga))).catch((e) => { setRighe([]); toastErrore(e); });
  }, []);

  const set = (i: number, k: keyof Riga, v: string | boolean) => setRighe((rr) => (rr || []).map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function salva() {
    if (!righe) return;
    setSalvando(true);
    try {
      const corpo: BpTariffa[] = righe.map((r) => ({
        ...r, anno: Number(r.anno), retrib_oraria_min: r.retrib_oraria_min ? numDa(r.retrib_oraria_min) : null,
        retrib_oraria_max: r.retrib_oraria_max ? numDa(r.retrib_oraria_max) : null, contributo_orario_totale: numDa(r.contributo_orario_totale),
        quota_lavoratore: numDa(r.quota_lavoratore), addizionale_td_percent: r.addizionale_td_percent ? numDa(r.addizionale_td_percent) : 1.4,
      }));
      const r = await bpSalvaTariffe(corpo, elimina);
      setRighe(r.tariffe.map(aRiga));
      setElimina([]);
      toast.success("Tariffe salvate");
      onSalvate();
    } catch (e) { toastErrore(e); } finally { setSalvando(false); }
  }

  if (!righe) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;
  const daVerificare = righe.some((r) => r.da_verificare);
  const inp = "h-7 w-20 rounded border border-input bg-background px-1 text-right text-sm tabular-nums";

  return (
    <Card className="gap-0 overflow-x-auto p-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <span className="font-medium">Tariffe contributive INPS — lavoro domestico</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setRighe([...righe, { anno: annoRoma(), fascia: "oltre_24", retrib_oraria_min: "", retrib_oraria_max: "",
            contributo_orario_totale: "", quota_lavoratore: "", addizionale_td_percent: "1,4", cuaf: true, da_verificare: true, note_fonte: "" }])}><Plus /> Aggiungi tariffa</Button>
          <Button size="sm" onClick={salva} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} Salva</Button>
        </div>
      </div>
      {daVerificare && (
        <div className="flex items-start gap-2 border-b bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Tariffe INPS da verificare con la circolare annuale: controlla gli importi orari e togli la spunta «da verificare».
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="p-2">Anno</th><th className="p-2">Fascia</th><th className="p-2 text-right">Retrib. oraria da</th><th className="p-2 text-right">a</th>
            <th className="p-2 text-right">Contributo orario totale €</th><th className="p-2 text-right">di cui lavoratore €</th>
            <th className="p-2 text-right">Addiz. TD %</th><th className="p-2">CUAF</th><th className="p-2">Da verificare</th><th className="p-2">Fonte / note</th><th />
          </tr>
        </thead>
        <tbody>
          {righe.map((r, i) => (
            <tr key={r.id || `n${i}`} className={`border-b last:border-0 ${r.da_verificare ? "bg-amber-500/5" : ""}`}>
              <td className="p-2"><input className={inp} inputMode="numeric" value={String(r.anno)} onChange={(e) => set(i, "anno", e.target.value)} aria-label="Anno" /></td>
              <td className="p-2">
                <select className="h-7 rounded border border-input bg-background px-1 text-sm" value={r.fascia} onChange={(e) => set(i, "fascia", e.target.value)}>
                  <option value="fino_24">fino a 24 h/sett.</option><option value="oltre_24">oltre 24 h/sett.</option>
                </select>
              </td>
              {(["retrib_oraria_min", "retrib_oraria_max", "contributo_orario_totale", "quota_lavoratore", "addizionale_td_percent"] as const).map((k) => (
                <td key={k} className="p-2 text-right"><input className={inp} inputMode="decimal" value={r[k]} onChange={(e) => set(i, k, e.target.value)} aria-label={k} /></td>
              ))}
              <td className="p-2"><input type="checkbox" checked={r.cuaf} onChange={(e) => set(i, "cuaf", e.target.checked)} aria-label="CUAF" /></td>
              <td className="p-2"><input type="checkbox" checked={r.da_verificare} onChange={(e) => set(i, "da_verificare", e.target.checked)} aria-label="Da verificare" /></td>
              <td className="p-2"><input className="h-7 w-full min-w-48 rounded border border-input bg-background px-1 text-sm" value={r.note_fonte || ""} onChange={(e) => set(i, "note_fonte", e.target.value)} /></td>
              <td className="p-2">
                <Button size="icon-sm" variant="ghost" aria-label="Togli tariffa" onClick={() => { if (r.id) setElimina([...elimina, r.id]); setRighe(righe.filter((_, j) => j !== i)); }}><Trash2 /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t p-3 text-xs text-muted-foreground">
        La fascia si sceglie dalle ore settimanali del contratto; per i rapporti fino a 24 h si usa la retribuzione oraria effettiva
        (paga × 13/12) per le soglie. L&apos;addizionale per i contratti a tempo determinato è a carico del datore e non tocca il netto.
      </div>
    </Card>
  );
}
