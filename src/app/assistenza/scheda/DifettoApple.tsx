"use client";
// 12/11/2026 (Christian: «sezioni per difetto integrate con GSX»): il DIFETTO APPLE della scheda = codici componente → difetto
// che Apple accetta per quel seriale (repair/product/componentissue). Fino a 3, il primo è il principale. Servono per
// l'idoneità/copertura (repair/eligibility) e, dopo l'ambiente di prova, per aprire la riparazione GSX.
import { useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { gsxDifetti, type DifettoApple, type GsxDifetti } from "@/lib/gsx";
import { campo } from "./ui";

export function DifettoAppleScelta({ seriale, valore, onChange, ro }: { seriale?: string | null; valore?: DifettoApple[] | null; onChange: (v: DifettoApple[]) => void; ro?: boolean }) {
  const [cat, setCat] = useState<GsxDifetti | null>(null);
  const [busy, setBusy] = useState(false);
  const [aperto, setAperto] = useState(false);
  const [comp, setComp] = useState("");
  const [filtro, setFiltro] = useState("");
  const ser = String(seriale || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const scelti = valore || [];

  async function apri() {
    const nuovo = !aperto;
    setAperto(nuovo);
    if (!nuovo || !ser || (cat && cat.seriale === ser)) return;
    setBusy(true);
    try { setCat(await gsxDifetti(ser)); } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  const componenti = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return (cat?.componenti || []).map((c) => ({ ...c, difetti: c.difetti.filter((d) => !f || `${c.componente} ${d.descrizione} ${d.codice}`.toLowerCase().includes(f)) }))
      .filter((c) => c.difetti.length > 0 && (!comp || c.codice === comp));
  }, [cat, filtro, comp]);

  function aggiungi(c: { codice: string; componente: string }, d: { codice: string; descrizione: string }) {
    if (scelti.some((x) => x.componentCode === c.codice && x.issueCode === d.codice)) return;
    if (scelti.length >= 3) return;
    onChange([...scelti, { componentCode: c.codice, componentDescription: c.componente, issueCode: d.codice, issueDescription: d.descrizione, reproducibility: "A" }]);
    setAperto(false); setFiltro("");
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {scelti.map((d, i) => (
          <span key={`${d.componentCode}-${d.issueCode}`} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${i === 0 ? "border-primary/50 bg-primary/5 font-medium" : "bg-muted/40"}`} title={`${d.componentCode} → ${d.issueCode}${i === 0 ? " · principale" : ""}`}>
            {d.componentDescription || d.componentCode}: {d.issueDescription || d.issueCode}
            {!ro && <button type="button" className="ml-0.5 text-muted-foreground hover:text-red-600" onClick={() => onChange(scelti.filter((_, j) => j !== i))} title="Togli"><X className="size-3" /></button>}
          </span>
        ))}
        {!ro && scelti.length < 3 && <Button type="button" size="xs" variant="outline" disabled={!ser} title={ser ? "Scegli il difetto tra i codici Apple di questo seriale" : "Prima il seriale"} onClick={apri}>
          <Plus />{scelti.length ? "altro difetto" : "Difetto Apple (codici GSX)"}</Button>}
        {scelti.length === 0 && <span className="text-[11px] text-muted-foreground">Serve per chiedere ad Apple copertura e idoneità, e per aprire la riparazione.</span>}
      </div>
      {aperto && !ro && (
        <div className="rounded-md border bg-background p-2 text-xs">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            <select className={`${campo} h-8 w-auto max-w-[260px] text-xs`} value={comp} onChange={(e) => setComp(e.target.value)}>
              <option value="">Tutti i componenti</option>
              {(cat?.componenti || []).map((c) => <option key={c.codice} value={c.codice}>{c.componente} ({c.difetti.length})</option>)}
            </select>
            <input className={`${campo} h-8 flex-1 text-xs`} placeholder="Cerca: batteria, display, non si accende, tastiera…" value={filtro} onChange={(e) => setFiltro(e.target.value)} autoFocus />
            <button type="button" onClick={() => setAperto(false)}><X className="size-3.5" /></button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {cat && componenti.length === 0 && <div className="p-2 text-muted-foreground">Nessun difetto con questo filtro.</div>}
            {componenti.map((c) => (
              <div key={c.codice} className="border-t py-1 first:border-0">
                <div className="font-semibold">{c.componente} <span className="font-mono text-muted-foreground">{c.codice}</span></div>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {c.difetti.map((d) => <button key={d.codice} type="button" className="rounded border px-1.5 py-0.5 hover:bg-muted" title={d.codice} onClick={() => aggiungi(c, d)}>{d.descrizione}</button>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
