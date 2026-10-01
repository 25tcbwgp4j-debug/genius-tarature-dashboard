"use client";

// Spedizione della sessione di taratura (01/10/2026):
// - flag «arrivato con corriere», «da rispedire con corriere», «spedizione a carico del cliente»
//   (il cliente ritira e riconsegna con il SUO corriere → nessun costo in fattura, nota su ricevuta e pro forma);
// - costo della spedizione da mettere in fattura/pro forma, modificabile, con scelte rapide:
//   ritiro + riconsegna (fino a 5 pezzi) 30+IVA = 36,60 · sola riconsegna (metà) 15+IVA = 18,30 · importo libero.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Truck } from "lucide-react";
import { toast } from "sonner";
import { updateSession } from "@/lib/api";

export const COSTO_AR = 36.6;
export const COSTO_SOLA = 18.3;
export const ETICHETTA_AR = "Spese di spedizione corriere (ritiro e riconsegna)";
export const ETICHETTA_SOLA = "Spese di spedizione corriere (sola riconsegna)";
const ETICHETTA_LIBERA = "Spese di spedizione (porto IVA)";

export interface Costo { incluso: boolean; importo: number; etichetta: string }

export interface SessioneSpedizione {
  shipping_included?: boolean | null;
  shipping_amount_gross?: number | string | null;
  shipping_label?: string | null;
  arrived_by_courier?: boolean | null;
  return_by_courier?: boolean | null;
  shipping_by_customer?: boolean | null;
}

export const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const num = (s: string) => Math.round((parseFloat(s.replace(",", ".")) || 0) * 100) / 100;

export function costoDaSessione(s: SessioneSpedizione): Costo {
  const importo = Number(s.shipping_amount_gross || 0);
  return { incluso: !!s.shipping_included && importo > 0 && !s.shipping_by_customer, importo, etichetta: s.shipping_label || ETICHETTA_AR };
}

/** Scelta del costo di spedizione: nessuno · A/R 36,60 · sola riconsegna 18,30 · importo libero. */
export function CostoSpedizione({ valore, onChange, disabilitato }: { valore: Costo; onChange: (c: Costo) => void; disabilitato?: boolean }) {
  const scelto = !valore.incluso ? "no" : Math.abs(valore.importo - COSTO_AR) < 0.005 ? "ar" : Math.abs(valore.importo - COSTO_SOLA) < 0.005 ? "sola" : "libero";
  // testo dell'importo libero: si tiene solo mentre si scrive; con le scelte rapide si svuota
  const [libero, setLibero] = useState(scelto === "libero" ? valore.importo.toFixed(2).replace(".", ",") : "");
  const btn = (k: string) => `h-8 rounded-md border px-2 text-xs ${scelto === k ? "border-amber-700 bg-amber-100 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "bg-background hover:bg-muted"}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" disabled={disabilitato} className={btn("no")} onClick={() => { setLibero(""); onChange({ incluso: false, importo: 0, etichetta: valore.etichetta }); }}>Nessun costo</button>
      <button type="button" disabled={disabilitato} className={btn("ar")} onClick={() => { setLibero(""); onChange({ incluso: true, importo: COSTO_AR, etichetta: ETICHETTA_AR }); }}>
        Ritiro + riconsegna (fino a 5 pezzi) {eur(COSTO_AR)}</button>
      <button type="button" disabled={disabilitato} className={btn("sola")} onClick={() => { setLibero(""); onChange({ incluso: true, importo: COSTO_SOLA, etichetta: ETICHETTA_SOLA }); }}>
        Sola riconsegna (metà) {eur(COSTO_SOLA)}</button>
      <span className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">altro importo</span>
        <Input className="h-8 w-20 text-right font-mono" inputMode="decimal" placeholder="0,00" disabled={disabilitato} value={libero}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d,.]/g, "");
            setLibero(v);
            const n = num(v);
            onChange(n > 0 ? { incluso: true, importo: n, etichetta: scelto === "libero" ? valore.etichetta : ETICHETTA_LIBERA } : { incluso: false, importo: 0, etichetta: valore.etichetta });
          }} />
        <span className="text-muted-foreground">€ IVA incl.</span>
      </span>
    </div>
  );
}

export function SpedizioneSessione({ sessionId, session, onSalvato }: { sessionId: string; session: SessioneSpedizione; onSalvato: () => void }) {
  const [arrivato, setArrivato] = useState(!!session.arrived_by_courier);
  const [rispedire, setRispedire] = useState(!!session.return_by_courier);
  const [carico, setCarico] = useState(!!session.shipping_by_customer);
  const [costo, setCosto] = useState<Costo>(costoDaSessione(session));
  const [busy, setBusy] = useState(false);

  const salvato = costoDaSessione(session);
  const modificato = arrivato !== !!session.arrived_by_courier || rispedire !== !!session.return_by_courier || carico !== !!session.shipping_by_customer
    || (!carico && (costo.incluso !== salvato.incluso || (costo.incluso && (Math.abs(costo.importo - salvato.importo) > 0.005 || costo.etichetta !== salvato.etichetta))));

  async function salva() {
    setBusy(true);
    try {
      await updateSession(sessionId, {
        arrived_by_courier: arrivato, return_by_courier: rispedire, shipping_by_customer: carico,
        shipping_included: !carico && costo.incluso, shipping_amount_gross: !carico && costo.incluso ? costo.importo : 0,
        shipping_label: costo.etichetta || ETICHETTA_LIBERA,
      });
      toast.success(carico ? "Salvato: spedizione a carico del cliente (nessun costo in fattura)"
        : costo.incluso ? `Salvato: spedizione ${eur(costo.importo)} in fattura` : "Salvato: nessun costo di spedizione");
      onSalvato();
    } catch (e) {
      toast.error("Spedizione non salvata: " + (e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Card className="space-y-3 border-l-4 border-l-amber-700 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Truck className="size-5 text-amber-800" />
        <h3 className="text-base font-semibold">Spedizione e corriere</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          In fattura e pro forma: {carico ? "nessun costo (corriere del cliente)" : salvato.incluso ? `${salvato.etichetta} ${eur(salvato.importo)}` : "nessun costo di spedizione"}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={arrivato} onChange={(e) => setArrivato(e.target.checked)} /> Arrivato con corriere</label>
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={rispedire} onChange={(e) => setRispedire(e.target.checked)} /> Da rispedire con corriere</label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={carico} onChange={(e) => setCarico(e.target.checked)} />
          Spedizione a carico del cliente <span className="text-muted-foreground">(ritiro e consegna con il SUO corriere)</span>
        </label>
      </div>
      {carico ? (
        <p className="rounded-md bg-amber-500/10 p-2 text-sm">Il cliente organizza ritiro e riconsegna con il proprio corriere: <b>costo di spedizione 0</b> in fattura e pro forma, e la ricevuta lo riporta.</p>
      ) : (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Costo della spedizione da mettere in fattura / pro forma (IVA inclusa)</div>
          <CostoSpedizione valore={costo} onChange={setCosto} />
          {costo.incluso && (
            <label className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Descrizione in fattura</span>
              <Input className="h-8 max-w-md" value={costo.etichetta} onChange={(e) => setCosto({ ...costo, etichetta: e.target.value })} />
            </label>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={salva} disabled={busy || !modificato}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Salva spedizione</Button>
        {modificato && <span className="text-xs text-orange-600">Modifiche non salvate</span>}
        {(rispedire || arrivato) && !carico && (
          <span className="text-xs text-muted-foreground">Etichette e ritiro UPS: pannello «Spedizioni UPS» qui sotto.</span>
        )}
      </div>
    </Card>
  );
}
