"use client";

// CRUSCOTTO OPERATIVO in alto nella pagina «Schede assistenza» (05/10/2026, specifica §10.6): contatori cliccabili per
// fase; cliccando, l'elenco mostra solo quelle schede. Le stesse fasi le usa la Panoramica Apple.
// 15/11/2026 (Christian): CRUSCOTTO COMPATTO a gruppi — Da gestire · Lavoro · Preventivi · Pronti · Oggi — ogni gruppo è
// una riga di chip (etichetta + numero) con il titolo piccolo a sinistra (prima i riquadri occupavano mezza pagina, ~650 px
// sul Mac). Le voci a zero stanno dietro «mostra tutte»; «Da ritirare» e «Da spedire» hanno in riga i sotto-filtri
// «da pagare» / «pagati» (al posto delle vecchie voci «Pronti da pagare» e «Pagati»). Tecnici e altri sotto-filtri si
// vedono sotto, quando la voce è scelta. Clic sulla voce già scelta = la toglie. I gruppi arrivano dal backend
// (V2.GRUPPI_CRUSCOTTO); senza, un gruppo unico con tutte le fasi.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { nomeTecnico, type CaricoTecnico, type FaseCruscotto, type GruppoCruscotto } from "@/lib/assistenza";

// fasi che chiedono un'azione: in evidenza quando non sono a zero
const DA_FARE = new Set(["da_assegnare_verifica", "da_preventivare", "da_verificare", "preventivi_da_inviare", "da_assegnare_riparazione",
  "aggiornamenti", "riparazione_finita", "rifiutati_da_rimontare", "rifiutati", "ricambi_arrivati", "trova_attivo", "da_spedire"]);
// già dentro i sotto-filtri di Da ritirare / Da spedire: non sono voci a sé
const DENTRO_I_SOTTO = new Set(["da_pagare", "pagati"]);
const SOTTO_IN_RIGA_DEFAULT: Record<string, string[]> = {
  da_ritirare: ["da_ritirare_da_pagare", "da_ritirare_pagati"], da_spedire: ["da_spedire_da_pagare", "da_spedire_pagati"] };
const CHIAVE_TUTTE = "gl_cruscotto_tutte";
// nomi brevi sui chip (il nome intero resta nel suggerimento e nella riga «Filtro:»), così «Lavoro» sta in una riga sul Mac
const BREVI: Record<string, string> = {
  in_arrivo: "In arrivo", ricambi_arrivati: "Ricambio arrivato", trova_attivo: "🔒 Trova il mio", rifiutati_da_rimontare: "Da richiudere", attesa_ricambi: "Attesa ricambi",
  rifiutati: "Rifiutati: invia pronto", presso_cliente: "Fuori negozio", attesa_cliente: "Attesa risposta cliente",
  riparazione_finita: "Finite: avvisa", aggiornamenti: "Aggiornamenti", bagnetti: "Bagnetti", conto_vendita: "Conto vendita",
  invii_programmati: "Invii programmati",
};

/** Gruppi da mostrare: quelli del backend o, se mancano, uno solo con tutte le fasi. */
export function gruppiCruscotto(fasi: FaseCruscotto[], gruppi?: GruppoCruscotto[] | null): GruppoCruscotto[] {
  if (gruppi?.length) return gruppi;
  return [{ codice: "tutte", titolo: "Schede", voci: fasi.map((f) => f.codice).filter((c) => !DENTRO_I_SOTTO.has(c)) }];
}

/** Nome leggibile di una fase scelta: «Pronti · Da spedire · pagati». */
export function nomeFase(codice: string, fasi: FaseCruscotto[] | null, gruppi?: GruppoCruscotto[] | null): string {
  const p = fasi?.find((f) => f.codice === codice || f.sotto?.some((x) => x.codice === codice));
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
  const [tutte, setTutte] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferenza del dispositivo letta dopo l'idratazione
    try { setTutte(localStorage.getItem(CHIAVE_TUTTE) === "1"); } catch { /* storage non disponibile */ }
  }, []);
  const cambiaTutte = (v: boolean) => { setTutte(v); try { localStorage.setItem(CHIAVE_TUTTE, v ? "1" : "0"); } catch { /* */ } };
  if (!fasi) return <div className="h-[74px] animate-pulse rounded-xl border bg-muted/40" />;
  // 29/10/2026 (Christian): «I miei lavori» — il tecnico clicca il suo nome e vede tutto quello che ha in carico
  const tecSel = scelta?.fase.startsWith("tec_") ? scelta.tecnico : "";
  const carico = carichi.find((c) => c.tecnico === tecSel);
  const per = new Map(fasi.map((f) => [f.codice, f]));
  const inRiga = sottoInRiga || SOTTO_IN_RIGA_DEFAULT;
  const gr = gruppiCruscotto(fasi, gruppi);
  // la voce scelta (anche tramite un suo sotto-filtro)
  const madre = !tecSel && scelta ? fasi.find((f) => f.codice === scelta.fase || f.sotto?.some((x) => x.codice === scelta.fase)) : undefined;
  const nZero = gr.reduce((t, g) => t + g.voci.filter((c) => !(per.get(c)?.n)).length, 0);
  const scegli = (codice: string) => onScegli(madre?.codice === codice && scelta?.fase === codice && !scelta?.tecnico ? null : { fase: codice, tecnico: "" });

  const chip = (f: FaseCruscotto, gruppo: string) => {
    const attiva = madre?.codice === f.codice;
    const sel = attiva && scelta?.fase === f.codice && !scelta?.tecnico;
    const urgente = (DA_FARE.has(f.codice) || gruppo === "da_gestire") && f.n > 0;
    const sotto = (inRiga[f.codice] || []).map((c) => f.sotto?.find((x) => x.codice === c)).filter((x): x is NonNullable<typeof x> => !!x);
    return (
      <span key={f.codice} className={cn("inline-flex shrink-0 items-stretch overflow-hidden rounded-full border text-xs",
        attiva ? "border-primary ring-2 ring-primary/40" : gruppo === "da_gestire" && f.n ? "border-red-400" : urgente ? "border-amber-300 dark:border-amber-700" : "",
        !f.n && !attiva && "opacity-60")}>
        <button type="button" data-fase={f.codice} aria-pressed={sel} onClick={() => scegli(f.codice)}
          title={sel ? `${f.etichetta} · clic di nuovo per togliere il filtro` : `Mostra solo: ${f.etichetta}`}
          className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 font-medium max-sm:min-h-9",
            sel ? "bg-primary text-primary-foreground"
              : gruppo === "da_gestire" && f.n ? "bg-red-600 text-white hover:bg-red-700"
                : urgente ? "bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30" : f.n ? "bg-card hover:bg-muted" : "bg-card text-muted-foreground")}>
          <span className="whitespace-nowrap">{BREVI[f.codice] || f.etichetta}</span><b className="tabular-nums">{f.n}</b>
        </button>
        {sotto.map((x) => {
          const xs = scelta?.fase === x.codice;
          return (
            <button key={x.codice} type="button" data-fase={x.codice} aria-pressed={xs}
              onClick={() => onScegli(xs ? null : { fase: x.codice, tecnico: "" })}
              title={x.codice.endsWith("pagati") ? "Pagati o a € 0 (garanzia): nulla da incassare" : "Da incassare prima della consegna"}
              className={cn("inline-flex items-center gap-1 border-l px-1.5 text-[11px] font-semibold max-sm:min-h-9",
                xs ? "bg-primary text-primary-foreground" : x.n ? "bg-background hover:bg-muted" : "bg-background text-muted-foreground")}>
              <span className="whitespace-nowrap">{x.etichetta}</span><span className="tabular-nums">{x.n}</span></button>
          );
        })}
      </span>
    );
  };

  // sotto la riga dei gruppi: tecnici e sotto-filtri della voce scelta (quelli non già in riga)
  const dettSotto = madre ? (madre.sotto || []).filter((x) => !(inRiga[madre.codice] || []).includes(x.codice)) : [];
  const dettTec = madre?.tecnici || [];
  const visibili = gr.map((g) => ({ g, voci: g.voci.map((c) => per.get(c)).filter((f): f is FaseCruscotto => !!f)
    .filter((f) => tutte || f.n > 0 || madre?.codice === f.codice) })).filter((x) => x.voci.length > 0);

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
    <div className="space-y-1 rounded-xl border bg-card px-2 py-1.5 shadow-sm" data-testid="cruscotto">
      {visibili.map(({ g, voci }, i) => (
        <div key={g.codice} data-gruppo={g.codice}
          className={cn("flex items-start gap-2", g.codice === "da_gestire" && "rounded-lg bg-red-50 px-1 py-0.5 dark:bg-red-950/30")}>
          <span className={cn("w-[4.5rem] shrink-0 pt-1 text-[10px] font-bold uppercase leading-tight tracking-wide sm:w-14",
            g.codice === "da_gestire" ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>{g.titolo}</span>
          {/* su iPhone la riga scorre in orizzontale dentro il riquadro (la pagina no) */}
          <div className="flex min-w-0 flex-1 gap-x-0.5 gap-y-1 overflow-x-auto pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {voci.map((f) => chip(f, g.codice))}
            {/* «mostra tutte» in coda all'ultima riga: nessuna riga in più */}
            {i === visibili.length - 1 && nZero > 0 && (
              <button type="button" className="shrink-0 self-center whitespace-nowrap px-1 text-[11px] text-muted-foreground underline max-sm:min-h-9" onClick={() => cambiaTutte(!tutte)}>
                {tutte ? "nascondi gli zeri" : `mostra tutte (+${nZero})`}</button>)}
          </div>
        </div>
      ))}
      {madre && (dettSotto.length > 0 || dettTec.length > 0) && (
        <div className="flex flex-wrap items-center gap-1 border-t pt-1 text-[11px]" data-testid="cruscotto-dettaglio">
          <span className="font-semibold">{madre.etichetta}:</span>
          {dettSotto.map((x) => {
            const sel = scelta?.fase === x.codice;
            return (
              <button key={x.codice} type="button" data-fase={x.codice} aria-pressed={sel}
                onClick={() => onScegli(sel ? { fase: madre.codice, tecnico: "" } : { fase: x.codice, tecnico: "" })}
                className={cn("rounded-full border px-2 py-0.5 font-medium max-sm:min-h-9", sel ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted", !x.n && !sel && "opacity-60")}>
                {x.etichetta} <span className="tabular-nums">{x.n}</span></button>
            );
          })}
          {dettTec.map((t) => {
            const sel = scelta?.tecnico === t.tecnico && scelta?.fase === madre.codice;
            return (
              <button key={t.tecnico || "-"} type="button" data-tecnico={t.tecnico}
                onClick={() => onScegli(sel ? { fase: madre.codice, tecnico: "" } : { fase: madre.codice, tecnico: t.tecnico })}
                className={cn("rounded-full border px-2 py-0.5 font-semibold max-sm:min-h-9", sel ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                👷 {nomeTecnico(t.tecnico, tecnici) || "?"} {t.n}</button>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
