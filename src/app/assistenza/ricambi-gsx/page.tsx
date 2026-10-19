"use client";

// RICAMBI GSX (18/10/2026) — backend gsx_ricambi_api.py, dati caricati con scripts/carica_gsx_ricambi.py.
// Costo d'acquisto Genius dei ricambi Mac letto dal GSX (IVA esclusa): «costo» = prezzo col reso del pezzo guasto,
// o il prezzo di stock se il pezzo non ha reso. In testa il prezzo ufficiale Apple della batteria (al cliente, IVA
// inclusa) e le franchigie AppleCare+. Solo titolare: sono costi d'acquisto.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchAPI } from "@/lib/api";
import { eur } from "@/lib/assistenza";

interface Modello {
  modello: string; nome_apple: string | null; seriale: string | null; batteria_apple: string | null;
  applecare: string | null; top_case_con_batteria: boolean; rilevato_il: string;
}
interface Ricambio {
  id: number; modello: string; categoria: string; codice: string; descrizione: string;
  costo: number | null; sostituzione: number | null; stock: number | null; sostituito_da: string | null;
}

export default function RicambiGsx() {
  const [modelli, setModelli] = useState<Modello[]>([]);
  const [categorie, setCategorie] = useState<string[]>([]);
  const [modello, setModello] = useState("");
  const [categoria, setCategoria] = useState("");
  const [q, setQ] = useState("");
  const [ricambi, setRicambi] = useState<Ricambio[]>([]);
  const [carico, setCarico] = useState(false);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    fetchAPI("/api/assistenza/ricambi-gsx/modelli")
      .then((r) => { setModelli(r.modelli); setCategorie(r.categorie); })
      .catch((e) => setErrore(String(e?.message || e)));
  }, []);

  const cerca = useCallback(async () => {
    if (!modello && !categoria && q.trim().length < 2) return;
    setCarico(true);
    try {
      const r = await fetchAPI(`/api/assistenza/ricambi-gsx?${new URLSearchParams({ modello, categoria, q: q.trim() })}`);
      setRicambi(r.ricambi); setErrore("");
    } catch (e) {
      setErrore(String((e as Error)?.message || e));
    } finally {
      setCarico(false);
    }
  }, [modello, categoria, q]);

  useEffect(() => {
    const t = setTimeout(cerca, 250);
    return () => clearTimeout(t);
  }, [cerca]);

  const m = modelli.find((x) => x.modello === modello);
  const nomi = useMemo(() => Object.fromEntries(modelli.map((x) => [x.modello, x.nome_apple || x.modello])), [modelli]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Wrench className="h-5 w-5" /> Ricambi Apple — prezzi GSX</h1>
        <p className="text-sm text-gray-500 mt-1">
          Costo d&apos;acquisto Genius dal GSX (Mac, MacBook Neo, iMac, iPad, iPhone 17), IVA esclusa (col reso del pezzo guasto; se il pezzo non ha reso, prezzo di stock).
          Rilevati il {modelli[0] ? new Date(modelli[0].rilevato_il).toLocaleDateString("it-IT") : "…"} · prezzo al cliente = ricarico deciso dal titolare.
        </p>
      </div>

      {errore && <Card className="p-3 text-sm text-red-600">{errore}</Card>}

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <select value={modello} onChange={(e) => setModello(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-900 max-w-full">
          <option value="">Tutti i modelli</option>
          {modelli.map((x) => <option key={x.modello} value={x.modello}>{x.nome_apple || x.modello}</option>)}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
          className="border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-900">
          <option value="">Tutte le categorie</option>
          {categorie.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca codice o descrizione (es. 661-50110, speaker)"
            className="w-full border rounded-md pl-8 pr-2 py-1.5 text-sm bg-white dark:bg-gray-900" />
        </div>
      </Card>

      {m && (
        <Card className="p-3 text-sm grid gap-1 sm:grid-cols-2">
          <div><span className="text-gray-500">Seriale letto:</span> {m.seriale || "—"}</div>
          <div><span className="text-gray-500">Batteria Apple ufficiale (cliente, IVA incl.):</span> {m.batteria_apple || "—"}</div>
          <div><span className="text-gray-500">AppleCare+ schermo / scocca / altri danni:</span> {m.applecare || "—"}</div>
          {m.top_case_con_batteria && <div className="text-amber-600">Il top case comprende la batteria</div>}
        </Card>
      )}

      {!modello && !categoria && q.trim().length < 2 ? (
        <p className="text-sm text-gray-500">Scegli un modello o una categoria (es. «Porta USB-C / I/O board» per vederla su tutti i modelli).</p>
      ) : carico ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr>
                {!modello && <th className="p-2">Modello</th>}
                <th className="p-2">Categoria</th><th className="p-2">Codice</th><th className="p-2">Descrizione</th>
                <th className="p-2 text-right">Costo</th><th className="p-2 text-right">Col reso</th><th className="p-2 text-right">Stock</th>
              </tr>
            </thead>
            <tbody>
              {ricambi.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  {!modello && <td className="p-2 whitespace-nowrap">{nomi[r.modello] || r.modello}</td>}
                  <td className="p-2 whitespace-nowrap">{r.categoria}</td>
                  <td className="p-2 font-mono text-xs whitespace-nowrap">{r.codice}{r.sostituito_da ? ` → ${r.sostituito_da}` : ""}</td>
                  <td className="p-2">{r.descrizione}</td>
                  <td className="p-2 text-right font-medium whitespace-nowrap">{eur(r.costo)}</td>
                  <td className="p-2 text-right text-gray-500 whitespace-nowrap">{r.sostituzione ? eur(r.sostituzione) : "—"}</td>
                  <td className="p-2 text-right text-gray-500 whitespace-nowrap">{eur(r.stock)}</td>
                </tr>
              ))}
              {!ricambi.length && <tr><td className="p-3 text-gray-500" colSpan={7}>Nessun ricambio</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
