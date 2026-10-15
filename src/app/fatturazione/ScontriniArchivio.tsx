"use client";

// Archivio scontrini (15/10/2026): «Vendita al banco» di Gingy importate dallo storico SimplyFatt.
// Sola lettura: sono documenti commerciali già trasmessi all'Agenzia, qui solo per consultazione e totali.

import { Fragment, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fattScontriniArchivio, type ScontrinoArchivio } from "@/lib/api";
import { dataIt, eur } from "./util";

export function ScontriniArchivio({ societa, anno }: { societa: string; anno: number }) {
  const [q, setQ] = useState("");
  const [dati, setDati] = useState<{ scontrini: ScontrinoArchivio[]; totale_righe: number; totale: number } | null>(null);
  const [aperto, setAperto] = useState<string | null>(null);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      fattScontriniArchivio(societa, anno, q.trim())
        .then((r) => { if (vivo) { setDati(r); setErrore(""); } })
        .catch((e: Error) => { if (vivo) setErrore(e.message); });
    }, q ? 300 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [societa, anno, q]);

  return (
    <Card className="overflow-x-auto p-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-3 text-sm">
        <span className="font-medium">Scontrini importati da SimplyFatt</span>
        <span className="text-xs text-muted-foreground">sola lettura · {anno ? `anno ${anno}` : "tutti gli anni"}</span>
        {dati && <span className="text-xs">{dati.totale_righe} scontrini · totale {eur(dati.totale)}</span>}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="Numero o cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {errore && <div className="p-4 text-sm text-red-600">{errore}</div>}
      {!dati && !errore && <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>}
      {dati && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Numero</th><th className="p-2">Data</th><th className="p-2">Cliente</th>
              <th className="p-2 text-right">Totale</th><th className="p-2">Pagamento</th><th className="p-2">Agenzia Entrate</th>
            </tr>
          </thead>
          <tbody>
            {dati.scontrini.map((s) => (
              <Fragment key={s.id}>
                <tr className="cursor-pointer border-b hover:bg-muted/50" onClick={() => setAperto(aperto === s.id ? null : s.id)}>
                  <td className="p-2 font-medium">{s.numero}</td>
                  <td className="p-2 whitespace-nowrap">{dataIt(s.data)}</td>
                  <td className="p-2">{s.cliente || <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2 text-right tabular-nums">{eur(s.totale)}</td>
                  <td className="p-2 text-xs">{s.pagamento_stato === "pagata" ? "pagato" : "da pagare"}
                    {s.pagamenti?.[0]?.method ? ` · ${s.pagamenti[0].method}` : ""}</td>
                  <td className="p-2 text-xs">{s.stato_ade || "—"}</td>
                </tr>
                {aperto === s.id && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={6} className="p-2 text-xs">
                      {(s.righe || []).map((r, i) => (
                        <div key={i} className="flex justify-between gap-2">
                          <span>{r.descrizione}</span>
                          <span className="tabular-nums">{Number(r.quantita || 1)} × {eur(r.prezzo_ivato ?? r.prezzo_unitario)} · IVA {Number(r.aliquota)}%</span>
                        </div>
                      ))}
                      {!s.righe?.length && <span className="text-muted-foreground">Righe non disponibili</span>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!dati.scontrini.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nessuno scontrino in archivio</td></tr>}
          </tbody>
        </table>
      )}
    </Card>
  );
}
