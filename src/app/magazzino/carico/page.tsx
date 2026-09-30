"use client";

// CARICO E INVENTARIO DI MAGAZZINO con lo scanner (GENIUS LAB).
// Si spara il codice a barre: se l'articolo è in magazzino si somma la quantità, se no lo si riconosce online
// (banche dati + ricerca web) e si completa descrizione e prezzo. Oppure si importa un file di testo con una riga
// per articolo «BARCODE QUANTITÀ». In modalità INVENTARIO la quantità è quella contata e sostituisce la giacenza.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ClipboardCheck, FileUp, Loader2, PackagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ScannerInput } from "@/components/ScannerInput";
import { magCaricoLotto, magImportTesto, magRiconosci, type Riconoscimento } from "@/lib/api";
import { dec0, parseDec } from "@/components/DecInput";
import { toastErrore } from "@/lib/errori";

type Riga = {
  barcode: string; quantita: number; stato: "magazzino" | "online" | "sconosciuto" | "in_ricerca";
  descrizione: string; marca: string; prezzo: string; costo: string; giacenza: number | null; fonte: string;
};
const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);

function daRiconoscimento(r: Riconoscimento, q: number): Riga {
  if (r.trovato === "magazzino" && r.prodotto) {
    return { barcode: r.barcode, quantita: q, stato: "magazzino", descrizione: r.prodotto.descrizione, marca: r.prodotto.marca || "",
      prezzo: String(r.prodotto.prezzo ?? ""), costo: String(r.prodotto.costo ?? ""), giacenza: Number(r.prodotto.giacenza), fonte: "magazzino" };
  }
  return { barcode: r.barcode, quantita: q, stato: r.trovato === "online" ? "online" : "sconosciuto", descrizione: r.info?.descrizione || "",
    marca: r.info?.marca || "", prezzo: "", costo: "", giacenza: null, fonte: r.info?.fonte || "" };
}

export default function CaricoMagazzinoPage() {
  const [modo, setModo] = useState<"carico" | "inventario">("carico");
  const [righe, setRighe] = useState<Riga[]>([]);
  const [qScan, setQScan] = useState(1);
  const [busy, setBusy] = useState("");
  const [testo, setTesto] = useState("");
  const file = useRef<HTMLInputElement>(null);
  // lo scanner spara più codici di fila prima che React ridisegni: la lista «vera» sta in un ref
  const righeRef = useRef<Riga[]>([]);
  useEffect(() => { righeRef.current = righe; }, [righe]);
  const lock = useRef(false);

  const aggiorna = (i: number, p: Partial<Riga>) => setRighe((rr) => rr.map((r, j) => (j === i ? { ...r, ...p } : r)));

  async function scansiona(codice: string) {
    const c = codice.trim();
    if (!c) return;
    const esistente = righeRef.current.find((r) => r.barcode === c);
    if (esistente) {   // già in lista: si somma (carico) o si conta un pezzo in più (inventario)
      const nuovaQ = esistente.quantita + qScan;
      righeRef.current = righeRef.current.map((r) => (r.barcode === c ? { ...r, quantita: nuovaQ } : r));
      setRighe((rr) => rr.map((r) => (r.barcode === c ? { ...r, quantita: r.quantita + qScan } : r)));
      toast.success(`${esistente.descrizione || c}: ${nuovaQ}`);
      return;
    }
    const riga: Riga = { barcode: c, quantita: qScan, stato: "in_ricerca", descrizione: "", marca: "", prezzo: "", costo: "", giacenza: null, fonte: "" };
    righeRef.current = [riga, ...righeRef.current];
    setRighe((rr) => (rr.some((r) => r.barcode === c) ? rr : [riga, ...rr]));
    try {
      const r = await magRiconosci(c);
      setRighe((rr) => rr.map((x) => (x.barcode === c && x.stato === "in_ricerca" ? daRiconoscimento(r, x.quantita) : x)));
      if (r.trovato === "magazzino") toast.success(`${r.prodotto?.descrizione} · in magazzino: ${Number(r.prodotto?.giacenza)}`);
      else if (r.trovato === "online") toast.info(`Nuovo articolo riconosciuto: ${r.info?.descrizione} — metti il prezzo`);
      else toast.warning(`Codice ${c} non trovato: scrivi tu la descrizione`);
    } catch (e) {
      setRighe((rr) => rr.map((x) => (x.barcode === c && x.stato === "in_ricerca" ? { ...x, stato: "sconosciuto" } : x)));
      toastErrore(e);
    }
  }

  async function importa(t: string) {
    if (!t.trim() || busy) return;
    setBusy("import");
    try {
      const r = await magImportTesto(t);
      setRighe((rr) => {
        const out = [...rr];
        for (const x of r.righe) {
          const i = out.findIndex((y) => y.barcode === x.barcode);
          if (i >= 0) out[i] = { ...out[i], quantita: out[i].quantita + (x.quantita || 0) };
          else out.push(daRiconoscimento(x, x.quantita || 1));
        }
        return out;
      });
      toast.success(`Letti ${r.codici} codici, ${r.pezzi} pezzi`);
      setTesto("");
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  async function registra() {
    if (lock.current) return;
    const prezzoKo = righe.find((r) => [r.prezzo, r.costo].some((v) => { const n = parseDec(v); return n !== null && (Number.isNaN(n) || n < 0); }));
    if (prezzoKo) { toast.error(`Prezzo o costo non valido per ${prezzoKo.descrizione || prezzoKo.barcode} (es. 12,50)`); return; }
    if (modo === "carico" && righe.some((r) => !(r.quantita > 0))) { toast.error("C'è un articolo con quantità 0: correggila o toglilo dalla lista"); return; }
    const mancano = righe.filter((r) => r.stato !== "magazzino" && !r.descrizione.trim());
    if (mancano.length) { toast.error(`Manca la descrizione per ${mancano.length} articoli nuovi`); return; }
    if (righe.some((r) => r.stato === "in_ricerca")) { toast.error("Aspetta che finisca il riconoscimento"); return; }
    if (!confirm(modo === "carico" ? `Caricare ${righe.reduce((s, r) => s + r.quantita, 0)} pezzi di ${righe.length} articoli?`
      : `Registrare l'inventario di ${righe.length} articoli? La giacenza verrà sostituita con le quantità contate.`)) return;
    lock.current = true;
    setBusy("registra");
    try {
      const r = await magCaricoLotto({ modo, righe: righe.map((x) => ({ barcode: x.barcode, quantita: x.quantita, descrizione: x.descrizione,
        marca: x.marca || null, prezzo: parseDec(x.prezzo) ?? undefined, costo: parseDec(x.costo) ?? undefined })) });
      if (r.errori) {
        const ko = new Set(r.esiti.filter((e) => !e.ok).map((e) => e.barcode));
        setRighe((rr) => rr.filter((x) => ko.has(x.barcode)));
        toast.error(`${r.ok} registrati, ${r.errori} con errore (rimasti in lista)`);
      } else {
        setRighe([]);
        toast.success(`${r.ok} articoli registrati${r.esiti.some((e) => e.creato) ? ` (${r.esiti.filter((e) => e.creato).length} nuovi creati)` : ""}`);
      }
    } catch (e) { toastErrore(e); } finally { lock.current = false; setBusy(""); }
  }

  const pezzi = righe.reduce((s, r) => s + r.quantita, 0);
  return (
    <div className="space-y-4 p-1 md:p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/magazzino"><Button size="icon" variant="ghost"><ArrowLeft className="size-4" /></Button></Link>
        <h1 className="text-2xl font-semibold">Carico e inventario</h1>
        <div className="ml-2 flex rounded-md border p-0.5">
          {([["carico", "Carico merce", PackagePlus], ["inventario", "Inventario (verifica)", ClipboardCheck]] as const).map(([k, l, Icon]) => (
            <button key={k} onClick={() => setModo(k)} className={`flex items-center gap-1 rounded px-3 py-1 text-sm ${modo === k ? "bg-primary text-primary-foreground" : ""}`}>
              <Icon className="size-4" />{l}
            </button>
          ))}
        </div>
      </div>

      <Card className="space-y-2 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1"><ScannerInput onCodice={scansiona} placeholder="Spara il codice a barre (o scrivilo e premi Invio)" /></div>
          <label className="text-sm">Quantità per lettura
            <Input type="number" min={1} className="h-9 w-20" value={qScan} onChange={(e) => setQScan(Math.max(1, parseInt(e.target.value || "1", 10)))} />
          </label>
        </div>
        <div className="text-xs text-muted-foreground">
          {modo === "carico" ? "Ogni lettura aggiunge i pezzi. Gli articoli nuovi vengono riconosciuti online: controlla la descrizione e metti il prezzo."
            : "Conta gli articoli sparandoli uno per uno (o scrivi la quantità contata): a fine conteggio la giacenza viene sostituita."}
        </div>
      </Card>

      <Card className="space-y-2 p-3">
        <div className="flex items-center gap-2 text-sm font-medium"><FileUp className="size-4" />Importa da file di testo
          <span className="text-xs font-normal text-muted-foreground">una riga per articolo: BARCODE spazio QUANTITÀ</span></div>
        <div className="flex flex-wrap gap-2">
          <input ref={file} type="file" accept=".txt,.csv,text/plain" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) await importa(await f.text()); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => file.current?.click()} disabled={busy === "import"}>
            {busy === "import" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <FileUp className="mr-1 size-4" />}Scegli file .txt
          </Button>
          <textarea className="min-h-10 flex-1 rounded-md border border-input bg-background p-2 font-mono text-xs" placeholder={"oppure incolla qui:\n8001234567890 5\n0190199421509 2"}
            value={testo} onChange={(e) => setTesto(e.target.value)} />
          <Button variant="outline" onClick={() => importa(testo)} disabled={!testo.trim() || busy === "import"}>Leggi</Button>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="px-2 py-2 text-left">Codice</th><th className="text-left">Articolo</th><th className="text-right">In magazzino</th>
              <th className="text-right">{modo === "carico" ? "Carico" : "Contati"}</th><th className="text-right">{modo === "carico" ? "Dopo" : "Differenza"}</th>
              <th className="text-right">Prezzo vendita</th><th className="text-right">Costo</th><th /></tr>
          </thead>
          <tbody>
            {!righe.length && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Spara un codice a barre o importa un file</td></tr>}
            {righe.map((r, i) => {
              const g = r.giacenza ?? 0;
              const dopo = modo === "carico" ? g + r.quantita : r.quantita - g;
              return (
                <tr key={r.barcode} className={`border-t ${r.stato === "sconosciuto" && !r.descrizione ? "bg-red-50 dark:bg-red-950/20" : r.stato === "online" ? "bg-sky-50/60 dark:bg-sky-950/20" : ""}`}>
                  <td className="px-2 py-1 font-mono text-xs">{r.barcode}</td>
                  <td className="py-1 pr-2">
                    {r.stato === "in_ricerca" ? <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3 animate-spin" />riconosco…</span>
                      : r.stato === "magazzino" ? <span>{r.descrizione}</span>
                      : <div className="space-y-0.5">
                          <Input className="h-8" placeholder="descrizione articolo *" value={r.descrizione} onChange={(e) => aggiorna(i, { descrizione: e.target.value })} />
                          <span className="text-[10px] text-muted-foreground">{r.stato === "online" ? `nuovo · trovato su ${r.fonte}` : "nuovo · non trovato online"}</span>
                        </div>}
                  </td>
                  <td className="text-right tabular-nums">{r.giacenza ?? "—"}</td>
                  <td className="text-right"><Input type="number" min={0} className="ml-auto h-8 w-20 text-right font-semibold" value={r.quantita}
                    onChange={(e) => aggiorna(i, { quantita: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></td>
                  <td className={`text-right tabular-nums font-medium ${modo === "inventario" && dopo !== 0 ? (dopo > 0 ? "text-emerald-700" : "text-red-700") : ""}`}>
                    {modo === "inventario" && dopo > 0 ? "+" : ""}{dopo}</td>
                  <td className="text-right"><Input className="ml-auto h-8 w-24 text-right" inputMode="decimal" placeholder={r.stato === "magazzino" ? "" : "€"}
                    value={r.prezzo} onChange={(e) => aggiorna(i, { prezzo: e.target.value })} /></td>
                  <td className="text-right"><Input className="ml-auto h-8 w-24 text-right" inputMode="decimal" placeholder="€" value={r.costo}
                    onChange={(e) => aggiorna(i, { costo: e.target.value })} /></td>
                  <td className="px-2"><button className="text-muted-foreground hover:text-red-600" title="Togli dalla lista" onClick={() => setRighe((rr) => rr.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {righe.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t bg-muted/30 p-3">
            <span className="text-sm">{righe.length} articoli · {pezzi} pezzi{righe.some((r) => r.stato !== "magazzino") ? ` · ${righe.filter((r) => r.stato !== "magazzino").length} nuovi` : ""}</span>
            {righe.some((r) => r.prezzo) && <span className="text-xs text-muted-foreground">valore a prezzo di vendita {eur(righe.reduce((s, r) => s + dec0(r.prezzo) * r.quantita, 0))}</span>}
            <Button variant="ghost" className="ml-auto" onClick={() => confirm("Svuotare la lista senza registrare?") && setRighe([])}>Svuota</Button>
            <Button onClick={registra} disabled={!!busy}>
              {busy === "registra" ? <Loader2 className="mr-1 size-4 animate-spin" /> : modo === "carico" ? <PackagePlus className="mr-1 size-4" /> : <ClipboardCheck className="mr-1 size-4" />}
              {modo === "carico" ? "Carica in magazzino" : "Registra inventario"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
