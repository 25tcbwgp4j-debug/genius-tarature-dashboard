"use client";

// MAGAZZINO (GENIUS LAB): articoli con codice a barre, carico con lo scanner, giacenze, movimenti,
// etichette stampabili con il codice a barre per gli articoli che non l'hanno.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Boxes, Loader2, PackagePlus, Plus, Printer, Save, Search, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { ScannerInput } from "@/components/ScannerInput";
import { magCrea, magModifica, magMovimento, magPerCodice, magProdotti, magProdotto, type Prodotto } from "@/lib/api";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => { if (ref.current && value) { try { JsBarcode(ref.current, value, { format: "CODE128", height: 40, fontSize: 12, margin: 0 }); } catch { /* codice non valido */ } } }, [value]);
  return <svg ref={ref} />;
}

export default function MagazzinoPage() {
  const [q, setQ] = useState("");
  const [sotto, setSotto] = useState(false);
  const [righe, setRighe] = useState<Prodotto[]>([]);
  const [valore, setValore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [aperto, setAperto] = useState<Prodotto | null>(null);
  const [nuovo, setNuovo] = useState<Partial<Prodotto> & { giacenza_iniziale?: number } | null>(null);
  const [etichette, setEtichette] = useState<Prodotto[]>([]);
  const [caricoQta, setCaricoQta] = useState(1);

  const carica = useCallback(async () => {
    setLoading(true);
    try { const r = await magProdotti(q, sotto, 500); setRighe(r.prodotti || []); setValore(r.valore_magazzino || 0); }
    catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
  }, [q, sotto]);
  useEffect(() => { const t = setTimeout(carica, q ? 300 : 0); return () => clearTimeout(t); }, [carica, q]);

  // Carico rapido con lo scanner: se l'articolo esiste aggiunge la quantità, altrimenti apre «nuovo articolo» col codice
  const caricoScanner = useCallback(async (codice: string) => {
    try {
      const p = await magPerCodice(codice);
      const r = await magMovimento(p.id, { tipo: "carico", quantita: caricoQta, causale: "Carico con scanner" });
      toast.success(`${p.descrizione}: +${caricoQta} → giacenza ${r.giacenza}`);
      carica();
    } catch {
      setNuovo({ barcode: codice, descrizione: "", prezzo: 0, aliquota: 22, giacenza_iniziale: caricoQta });
    }
  }, [caricoQta, carica]);

  async function salvaNuovo() {
    if (!nuovo?.descrizione) { toast.error("Serve la descrizione"); return; }
    try { const p = await magCrea(nuovo); toast.success(`Creato ${p.descrizione} (${p.barcode})`); setNuovo(null); carica(); }
    catch (e) { toast.error((e as Error).message); }
  }

  const campo = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Boxes className="size-6" /><h1 className="text-2xl font-semibold">Magazzino</h1>
        <span className="text-sm text-muted-foreground">{righe.length} articoli · valore (a costo) {eur(valore)}</span>
        <div className="ml-auto flex gap-2">
          {etichette.length > 0 && <Button variant="outline" onClick={() => window.print()}><Printer /> Stampa {etichette.length} etichette</Button>}
          <Link href="/magazzino/carico"><Button variant="outline"><PackagePlus /> Carico e inventario</Button></Link>
          <Button onClick={() => setNuovo({ descrizione: "", prezzo: 0, aliquota: 22, giacenza_iniziale: 0 })}><Plus /> Nuovo articolo</Button>
        </div>
      </div>

      <Card className="space-y-2 p-3 print:hidden">
        <div className="flex items-center gap-2 text-sm font-medium"><PackagePlus className="size-4" /> Carico con lo scanner
          <span className="ml-2 text-xs font-normal text-muted-foreground">quantità per ogni lettura</span>
          <input type="number" min={1} className="h-7 w-16 rounded border border-input bg-background px-1" value={caricoQta} onChange={(e) => setCaricoQta(Math.max(1, Number(e.target.value)))} />
        </div>
        <ScannerInput onCodice={caricoScanner} placeholder="Spara il codice dell'articolo che entra in magazzino" />
      </Card>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative"><Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input className="h-8 w-72 pl-8" placeholder="Descrizione, codice, marca…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={sotto} onChange={(e) => setSotto(e.target.checked)} /> solo sotto scorta</label>
      </div>

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : (
        <Card className="overflow-x-auto p-0 print:hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-8 p-2" /><th className="p-2">Articolo</th><th className="p-2">Codice a barre</th><th className="p-2 text-right">Prezzo</th>
              <th className="p-2 text-right">Costo</th><th className="p-2 text-right">Giacenza</th></tr></thead>
            <tbody>
              {righe.map((p) => (
                <tr key={p.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => magProdotto(p.id).then(setAperto)}>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" title="Etichetta da stampare" checked={etichette.some((x) => x.id === p.id)}
                      onChange={(e) => setEtichette((l) => e.target.checked ? [...l, p] : l.filter((x) => x.id !== p.id))} /></td>
                  <td className="p-2"><div className="font-medium">{p.descrizione}</div><div className="text-xs text-muted-foreground">{[p.marca, p.categoria, p.codice].filter(Boolean).join(" · ")}</div></td>
                  <td className="p-2 text-xs">{p.barcode || "—"}</td>
                  <td className="p-2 text-right tabular-nums">{eur(Number(p.prezzo))}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{eur(Number(p.costo))}</td>
                  <td className={`p-2 text-right font-medium tabular-nums ${p.gestisce_giacenza && Number(p.giacenza) <= Number(p.scorta_minima) ? "text-red-600" : ""}`}>{Number(p.giacenza)}</td>
                </tr>
              ))}
              {!righe.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nessun articolo</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {/* etichette: visibili solo in stampa */}
      <div className="hidden print:grid print:grid-cols-3 print:gap-4">
        {etichette.map((p) => (
          <div key={p.id} className="break-inside-avoid border p-2 text-center text-xs">
            <div className="font-semibold">{p.descrizione.slice(0, 40)}</div>
            <Barcode value={p.barcode || p.codice || p.id.slice(0, 8)} />
            <div className="text-sm font-bold">{eur(Number(p.prezzo))}</div>
          </div>
        ))}
      </div>

      {(nuovo || aperto) && (
        <Scheda p={aperto} nuovo={nuovo} setNuovo={setNuovo} onClose={() => { setAperto(null); setNuovo(null); }} onSalvaNuovo={salvaNuovo}
          onCambiato={(p) => { carica(); if (p) magProdotto(p.id).then(setAperto); }} campo={campo} />
      )}
    </div>
  );
}

function Scheda({ p, nuovo, setNuovo, onClose, onSalvaNuovo, onCambiato, campo }: {
  p: Prodotto | null; nuovo: (Partial<Prodotto> & { giacenza_iniziale?: number }) | null;
  setNuovo: (n: Partial<Prodotto> & { giacenza_iniziale?: number }) => void; onClose: () => void; onSalvaNuovo: () => void;
  onCambiato: (p: Prodotto | null) => void; campo: string;
}) {
  const [f, setF] = useState<Partial<Prodotto>>(p || {});
  const [mov, setMov] = useState({ tipo: "carico", quantita: 1, causale: "" });
  const dati = nuovo || f;
  const set = (k: keyof Prodotto | "giacenza_iniziale", v: string | number) => nuovo ? setNuovo({ ...nuovo, [k]: v }) : setF((x) => ({ ...x, [k]: v }));
  const CAMPI: [keyof Prodotto, string, string][] = [["descrizione", "Descrizione", "text"], ["barcode", "Codice a barre (vuoto = interno)", "text"],
    ["codice", "Codice articolo", "text"], ["marca", "Marca", "text"], ["categoria", "Categoria", "text"], ["ubicazione", "Ubicazione", "text"],
    ["prezzo", "Prezzo di vendita IVA incl.", "number"], ["aliquota", "IVA %", "number"], ["costo", "Costo d'acquisto", "number"], ["scorta_minima", "Scorta minima", "number"]];

  async function salva() {
    if (!p) return;
    try { const r = await magModifica(p.id, f); toast.success("Salvato"); onCambiato(r); } catch (e) { toast.error((e as Error).message); }
  }
  async function movimento() {
    if (!p) return;
    try { const r = await magMovimento(p.id, mov); toast.success(`Giacenza: ${r.giacenza}`); onCambiato(p); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 print:hidden" onClick={onClose}>
      <div className="h-full w-full max-w-xl space-y-4 overflow-y-auto bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-semibold">{nuovo ? "Nuovo articolo" : p?.descrizione}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X /></Button></div>
        <div className="grid grid-cols-2 gap-2">
          {CAMPI.map(([k, l, t]) => (
            <label key={k} className={`space-y-1 ${k === "descrizione" ? "col-span-2" : ""}`}><div className="text-xs text-muted-foreground">{l}</div>
              <input type={t} step="0.01" className={campo} value={(dati[k] as string | number | undefined) ?? ""} onChange={(e) => set(k, t === "number" ? Number(e.target.value) : e.target.value)} /></label>
          ))}
          {nuovo && <label className="space-y-1"><div className="text-xs text-muted-foreground">Giacenza iniziale</div>
            <input type="number" className={campo} value={nuovo.giacenza_iniziale ?? 0} onChange={(e) => set("giacenza_iniziale", Number(e.target.value))} /></label>}
        </div>
        {nuovo ? <Button onClick={onSalvaNuovo}><Save /> Crea articolo</Button> : (
          <>
            <div className="flex gap-2"><Button onClick={salva}><Save /> Salva</Button>
              {p?.barcode && <div className="rounded border p-2"><Barcode value={p.barcode} /></div>}</div>
            <Card className="space-y-2 p-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Tag className="size-4" /> Movimento · giacenza attuale <b>{Number(p?.giacenza)}</b></div>
              <div className="flex flex-wrap gap-2">
                <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })}>
                  <option value="carico">Carico (+)</option><option value="scarico">Scarico (−)</option><option value="rettifica">Rettifica (±)</option><option value="inventario">Inventario (= contati)</option></select>
                <input type="number" className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm" value={mov.quantita} onChange={(e) => setMov({ ...mov, quantita: Number(e.target.value) })} />
                <input className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm" placeholder="Causale (fornitore, fattura…)" value={mov.causale} onChange={(e) => setMov({ ...mov, causale: e.target.value })} />
                <Button size="sm" onClick={movimento}>Registra</Button>
              </div>
            </Card>
            <div className="text-sm font-medium">Movimenti</div>
            <div className="divide-y rounded border text-sm">
              {(p?.movimenti || []).map((m) => (
                <div key={m.id} className="flex justify-between p-2"><span>{new Date(m.created_at).toLocaleString("it-IT")} · {m.tipo} · {m.causale}</span>
                  <span className={Number(m.quantita) < 0 ? "text-red-600" : "text-emerald-700"}>{Number(m.quantita) > 0 ? "+" : ""}{Number(m.quantita)}</span></div>
              ))}
              {!p?.movimenti?.length && <div className="p-2 text-muted-foreground">Nessun movimento</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
