"use client";

// VOCI DI PREVENTIVO nella scheda (05/10/2026, specifica §10.2):
// · RICERCA libera (anno, pollici, chip, «M1», «batteria»…) e filtri rapidi per pollici / anno / modello;
// · se il modello della scheda non ha voci (es. MacBook Pro 16" M5 2025/2026) si propongono i MODELLI PIÙ VICINI
//   (stessa famiglia e pollici, anni più vicini) e lo si dice chiaramente;
// · le voci si propongono come COMBO «1ª + 2ª ipotesi abbinate» dello stesso intervento e modello (+ 3ª aggiungibile,
//   es. recupero backup): UN clic inserisce la combinazione intera nel preventivo.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { assProposte, eur, type Combo, type Proposte, type VoceProposta } from "@/lib/assistenza";
import { cn } from "@/lib/utils";
import { Pill, campo } from "./ui";

type Filtri = { q: string; modello: string; pollici: string; anno: string };
const VUOTI: Filtri = { q: "", modello: "", pollici: "", anno: "" };

const FONTE: Record<string, string> = {
  modello: "del modello della scheda", famiglia: "generiche della famiglia (il modello non ha voci dedicate)", tutte: "generiche",
  vicino: "del modello più vicino", ricerca: "trovate con la ricerca", modello_scelto: "del modello scelto", filtro: "dei modelli filtrati",
};

export function VociPreventivo({ idScheda, modelloScheda, chiave, accettato, bloccoAggiuntivo, onCombo, onVoce }: {
  idScheda: string; modelloScheda: string; chiave: string; accettato: boolean; bloccoAggiuntivo: boolean;
  onCombo: (c: Combo) => void; onVoce: (v: VoceProposta, come: "ipotesi" | "aggiungibile" | "fissa") => void;
}) {
  const [f, setF] = useState<Filtri>(VUOTI);
  const [qDigitata, setQDigitata] = useState("");
  const [intervento, setIntervento] = useState("");
  const [prop, setProp] = useState<Proposte | null>(null);
  const [caricata, setCaricata] = useState("");
  const [altre, setAltre] = useState(false);

  // la ricerca parte mezzo secondo dopo l'ultima lettera
  useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === qDigitata.trim() ? x : { ...x, q: qDigitata.trim() })), 400); return () => clearTimeout(t); }, [qDigitata]);
  const richiesta = JSON.stringify([idScheda, chiave, intervento, f]);
  const carico = caricata !== richiesta;
  useEffect(() => {
    let vivo = true;
    assProposte(idScheda, intervento, f).then((p) => { if (vivo) setProp(p); }).catch((e) => { if (vivo) toastErrore(e); })
      .finally(() => { if (vivo) setCaricata(richiesta); });
    return () => { vivo = false; };
  }, [idScheda, intervento, f, richiesta]);

  const filtrato = !!(f.q || f.modello || f.pollici || f.anno);
  const combo = useMemo(() => prop?.combo || [], [prop]);
  // le voci che non stanno già in una combo (voci senza ipotesi, o di interventi senza 1ª/2ª)
  const inCombo = useMemo(() => new Set(combo.flatMap((c) => [c.uno?.id, c.due?.id, c.tre?.id]).filter(Boolean) as string[]), [combo]);
  const sciolte = (prop?.voci || []).filter((v) => !inCombo.has(v.id));
  const mostraModello = prop && prop.fonte !== "modello";

  return (
    <div className="rounded-lg border bg-muted/30 p-3" data-testid="voci-preventivo">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <b>Voci di preventivo</b>
        {prop && <span className="text-xs text-muted-foreground">{FONTE[prop.fonte] || "nessuna voce"}{prop.fonte === "modello" && modelloScheda ? <> · <b>{modelloScheda}</b></> : null}</span>}
        {accettato && <Pill tono="ambra">vanno nel {bloccoAggiuntivo ? "preventivo aggiuntivo" : "preventivo"}</Pill>}
        {carico && <Loader2 className="size-4 animate-spin" />}
      </div>

      {/* ricerca e filtri rapidi */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input className={cn(campo, "pl-8")} placeholder="Cerca: «16», «2019», «M1», «batteria», «air 13 logica»…" value={qDigitata}
            onChange={(e) => setQDigitata(e.target.value)} aria-label="Cerca voci di preventivo" />
        </div>
        {!!prop?.filtri?.modelli?.length && (
          <select className={cn(campo, "w-auto max-w-[260px]")} value={f.modello} aria-label="Modello"
            onChange={(e) => setF((x) => ({ ...x, modello: e.target.value, q: "", pollici: "", anno: "" }))}>
            <option value="">Modello: quello della scheda</option>
            {prop.filtri.modelli.map((m) => <option key={m.chiave} value={m.chiave}>{m.nome} ({m.voci})</option>)}
          </select>
        )}
        {filtrato && <Button size="sm" variant="ghost" onClick={() => { setF(VUOTI); setQDigitata(""); }}><X />Togli filtri</Button>}
      </div>
      {(!!prop?.filtri?.pollici?.length || !!prop?.filtri?.anni?.length) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
          {!!prop?.filtri?.pollici?.length && <span className="text-muted-foreground">Pollici:</span>}
          {prop?.filtri?.pollici.map((p) => {
            const k = String(p);
            return <button key={k} type="button" onClick={() => setF((x) => ({ ...x, pollici: x.pollici === k ? "" : k, modello: "", q: "" }))}
              className={cn("rounded-full border px-2 py-0.5", f.pollici === k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>{k.replace(".", ",")}&quot;</button>;
          })}
          {!!prop?.filtri?.anni?.length && <span className="ml-2 text-muted-foreground">Anno:</span>}
          {prop?.filtri?.anni.slice(0, 16).map((a) => {
            const k = String(a);
            return <button key={k} type="button" onClick={() => setF((x) => ({ ...x, anno: x.anno === k ? "" : k, modello: "", q: "" }))}
              className={cn("rounded-full border px-2 py-0.5 tabular-nums", f.anno === k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>{k}</button>;
          })}
        </div>
      )}

      {/* modello senza voci: i modelli più vicini, detto chiaro */}
      {prop?.fonte === "vicino" && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          {prop.nota}
          {!!prop.vicini?.length && (
            <div className="mt-1 flex flex-wrap items-center gap-1">Altri modelli vicini:
              {prop.vicini.map((m) => <button key={m.chiave} type="button" className="rounded-full border border-amber-400 bg-background px-2 py-0.5 font-medium"
                onClick={() => setF({ ...VUOTI, modello: m.chiave })}>{m.nome} ({m.voci})</button>)}
            </div>
          )}
        </div>
      )}

      {/* interventi */}
      {!!prop?.interventi?.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setIntervento("")}
            className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", !intervento ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>Tutti</button>
          {prop.interventi.map((iv) => (
            <button key={iv.codice} type="button" onClick={() => setIntervento(intervento === iv.codice ? "" : iv.codice)}
              className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", intervento === iv.codice ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
              {iv.etichetta} <span className="opacity-60">{iv.voci}</span></button>
          ))}
        </div>
      )}

      {/* COMBO 1ª + 2ª (+ 3ª aggiungibile) */}
      {combo.length > 0 && (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {combo.slice(0, 40).map((c) => (
            <div key={`${c.modello_chiave}-${c.intervento}`} className="rounded-lg border bg-background p-2.5" data-testid="combo">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <b className="text-sm">{c.etichetta}</b>
                {mostraModello && c.modello && <span className="text-muted-foreground">· {c.modello}</span>}
                {[c.uno, c.due, c.tre].some((v) => v?.da_verificare) && <Pill tono="ambra" title="Prezzi dello storico che non collimano: verificare su GSX">da verificare</Pill>}
              </div>
              <div className="space-y-1 text-[13px]">
                {([["1ª", c.uno], ["2ª", c.due], ["3ª +", c.tre]] as const).map(([n, v]) => v && (
                  <div key={n} className="flex items-start gap-2">
                    <span className={cn("mt-0.5 w-9 shrink-0 rounded px-1 text-center text-[10px] font-semibold", n === "1ª" ? "bg-primary/10 text-primary" : n === "2ª" ? "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100" : "bg-muted text-muted-foreground")}>{n}</span>
                    <span className="min-w-0 flex-1 leading-snug">{v.descrizione}</span>
                    <b className="shrink-0 tabular-nums">{v.prezzo != null ? eur(v.prezzo) : "—"}</b>
                  </div>
                ))}
              </div>
              <Button size="sm" className="mt-2 w-full" onClick={() => onCombo(c)}>
                <Sparkles />Inserisci {c.uno && c.due ? "1ª + 2ª" : c.uno ? "1ª" : "2ª"}{c.tre ? " (+ 3ª aggiungibile)" : ""}</Button>
            </div>
          ))}
        </div>
      )}
      {prop && combo.length === 0 && !carico && (
        <div className="mt-3 text-xs text-muted-foreground">Nessuna combinazione 1ª + 2ª per questa scelta: usa le voci singole qui sotto, la ricerca o un altro modello.</div>
      )}

      {/* voci singole (anche senza ipotesi): si aggiungono come ipotesi alternativa, aggiungibile o voce fissa */}
      {sciolte.length > 0 && (
        <div className="mt-3">
          <button type="button" className="flex items-center gap-1 text-xs font-semibold text-muted-foreground" onClick={() => setAltre((x) => !x)}>
            {altre ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}Voci singole ({sciolte.length})</button>
          {altre && (
            <div className="mt-1 max-h-72 divide-y overflow-y-auto rounded-md border bg-background">
              {sciolte.slice(0, 200).map((v) => (
                <div key={v.id} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">{v.descrizione}{mostraModello && v.modello ? <span className="text-xs text-muted-foreground"> · {v.modello}</span> : null}</span>
                  {v.da_verificare && <Pill tono="ambra">da verificare</Pill>}
                  <b className="w-20 text-right tabular-nums">{v.prezzo != null ? eur(v.prezzo) : "—"}</b>
                  <span className="flex gap-1">
                    <Button size="xs" variant="outline" onClick={() => onVoce(v, "ipotesi")} title="Nuova ipotesi alternativa"><Plus />ipotesi</Button>
                    <Button size="xs" variant="outline" onClick={() => onVoce(v, "aggiungibile")} title="Ipotesi aggiungibile (si somma alla scelta)"><Plus />aggiungibile</Button>
                    <Button size="xs" variant="outline" onClick={() => onVoce(v, "fissa")} title="Voce fissa (si somma sempre)"><Plus />fissa</Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
