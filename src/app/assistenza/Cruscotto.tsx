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

  // 16/11/2026 sera (Christian: «fa veramente pietà, non si capisce nulla»): ELENCO A COLONNE, una per gruppo (Lavoro ·
  // Preventivi · Pronti · Oggi). Ogni riga: nome a sinistra, numero allineato a destra; sotto-filtri rientrati sotto la
  // riga; tecnici in piccolo. In evidenza (ambra) solo le righe che chiedono un'azione; a zero in grigio. «Da gestire» è
  // una barra rossa in cima solo quando c'è qualcosa.
  const pulita = (s: string) => s.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "");
  const riga = (f: FaseCruscotto, gruppo: string) => {
    const attiva = madre?.codice === f.codice;
    const sel = attiva && scelta?.fase === f.codice && !scelta?.tecnico;
    const urgente = DA_FARE.has(f.codice) && f.n > 0;
    const ordineSotto = [...(inRiga[f.codice] || []), ...(f.sotto || []).map((x) => x.codice).filter((c) => !(inRiga[f.codice] || []).includes(c))];
    const sotto = ordineSotto.map((c) => f.sotto?.find((x) => x.codice === c))
      .filter((x): x is NonNullable<typeof x> => !!x && (x.n > 0 || scelta?.fase === x.codice));
    return (
      <div key={f.codice} className="break-inside-avoid pb-0.5" data-gruppo-voce={gruppo}>
        <button type="button" data-fase={f.codice} aria-pressed={sel} onClick={() => scegli(f.codice)}
          title={sel ? `${f.etichetta} · clic di nuovo per togliere il filtro` : `Mostra solo: ${f.etichetta}`}
          className={cn("flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1 text-left text-[13px] leading-tight transition-colors max-sm:min-h-10",
            sel ? "bg-primary text-primary-foreground"
              : attiva ? "bg-primary/10 ring-1 ring-primary"
                : urgente ? "bg-amber-100 font-semibold text-amber-950 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-50"
                  : f.n ? "font-medium hover:bg-muted" : "text-muted-foreground/70 hover:bg-muted")}>
          <span className="min-w-0">{pulita(f.etichetta)}</span>
          <span className={cn("shrink-0 tabular-nums", f.n ? "text-base font-bold" : "text-sm")}>{f.n}</span>
        </button>
        {sotto.map((x) => {
          const xs = scelta?.fase === x.codice;
          return (
            <button key={x.codice} type="button" data-fase={x.codice} aria-pressed={xs} title={TITOLO_SOTTO(x.codice)}
              onClick={() => onScegli(xs ? { fase: f.codice, tecnico: "" } : { fase: x.codice, tecnico: "" })}
              className={cn("flex w-full items-baseline justify-between gap-3 rounded-md py-0.5 pl-5 pr-2 text-left text-[12px] leading-tight max-sm:min-h-9",
                xs ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <span className="min-w-0">↳ {pulita(x.etichetta)}</span><span className="shrink-0 font-semibold tabular-nums">{x.n}</span></button>
          );
        })}
        {(f.tecnici || []).length > 0 && f.n > 0 && (
          <div className="flex flex-wrap gap-1 py-0.5 pl-5 pr-2">
            {f.tecnici.map((t) => {
              const ts = attiva && scelta?.tecnico === t.tecnico;
              return (
                <button key={t.tecnico || "-"} type="button" data-tecnico={t.tecnico}
                  onClick={() => onScegli(ts ? { fase: f.codice, tecnico: "" } : { fase: f.codice, tecnico: t.tecnico })}
                  className={cn("rounded-full border px-1.5 text-[11px] leading-4 max-sm:min-h-8", ts ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}>
                  {nomeTecnico(t.tecnico, tecnici) || "?"} {t.n}</button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const visibili = gr.map((g) => ({ g, voci: g.voci.map((c) => per.get(c)).filter((f): f is FaseCruscotto => !!f) }))
    .filter((x) => x.voci.length > 0);
  const daGestire = visibili.find((x) => x.g.codice === "da_gestire");
  const colonne = visibili.filter((x) => x.g.codice !== "da_gestire");
  const nGestire = daGestire ? daGestire.voci.reduce((a, f) => a + f.n, 0) : 0;

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
    <div className="rounded-xl border bg-card p-2 shadow-sm" data-testid="cruscotto">
      {nGestire > 0 && daGestire && (
        <div className="mb-2 flex flex-wrap gap-1.5" data-gruppo="da_gestire">
          {daGestire.voci.filter((f) => f.n > 0).map((f) => {
            const sel = madre?.codice === f.codice;
            return (
              <button key={f.codice} type="button" data-fase={f.codice} aria-pressed={sel} onClick={() => scegli(f.codice)}
                className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold text-white", sel ? "bg-red-900 ring-2 ring-red-400" : "bg-red-600 hover:bg-red-700")}>
                <span className="text-lg tabular-nums">{f.n}</span>{pulita(f.etichetta).toUpperCase()}</button>
            );
          })}
        </div>
      )}
      <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-[2.4fr_1.15fr_1.15fr_0.8fr]">
        {colonne.map(({ g, voci }) => {
          const lunga = voci.length > 8;
          return (
            <section key={g.codice} data-gruppo={g.codice} className={cn("min-w-0", lunga && "md:col-span-2 xl:col-span-1")}>
              <h3 className="mb-1 flex items-baseline justify-between border-b px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <span>{g.titolo}</span></h3>
              <div className={cn(lunga && "gap-x-3 sm:columns-2")}>
                {voci.map((f) => riga(f, g.codice))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
    </div>
  );
}
