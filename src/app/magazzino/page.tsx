"use client";

// MAGAZZINO (GENIUS LAB): articoli con codice a barre, carico con lo scanner, giacenze, movimenti,
// etichette stampabili con il codice a barre per gli articoli che non l'hanno.
// 08/10/2026: organizzazione professionale — categorie a 2 livelli, filtri di giacenza, riepilogo, export.
// 08/10/2026: «Stampa etichetta» (riga, scheda, selezione multipla, dopo il carico e dopo «Nuovo articolo»): etichetta
// 50x22 mm sulla Brother del banco con lo stesso sistema delle etichette di taratura (vedi StampaEtichette.tsx).

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import JsBarcode from "jsbarcode";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, ArrowUpDown, Boxes, ChevronDown, ChevronRight, Download, FileSpreadsheet, FolderInput, Loader2, PackagePlus, Pencil,
  Plus, Printer, Save, Search, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { ScannerInput } from "@/components/ScannerInput";
import { dec0 } from "@/components/DecInput";
import { toastErrore } from "@/lib/errori";
import { usePermessi } from "@/components/permessi";
import { type ApiError, magCrea, magModifica, magMovimento, magPerCodice, magProdotto, type Prodotto,
  CATEGORIE_MERCE, type CategoriaMerce, type FiltroGiacenza, type MagFiltri, type MagRiepilogo, MAG_SENZA_CATEGORIA,
  magElenco, magSposta, magTassonomia, magUrlExport } from "@/lib/api";
import { BadgeAttivita, FiltroAttivita, SceltaAttivita, useAttivita } from "@/components/attivita";
import { PezziArticolo } from "./PezziArticolo";
import { StampaEtichette, type VoceEtichetta } from "./StampaEtichette";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    // EAN-13 (anche il nostro interno «20…») come sull'etichetta; il resto in Code128
    const formato = /^\d{13}$/.test(value) ? "EAN13" : /^\d{12}$/.test(value) ? "UPC" : "CODE128";
    try { JsBarcode(ref.current, value, { format: formato, height: 40, fontSize: 12, margin: 0 }); }
    catch { try { JsBarcode(ref.current, value, { format: "CODE128", height: 40, fontSize: 12, margin: 0 }); } catch { /* codice non valido */ } }
  }, [value]);
  return <svg ref={ref} />;
}

const PAGINA = 100;
const GIACENZE: { v: FiltroGiacenza; l: string }[] = [
  { v: "tutti", l: "Tutti" }, { v: "disponibili", l: "Disponibili" }, { v: "esauriti", l: "Esauriti" },
  { v: "sotto_scorta", l: "Sotto scorta" }, { v: "negativi", l: "Negativi" },
];
const nomeCat = (c: string) => (c === MAG_SENZA_CATEGORIA ? "Senza categoria" : c);
const num = (v: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(v || 0);
const data = (s?: string | null) => (s ? new Date(s).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

export default function MagazzinoPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>}>
      <Magazzino />
    </Suspense>
  );
}

// MAGAZZINO PROFESSIONALE (08/10/2026): filtri per categoria → sottocategoria, giacenza, divisione, marca e testo, tutti
// lato server e conservati nell'URL (si salvano e si condividono); albero/chip delle categorie con articoli e pezzi;
// riepilogo del filtro; colonne ordinabili; modifica rapida e «sposta in categoria»; export Excel/CSV del filtro.
function Magazzino() {
  const sp = useSearchParams();
  const router = useRouter();
  const filtri: MagFiltri = useMemo(() => ({
    q: sp.get("q") || "", categoria: sp.get("cat") || "", sottocategoria: sp.get("sub") || "",
    giacenza: (sp.get("giac") as FiltroGiacenza) || "", attivita: sp.get("att") || "", marca: sp.get("marca") || "",
    ordina: sp.get("ord") || "descrizione", verso: sp.get("verso") === "desc" ? "desc" : "asc",
    offset: Math.max(0, Number(sp.get("da")) || 0), limit: PAGINA,
  }), [sp]);
  // aggiorna l'URL (i filtri vivono lì); cambiando un filtro si torna alla prima pagina
  const vai = useCallback((cambi: Record<string, string>, tienPagina = false) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(cambi)) { if (v) n.set(k, v); else n.delete(k); }
    if (!tienPagina) n.delete("da");
    const s = n.toString();
    router.replace(s ? `/magazzino?${s}` : "/magazzino", { scroll: false });
  }, [sp, router]);

  const [testo, setTesto] = useState(filtri.q || "");
  useEffect(() => { setTesto(filtri.q || ""); }, [filtri.q]);
  useEffect(() => {
    if (testo === (filtri.q || "")) return;
    const t = setTimeout(() => vai({ q: testo.trim() }), 350);
    return () => clearTimeout(t);
  }, [testo, filtri.q, vai]);

  const { attivita: attSelettore } = useAttivita();
  const [righe, setRighe] = useState<Prodotto[]>([]);
  const [totale, setTotale] = useState(0);
  const [riep, setRiep] = useState<MagRiepilogo | null>(null);
  const [tasso, setTasso] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [aperto, setAperto] = useState<Prodotto | null>(null);
  const [nuovo, setNuovo] = useState<Partial<Prodotto> & { giacenza_iniziale?: number } | null>(null);
  const [sel, setSel] = useState<Map<string, Prodotto>>(new Map());
  const [rapida, setRapida] = useState<Prodotto | null>(null);
  const [sposta, setSposta] = useState(false);
  const [caricoQta, setCaricoQta] = useState(1);
  const [espansa, setEspansa] = useState<string>("");
  const [etichette, setEtichette] = useState<{ voci: VoceEtichetta[]; titolo?: string } | null>(null);
  const stampaEtichetta = (p: Prodotto, copie = 1, titolo?: string) => setEtichette({ voci: [{ p, copie }], titolo });
  // 02/10/2026: anche l'operatore usa il magazzino (articoli, carico, scarico); rettifica e inventario
  // gli chiedono l'autorizzazione dell'amministratore (dialogo globale). Backend vecchio: puo.magazzino_modifica=false.
  const { permessi, caricato } = usePermessi();
  const puoModificare = !!permessi?.puo.magazzino_modifica;

  useEffect(() => { magTassonomia().then((r) => setTasso(r.tassonomia)).catch(() => undefined); }, []);
  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const r = await magElenco(filtri);
      setRighe(r.prodotti || []); setTotale(r.totale_righe || 0); setRiep(r.riepilogo);
    } catch (e) { toastErrore(e); } finally { setLoading(false); }
  }, [filtri]);
  useEffect(() => { carica(); }, [carica]);
  useEffect(() => { if (filtri.categoria) setEspansa(filtri.categoria); }, [filtri.categoria]);

  // Carico con lo scanner: se l'articolo esiste NON carica da solo (04/10/2026, Christian: una lettura «di controllo»
  // diventava un carico). Mostra articolo e giacenza attuale e chiede «Quanti ne carichi?»; Invio conferma, Esc annulla.
  // Se non esiste apre «nuovo articolo» col codice.
  const [daCaricare, setDaCaricare] = useState<{ p: Prodotto; qta: string } | null>(null);
  const [caricando, setCaricando] = useState(false);
  const caricoScanner = useCallback(async (codice: string) => {
    let p: Prodotto;
    try {
      p = await magPerCodice(codice);
    } catch (e) {
      // SOLO «non trovato» apre il nuovo articolo; rete/server/sessione → errore (niente articoli doppi)
      if ((e as ApiError).status === 404) setNuovo({ barcode: codice, descrizione: "", prezzo: 0, aliquota: 22, giacenza_iniziale: caricoQta, attivita: attSelettore });
      else toastErrore(e);
      return;
    }
    setDaCaricare({ p, qta: String(caricoQta || 1) });
  }, [caricoQta, attSelettore]);
  async function confermaCarico(conEtichette = false) {
    if (!daCaricare || caricando) return;
    const n = Number(daCaricare.qta.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) { toast.error("Scrivi quanti pezzi carichi (più di 0)"); return; }
    setCaricando(true);
    try {
      const r = await magMovimento(daCaricare.p.id, { tipo: "carico", quantita: n, causale: "Carico con scanner" });
      toast.success(`${daCaricare.p.descrizione}: +${n} → giacenza ${r.giacenza}`);
      if (conEtichette) stampaEtichetta(daCaricare.p, n, `Etichette per i ${n} pezzi caricati`);
      setDaCaricare(null);
      carica();
    } catch (e) { toastErrore(e); } finally { setCaricando(false); }
  }

  const [creando, setCreando] = useState(false);
  async function salvaNuovo() {
    if (creando) return;
    if (!nuovo?.descrizione?.trim()) { toast.error("Serve la descrizione"); return; }
    setCreando(true);
    try {
      const p = await magCrea(nuovo);
      toast.success(`Creato ${p.descrizione} (${p.barcode})`);
      setNuovo(null); carica();
      // subito la proposta di stampa: copie = pezzi caricati (modificabile)
      if (!p.serializzato) stampaEtichetta(p, Math.max(1, Math.round(Number(nuovo.giacenza_iniziale) || 1)), "Articolo creato: stampi l'etichetta?");
    }
    catch (e) { toastErrore(e); } finally { setCreando(false); }
  }
  const apri = (id: string) => magProdotto(id).then(setAperto).catch(toastErrore);

  const campo = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";
  const sel8 = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const albero = riep?.albero || [];
  const nodo = albero.find((n) => n.categoria === filtri.categoria);
  const subsCat = filtri.categoria ? Array.from(new Set([...(tasso[filtri.categoria] || []), ...(nodo?.sottocategorie.map((s) => s.nome).filter(Boolean) || [])])) : [];
  const contaSub = (s: string) => nodo?.sottocategorie.find((x) => x.nome === s)?.articoli || 0;
  const categorieMenu = Array.from(new Set([...Object.keys(tasso), ...albero.map((n) => n.categoria)]));
  const contaCat = (c: string) => albero.find((n) => n.categoria === c)?.articoli || 0;
  const t = riep?.totali;
  const filtriAttivi = !!(filtri.q || filtri.categoria || filtri.giacenza || filtri.attivita || filtri.marca);
  const ordina = (col: string) => vai({ ord: col, verso: filtri.ordina === col && filtri.verso === "asc" ? "desc" : "asc" }, false);
  const Th = ({ col, children, className = "" }: { col: string; children: React.ReactNode; className?: string }) => (
    <th className={`p-2 ${className}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => ordina(col)}>
        {children}{filtri.ordina === col ? (filtri.verso === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
      </button>
    </th>
  );
  const tuttiSelezionati = righe.length > 0 && righe.every((p) => sel.has(p.id));
  const toggle = (p: Prodotto, on: boolean) => setSel((m) => { const n = new Map(m); if (on) n.set(p.id, p); else n.delete(p.id); return n; });
  const da = (filtri.offset || 0);

  return (
    <div className="space-y-4 p-1 md:p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Boxes className="size-6" /><h1 className="text-2xl font-semibold">Magazzino</h1>
        <div className="ml-auto flex flex-wrap gap-2 print:hidden">
          {puoModificare && <Link href="/magazzino/carico"><Button variant="outline"><PackagePlus /> <span className="hidden sm:inline">Carico e inventario</span></Button></Link>}
          <Button variant="outline" title="Esporta in Excel gli articoli del filtro corrente" onClick={() => { window.location.href = magUrlExport(filtri, "xlsx"); }}><FileSpreadsheet /> Excel</Button>
          <Button variant="outline" title="Esporta in CSV gli articoli del filtro corrente" onClick={() => { window.location.href = magUrlExport(filtri, "csv"); }}><Download /> CSV</Button>
          {puoModificare && <Button onClick={() => setNuovo({ descrizione: "", prezzo: 0, aliquota: 22, giacenza_iniziale: 0, attivita: attSelettore, categoria: filtri.categoria && filtri.categoria !== MAG_SENZA_CATEGORIA ? filtri.categoria : undefined, sottocategoria: filtri.sottocategoria || undefined })}><Plus /> Nuovo articolo</Button>}
        </div>
      </div>

      {caricato && !puoModificare && (
        <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 print:hidden dark:bg-sky-950/30 dark:text-sky-200">
          Consultazione: la modifica del magazzino non è abilitata per questo utente.
        </div>
      )}
      {puoModificare && <Card className="space-y-2 p-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><PackagePlus className="size-4" /> Carico con lo scanner
          <span className="text-xs font-normal text-muted-foreground">quantità proposta (la confermi a ogni lettura)</span>
          <input type="number" min={1} className="h-7 w-16 rounded border border-input bg-background px-1" value={caricoQta} onChange={(e) => setCaricoQta(Math.max(1, Number(e.target.value)))} />
        </div>
        <ScannerInput onCodice={caricoScanner} autoInvio placeholder="Spara il codice dell'articolo che entra in magazzino" />
      </Card>}

      {/* riepilogo del filtro corrente: le caselle di giacenza sono anche scorciatoie del filtro */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 print:hidden">
        <Kpi etichetta="Articoli" valore={t ? num(t.articoli) : "…"} />
        <Kpi etichetta="Pezzi in giacenza" valore={t ? num(t.pezzi) : "…"} />
        <Kpi etichetta="Valore a prezzo di vendita" valore={t ? eur(t.valore_vendita) : "…"} nota={t && t.valore_costo > 0 ? `a costo ${eur(t.valore_costo)}` : ""} />
        <Kpi etichetta="Disponibili" valore={t ? num(t.disponibili) : "…"} attivo={filtri.giacenza === "disponibili"} onClick={() => vai({ giac: filtri.giacenza === "disponibili" ? "" : "disponibili" })} />
        <Kpi etichetta="Esauriti" valore={t ? num(t.esauriti) : "…"} tono="ambra" attivo={filtri.giacenza === "esauriti"} onClick={() => vai({ giac: filtri.giacenza === "esauriti" ? "" : "esauriti" })} />
        <Kpi etichetta="Sotto scorta minima" valore={t ? num(t.sotto_scorta) : "…"} tono="rosso" nota={t && t.negativi ? `${t.negativi} negativi` : ""} attivo={filtri.giacenza === "sotto_scorta"} onClick={() => vai({ giac: filtri.giacenza === "sotto_scorta" ? "" : "sotto_scorta" })} />
      </div>

      {/* chip delle categorie (telefono e schermi stretti) */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden print:hidden">
        <Chip on={!filtri.categoria} onClick={() => vai({ cat: "", sub: "" })}>Tutte</Chip>
        {albero.map((n) => <Chip key={n.categoria} on={filtri.categoria === n.categoria} onClick={() => vai({ cat: n.categoria, sub: "" })}>{nomeCat(n.categoria)} <span className="opacity-60">{n.articoli}</span></Chip>)}
      </div>
      {nodo && nodo.sottocategorie.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden print:hidden">
          <Chip piccolo on={!filtri.sottocategoria} onClick={() => vai({ sub: "" })}>Tutte</Chip>
          {nodo.sottocategorie.map((s) => <Chip piccolo key={s.nome} on={filtri.sottocategoria === s.nome} onClick={() => vai({ sub: s.nome })}>{s.nome || "—"} <span className="opacity-60">{s.articoli}</span></Chip>)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* albero delle categorie (iMac) */}
        <Card className="hidden h-fit max-h-[calc(100vh-8rem)] overflow-y-auto p-2 lg:sticky lg:top-2 lg:block print:hidden">
          <div className="px-2 pb-1 text-xs font-medium uppercase text-muted-foreground">Categorie</div>
          <button type="button" onClick={() => vai({ cat: "", sub: "" })} className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${!filtri.categoria ? "bg-muted font-semibold" : ""}`}>
            <span>Tutte</span><span className="text-xs text-muted-foreground tabular-nums">{num(albero.reduce((a, n) => a + n.articoli, 0))}</span>
          </button>
          {albero.map((n) => {
            const on = filtri.categoria === n.categoria;
            const aperta = espansa === n.categoria;
            return (
              <div key={n.categoria}>
                <div className={`flex items-center rounded hover:bg-muted ${on && !filtri.sottocategoria ? "bg-muted font-semibold" : ""}`}>
                  <button type="button" aria-label={aperta ? "Chiudi" : "Apri"} className="p-1 text-muted-foreground" onClick={() => setEspansa(aperta ? "" : n.categoria)}>
                    {aperta ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</button>
                  <button type="button" className="flex flex-1 items-center justify-between py-1.5 pr-2 text-left text-sm" onClick={() => { vai({ cat: n.categoria, sub: "" }); setEspansa(n.categoria); }}>
                    <span className={n.categoria === "Da classificare" || n.categoria === MAG_SENZA_CATEGORIA ? "text-amber-700 dark:text-amber-400" : ""}>{nomeCat(n.categoria)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums" title={`${n.articoli} articoli · ${num(n.pezzi)} pezzi`}>{n.articoli} · {num(n.pezzi)} pz</span>
                  </button>
                </div>
                {aperta && n.sottocategorie.filter((s) => s.nome).map((s) => (
                  <button key={s.nome} type="button" onClick={() => vai({ cat: n.categoria, sub: s.nome })}
                    className={`flex w-full items-center justify-between rounded py-1 pl-7 pr-2 text-left text-[13px] hover:bg-muted ${on && filtri.sottocategoria === s.nome ? "bg-muted font-semibold" : "text-muted-foreground"}`}>
                    <span className="truncate">{s.nome}</span><span className="ml-2 shrink-0 text-xs tabular-nums">{s.articoli} · {num(s.pezzi)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </Card>

        <div className="min-w-0 space-y-3">
          {/* barra filtri */}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="relative w-full sm:w-72"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input className="h-9 w-full pl-8" placeholder="Descrizione, codice, barcode, marca…" value={testo} onChange={(e) => setTesto(e.target.value)} /></div>
            <select className={sel8} value={filtri.categoria} aria-label="Categoria" onChange={(e) => vai({ cat: e.target.value, sub: "" })}>
              <option value="">Tutte le categorie</option>
              {categorieMenu.map((c) => <option key={c} value={c}>{nomeCat(c)} ({contaCat(c)})</option>)}
            </select>
            <select className={sel8} value={filtri.sottocategoria} aria-label="Sottocategoria" disabled={!filtri.categoria} onChange={(e) => vai({ sub: e.target.value })}>
              <option value="">{filtri.categoria ? "Tutte le sottocategorie" : "Sottocategoria"}</option>
              {subsCat.map((s) => <option key={s} value={s}>{s} ({contaSub(s)})</option>)}
            </select>
            <div className="flex overflow-hidden rounded-md border border-input text-sm" role="group" aria-label="Giacenza">
              {GIACENZE.map((g) => (
                <button key={g.v} type="button" onClick={() => vai({ giac: g.v === "tutti" ? "" : g.v })}
                  className={`h-9 px-2.5 ${(filtri.giacenza || "tutti") === g.v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{g.l}</button>
              ))}
            </div>
            <FiltroAttivita className="h-9" value={filtri.attivita || ""} onChange={(v) => vai({ att: v })} />
            <select className={sel8} value={filtri.marca} aria-label="Marca" onChange={(e) => vai({ marca: e.target.value })}>
              <option value="">Tutte le marche</option>
              {(riep?.marche || []).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {filtriAttivi && <Button variant="ghost" size="sm" onClick={() => { setTesto(""); router.replace("/magazzino", { scroll: false }); }}><X /> Azzera filtri</Button>}
          </div>

          {sel.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm print:hidden">
              <b>{sel.size} selezionati</b>
              {puoModificare && <Button size="sm" onClick={() => setSposta(true)}><FolderInput /> Sposta in categoria</Button>}
              {puoModificare && <Button size="sm" variant="outline" onClick={() => setEtichette({ voci: Array.from(sel.values()).map((p) => ({ p, copie: 1 })) })}><Printer /> Stampa etichette</Button>}
              <Button size="sm" variant="ghost" onClick={() => setSel(new Map())}><X /> Deseleziona</Button>
            </div>
          )}

          <Card className="overflow-x-auto p-0 print:hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-8 p-2"><input type="checkbox" aria-label="Seleziona la pagina" checked={tuttiSelezionati}
                  onChange={(e) => setSel((m) => { const n = new Map(m); righe.forEach((p) => (e.target.checked ? n.set(p.id, p) : n.delete(p.id))); return n; })} /></th>
                <Th col="descrizione">Articolo</Th>
                <Th col="categoria" className="hidden md:table-cell">Categoria</Th>
                <Th col="giacenza" className="text-right">Giac.</Th>
                <th className="hidden p-2 text-right xl:table-cell">Scorta min.</th>
                <Th col="prezzo" className="hidden text-right sm:table-cell">Prezzo</Th>
                <Th col="valore" className="hidden text-right md:table-cell">Valore</Th>
                <Th col="ultimo_movimento" className="hidden text-right lg:table-cell">Ultimo mov.</Th>
                {puoModificare && <th className="w-16 p-2" />}
              </tr></thead>
              <tbody>
                {loading && !righe.length && <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="mx-auto animate-spin" /></td></tr>}
                {righe.map((p) => {
                  const g = Number(p.giacenza);
                  const merce = p.e_merce !== false;
                  const colore = !merce ? "text-muted-foreground" : g < 0 ? "text-red-600" : p.sotto_scorta ? "text-red-600" : g === 0 ? "text-amber-600" : "";
                  return (
                    <tr key={p.id} className={`cursor-pointer border-b last:border-0 hover:bg-muted/50 ${loading ? "opacity-60" : ""}`} onClick={() => apri(p.id)}>
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label="Seleziona" checked={sel.has(p.id)} onChange={(e) => toggle(p, e.target.checked)} /></td>
                      <td className="p-2"><div className="font-medium">{p.descrizione} <BadgeAttivita a={p.attivita} />
                        {p.serializzato && <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200" title="Si vende per pezzo (seriale/IMEI)">S/N</span>}</div>
                        <div className="text-xs text-muted-foreground">{[p.codice, p.barcode && p.barcode !== p.codice ? p.barcode : null, p.marca].filter(Boolean).join(" · ")}</div>
                        <div className="text-xs text-muted-foreground md:hidden">{[p.categoria, p.sottocategoria].filter(Boolean).join(" › ")}</div></td>
                      <td className="hidden p-2 text-xs md:table-cell"><div>{p.categoria || <span className="text-amber-600">—</span>}</div><div className="text-muted-foreground">{p.sottocategoria}</div></td>
                      <td className={`p-2 text-right font-semibold tabular-nums ${colore}`} title={merce ? undefined : "Voce di servizio: la giacenza non conta"}>{merce ? num(g) : "—"}</td>
                      <td className="hidden p-2 text-right tabular-nums text-muted-foreground xl:table-cell">{Number(p.scorta_minima) ? num(Number(p.scorta_minima)) : "—"}</td>
                      <td className="hidden p-2 text-right tabular-nums sm:table-cell">{eur(Number(p.prezzo))}</td>
                      <td className="hidden p-2 text-right tabular-nums md:table-cell">{merce && g > 0 ? eur(Number(p.valore_vendita ?? g * Number(p.prezzo))) : "—"}</td>
                      <td className="hidden p-2 text-right text-xs tabular-nums text-muted-foreground lg:table-cell">{data(p.ultimo_movimento_at)}</td>
                      {puoModificare && <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <Button variant="ghost" size="icon-sm" title="Stampa etichetta (codice a barre e prezzo)" onClick={() => stampaEtichetta(p)}><Printer /></Button>
                          <Button variant="ghost" size="icon-sm" title="Modifica rapida: categoria e scorta minima" onClick={() => setRapida(p)}><Pencil /></Button></div></td>}
                    </tr>
                  );
                })}
                {!loading && !righe.length && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nessun articolo con questi filtri</td></tr>}
              </tbody>
            </table>
          </Card>
          {totale > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground print:hidden">
              <span>{da + 1}–{Math.min(da + PAGINA, totale)} di {num(totale)}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={da === 0} onClick={() => vai({ da: String(Math.max(0, da - PAGINA)) }, true)}>Precedenti</Button>
                <Button variant="outline" size="sm" disabled={da + PAGINA >= totale} onClick={() => vai({ da: String(da + PAGINA) }, true)}>Successivi</Button>
              </div>
            </div>
          )}
        </div>
      </div>

        {daCaricare && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !caricando && setDaCaricare(null)}>
            <Card className="w-full max-w-sm space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
              <div className="text-sm text-muted-foreground">Carico con lo scanner</div>
              <div className="font-medium">{daCaricare.p.descrizione}</div>
              <div className="text-xs text-muted-foreground">{daCaricare.p.codice}{daCaricare.p.barcode ? ` · ${daCaricare.p.barcode}` : ""}</div>
              <div className="rounded-md bg-muted px-3 py-2 text-sm">Giacenza attuale: <b className="tabular-nums">{Number(daCaricare.p.giacenza || 0)}</b></div>
              <label className="block space-y-1">
                <div className="text-sm font-medium">Quanti ne carichi?</div>
                <Input autoFocus inputMode="numeric" className="h-11 text-lg" value={daCaricare.qta}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setDaCaricare({ ...daCaricare, qta: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confermaCarico(); } if (e.key === "Escape") setDaCaricare(null); }} />
              </label>
              {Number(daCaricare.qta.replace(",", ".")) > 0 && <div className="text-xs text-muted-foreground">Dopo il carico: {Number(daCaricare.p.giacenza || 0) + Number(daCaricare.qta.replace(",", "."))}</div>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" className="h-11" disabled={caricando} onClick={() => setDaCaricare(null)}>Annulla (non carico)</Button>
                <Button variant="outline" className="h-11" disabled={caricando} title="Carica e poi stampa un'etichetta per ogni pezzo (quantità modificabile)"
                  onClick={() => confermaCarico(true)}><Printer className="size-4" /> Carica + etichette</Button>
                <Button className="h-11" disabled={caricando} onClick={() => confermaCarico()}>{caricando ? <Loader2 className="size-4 animate-spin" /> : <PackagePlus className="size-4" />} Carica</Button>
              </div>
              <button type="button" className="text-xs text-muted-foreground underline" disabled={caricando}
                onClick={() => { const p = daCaricare.p; setDaCaricare(null); stampaEtichetta(p, Math.max(1, Math.round(Number(daCaricare.qta.replace(",", ".")) || 1))); }}>
                Solo etichette, senza caricare</button>
            </Card>
          </div>
        )}
      {rapida && <ModificaRapida p={rapida} tasso={tasso} onClose={() => setRapida(null)} onSalvato={() => { setRapida(null); carica(); }} />}
      {sposta && <SpostaInCategoria ids={Array.from(sel.keys())} tasso={tasso} onClose={() => setSposta(false)}
        onFatto={() => { setSposta(false); setSel(new Map()); carica(); }} />}
      {(nuovo || aperto) && (
        <Scheda p={aperto} nuovo={nuovo} setNuovo={setNuovo} onClose={() => { setAperto(null); setNuovo(null); }} onSalvaNuovo={salvaNuovo} creando={creando}
          onCambiato={(p) => { carica(); if (p) apri(p.id); }} campo={campo} solaLettura={!puoModificare} tasso={tasso}
          onStampa={(p) => stampaEtichetta(p)} />
      )}
      {etichette && <StampaEtichette voci={etichette.voci} titolo={etichette.titolo} onClose={() => setEtichette(null)}
        onStampato={() => { carica(); if (aperto) apri(aperto.id); }} />}
    </div>
  );
}

function Kpi({ etichetta, valore, nota, tono, attivo, onClick }: { etichetta: string; valore: string; nota?: string; tono?: "ambra" | "rosso"; attivo?: boolean; onClick?: () => void }) {
  const colore = tono === "rosso" ? "text-red-600" : tono === "ambra" ? "text-amber-600" : "";
  const corpo = (<>
    <div className="text-xs text-muted-foreground">{etichetta}</div>
    <div className={`text-lg font-semibold tabular-nums ${colore}`}>{valore}</div>
    {nota ? <div className="text-[11px] text-muted-foreground">{nota}</div> : null}
  </>);
  const cls = `rounded-lg border bg-card p-2.5 text-left ${attivo ? "ring-2 ring-primary" : ""}`;
  return onClick ? <button type="button" className={`${cls} hover:bg-muted/50`} onClick={onClick} aria-pressed={attivo}>{corpo}</button> : <div className={cls}>{corpo}</div>;
}

function Chip({ on, onClick, children, piccolo }: { on: boolean; onClick: () => void; children: React.ReactNode; piccolo?: boolean }) {
  return <button type="button" onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-full border px-3 ${piccolo ? "py-0.5 text-xs" : "py-1 text-sm"} ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{children}</button>;
}

function SceltaCategoria({ tasso, cat, sub, onCambia, className }: { tasso: Record<string, string[]>; cat: string; sub: string; onCambia: (cat: string, sub: string) => void; className: string }) {
  const subs = tasso[cat] || [];
  return (<>
    <label className="space-y-1"><div className="text-xs text-muted-foreground">Categoria</div>
      <select className={className} value={cat} onChange={(e) => onCambia(e.target.value, "")}>
        <option value="">—</option>
        {cat && !(cat in tasso) && <option value={cat}>{cat}</option>}
        {Object.keys(tasso).map((c) => <option key={c} value={c}>{c}</option>)}
      </select></label>
    <label className="space-y-1"><div className="text-xs text-muted-foreground">Sottocategoria</div>
      <select className={className} value={sub} disabled={!subs.length && !sub} onChange={(e) => onCambia(cat, e.target.value)}>
        <option value="">—</option>
        {sub && !subs.includes(sub) && <option value={sub}>{sub}</option>}
        {subs.map((s) => <option key={s} value={s}>{s}</option>)}
      </select></label>
  </>);
}

function ModificaRapida({ p, tasso, onClose, onSalvato }: { p: Prodotto; tasso: Record<string, string[]>; onClose: () => void; onSalvato: () => void }) {
  const [cat, setCat] = useState(p.categoria || "");
  const [sub, setSub] = useState(p.sottocategoria || "");
  const [scorta, setScorta] = useState(String(Number(p.scorta_minima) || 0).replace(".", ","));
  const [busy, setBusy] = useState(false);
  async function salva() {
    if (busy) return;
    const s = dec0(scorta);
    if (!Number.isFinite(s) || s < 0) { toast.error("Scorta minima non valida"); return; }
    setBusy(true);
    try { await magModifica(p.id, { categoria: cat || null, sottocategoria: sub || null, scorta_minima: s }); toast.success("Salvato"); onSalvato(); }
    catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  const c = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden" onClick={onClose}>
      <Card className="w-full max-w-md space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm text-muted-foreground">Modifica rapida</div>
        <div className="font-medium">{p.descrizione}</div>
        <div className="grid grid-cols-2 gap-2">
          <SceltaCategoria tasso={tasso} cat={cat} sub={sub} onCambia={(a, b) => { setCat(a); setSub(b); }} className={c} />
          <label className="space-y-1"><div className="text-xs text-muted-foreground">Scorta minima (0 = nessuna)</div>
            <input className={c} inputMode="decimal" value={scorta} onChange={(e) => setScorta(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") salva(); }} /></label>
          <div className="space-y-1"><div className="text-xs text-muted-foreground">Giacenza</div><div className="h-9 py-2 text-sm font-semibold tabular-nums">{Number(p.giacenza)}</div></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={salva} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Salva</Button>
        </div>
      </Card>
    </div>
  );
}

function SpostaInCategoria({ ids, tasso, onClose, onFatto }: { ids: string[]; tasso: Record<string, string[]>; onClose: () => void; onFatto: () => void }) {
  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const [busy, setBusy] = useState(false);
  async function vai() {
    if (busy) return;
    if (!cat) { toast.error("Scegli la categoria"); return; }
    setBusy(true);
    try { const r = await magSposta(ids, cat, sub || null); toast.success(`${r.aggiornati} articoli spostati in ${cat}${sub ? ` › ${sub}` : ""}`); onFatto(); }
    catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  const c = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden" onClick={onClose}>
      <Card className="w-full max-w-md space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="font-medium">Sposta {ids.length} articoli in categoria</div>
        <div className="grid grid-cols-2 gap-2"><SceltaCategoria tasso={tasso} cat={cat} sub={sub} onCambia={(a, b) => { setCat(a); setSub(b); }} className={c} /></div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={vai} disabled={busy || !cat}>{busy ? <Loader2 className="animate-spin" /> : <FolderInput />} Sposta</Button>
        </div>
      </Card>
    </div>
  );
}

function Scheda({ p, nuovo, setNuovo, onClose, onSalvaNuovo, onCambiato, campo, creando, solaLettura, tasso, onStampa }: {
  tasso: Record<string, string[]>; onStampa: (p: Prodotto) => void;
  p: Prodotto | null; nuovo: (Partial<Prodotto> & { giacenza_iniziale?: number }) | null; creando: boolean; solaLettura: boolean;
  setNuovo: (n: Partial<Prodotto> & { giacenza_iniziale?: number }) => void; onClose: () => void; onSalvaNuovo: () => void;
  onCambiato: (p: Prodotto | null) => void; campo: string;
}) {
  const [f, setF] = useState<Partial<Prodotto>>(p || {});
  const [mov, setMov] = useState({ tipo: "carico", quantita: 1, causale: "" });
  const [busy, setBusy] = useState("");
  // i numeri si scrivono come testo (virgola ammessa) e si convertono al salvataggio
  const NUMERICI = new Set<string>(["prezzo", "aliquota", "costo", "scorta_minima"]);
  const [testi, setTesti] = useState<Record<string, string>>({});
  const dati = nuovo || f;
  const set = (k: keyof Prodotto | "giacenza_iniziale", v: string | number | boolean | null) => nuovo ? setNuovo({ ...nuovo, [k]: v }) : setF((x) => ({ ...x, [k]: v }));
  const CAMPI: [keyof Prodotto, string, string][] = [["descrizione", "Descrizione", "text"], ["barcode", "Codice a barre (vuoto = EAN interno generato)", "text"],
    ["codice", "Codice articolo", "text"], ["marca", "Marca", "text"], ["modello", "Modello / compatibilità", "text"],
    ["ubicazione", "Ubicazione", "text"], ["fornitore_nome", "Fornitore predefinito", "text"],
    ["prezzo", "Prezzo di vendita IVA incl.", "number"], ["aliquota", "IVA %", "number"], ["costo", "Costo d'acquisto", "number"], ["scorta_minima", "Scorta minima", "number"]];

  async function salva() {
    if (!p || busy) return;
    setBusy("salva");
    try { const r = await magModifica(p.id, f); toast.success("Salvato"); onCambiato(r); } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function movimento() {
    if (!p || busy) return;
    if (!mov.quantita && mov.tipo !== "inventario") { toast.error("Scrivi la quantità"); return; }
    setBusy("mov");
    try { const r = await magMovimento(p.id, mov); toast.success(`Giacenza: ${r.giacenza}`); onCambiato(p); } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 print:hidden" onClick={onClose}>
      <div className="h-full w-full max-w-xl space-y-4 overflow-y-auto bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-semibold">{nuovo ? "Nuovo articolo" : p?.descrizione}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X /></Button></div>
        <div className="grid grid-cols-2 gap-2">
          {CAMPI.map(([k, l, t]) => (
            <label key={k} className={`space-y-1 ${k === "descrizione" ? "col-span-2" : ""}`}><div className="text-xs text-muted-foreground">{l}</div>
              {NUMERICI.has(k)
                ? <input type="text" inputMode="decimal" className={campo} disabled={solaLettura} value={testi[k] ?? String((dati[k] as number | undefined) ?? "").replace(".", ",")}
                    onChange={(e) => { setTesti((x) => ({ ...x, [k]: e.target.value })); set(k, dec0(e.target.value)); }} />
                : <input type={t} className={campo} disabled={solaLettura} value={(dati[k] as string | undefined) ?? ""} onChange={(e) => set(k, e.target.value)} />}</label>
          ))}
          {solaLettura
            ? <div className="col-span-2 text-sm"><span className="text-xs text-muted-foreground">Categoria </span>{[dati.categoria, dati.sottocategoria].filter(Boolean).join(" › ") || "—"}</div>
            : <SceltaCategoria tasso={tasso} cat={dati.categoria || ""} sub={dati.sottocategoria || ""} className={campo}
                onCambia={(c, sc) => nuovo ? setNuovo({ ...nuovo, categoria: c || null, sottocategoria: sc || null })
                  : setF((x) => ({ ...x, categoria: c || null, sottocategoria: sc || null }))} />}
          <label className="col-span-2 space-y-1"><div className="text-xs text-muted-foreground">Regime IVA in cassa e in fattura</div>
            <select className={campo} disabled={solaLettura} value={dati.regime_iva || "ordinario"} onChange={(e) => set("regime_iva", e.target.value)}>
              <option value="ordinario">Ordinario (aliquota IVA sopra)</option>
              <option value="margine">Regime del margine — usato / conto vendita (costo = prezzo di acquisto o da girare al cliente)</option>
              <option value="esente">Esente / non imponibile</option>
            </select></label>
          <label className="space-y-1"><div className="text-xs text-muted-foreground">Categoria merce</div>
            <select className={campo} disabled={solaLettura} value={dati.categoria_merce || ""} onChange={(e) => {
              const v = e.target.value as CategoriaMerce | "";
              set("categoria_merce", v);
              if (v === "usato_margine") set("regime_iva", "margine");
            }}>
              <option value="">—</option>
              {Object.entries(CATEGORIE_MERCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <div className="space-y-1"><div className="text-xs text-muted-foreground">Attività</div>
            <SceltaAttivita value={dati.attivita} disabled={solaLettura} onChange={(a) => set("attivita", a)} /></div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={solaLettura || (!!p?.serializzato && Number(p?.giacenza) > 0)} checked={!!dati.serializzato}
              onChange={(e) => set("serializzato", e.target.checked)} />
            Si vende per pezzo con seriale / IMEI (iPhone, Mac, iPad…)</label>
          {nuovo && !nuovo.serializzato && <label className="space-y-1"><div className="text-xs text-muted-foreground">Giacenza iniziale</div>
            <input type="number" className={campo} value={nuovo.giacenza_iniziale ?? 0} onChange={(e) => set("giacenza_iniziale", Number(e.target.value))} /></label>}
        </div>
        {nuovo ? <Button onClick={onSalvaNuovo} disabled={creando}>{creando ? <Loader2 className="animate-spin" /> : <Save />} Crea articolo</Button> : (
          <>
            <div className="flex flex-wrap items-start gap-2">{!solaLettura && <Button onClick={salva} disabled={!!busy}>{busy === "salva" ? <Loader2 className="animate-spin" /> : <Save />} Salva</Button>}
              {!solaLettura && p && <Button variant="outline" onClick={() => onStampa(p)} title="Etichetta 50x22 mm sulla Brother del banco">
                <Printer /> Stampa etichetta</Button>}
              {p?.barcode && <div className="rounded border p-2"><Barcode value={p.barcode} /></div>}</div>
            {p?.serializzato && <PezziArticolo prodotto={p} solaLettura={solaLettura} onCambiato={() => onCambiato(p)} />}
            {solaLettura ? <div className="text-sm">Giacenza attuale <b>{Number(p?.giacenza)}</b></div> : p?.serializzato ? null : <Card className="space-y-2 p-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Tag className="size-4" /> Movimento · giacenza attuale <b>{Number(p?.giacenza)}</b></div>
              <div className="flex flex-wrap gap-2">
                <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })}>
                  <option value="carico">Carico (+)</option><option value="scarico">Scarico (−)</option><option value="rettifica">Rettifica (±)</option><option value="inventario">Inventario (= contati)</option></select>
                <input type="number" className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm" value={mov.quantita} onChange={(e) => setMov({ ...mov, quantita: Number(e.target.value) })} />
                <input className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm" placeholder="Causale (fornitore, fattura…)" value={mov.causale} onChange={(e) => setMov({ ...mov, causale: e.target.value })} />
                <Button size="sm" onClick={movimento} disabled={!!busy}>{busy === "mov" ? <Loader2 className="animate-spin" /> : null}Registra</Button>
              </div>
            </Card>}
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
