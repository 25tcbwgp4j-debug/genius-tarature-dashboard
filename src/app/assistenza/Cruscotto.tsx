"use client";

// CRUSCOTTO OPERATIVO in alto nella pagina «Schede assistenza» (05/10/2026, specifica §10.6): contatori cliccabili per
// fase (ricevute oggi → verifica → preventivo → risposta → riparazione → pronti/pagati/ritiro/spedizione → completati),
// con il dettaglio per tecnico dove serve (in verifica, in riparazione). Cliccando, l'elenco mostra solo quelle schede.
// Compatto e leggibile su iPad. Le stesse fasi le usa la Panoramica Apple.
import { cn } from "@/lib/utils";
import { nomeTecnico, type FaseCruscotto } from "@/lib/assistenza";

// fasi che chiedono un'azione: in evidenza quando non sono a zero
const DA_FARE = new Set(["da_assegnare_verifica", "da_preventivare", "preventivi_da_inviare", "da_assegnare_riparazione", "aggiornamenti", "da_pagare", "da_spedire"]);

export function Cruscotto({ fasi, tecnici, scelta, onScegli }: {
  fasi: FaseCruscotto[] | null; tecnici: { codice: string; nome: string }[];
  scelta: { fase: string; tecnico: string } | null; onScegli: (s: { fase: string; tecnico: string } | null) => void;
}) {
  if (!fasi) return <div className="h-[74px] animate-pulse rounded-xl border bg-muted/40" />;
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible" data-testid="cruscotto">
      {fasi.map((f) => {
        const attiva = scelta?.fase === f.codice;
        const urgente = DA_FARE.has(f.codice) && f.n > 0;
        return (
          <div key={f.codice} role="button" tabIndex={0} data-fase={f.codice}
            onClick={() => onScegli(attiva && !scelta?.tecnico ? null : { fase: f.codice, tecnico: "" })}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onScegli(attiva && !scelta?.tecnico ? null : { fase: f.codice, tecnico: "" }); } }}
            className={cn("min-w-[112px] shrink-0 cursor-pointer select-none rounded-lg border px-2.5 py-1.5 text-left transition-colors sm:min-w-[118px] sm:flex-1 sm:basis-[118px] sm:max-w-[190px]",
              attiva ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : urgente ? "border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30"
                  : f.n ? "bg-card hover:bg-muted/60" : "bg-card text-muted-foreground opacity-70 hover:opacity-100")}>
            <div className="text-xl font-bold tabular-nums leading-tight">{f.n}</div>
            <div className="text-[11px] font-medium leading-tight">{f.etichetta}</div>
            {f.tecnici.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {f.tecnici.map((t) => {
                  const sel = attiva && scelta?.tecnico === t.tecnico;
                  return (
                    <button key={t.tecnico || "-"} type="button" data-tecnico={t.tecnico}
                      onClick={(e) => { e.stopPropagation(); onScegli(sel ? { fase: f.codice, tecnico: "" } : { fase: f.codice, tecnico: t.tecnico }); }}
                      className={cn("rounded-full border px-1.5 text-[10px] font-semibold leading-4",
                        sel ? "border-white bg-white text-primary" : attiva ? "border-white/60 text-primary-foreground" : "bg-background")}>
                      {nomeTecnico(t.tecnico, tecnici) || "?"} {t.n}</button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
