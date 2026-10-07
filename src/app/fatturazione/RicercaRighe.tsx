"use client";

// SOTTO-RICERCA NELLE RIGHE (07/10/2026) — «Cerca dentro le fatture»: dopo aver scelto un cliente col primo campo,
// si cerca un articolo nelle righe delle sue fatture per vedere che prezzo gli è stato fatto.
// L'evidenziazione è fatta con <mark> (niente HTML iniettato), senza badare a maiuscole e accenti.

import type { FattRigaTrovata, FattStoricoPrezzo } from "@/lib/api";
import { dataIt, eur } from "./util";

/** Un carattere senza accento e in minuscolo (resta UN carattere, così gli indici combaciano col testo originale). */
function base(c: string): string {
  const n = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return n.length === 1 ? n : c.toLowerCase().slice(0, 1) || c;
}

/** Parole della ricerca normalizzate (stessa logica del server). */
export function paroleRicerca(q: string): string[] {
  return Array.from(q).map(base).join("").replace(/['’`]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8);
}

/** Testo con le parole cercate evidenziate. */
export function Evidenzia({ testo, parole }: { testo: string; parole: string[] }) {
  const chars = Array.from(testo || "");
  const norm = chars.map(base).join("");
  const segnato = new Array<boolean>(chars.length).fill(false);
  for (const w of parole) {
    if (!w) continue;
    let i = norm.indexOf(w);
    while (i >= 0) {
      for (let k = i; k < i + w.length && k < segnato.length; k++) segnato[k] = true;
      i = norm.indexOf(w, i + w.length);
    }
  }
  const pezzi: { t: string; m: boolean }[] = [];
  chars.forEach((c, i) => {
    const ult = pezzi[pezzi.length - 1];
    if (ult && ult.m === segnato[i]) ult.t += c;
    else pezzi.push({ t: c, m: segnato[i] });
  });
  return (
    <>
      {pezzi.map((p, i) => p.m
        ? <mark key={i} className="rounded-sm bg-yellow-300/70 px-0.5 text-foreground dark:bg-yellow-500/40">{p.t}</mark>
        : <span key={i}>{p.t}</span>)}
    </>
  );
}

const iva = (r: { aliquota: number; natura?: string | null }) => (r.natura ? r.natura : `IVA ${r.aliquota}%`);

/** Le righe trovate di una fattura, sotto la riga della fattura. */
export function RigheTrovate({ righe, parole, nc }: { righe: FattRigaTrovata[]; parole: string[]; nc: boolean }) {
  return (
    <div className="space-y-1">
      {righe.map((r) => (
        <div key={r.indice} className="flex flex-col gap-0.5 rounded bg-muted/40 px-2 py-1 text-xs sm:flex-row sm:items-baseline sm:gap-3">
          <div className="min-w-0 flex-1 break-words">
            <Evidenzia testo={r.descrizione} parole={parole} />
            {r.codice && <span className="ml-1 text-muted-foreground">· cod. <Evidenzia testo={r.codice} parole={parole} /></span>}
            {r.seriale && <span className="ml-1 text-muted-foreground">· s/n <Evidenzia testo={r.seriale} parole={parole} /></span>}
            {r.note && <span className="ml-1 text-muted-foreground">· <Evidenzia testo={r.note} parole={parole} /></span>}
          </div>
          <div className="flex flex-wrap gap-x-3 whitespace-nowrap tabular-nums">
            <span>q.tà {r.quantita}</span>
            <span title="Prezzo unitario netto (imponibile)"><b>{nc ? "−" : ""}{r.prezzo_unitario != null ? eur(r.prezzo_unitario) : "—"}</b> netto</span>
            <span title="Prezzo unitario IVA inclusa">{nc ? "−" : ""}{r.prezzo_unitario_ivato != null ? eur(r.prezzo_unitario_ivato) : "—"} ivato</span>
            {r.sconto ? <span className="text-amber-700 dark:text-amber-300">sconto {r.sconto}%</span> : null}
            <span className="text-muted-foreground">{iva(r)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Storico prezzi compatto in cima ai risultati. */
export function StoricoPrezzi({ voci, parole, onApri, limitato }: {
  voci: FattStoricoPrezzo[]; parole: string[]; onApri: (id: string) => void; limitato?: string;
}) {
  if (!voci.length) return null;
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2 text-sm">
        <b>Storico prezzi · {voci.length} {voci.length === 1 ? "riga trovata" : "righe trovate"}</b>
        {limitato && <span className="text-xs text-muted-foreground">{limitato}</span>}
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-1.5 pl-3">Data</th><th className="p-1.5">N.</th><th className="p-1.5">Descrizione</th>
              <th className="p-1.5 text-right">Q.tà</th><th className="p-1.5 text-right">Netto</th>
              <th className="hidden p-1.5 text-right sm:table-cell">Ivato</th><th className="hidden p-1.5 sm:table-cell">Sconto</th>
            </tr>
          </thead>
          <tbody>
            {voci.map((v, i) => {
              const nc = v.tipo_documento === "TD04";
              return (
                <tr key={`${v.fattura_id}-${i}`} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => onApri(v.fattura_id)}>
                  <td className="whitespace-nowrap p-1.5 pl-3">{dataIt(v.data)}</td>
                  <td className="whitespace-nowrap p-1.5">{v.numero || "bozza"}{nc && <span className="ml-1 text-muted-foreground">NC</span>}</td>
                  <td className="p-1.5"><Evidenzia testo={v.descrizione} parole={parole} /></td>
                  <td className="p-1.5 text-right tabular-nums">{v.quantita}</td>
                  <td className="whitespace-nowrap p-1.5 text-right font-medium tabular-nums">{nc ? "−" : ""}{v.prezzo_unitario != null ? eur(v.prezzo_unitario) : "—"}</td>
                  <td className="hidden whitespace-nowrap p-1.5 text-right tabular-nums sm:table-cell">{nc ? "−" : ""}{v.prezzo_unitario_ivato != null ? eur(v.prezzo_unitario_ivato) : "—"}</td>
                  <td className="hidden p-1.5 sm:table-cell">{v.sconto ? `${v.sconto}%` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
