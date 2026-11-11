"use client";
// CATALOGO RICAMBI GSX COMPLETO (11/11/2026): tutti i prodotti scaricati da Apple via ponte, con i prezzi del listino
// (GSX col reso ×1,10 ×1,22 → proposto → listino). Ricerca per prodotto, componente, codice o descrizione.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchAPI } from "@/lib/api";
import { toastErrore } from "@/lib/errori";

type Prodotto = { product_line: string; nome: string | null; famiglia: string | null; ricambi: number; rilevato_il: string };
type Riga = {
  product_line: string; prodotto: string | null; codice: string; descrizione: string; categoria: string; tipo_descrizione: string | null;
  stock: number | null; sostituzione: number | null; sostituito_da: string | null; serializzato: boolean | null; intero: boolean | null;
  prezzi: { gsx: number; costo: number; proposto: number; listino: number } | null;
};
const euro = (n?: number | null) => (n == null ? "—" : Number(n).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));

export function CatalogoGsx() {
  const [prodotti, setProdotti] = useState<Prodotto[]>([]);
  const [categorie, setCategorie] = useState<Record<string, string>>({});
  const [pl, setPl] = useState("");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [tutti, setTutti] = useState(false);
  const [righe, setRighe] = useState<Riga[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAPI("/api/assistenza/gsx/catalogo/prodotti").then((r) => { setProdotti(r.prodotti); setCategorie(r.categorie); }).catch(toastErrore);
  }, []);

  async function cerca() {
    if (!pl && !cat && q.trim().length < 2) return;
    setBusy(true);
    try {
      const p = new URLSearchParams({ pl, cat, q: q.trim(), tutti: String(tutti) });
      setRighe((await fetchAPI(`/api/assistenza/gsx/catalogo?${p}`)).ricambi);
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  // cambio prodotto o componente → cerca subito
  useEffect(() => { if (pl || cat) cerca(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pl, cat, tutti]);

  const famiglie = useMemo(() => Array.from(new Set(prodotti.map((p) => p.famiglia || "Altro"))), [prodotti]);
  const rilevato = prodotti[0]?.rilevato_il ? new Date(prodotti[0].rilevato_il).toLocaleDateString("it-IT") : "…";

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{prodotti.length} prodotti · {prodotti.reduce((a, p) => a + (p.ricambi || 0), 0).toLocaleString("it-IT")} ricambi · scaricati da Apple il {rilevato}.
        Ci costa = GSX col reso ×1,10 (Bagnetti) ×1,22 (IVA) · proposto e listino con la regola del listino Apple.</p>
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <select value={pl} onChange={(e) => setPl(e.target.value)} className="max-w-full rounded-md border bg-white px-2 py-1.5 text-sm dark:bg-gray-900">
          <option value="">Tutti i prodotti</option>
          {famiglie.map((f) => <optgroup key={f} label={f}>{prodotti.filter((p) => (p.famiglia || "Altro") === f).map((p) => <option key={p.product_line} value={p.product_line}>{p.nome} ({p.ricambi})</option>)}</optgroup>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-md border bg-white px-2 py-1.5 text-sm dark:bg-gray-900">
          <option value="">Tutti i componenti</option>
          {Object.entries(categorie).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") cerca(); }}
            placeholder="Codice o descrizione (es. 661-35699, logic board, display)" className="w-full rounded-md border py-1.5 pl-8 pr-2 text-sm" />
        </div>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={tutti} onChange={(e) => setTutti(e.target.checked)} />anche accessori, attrezzi e voci di servizio</label>
        <Button onClick={cerca} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Search />}Cerca</Button>
      </Card>
      {righe && (
        <Card className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-left text-muted-foreground dark:bg-gray-950"><tr>
              {!pl && <th className="p-1.5">Prodotto</th>}<th className="p-1.5">Componente</th><th>Codice</th><th>Descrizione</th>
              <th className="text-right">GSX stock</th><th className="text-right">GSX col reso</th><th className="text-right">Ci costa</th>
              <th className="text-right">Proposto</th><th className="pr-2 text-right">Listino</th></tr></thead>
            <tbody>{righe.map((r) => (
              <tr key={r.product_line + r.codice} className="border-t">
                {!pl && <td className="p-1.5">{r.prodotto}</td>}
                <td className="p-1.5 text-muted-foreground">{categorie[r.categoria] || r.categoria}</td>
                <td className="font-mono">{r.codice}</td>
                <td>{r.descrizione}{r.sostituito_da ? <span className="text-muted-foreground"> · sostituito da {r.sostituito_da}</span> : null}</td>
                <td className="text-right">{euro(r.stock)}</td><td className="text-right">{euro(r.sostituzione)}</td>
                <td className="text-right">{euro(r.prezzi?.costo)}</td><td className="text-right font-semibold">{euro(r.prezzi?.proposto)}</td>
                <td className="pr-2 text-right">{euro(r.prezzi?.listino)}</td>
              </tr>))}</tbody>
          </table>
          {righe.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nessun ricambio trovato.</p>}
        </Card>
      )}
    </div>
  );
}
