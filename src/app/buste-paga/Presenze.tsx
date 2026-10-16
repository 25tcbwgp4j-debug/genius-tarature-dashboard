"use client";

// Foglio presenze del mese (una riga per giorno, precompilato dall'orario del contratto) + pannello «Calcolo busta».
// Il calcolo vero lo fa il backend (buste_paga.py, CCNL lavoro domestico): qui solo modifica, totali e azioni.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calculator, CheckCircle2, Download, Loader2, RotateCcw, Save, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  CAUSALI, bpAnnullaPagamento, bpCalcola, bpPresenze, bpRiportaInBozza, bpSalvaBusta, bpSalvaPresenze, bpSegnaPagata, bpUrlPdfBusta,
  type BpBustaRiga, type BpCalcolo, type BpLavoratore, type BpPresenza, type Causale,
} from "@/lib/buste-paga";
import { oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";
import { BadgeStato, MESI, dataIt, eur, num, numDa } from "./util";

// causali che di norma valgono le ore pattuite del giorno (cambiando causale si propongono quelle)
const CON_ORE: Causale[] = ["lavoro", "non_richiesto", "ferie", "malattia", "permesso_retribuito", "trasferta"];
const COLORE: Partial<Record<Causale, string>> = {
  ferie: "bg-sky-500/10", malattia: "bg-rose-500/10", festivita: "bg-violet-500/10", trasferta: "bg-teal-500/10",
  assenza_non_retribuita: "bg-zinc-500/15", permesso_retribuito: "bg-indigo-500/10", non_richiesto: "bg-amber-500/10",
};
type CampoOre = "ore_ordinarie" | "ore_extra_diurne" | "ore_extra_notturne" | "ore_extra_festive";
const CAMPI_ORE: [CampoOre, string][] = [
  ["ore_ordinarie", "Ore ord."], ["ore_extra_diurne", "Extra diurne"], ["ore_extra_notturne", "Extra nott."], ["ore_extra_festive", "Extra fest."],
];

export function Presenze({ lav, anno, mese }: { lav: BpLavoratore; anno: number; mese: number }) {
  const [righe, setRighe] = useState<BpPresenza[]>([]);
  const [bloccata, setBloccata] = useState(false);
  const [salvate, setSalvate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modificato, setModificato] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [calcolo, setCalcolo] = useState<BpCalcolo | null>(null);
  const [busta, setBusta] = useState<BpBustaRiga | null>(null);
  const [calcolando, setCalcolando] = useState(false);
  const [pagamento, setPagamento] = useState<{ data: string; rif: string } | null>(null);

  const calcola = useCallback(async () => {
    setCalcolando(true);
    try {
      const r = await bpCalcola(lav.id, anno, mese);
      setCalcolo(r.calcolo);
      setBusta(r.salvata);
    } catch (e) { toastErrore(e); } finally { setCalcolando(false); }
  }, [lav.id, anno, mese]);

  const carica = useCallback(async () => {
    try {
      const r = await bpPresenze(lav.id, anno, mese);
      setRighe(r.righe);
      setBloccata(r.bloccata);
      setSalvate(r.salvate);
      setModificato(false);
    } catch (e) { toastErrore(e); } finally { setLoading(false); }
    calcola();
  }, [lav.id, anno, mese, calcola]);
  useEffect(() => { carica(); }, [carica]);

  function cambia(i: number, campo: keyof BpPresenza, valore: string) {
    setRighe((rr) => rr.map((r, k) => {
      if (k !== i) return r;
      if (campo === "causale") {
        const c = valore as Causale | "";
        let ore = r.ore_ordinarie;
        if (c && CON_ORE.includes(c) && !ore) ore = r.ore_pattuite || 0;
        if (!c || c === "festivita" || c === "assenza_non_retribuita") ore = 0;
        return { ...r, causale: c, ore_ordinarie: ore };
      }
      if (campo === "note") return { ...r, note: valore };
      return { ...r, [campo]: numDa(valore) };
    }));
    setModificato(true);
  }

  async function salva(silenzioso = false) {
    setSalvando(true);
    try {
      const r = await bpSalvaPresenze(lav.id, anno, mese, righe.filter((x) => !x.fuori_rapporto));
      if (!silenzioso) toast.success(`Presenze salvate (${r.salvate} giorni)`);
      setModificato(false);
      setSalvate(r.salvate);
      return true;
    } catch (e) { toastErrore(e); return false; } finally { setSalvando(false); }
  }

  async function ricalcola() {
    if (modificato && !(await salva(true))) return;
    await calcola();
  }

  async function salvaBusta(conferma: boolean) {
    if (modificato && !(await salva(true))) return;
    if (conferma && !confirm(`Confermare la busta di ${MESI[mese - 1]} ${anno}? Le presenze del mese saranno bloccate.`)) return;
    try {
      const b = await bpSalvaBusta(lav.id, anno, mese, conferma);
      toast.success(conferma ? "Busta confermata" : "Bozza salvata");
      setBusta(b);
      carica();
    } catch (e) { toastErrore(e); }
  }

  async function azione(fn: () => Promise<BpBustaRiga>, msg: string) {
    try { setBusta(await fn()); toast.success(msg); carica(); } catch (e) { toastErrore(e); }
  }

  const totali = useMemo(() => {
    const t = { ore_ordinarie: 0, ore_extra_diurne: 0, ore_extra_notturne: 0, ore_extra_festive: 0 };
    const giorni: Record<string, number> = {};
    for (const r of righe) {
      if (r.fuori_rapporto) continue;
      for (const [k] of CAMPI_ORE) t[k] += Number(r[k] || 0);
      if (r.causale) giorni[r.causale] = (giorni[r.causale] || 0) + 1;
    }
    return { ...t, giorni };
  }, [righe]);

  const stato = busta?.stato || calcolo?.stato;
  const chiusa = bloccata || stato === "confermata" || stato === "pagata";
  const inp = "h-7 w-16 rounded border border-input bg-background px-1 text-right text-sm tabular-nums disabled:opacity-50";

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="gap-0 overflow-x-auto p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <span className="font-medium">Foglio presenze — {MESI[mese - 1]} {anno}</span>
          <span className="text-xs text-muted-foreground">
            {salvate ? `${salvate} giorni salvati` : "precompilato dall'orario del contratto (non ancora salvato)"}
          </span>
          {chiusa && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-xs text-blue-700 dark:text-blue-300">bloccato: busta confermata</span>}
          <div className="ml-auto flex gap-2">
            {modificato && <Button size="sm" variant="ghost" onClick={() => { setLoading(true); carica(); }}><RotateCcw /> Annulla modifiche</Button>}
            <Button size="sm" onClick={() => salva()} disabled={chiusa || salvando || !modificato && salvate > 0}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salva presenze
            </Button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Data</th><th className="p-2">Giorno</th><th className="p-2">Causale</th>
              {CAMPI_ORE.map(([k, l]) => <th key={k} className="p-2 text-right">{l}</th>)}
              <th className="p-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r, i) => {
              const fuori = !!r.fuori_rapporto;
              const dis = fuori || chiusa;
              return (
                <tr key={r.data} className={`border-b last:border-0 ${fuori ? "opacity-40" : COLORE[r.causale as Causale] || ""}`}>
                  <td className="whitespace-nowrap p-2 tabular-nums">{dataIt(r.data).slice(0, 5)}</td>
                  <td className={`p-2 ${r.giorno === "Domenica" ? "text-red-600 dark:text-red-400" : ""}`}>
                    {r.giorno}
                    {r.festivita && <div className="text-[10px] font-medium text-violet-700 dark:text-violet-300">{r.festivita}</div>}
                  </td>
                  <td className="p-2">
                    <select className="h-7 rounded border border-input bg-background px-1 text-sm disabled:opacity-50" disabled={dis}
                      value={r.causale} onChange={(e) => cambia(i, "causale", e.target.value)}>
                      <option value="">{fuori ? "fuori rapporto" : "— riposo —"}</option>
                      {CAUSALI.map((c) => <option key={c.codice} value={c.codice}>{c.label}</option>)}
                    </select>
                  </td>
                  {CAMPI_ORE.map(([k]) => (
                    <td key={k} className="p-2 text-right">
                      <input className={inp} inputMode="decimal" disabled={dis} aria-label={k}
                        value={r[k] ? String(r[k]).replace(".", ",") : ""} placeholder="0"
                        onChange={(e) => cambia(i, k, e.target.value)} />
                    </td>
                  ))}
                  <td className="p-2">
                    <input className="h-7 w-full min-w-28 rounded border border-input bg-background px-1 text-sm disabled:opacity-50" disabled={dis}
                      value={r.note || ""} onChange={(e) => cambia(i, "note", e.target.value)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-medium">
              <td className="p-2" colSpan={3}>
                Totali
                <div className="text-xs font-normal text-muted-foreground">
                  {Object.entries(totali.giorni).map(([c, n]) => `${CAUSALI.find((x) => x.codice === c)?.label || c}: ${n} gg`).join(" · ") || "—"}
                </div>
              </td>
              {CAMPI_ORE.map(([k]) => <td key={k} className="p-2 text-right tabular-nums">{num(totali[k])}</td>)}
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <Card className="h-fit gap-3 p-4 xl:sticky xl:top-4">
        <div className="flex items-center gap-2">
          <Calculator className="size-5" />
          <span className="font-semibold">Calcolo busta</span>
          <BadgeStato stato={stato || "anteprima"} />
          <Button size="sm" variant="outline" className="ml-auto" onClick={ricalcola} disabled={calcolando}>
            {calcolando ? <Loader2 className="animate-spin" /> : <Calculator />} Calcola
          </Button>
        </div>
        {modificato && <div className="text-xs text-amber-700 dark:text-amber-300">Presenze modificate: «Calcola» le salva e ricalcola.</div>}
        {!calcolo ? <div className="py-6 text-center text-muted-foreground">Nessun calcolo</div> : !calcolo.periodo ? (
          <div className="py-6 text-center text-muted-foreground">Nel mese il rapporto di lavoro non è attivo</div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              Periodo {dataIt(calcolo.periodo.dal)} – {dataIt(calcolo.periodo.al)}
              {calcolo.cessazione && <span className="ml-1 font-medium text-orange-700 dark:text-orange-300">· fine rapporto</span>}
              {" · "}{calcolo.mese_utile ? "mese utile ai ratei" : "mese non utile ai ratei (≤ 15 giorni)"}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {calcolo.voci.map((v) => (
                  <tr key={v.codice} className="border-b align-top last:border-0">
                    <td className="py-1 pr-2">
                      {v.descrizione}
                      {v.unita && <div className="text-xs text-muted-foreground">{num(v.quantita)} {v.unita} × {eur(v.unitario)}</div>}
                    </td>
                    <td className="py-1 text-right tabular-nums">{eur(v.importo)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 font-medium"><td className="py-1">Totale lordo</td><td className="py-1 text-right tabular-nums">{eur(calcolo.lordo)}</td></tr>
                <tr><td className="py-1">Contributi INPS lavoratore <span className="text-xs text-muted-foreground">({num(calcolo.ore_retribuite)} h × {eur(calcolo.contributi.quota_lavoratore_oraria)})</span></td>
                  <td className="py-1 text-right tabular-nums">− {eur(calcolo.trattenuta_inps)}</td></tr>
                <tr><td className="py-1 text-muted-foreground">IRPEF (datore domestico non sostituto d&apos;imposta)</td><td className="py-1 text-right tabular-nums text-muted-foreground">{eur(0)}</td></tr>
                <tr className="text-base font-semibold"><td className="py-1">NETTO</td><td className="py-1 text-right tabular-nums">{eur(calcolo.netto)}</td></tr>
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border p-2"><div className="font-medium">13ª mensilità</div>
                rateo {eur(calcolo.ratei.tredicesima.rateo_mese)}<br />maturata {eur(calcolo.ratei.tredicesima.maturata_anno)}<br />erogata {eur(calcolo.ratei.tredicesima.erogata_anno)}</div>
              <div className="rounded border p-2"><div className="font-medium">Ferie (giorni)</div>
                +{num(calcolo.ratei.ferie.maturate_mese)} / −{num(calcolo.ratei.ferie.godute_mese)}<br />residue <b>{num(calcolo.ratei.ferie.residue)}</b></div>
              <div className="rounded border p-2"><div className="font-medium">Permessi (ore)</div>
                +{num(calcolo.ratei.permessi.maturati_mese)} / −{num(calcolo.ratei.permessi.goduti_mese)}<br />residui <b>{num(calcolo.ratei.permessi.residui)}</b></div>
              <div className="rounded border p-2"><div className="font-medium">TFR</div>
                quota {eur(calcolo.ratei.tfr.quota_mese)}<br />maturato <b>{eur(calcolo.ratei.tfr.progressivo)}</b>
                {calcolo.ratei.tfr.liquidato > 0 && <><br />liquidato {eur(calcolo.ratei.tfr.liquidato)}</>}</div>
            </div>
            <div className="rounded bg-muted/50 p-2 text-xs">
              <div className="font-medium">Costo per il datore</div>
              Contributi INPS totali {eur(calcolo.contributi.totale)} (datore {eur(calcolo.contributi.a_carico_datore)})
              {calcolo.contributi.addizionale_td > 0 && <> · addizionale tempo determinato {num(calcolo.contributi.addizionale_td_percent)}% {eur(calcolo.contributi.addizionale_td)}</>}
              <br />Costo complessivo del mese <b>{eur(calcolo.costo_datore)}</b>
            </div>
            {calcolo.avvisi.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
                {calcolo.avvisi.map((a) => <li key={a} className="flex gap-1"><TriangleAlert className="mt-0.5 size-3 shrink-0" />{a}</li>)}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 border-t pt-3">
              {!chiusa && <Button size="sm" variant="outline" onClick={() => salvaBusta(false)}><Save /> Salva bozza</Button>}
              {!chiusa && <Button size="sm" onClick={() => salvaBusta(true)}><CheckCircle2 /> Conferma busta</Button>}
              <a href={bpUrlPdfBusta(lav.id, anno, mese)} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline"><Download /> Scarica PDF</Button>
              </a>
              {stato === "confermata" && busta && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setPagamento({ data: oggiRoma(), rif: "" })}><Wallet /> Segna come pagata</Button>
                  <Button size="sm" variant="ghost" onClick={() => azione(() => bpRiportaInBozza(busta.id), "Busta riportata in bozza")}>Riporta in bozza</Button>
                </>
              )}
              {stato === "pagata" && busta && (
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Annullare la registrazione del pagamento?")) azione(() => bpAnnullaPagamento(busta.id), "Pagamento annullato"); }}>
                  Annulla pagamento
                </Button>
              )}
            </div>
            {stato === "pagata" && busta && (
              <div className="text-xs text-emerald-700 dark:text-emerald-300">
                Pagata il {dataIt(busta.data_pagamento)}{busta.riferimento_bonifico ? ` · rif. ${busta.riferimento_bonifico}` : ""}
                {lav.iban ? ` · IBAN ${lav.iban}` : ""}
              </div>
            )}
            {pagamento && busta && (
              <div className="flex flex-wrap items-end gap-2 rounded border p-2">
                <label className="text-xs">Data bonifico
                  <input type="date" className="mt-0.5 block h-8 rounded-md border border-input bg-background px-2 text-sm"
                    value={pagamento.data} onChange={(e) => setPagamento({ ...pagamento, data: e.target.value })} />
                </label>
                <label className="flex-1 text-xs">Riferimento bonifico (CRO/TRN)
                  <Input className="mt-0.5" value={pagamento.rif} onChange={(e) => setPagamento({ ...pagamento, rif: e.target.value })} />
                </label>
                <Button size="sm" onClick={() => { const p = pagamento; setPagamento(null); azione(() => bpSegnaPagata(busta.id, p.data, p.rif), "Busta segnata come pagata"); }}>Registra</Button>
                <Button size="sm" variant="ghost" onClick={() => setPagamento(null)}>Annulla</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
