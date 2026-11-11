"use client";

// 11/11/2026 (Christian, 63181 → 63388): EX SCHEDE DI ASSISTENZA dello stesso dispositivo (stesso seriale o IMEI).
// Il dispositivo può tornare per lo stesso problema (garanzia 90 giorni) o per un altro lavoro: al banco servono subito
// numero (cliccabile), data, difetto, test in ingresso, lavorazione effettuata ed esito.

import type { ExScheda } from "@/lib/assistenza";

export function ExSchede({ ex }: { ex?: ExScheda[] | null }) {
  if (!ex || !ex.length) return null;
  const inGaranzia = ex.some((e) => e.garanzia?.attiva);
  return (
    <div className={`rounded-xl border-2 px-3 py-2 text-sm shadow-sm ${inGaranzia ? "border-red-400 bg-red-50 dark:bg-red-950/30" : "border-sky-300 bg-sky-50 dark:bg-sky-950/30"}`}>
      <div className="mb-1 font-semibold">
        🔁 Dispositivo già passato da noi: {ex.length === 1 ? "1 ex scheda" : `${ex.length} ex schede`} di assistenza
        {inGaranzia && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-xs text-white">ATTENZIONE: possibile GARANZIA</span>}
      </div>
      <ul className="space-y-1.5">
        {ex.map((e) => (
          <li key={e.id} className="rounded-md border bg-background/70 px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <a href={`/assistenza?id=${e.id}`} target="_blank" rel="noreferrer" className="font-bold text-blue-700 underline">EX SCHEDA {e.sigla}</a>
              <span className="text-muted-foreground">del {e.data}</span>
              {e.prodotto && <span className="text-muted-foreground">· {e.prodotto}</span>}
              <span className="text-xs text-muted-foreground">· {e.stato}{e.esito ? `, esito ${e.esito}` : ""}{e.consegnata_il ? `, riconsegnata il ${e.consegnata_il}` : ""}</span>
              {e.garanzia && (e.garanzia.attiva
                ? <span className="rounded bg-red-600 px-1.5 text-xs font-semibold text-white">in garanzia fino al {e.garanzia.fino_al}</span>
                : <span className="text-xs text-muted-foreground">garanzia scaduta il {e.garanzia.fino_al}</span>)}
            </div>
            {e.difetto && <div className="text-xs"><b>Difetto:</b> {e.difetto}</div>}
            {e.test_ingresso && <div className="text-xs"><b>Test in ingresso:</b> {e.test_ingresso}</div>}
            {e.lavorazione && <div className="text-xs"><b>Lavorazione effettuata:</b> {e.lavorazione}{e.totale ? ` (€ ${e.totale.toFixed(2)})` : ""}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
