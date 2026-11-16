"use client";

// CRUSCOTTO OPERATIVO in alto nella pagina «Schede assistenza» (05/10/2026, specifica §10.6): contatori cliccabili per
// fase; cliccando, l'elenco mostra solo quelle schede. Le stesse fasi le usa la Panoramica Apple.
// 15/11/2026 (Christian): CRUSCOTTO COMPATTO a gruppi — Da gestire · Lavoro · Preventivi · Pronti · Oggi — ogni gruppo è
// una riga di chip (etichetta + numero) con il titolo piccolo a sinistra (prima i riquadri occupavano mezza pagina, ~650 px
// sul Mac). Le voci a zero stanno dietro «mostra tutte»; «Da ritirare» e «Da spedire» hanno in riga i sotto-filtri
// «da pagare» / «pagati» / «nulla da pagare» (al posto delle vecchie voci «Pronti da pagare» e «Pagati»; dal 15/11 sera
// le schede a € 0 in garanzia sono «nulla da pagare», non «pagati»). Tecnici e altri sotto-filtri si
// vedono sotto, quando la voce è scelta. Clic sulla voce già scelta = la toglie. I gruppi arrivano dal backend
// (V2.GRUPPI_CRUSCOTTO); senza, un gruppo unico con tutte le fasi.
import { cn } from "@/lib/utils";
import { faseMadre } from "@/lib/cruscotto-fase";
import { nomeTecnico, type CaricoTecnico, type FaseCruscotto, type GruppoCruscotto } from "@/lib/assistenza";

// fasi che chiedono un'azione: in evidenza quando non sono a zero
const DA_FARE = new Set(["da_assegnare_verifica", "da_preventivare", "da_verificare", "preventivi_da_inviare", "da_assegnare_riparazione",
  "aggiornamenti", "riparazione_finita", "rifiutati_da_rimontare", "rifiutati", "ricambi_arrivati", "trova_attivo", "da_spedire"]);
// già dentro i sotto-filtri di Da ritirare / Da spedire: non sono voci a sé
const DENTRO_I_SOTTO = new Set(["da_pagare", "pagati", "zero"]);
const SOTTO_IN_RIGA_DEFAULT: Record<string, string[]> = {
  da_ritirare: ["da_ritirare_da_pagare", "da_ritirare_pagati", "da_ritirare_zero"],
  da_spedire: ["da_spedire_da_pagare", "da_spedire_pagati", "da_spedire_zero"] };
// suggerimento dei sotto-filtri in riga
const TITOLO_SOTTO = (codice: string) => codice.endsWith("_zero") ? "Nulla da pagare: totale € 0 (garanzia, rifiutato senza spese)"
  : codice.endsWith("pagati") ? "Pagati davvero: incasso registrato (scontrino, fattura pagata, bonifico, acconti)" : "Da incassare prima della consegna";

/** Gruppi da mostrare: quelli del backend o, se mancano, uno solo con tutte le fasi. */
export function gruppiCruscotto(fasi: FaseCruscotto[], gruppi?: GruppoCruscotto[] | null): GruppoCruscotto[] {
  if (gruppi?.length) return gruppi;
  return [{ codice: "tutte", titolo: "Schede", voci: fasi.map((f) => f.codice).filter((c) => !DENTRO_I_SOTTO.has(c)) }];
}

/** Nome leggibile di una fase scelta: «Pronti · Da spedire · pagati». */
export function nomeFase(codice: string, fasi: FaseCruscotto[] | null, gruppi?: GruppoCruscotto[] | null): string {
  const p = faseMadre(fasi, codice);
  if (!p) return codice;
  const x = p.sotto?.find((y) => y.codice === codice);
  const g = gruppiCruscotto(fasi || [], gruppi).find((y) => y.voci.includes(p.codice));
  return [g && g.titolo !== p.etichetta && g.codice !== "tutte" ? g.titolo : "", p.etichetta, x?.etichetta || ""].filter(Boolean).join(" · ");
}

/** Le voci non a zero in ordine di gruppo (per la riga ridotta). */
export function vociInEvidenza(fasi: FaseCruscotto[] | null, gruppi?: GruppoCruscotto[] | null): FaseCruscotto[] {
  if (!fasi) return [];
  const per = new Map(fasi.map((f) => [f.codice, f]));
  return gruppiCruscotto(fasi, gruppi).flatMap((g) => g.voci.map((c) => per.get(c)).filter((f): f is FaseCruscotto => !!f && f.n > 0));
}

export function Cruscotto({ fasi, gruppi, sottoInRiga, tecnici, scelta, onScegli, carichi = [] }: {
  fasi: FaseCruscotto[] | null; gruppi?: GruppoCruscotto[] | null; sottoInRiga?: Record<string, string[]> | null;
  tecnici: { codice: string; nome: string }[]; carichi?: CaricoTecnico[];
  scelta: { fase: string; tecnico: string } | null; onScegli: (s: { fase: string; tecnico: string } | null) => void;
}) {
  if (!fasi) return <div className="h-[74px] animate-pulse rounded-xl border bg-muted/40" />;
  // 29/10/2026 (Christian): «I miei lavori» — il tecnico clicca il suo nome e vede tutto quello che ha in carico
  const tecSel = scelta?.fase.startsWith("tec_") ? scelta.tecnico : "";
  const carico = carichi.find((c) => c.tecnico === tecSel);
  const per = new Map(fasi.map((f) => [f.codice, f]));
  const inRiga = sottoInRiga || SOTTO_IN_RIGA_DEFAULT;
  const gr = gruppiCruscotto(fasi, gruppi);
  // la voce scelta (anche tramite un suo sotto-filtro)
  const madre = !tecSel && scelta ? faseMadre(fasi, scelta.fase) : undefined;
  const scegli = (codice: string) => onScegli(madre?.codice === codice && scelta?.fase === codice && !scelta?.tecnico ? null : { fase: codice, tecnico: "" });

  // 16/11/2026 (Christian: «il cruscotto era fondamentale ed è stato ridotto: ora devo fare mostra, poi mostra tutte le
  // righe… come era prima era decisamente meglio»): di nuovo i RIQUADRI di prima (numero grande, nome intero, sotto-filtri e
  // tecnici dentro il riquadro), divisi per gruppo, TUTTI visibili (le voci a zero restano, più chiare).
  const riquadro = (f: FaseCruscotto, gruppo: string) => {
    const attiva = madre?.codice === f.codice;
    const sel = attiva && scelta?.fase === f.codice && !scelta?.tecnico;
    const urgente = (DA_FARE.has(f.codice) || gruppo === "da_gestire") && f.n > 0;
    const ordineSotto = [...(inRiga[f.codice] || []), ...(f.sotto || []).map((x) => x.codice).filter((c) => !(inRiga[f.codice] || []).includes(c))];
    const sotto = ordineSotto.map((c) => f.sotto?.find((x) => x.codice === c)).filter((x): x is NonNullable<typeof x> => !!x);
    return (
      <div key={f.codice} role="button" tabIndex={0} data-fase={f.codice} aria-pressed={sel} title={sel ? `${f.etichetta} · clic di nuovo per togliere il filtro` : `Mostra solo: ${f.etichetta}`}
        onClick={() => scegli(f.codice)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); scegli(f.codice); } }}
        className={cn("min-w-[118px] shrink-0 cursor-pointer select-none rounded-lg border px-2 py-1 text-left transition-colors sm:min-w-[124px] sm:flex-1 sm:basis-[124px] sm:max-w-[220px]",
          sel ? "border-primary bg-primary text-primary-foreground shadow-sm"
            : attiva ? "border-primary ring-2 ring-primary/40 bg-card"
              : gruppo === "da_gestire" && f.n ? "border-red-400 bg-red-600 text-white hover:bg-red-700"
                : urgente ? "border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30"
                  : f.n ? "bg-card hover:bg-muted/60" : "bg-card text-muted-foreground opacity-60 hover:opacity-100")}>
        <div className="flex items-baseline gap-1.5"><span className="text-xl font-bold tabular-nums leading-tight">{f.n}</span><span className="text-[11.5px] font-medium leading-tight">{f.etichetta}</span></div>
        {sotto.length > 0 && (
          <div className="mt-1 flex flex-col gap-0.5">
            {sotto.map((x) => {
              const xs = scelta?.fase === x.codice;
              return (
                <button key={x.codice} type="button" data-fase={x.codice} aria-pressed={xs} title={TITOLO_SOTTO(x.codice)}
                  onClick={(e) => { e.stopPropagation(); onScegli(xs ? { fase: f.codice, tecnico: "" } : { fase: x.codice, tecnico: "" }); }}
                  className={cn("flex items-center justify-between gap-1 rounded border px-1.5 text-left text-[10.5px] font-semibold leading-4 max-sm:min-h-8",
                    xs ? "border-white bg-white text-primary" : sel ? "border-white/60 text-primary-foreground" : "bg-background text-foreground",
                    !x.n && !xs && "opacity-60")}>
                  <span className="truncate">{x.etichetta}</span><span className="tabular-nums">{x.n}</span></button>
              );
            })}
          </div>
        )}
        {(f.tecnici || []).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {f.tecnici.map((t) => {
              const ts = attiva && scelta?.tecnico === t.tecnico;
              return (
                <button key={t.tecnico || "-"} type="button" data-tecnico={t.tecnico}
                  onClick={(e) => { e.stopPropagation(); onScegli(ts ? { fase: f.codice, tecnico: "" } : { fase: f.codice, tecnico: t.tecnico }); }}
                  className={cn("rounded-full border px-1.5 text-[10.5px] font-semibold leading-4 max-sm:min-h-8",
                    ts ? "border-white bg-white text-primary" : sel ? "border-white/60 text-primary-foreground" : "bg-background text-foreground")}>
                  {nomeTecnico(t.tecnico, tecnici) || "?"} {t.n}</button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // 16/11/2026: sotto-filtri e tecnici stanno DENTRO il riquadro (come prima del 15/11): niente riga di dettaglio sotto
  const visibili = gr.map((g) => ({ g, voci: g.voci.map((c) => per.get(c)).filter((f): f is FaseCruscotto => !!f) }))
    .filter((x) => x.voci.length > 0);

  return (
    <div className="space-y-1.5">
    {carichi.length > 0 && (
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card px-2 py-1" data-testid="miei-lavori">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">👷 I miei lavori</span>
        {carichi.map((c) => {
          const sel = tecSel === c.tecnico;
          return (
            <button key={c.tecnico} type="button" data-tecnico={c.tecnico}
              onClick={() => onScegli(sel ? null : { fase: "tec_tutto", tecnico: c.tecnico })}
              className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold max-sm:min-h-9", sel ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
              {nomeTecnico(c.tecnico, tecnici) || c.tecnico} <span className="tabular-nums">{c.n}</span></button>
          );
        })}
        {carico && (
          <div className="flex w-full flex-wrap gap-1 pt-1">
            {carico.sotto.map((x) => {
              const sel = scelta?.fase === x.codice;
              return (
                <button key={x.codice} type="button" data-fase={x.codice}
                  onClick={() => onScegli({ fase: sel ? "tec_tutto" : x.codice, tecnico: carico.tecnico })}
                  className={cn("rounded border px-2 py-0.5 text-[11px] font-medium", sel ? "border-primary bg-primary text-primary-foreground" : "bg-background", !x.n && !sel && "opacity-50")}>
                  {x.etichetta} <span className="tabular-nums">{x.n}</span></button>
              );
            })}
          </div>
        )}
      </div>
    )}
    <div className="space-y-2 rounded-xl border bg-card p-2 shadow-sm" data-testid="cruscotto">
      {visibili.map(({ g, voci }) => (
        <div key={g.codice} data-gruppo={g.codice}
          className={cn("flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2", g.codice === "da_gestire" && "-mx-1 rounded-lg bg-red-50 px-1 py-1 dark:bg-red-950/30")}>
          <span className={cn("shrink-0 whitespace-nowrap text-[11px] font-bold uppercase leading-tight tracking-wide sm:w-[5.5rem] sm:pt-2",
            g.codice === "da_gestire" ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>{g.titolo}</span>
          {/* su iPhone la riga scorre in orizzontale dentro il riquadro (la pagina no) */}
          <div className="flex min-w-0 flex-1 items-start gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {voci.map((f) => riquadro(f, g.codice))}
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}
