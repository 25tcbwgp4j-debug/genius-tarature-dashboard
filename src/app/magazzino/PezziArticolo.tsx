"use client";

// MAGAZZINO APPLE (02/10/2026): pezzi serializzati di un articolo (iPhone, Mac, iPad…) — seriale/IMEI, condizione,
// costo d'acquisto (per il margine N5), fornitore, stato. La giacenza dell'articolo = pezzi disponibili.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dec0 } from "@/components/DecInput";
import { toastErrore } from "@/lib/errori";
import { magCaricaPezzo, magModificaPezzo, magPezzi, STATI_PEZZO, type Pezzo, type Prodotto, type StatoPezzo } from "@/lib/api";

const eur = (v: number | null | undefined) => (v === null || v === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v));
const VUOTO = { seriale: "", imei: "", condizione: "", costo: "", note: "" };

export function PezziArticolo({ prodotto, solaLettura, onCambiato }: { prodotto: Prodotto; solaLettura: boolean; onCambiato: () => void }) {
  const [pezzi, setPezzi] = useState<Pezzo[] | null>(null);
  const [nuovo, setNuovo] = useState(VUOTO);
  const [busy, setBusy] = useState("");
  const [tutti, setTutti] = useState(false);

  const carica = useCallback(() => {
    magPezzi({ prodotto_id: prodotto.id }).then((r) => setPezzi(r.pezzi)).catch(toastErrore);
  }, [prodotto.id]);
  useEffect(() => { carica(); }, [carica]);

  async function aggiungi() {
    if (busy) return;
    if (!nuovo.seriale.trim() && !nuovo.imei.trim()) { toast.error("Scrivi il seriale o l'IMEI"); return; }
    setBusy("nuovo");
    try {
      await magCaricaPezzo({ prodotto_id: prodotto.id, seriale: nuovo.seriale.trim() || null, imei: nuovo.imei.trim() || null,
        condizione: nuovo.condizione.trim() || null, costo: nuovo.costo.trim() ? dec0(nuovo.costo) : (Number(prodotto.costo) || null), note: nuovo.note.trim() || null });
      toast.success("Pezzo caricato");
      setNuovo(VUOTO); carica(); onCambiato();
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function cambiaStato(pz: Pezzo, stato: StatoPezzo) {
    if (stato === pz.stato || busy) return;
    if (stato === "venduto" && !confirm("Segnare venduto a mano? Di solito lo segna da solo lo scontrino o la fattura.")) return;
    setBusy(pz.id);
    try { await magModificaPezzo(pz.id, { stato }); carica(); onCambiato(); } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  const visibili = (pezzi || []).filter((x) => tutti || x.stato === "in_stock" || x.stato === "in_conto_vendita");
  const campo = "h-8 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>Pezzi · disponibili <b>{(pezzi || []).filter((x) => x.stato === "in_stock" || x.stato === "in_conto_vendita").length}</b></span>
        <label className="flex items-center gap-1 text-xs font-normal text-muted-foreground"><input type="checkbox" checked={tutti} onChange={(e) => setTutti(e.target.checked)} /> anche venduti e resi</label>
      </div>
      {pezzi === null ? <Loader2 className="size-4 animate-spin" /> : (
        <div className="divide-y rounded border text-sm">
          {visibili.map((pz) => (
            <div key={pz.id} className="flex flex-wrap items-center gap-2 p-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs">{pz.imei ? `IMEI ${pz.imei}` : ""}{pz.imei && pz.seriale ? " · " : ""}{pz.seriale ? `S/N ${pz.seriale}` : ""}</div>
                <div className="text-xs text-muted-foreground">{[pz.condizione, `costo ${eur(pz.costo)}`, pz.fornitore_nome, `carico ${pz.data_carico}`,
                  pz.stato === "venduto" ? `venduto ${pz.venduto_il?.slice(0, 10) || ""} ${pz.cliente_nome || ""}` : null].filter(Boolean).join(" · ")}</div>
              </div>
              <select className={`${campo} h-7 text-xs`} disabled={solaLettura || !!busy} value={pz.stato} onChange={(e) => cambiaStato(pz, e.target.value as StatoPezzo)}>
                {Object.entries(STATI_PEZZO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          ))}
          {!visibili.length && <div className="p-2 text-muted-foreground">Nessun pezzo {tutti ? "" : "disponibile"}</div>}
        </div>
      )}
      {!solaLettura && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input className={campo} placeholder="IMEI" value={nuovo.imei} onChange={(e) => setNuovo({ ...nuovo, imei: e.target.value })} />
          <input className={campo} placeholder="Seriale" value={nuovo.seriale} onChange={(e) => setNuovo({ ...nuovo, seriale: e.target.value })} />
          <input className={campo} placeholder="Condizione (es. grado A, batt. 89%)" value={nuovo.condizione} onChange={(e) => setNuovo({ ...nuovo, condizione: e.target.value })} />
          <input className={campo} inputMode="decimal" placeholder={`Costo (${eur(Number(prodotto.costo) || 0)})`} value={nuovo.costo} onChange={(e) => setNuovo({ ...nuovo, costo: e.target.value })} />
          <input className={`${campo} col-span-2 sm:col-span-3`} placeholder="Note" value={nuovo.note} onChange={(e) => setNuovo({ ...nuovo, note: e.target.value })} />
          <Button size="sm" onClick={aggiungi} disabled={!!busy}>{busy === "nuovo" ? <Loader2 className="animate-spin" /> : <Plus />} Carica pezzo</Button>
        </div>
      )}
    </Card>
  );
}
