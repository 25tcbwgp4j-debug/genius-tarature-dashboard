"use client";

// CASSA del negozio (GENIUS LAB): scanner → carrello → scontrino al registratore oppure fattura.
// La giacenza scende da sola. Lo scontrino lo emette la cassa tramite l'agente del negozio.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banknote, CreditCard, Loader2, Minus, Plus, Receipt, RotateCcw, Search, ShoppingCart, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { ScannerInput } from "@/components/ScannerInput";
import {
  cassaAnnulla, cassaFattura, cassaRiprova, cassaScontrini, cassaScontrino, magPerCodice, magProdotti,
  type Prodotto, type RigaCassa, type Scontrino,
} from "@/lib/api";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const MOD: Record<string, string> = { contanti: "Contanti", pos_sumup: "POS SumUp", bonifico: "Bonifico", paypal: "PayPal", non_riscosso: "Non riscosso" };
const STATO: Record<string, string> = {
  da_stampare: "in coda", in_stampa: "in stampa", emesso: "emesso", errore: "ERRORE", simulato: "simulato (non fiscale)", annullato: "annullato",
};

export default function CassaPage() {
  const router = useRouter();
  const [carrello, setCarrello] = useState<(RigaCassa & { giacenza?: number })[]>([]);
  const [q, setQ] = useState("");
  const [trovati, setTrovati] = useState<Prodotto[]>([]);
  const [lotteria, setLotteria] = useState("");
  const [busy, setBusy] = useState("");
  const [oggi, setOggi] = useState<{ scontrini: Scontrino[]; totale: number; per_modalita: Record<string, number> } | null>(null);
  const [libera, setLibera] = useState({ descrizione: "", prezzo: "" });

  const ricarica = useCallback(() => { cassaScontrini().then(setOggi).catch(() => undefined); }, []);
  useEffect(() => { ricarica(); const t = setInterval(ricarica, 5000); return () => clearInterval(t); }, [ricarica]);
  useEffect(() => {
    if (q.trim().length < 2) { setTrovati([]); return; }
    const t = setTimeout(() => magProdotti(q.trim(), false, 12).then((r) => setTrovati(r.prodotti || [])).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [q]);

  const aggiungi = useCallback((p: Prodotto) => {
    setCarrello((c) => {
      const i = c.findIndex((r) => r.prodotto_id === p.id);
      if (i >= 0) return c.map((r, j) => (j === i ? { ...r, quantita: r.quantita + 1 } : r));
      return [...c, { prodotto_id: p.id, descrizione: p.descrizione, quantita: 1, prezzo: Number(p.prezzo), aliquota: Number(p.aliquota), giacenza: Number(p.giacenza) }];
    });
    setQ(""); setTrovati([]);
  }, []);
  const scansiona = useCallback(async (codice: string) => {
    try { aggiungi(await magPerCodice(codice)); } catch (e) { toast.error((e as Error).message); }
  }, [aggiungi]);

  const tot = Math.round(carrello.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto || 0) / 100), 0) * 100) / 100;

  async function scontrino(modalita: string) {
    if (!carrello.length) return;
    setBusy(modalita);
    try {
      await cassaScontrino({ righe: carrello, pagamenti: [{ modalita, importo: tot }], codice_lotteria: lotteria || undefined });
      toast.success(`Scontrino da ${eur(tot)} inviato alla cassa (${MOD[modalita]})`);
      setCarrello([]); setLotteria(""); ricarica();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  }
  async function fattura() {
    if (!carrello.length) return;
    setBusy("fattura");
    try {
      const f = await cassaFattura({ righe: carrello });
      toast.success("Bozza di fattura creata: completa il cliente e inviala allo SdI");
      setCarrello([]);
      router.push(`/fatturazione?id=${f.id}`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  }
  function setR(i: number, k: keyof RigaCassa, v: number | string) { setCarrello((c) => c.map((r, j) => (j === i ? { ...r, [k]: v } : r))); }

  return (
    <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex items-center gap-3"><ShoppingCart className="size-6" /><h1 className="text-2xl font-semibold">Cassa</h1>
          <span className="text-sm text-muted-foreground">GENIUS LAB · registratore CUSTOM</span></div>
        <ScannerInput onCodice={scansiona} />
        <div className="relative">
          <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="…oppure cerca l'articolo per nome" value={q} onChange={(e) => setQ(e.target.value)} />
          {trovati.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
              {trovati.map((p) => (
                <button key={p.id} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => aggiungi(p)}>
                  <span>{p.descrizione} <span className="text-xs text-muted-foreground">{p.barcode || p.codice}</span></span>
                  <span className="tabular-nums">{eur(Number(p.prezzo))} · {Number(p.giacenza)} pz</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Articolo</th><th className="p-2 text-center">Q.tà</th><th className="p-2 text-right">Prezzo</th>
              <th className="p-2 text-right">IVA</th><th className="p-2 text-right">Totale</th><th /></tr></thead>
            <tbody>
              {carrello.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2">{r.descrizione}{r.giacenza !== undefined && r.quantita > r.giacenza && <div className="text-xs text-amber-600">giacenza {r.giacenza}</div>}</td>
                  <td className="p-2"><div className="flex items-center justify-center gap-1">
                    <Button size="icon-xs" variant="outline" onClick={() => setR(i, "quantita", Math.max(1, r.quantita - 1))}><Minus /></Button>
                    <span className="w-6 text-center">{r.quantita}</span>
                    <Button size="icon-xs" variant="outline" onClick={() => setR(i, "quantita", r.quantita + 1)}><Plus /></Button></div></td>
                  <td className="p-2 text-right"><input type="number" step="0.01" className="h-7 w-20 rounded border border-input bg-background px-1 text-right" value={r.prezzo}
                    onChange={(e) => setR(i, "prezzo", Number(e.target.value))} /></td>
                  <td className="p-2 text-right">{r.aliquota}%</td>
                  <td className="p-2 text-right tabular-nums">{eur(r.quantita * r.prezzo)}</td>
                  <td className="p-2"><Button size="icon-xs" variant="ghost" onClick={() => setCarrello((c) => c.filter((_, j) => j !== i))}><Trash2 /></Button></td>
                </tr>
              ))}
              {!carrello.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Spara un codice a barre per iniziare</td></tr>}
            </tbody>
          </table>
          <div className="flex flex-wrap items-end gap-2 border-t p-2">
            <Input className="h-8 flex-1" placeholder="Voce libera (es. Manodopera)" value={libera.descrizione} onChange={(e) => setLibera({ ...libera, descrizione: e.target.value })} />
            <Input className="h-8 w-28" type="number" step="0.01" placeholder="Prezzo IVA incl." value={libera.prezzo} onChange={(e) => setLibera({ ...libera, prezzo: e.target.value })} />
            <Button size="sm" variant="outline" disabled={!libera.descrizione || !libera.prezzo}
              onClick={() => { setCarrello((c) => [...c, { descrizione: libera.descrizione, quantita: 1, prezzo: Number(libera.prezzo), aliquota: 22 }]); setLibera({ descrizione: "", prezzo: "" }); }}>
              <Plus /> Aggiungi</Button>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Totale</span><span className="text-3xl font-bold tabular-nums">{eur(tot)}</span></div>
          <Input className="h-8" placeholder="Codice lotteria scontrini (facoltativo)" maxLength={8} value={lotteria} onChange={(e) => setLotteria(e.target.value.toUpperCase())} />
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!carrello.length || !!busy} onClick={() => scontrino("contanti")}>{busy === "contanti" ? <Loader2 className="animate-spin" /> : <Banknote />} Contanti</Button>
            <Button disabled={!carrello.length || !!busy} onClick={() => scontrino("pos_sumup")}>{busy === "pos_sumup" ? <Loader2 className="animate-spin" /> : <CreditCard />} POS SumUp</Button>
            <Button variant="outline" disabled={!carrello.length || !!busy} onClick={() => scontrino("paypal")}><Wallet /> PayPal</Button>
            <Button variant="outline" disabled={!carrello.length || !!busy} onClick={() => scontrino("non_riscosso")}>Non riscosso</Button>
          </div>
          <Button variant="secondary" className="w-full" disabled={!carrello.length || !!busy} onClick={fattura}>
            {busy === "fattura" ? <Loader2 className="animate-spin" /> : <Receipt />} Fai fattura invece dello scontrino</Button>
          {carrello.length > 0 && <Button variant="ghost" size="sm" className="w-full" onClick={() => setCarrello([])}><X /> Svuota carrello</Button>}
        </Card>

        <Card className="p-3">
          <div className="mb-2 flex items-baseline justify-between"><span className="text-sm font-medium">Scontrini di oggi</span><span className="font-semibold tabular-nums">{eur(oggi?.totale || 0)}</span></div>
          <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {Object.entries(oggi?.per_modalita || {}).map(([k, v]) => <span key={k}>{MOD[k] || k}: {eur(v)}</span>)}
          </div>
          <div className="max-h-96 divide-y overflow-y-auto">
            {(oggi?.scontrini || []).map((s) => (
              <div key={s.id} className="py-2 text-sm">
                <div className="flex justify-between">
                  <span>{new Date(s.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {s.numero_rt ? `n. ${s.numero_rt}` : ""}</span>
                  <span className="tabular-nums">{eur(Number(s.totale))}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={s.stato === "errore" ? "text-red-600" : s.stato === "simulato" ? "text-amber-600" : "text-muted-foreground"}>
                    {STATO[s.stato] || s.stato} · {s.pagamenti.map((p) => MOD[p.modalita] || p.modalita).join(", ")}{s.errore ? ` · ${s.errore}` : ""}</span>
                  <span className="flex gap-1">
                    {(s.stato === "errore" || s.stato === "simulato") && <Button size="xs" variant="ghost" onClick={() => cassaRiprova(s.id).then(ricarica)}><RotateCcw /> Riprova</Button>}
                    {["da_stampare", "errore", "simulato"].includes(s.stato) && <Button size="xs" variant="ghost" onClick={() => { if (confirm("Annullare lo scontrino e rimettere in giacenza gli articoli?")) cassaAnnulla(s.id).then(ricarica); }}>Annulla</Button>}
                  </span>
                </div>
              </div>
            ))}
            {!oggi?.scontrini.length && <div className="py-4 text-center text-sm text-muted-foreground">Nessuno scontrino oggi</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
