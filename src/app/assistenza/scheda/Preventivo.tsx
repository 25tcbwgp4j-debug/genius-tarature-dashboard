"use client";

// PREVENTIVO della scheda (05/10/2026, specifica §4 e §8.7-8.8):
// · scelto l'intervento, si propongono le VOCI DEL MODELLO della scheda (assistenza_voci, ripiego sulla famiglia) con i
//   prezzi: 1ª ipotesi = assistenza, 2ª = assistenza ufficiale, 3ª eventuale AGGIUNGIBILE (es. recupero backup);
// · prezzi SEMPRE IVA COMPRESA («+IVA» solo come opzione esplicita della riga), dicitura «probabile recupero dati»;
// · spedizione a flag (A/R · solo ritiro · solo ritorno, 28 € modificabile), testi standard che si AGGIUNGONO;
// · preventivo AGGIUNTIVO dopo l'accettazione (nuovo blocco con le sue ipotesi);
// · pulsante chiaro «INVIA PREVENTIVO» → mail + WhatsApp.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BookText, Copy, Loader2, Plus, Search, Send, Sparkles, Trash2, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import {
  assPreventivi, assProposte, assTesti, dataOra, eur, SPEDIZIONI, type Proposte, type Scheda, type SchedaBreve, type TestoStandard, type VoceProposta,
} from "@/lib/assistenza";
import {
  blocchi, blocco, ipotesiDelBlocco, NOTE_RECUPERO, nuovoOpt, parseEstimate, rowTotal, scegliIpotesi, totaleConSpedizione, type EstimateLine,
} from "@/lib/assistenza-preventivo";
import { Campo, Pill, Scelta, Sezione, area, campo } from "./ui";

const IPOTESI_NOME: Record<string, string> = { "1": "1ª ipotesi · assistenza", "2": "2ª ipotesi · assistenza ufficiale", "3": "3ª ipotesi · aggiungibile / alternativa", aggiuntiva: "Aggiuntiva", "": "Altre voci" };

export type BozzaPreventivo = { righe: EstimateLine[]; diagnosi: string; note: string; spedizione_tipo: string; spedizione_importo: number | string };

export function Preventivo({ s, bz, setBz, ro, onInvia, onNotaInterna, onStessoModello, spedDefault }: {
  s: Scheda; bz: BozzaPreventivo; setBz: (f: (b: BozzaPreventivo) => BozzaPreventivo) => void; ro: boolean;
  onInvia: () => void; onNotaInterna: (t: string) => void; onStessoModello: () => void; spedDefault: number;
}) {
  const righe = bz.righe;
  const setRighe = (f: (r: EstimateLine[]) => EstimateLine[]) => setBz((b) => ({ ...b, righe: f(b.righe) }));
  const accettato = s.preventivo_stato === "accettato" || s.preventivo_esito === "accettato";
  const inviato = s.preventivo_stato === "inviato";
  const bb = blocchi(righe);
  const [bloccoAttivo, setBloccoAttivo] = useState<number>(Math.max(...bb));
  const [prop, setProp] = useState<Proposte | null>(null);
  const [intervento, setIntervento] = useState("");
  const [interventi, setInterventi] = useState<Proposte["interventi"]>([]);
  const [carico, setCarico] = useState(false);
  const [testi, setTesti] = useState<TestoStandard[] | null>(null);
  const [cerca, setCerca] = useState("");
  const [trovati, setTrovati] = useState<{ preventivi: (SchedaBreve & { preventivo_testo: string | null })[]; sintesi: { n: number; min: number; max: number; mediana: number } | null } | null>(null);

  useEffect(() => {
    if (ro) return;
    assProposte(s.id, "").then((p) => { setProp(p); setInterventi(p.interventi); }).catch(() => setProp(null));
  }, [s.id, s.modello, s.famiglia, ro]);
  async function sceglieIntervento(iv: string) {
    setIntervento(iv);
    setCarico(true);
    try { setProp(await assProposte(s.id, iv)); } catch (e) { toastErrore(e); } finally { setCarico(false); }
  }

  const spedImp = bz.spedizione_tipo && bz.spedizione_tipo !== "nessuna" ? Number(String(bz.spedizione_importo).replace(",", ".")) || 0 : 0;
  const tot = totaleConSpedizione(righe, spedImp);

  // ---- operazioni sulle righe
  const upd = (i: number, k: keyof EstimateLine, val: unknown) => setRighe((r) => r.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  const togli = (i: number) => setRighe((r) => r.filter((_, j) => j !== i));
  function aggiungiVoce(v: Pick<VoceProposta, "descrizione" | "prezzo" | "scontato_da" | "id">, come: "1" | "2" | "3" | "fissa", b = bloccoAttivo) {
    setRighe((r) => {
      const riga: EstimateLine = { t: v.descrizione, p: v.prezzo ?? "", listino: v.scontato_da || null, nota: null, b, voce_id: v.id || undefined, opt: null, on: false };
      if (come === "fissa") return [...r, riga];
      const ips = ipotesiDelBlocco(r, b);
      const alt = ips.filter((x) => !x.agg);
      if (come === "3") return [...r, { ...riga, opt: nuovoOpt(r, b), agg: true, on: false }];
      // 1ª / 2ª: se l'ipotesi n-esima c'è già si sostituisce la sua voce, altrimenti si aggiunge
      const n = come === "1" ? 0 : 1;
      const es = alt[n];
      if (es) return r.map((x, j) => (j === es.righe[0].i ? { ...riga, opt: es.opt, on: x.on, agg: false } : x)).filter((x, j) => !es.righe.slice(1).some((y) => y.i === j));
      const opt = nuovoOpt(r, b);
      return [...r, { ...riga, opt, on: alt.length === 0, agg: false }];
    });
  }
  function proponi() {
    if (!prop) return;
    const voci = prop.voci.filter((v) => !intervento || v.intervento === intervento);
    const p1 = voci.find((v) => v.ipotesi === "1"), p2 = voci.find((v) => v.ipotesi === "2"), p3 = voci.find((v) => v.ipotesi === "3");
    if (!p1 && !p2) { toast.info("Per questo intervento non ci sono voci di 1ª/2ª ipotesi: aggiungile dall'elenco"); return; }
    if (p1) aggiungiVoce(p1, "1");
    if (p2) aggiungiVoce(p2, "2");
    if (p3) aggiungiVoce(p3, "3");
    toast.success("Ipotesi proposte dalle voci del modello: controlla i prezzi");
  }
  function nuovoBlocco() {
    const b = Math.max(...bb) + 1;
    setBloccoAttivo(b);
    setRighe((r) => [...r, { t: "", p: "", opt: 0, on: true, b }]);
  }
  function aggiungiTesto(t: TestoStandard) {
    if (t.uso === "interno") { onNotaInterna(t.testo); toast.success(`«${t.titolo}» aggiunto alla nota interna`); return; }
    setBz((b) => ({ ...b, note: (b.note ? b.note.trimEnd() + "\n" : "") + t.testo }));
    toast.success(`«${t.titolo}» aggiunto alle note del preventivo${t.prezzi_da_verificare ? " (verifica i prezzi)" : ""}`);
  }
  async function apriTesti() {
    if (testi) { setTesti(null); return; }
    try { setTesti((await assTesti(s.famiglia || "", intervento)).testi); } catch (e) { toastErrore(e); }
  }
  async function cercaPrev() {
    if (cerca.trim().length < 2) return;
    try { setTrovati(await assPreventivi(cerca)); } catch (e) { toastErrore(e); }
  }

  const gruppi = useMemo(() => {
    const g: Record<string, VoceProposta[]> = {};
    for (const v of prop?.voci || []) if (!intervento || v.intervento === intervento) (g[v.ipotesi || ""] ||= []).push(v);
    return Object.entries(g).sort(([a], [b]) => (a || "9").localeCompare(b || "9"));
  }, [prop, intervento]);

  const statoPrev = accettato ? <Pill tono="verde">accettato</Pill> : s.preventivo_stato === "rifiutato" ? <Pill tono="rosso">rifiutato</Pill>
    : inviato ? <Pill tono="blu">inviato {dataOra(s.preventivo_inviato_il)}{s.preventivo_inviato_da ? ` · ${s.preventivo_inviato_da}` : ""}</Pill>
      : righe.length ? <Pill tono="ambra">da inviare</Pill> : <Pill>da fare</Pill>;

  return (
    <Sezione titolo="Preventivo" icona={<Sparkles />} sottotitolo={statoPrev}
      azioni={<span className="text-sm">Totale proposto <b className="text-base">{eur(tot)}</b> <span className="text-xs text-muted-foreground">IVA compresa</span></span>}>
      <div className="space-y-4">
        <Campo label="Test in ingresso (diagnosi)">
          <input className={campo} disabled={ro} placeholder="es. SCHEDA LOGICA IN CORTO" value={bz.diagnosi} onChange={(e) => setBz((b) => ({ ...b, diagnosi: e.target.value }))} />
        </Campo>

        {!ro && prop && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <b>Voci di preventivo</b>
              <span className="text-xs text-muted-foreground">{prop.fonte === "modello" ? <>del modello <b>{s.modello}</b></> : prop.fonte === "famiglia" ? "della famiglia (per questo modello non ci sono voci dedicate)" : prop.fonte === "tutte" ? "generiche" : "nessuna voce: scrivi il modello o scegli il prodotto"}</span>
              {accettato && <Pill tono="ambra">vanno nel {bloccoAttivo > 0 ? "preventivo aggiuntivo" : "preventivo"}</Pill>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {interventi.map((iv) => (
                <button key={iv.codice} type="button" onClick={() => sceglieIntervento(intervento === iv.codice ? "" : iv.codice)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${intervento === iv.codice ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                  {iv.etichetta} <span className="opacity-60">{iv.voci}</span></button>
              ))}
              {carico && <Loader2 className="size-4 animate-spin" />}
            </div>
            {intervento && (
              <div className="mt-3 space-y-2">
                <Button size="sm" onClick={proponi}><Sparkles />Proponi 1ª + 2ª ipotesi</Button>
                {gruppi.map(([ip, voci]) => (
                  <div key={ip}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{IPOTESI_NOME[ip] || ip}</div>
                    <div className="divide-y rounded-md border bg-background">
                      {voci.map((v) => (
                        <div key={v.id} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-sm">
                          <span className="min-w-0 flex-1">{v.descrizione}{v.modello && prop.fonte !== "modello" ? <span className="text-xs text-muted-foreground"> · {v.modello}</span> : null}</span>
                          {v.da_verificare && <Pill tono="ambra" title="Prezzi dello storico che non collimano: verificare su GSX">da verificare</Pill>}
                          <b className="w-20 text-right tabular-nums">{v.prezzo != null ? eur(v.prezzo) : "—"}</b>
                          <span className="flex gap-1">
                            {(["1", "2", "3", "fissa"] as const).map((c) => (
                              <Button key={c} size="xs" variant="outline" onClick={() => aggiungiVoce(v, c)} title={c === "3" ? "3ª ipotesi aggiungibile (si somma alla scelta)" : c === "fissa" ? "voce fissa (si somma sempre)" : `come ${c}ª ipotesi`}>
                                {c === "fissa" ? "fissa" : c === "3" ? "3ª +" : `${c}ª`}</Button>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {bb.map((b) => (
          <Blocco key={b} b={b} righe={righe} ro={ro} attivo={b === bloccoAttivo} onAttiva={() => setBloccoAttivo(b)}
            upd={upd} togli={togli} setRighe={setRighe} />
        ))}
        {!ro && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setRighe((r) => [...r, { t: "", p: "", opt: nuovoOpt(r, bloccoAttivo), on: ipotesiDelBlocco(r, bloccoAttivo).filter((x) => !x.agg).length === 0, b: bloccoAttivo }])}><Plus />Ipotesi</Button>
            <Button size="sm" variant="outline" onClick={() => setRighe((r) => [...r, { t: "", p: "", opt: nuovoOpt(r, bloccoAttivo), agg: true, on: false, b: bloccoAttivo }])}><Plus />Ipotesi aggiungibile</Button>
            <Button size="sm" variant="outline" onClick={() => setRighe((r) => [...r, { t: "", p: "", opt: null, on: false, b: bloccoAttivo }])}><Plus />Voce fissa</Button>
            {accettato && <Button size="sm" variant="outline" onClick={nuovoBlocco} title="Dopo l'accettazione: es. riparata la logica, trovata la batteria da sostituire"><Plus />Preventivo aggiuntivo</Button>}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[auto_1fr] lg:items-end">
          <Campo label="Spese di spedizione">
            <div className="flex flex-wrap items-center gap-2">
              <Scelta piccolo disabled={ro} valore={bz.spedizione_tipo || "nessuna"} opzioni={SPEDIZIONI.map(([k, l]) => [k, l])}
                onChange={(v) => setBz((x) => ({ ...x, spedizione_tipo: v, spedizione_importo: v === "nessuna" ? x.spedizione_importo : (x.spedizione_importo || spedDefault) }))} />
              {bz.spedizione_tipo && bz.spedizione_tipo !== "nessuna" && (
                <span className="inline-flex items-center gap-1 text-sm"><Truck className="size-4 text-muted-foreground" />€
                  <input className={`${campo} h-8 w-20 text-right`} disabled={ro} inputMode="decimal" value={bz.spedizione_importo ?? ""} onChange={(e) => setBz((x) => ({ ...x, spedizione_importo: e.target.value.replace(",", ".") }))} /></span>
              )}
            </div>
          </Campo>
          <div className="text-xs text-muted-foreground lg:text-right">Di solito 28 € A/R; cambia con dimensioni e peso.</div>
        </div>

        <Campo label="Note per il cliente (testi standard)">
          <textarea className={area} rows={bz.note ? Math.min(10, bz.note.split("\n").length + 1) : 2} disabled={ro} value={bz.note} onChange={(e) => setBz((b) => ({ ...b, note: e.target.value }))}
            placeholder="Si aggiungono con «Testi standard» (non sostituiscono quello che c'è)" />
        </Campo>

        {!ro && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={apriTesti}><BookText />Testi standard</Button>
            <Button size="sm" variant="outline" onClick={onStessoModello}><Copy />Stesso modello</Button>
            <div className="flex items-center gap-1">
              <input className={`${campo} h-8 w-56`} placeholder="Cerca preventivi: «air 2020 logica»" value={cerca} onChange={(e) => setCerca(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") cercaPrev(); }} />
              <Button size="sm" variant="outline" onClick={cercaPrev}><Search /></Button>
            </div>
            <Button className="ml-auto h-10 px-4 text-sm font-semibold" disabled={!righe.length} onClick={onInvia}>
              <Send />{inviato || accettato || s.preventivo_stato === "rifiutato" ? "INVIA AGGIORNAMENTO" : "INVIA PREVENTIVO"}</Button>
          </div>
        )}
        {!ro && <div className="text-right text-[11px] text-muted-foreground">Invio sempre per mail (con il PDF) e WhatsApp. Prezzi IVA compresa.</div>}

        {testi && (
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <div className="sticky top-0 flex items-center justify-between border-b bg-background px-3 py-1.5 text-xs font-semibold">Testi standard — clic per aggiungere
              <button onClick={() => setTesti(null)}><X className="size-3.5" /></button></div>
            {testi.map((t) => (
              <button key={t.id} type="button" onClick={() => aggiungiTesto(t)} className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted">
                <span className="flex items-center gap-2"><b>{t.titolo}</b>{t.uso === "interno" && <Pill>nota interna</Pill>}{t.prezzi_da_verificare && <Pill tono="ambra">prezzi da verificare</Pill>}</span>
                <span className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{t.testo}</span>
              </button>
            ))}
          </div>
        )}
        {trovati && (
          <div className="max-h-72 overflow-y-auto rounded-lg border p-2 text-xs">
            <div className="mb-1 flex items-center gap-2">{trovati.sintesi ? <>Trovati {trovati.sintesi.n}: min {eur(trovati.sintesi.min)} · mediana <b>{eur(trovati.sintesi.mediana)}</b> · max {eur(trovati.sintesi.max)} — verificare su GSX</> : "Nessun preventivo"}
              <button className="ml-auto" onClick={() => setTrovati(null)}><X className="size-3.5" /></button></div>
            {trovati.preventivi.map((p) => (
              <div key={p.id} className="flex gap-2 border-t py-1">
                <span className="w-14 shrink-0 tabular-nums">{p.sigla}</span>
                <span className="flex-1"><b>{p.modello || p.prodotto}</b> — {p.preventivo_testo}</span>
                <span className="shrink-0">{eur(p.totale_lavorazione ?? p.preventivo_totale)}</span>
                {!ro && <button className="shrink-0 underline" onClick={() => { setRighe((r) => [...r.filter((x) => blocco(x) !== bloccoAttivo), ...parseEstimate(p.preventivo_testo || "").map((x) => ({ ...x, b: bloccoAttivo }))]); toast.success("Preventivo copiato: controlla i prezzi"); }}>usa</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Sezione>
  );
}

function Blocco({ b, righe, ro, attivo, onAttiva, upd, togli, setRighe }: {
  b: number; righe: EstimateLine[]; ro: boolean; attivo: boolean; onAttiva: () => void;
  upd: (i: number, k: keyof EstimateLine, v: unknown) => void; togli: (i: number) => void; setRighe: (f: (r: EstimateLine[]) => EstimateLine[]) => void;
}) {
  const fisse = righe.map((r, i) => ({ r, i })).filter((x) => blocco(x.r) === b && x.r.opt == null);
  const ips = ipotesiDelBlocco(righe, b);
  if (!fisse.length && !ips.length && b === 0) {
    return <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nessuna voce: scegli l&apos;intervento qui sopra e «Proponi 1ª + 2ª ipotesi», oppure aggiungi le voci a mano.</div>;
  }
  return (
    <div className={`space-y-2 ${b > 0 ? "rounded-lg border-2 border-dashed border-amber-300 p-2" : ""}`} onClick={onAttiva}>
      {b > 0 && <div className="flex items-center gap-2 text-sm font-semibold">Preventivo aggiuntivo {b > 1 ? b : ""}{attivo && !ro && <Pill tono="ambra">le voci nuove vanno qui</Pill>}</div>}
      {fisse.map(({ r, i }) => <Riga key={i} r={r} i={i} ro={ro} upd={upd} togli={togli} etichetta="voce fissa" />)}
      {ips.map((ip) => (
        <div key={ip.opt} className={`rounded-lg border p-2 ${ip.scelta ? (ip.agg ? "border-sky-300 bg-sky-50/50 dark:bg-sky-950/20" : "border-primary/50 bg-primary/[0.03]") : ""}`}>
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
            {ip.agg ? (
              <label className="flex items-center gap-1.5 font-semibold"><input type="checkbox" disabled={ro} checked={ip.scelta} onChange={(e) => setRighe((rr) => rr.map((x) => (blocco(x) === b && x.opt === ip.opt ? { ...x, on: e.target.checked } : x)))} />
                {ip.n}ª IPOTESI — aggiungibile</label>
            ) : (
              <label className="flex items-center gap-1.5 font-semibold"><input type="radio" disabled={ro} checked={ip.scelta} onChange={() => setRighe((rr) => scegliIpotesi(rr, b, ip.opt))} />
                {ip.n}ª IPOTESI</label>
            )}
            <span className="text-muted-foreground">{ip.agg ? "si somma all'ipotesi scelta" : ip.scelta ? "quella proposta (nel totale)" : "alternativa"}</span>
            <span className="ml-auto font-semibold tabular-nums">{eur(ip.totale)}</span>
            {!ro && <Button size="xs" variant="ghost" onClick={() => setRighe((rr) => [...rr, { t: "", p: "", opt: ip.opt, on: ip.scelta, agg: ip.agg, b }])} title="Altra voce nella stessa ipotesi"><Plus />voce</Button>}
          </div>
          <div className="space-y-1.5">{ip.righe.map(({ r, i }) => <Riga key={i} r={r} i={i} ro={ro} upd={upd} togli={togli} />)}</div>
        </div>
      ))}
    </div>
  );
}

function Riga({ r, i, ro, upd, togli, etichetta }: { r: EstimateLine; i: number; ro: boolean; upd: (i: number, k: keyof EstimateLine, v: unknown) => void; togli: (i: number) => void; etichetta?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-1.5">
        {etichetta && <span className="mt-2.5 w-16 shrink-0 text-[11px] text-muted-foreground">{etichetta}</span>}
        <textarea className={`${area} min-h-9 flex-1 resize-y`} rows={r.t.length > 90 ? 2 : 1} disabled={ro} value={r.t} placeholder="Descrizione della voce" onChange={(e) => upd(i, "t", e.target.value)} />
        <div className="relative w-24 shrink-0">
          <span className="pointer-events-none absolute left-2 top-2 text-sm text-muted-foreground">€</span>
          <input className={`${campo} pl-5 text-right font-semibold tabular-nums`} disabled={ro} inputMode="decimal" value={r.p ?? ""} onChange={(e) => upd(i, "p", e.target.value.replace(",", "."))} />
        </div>
        {!ro && <button type="button" title="Togli la voce" className="mt-1.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600" onClick={() => togli(i)}><Trash2 className="size-4" /></button>}
      </div>
      <div className={`flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground ${etichetta ? "pl-[70px]" : ""}`}>
        <select className="h-7 rounded border bg-background px-1" disabled={ro} value={r.nota || ""} onChange={(e) => upd(i, "nota", e.target.value || null)}>
          <option value="">recupero dati: —</option>{NOTE_RECUPERO.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <label className="flex items-center gap-1" title="Prezzo barrato: «scontato da € …» (non si somma)">scontato da €
          <input className="h-7 w-16 rounded border bg-background px-1 text-right" disabled={ro} inputMode="decimal" value={r.listino ?? ""} onChange={(e) => upd(i, "listino", e.target.value ? Number(e.target.value.replace(",", ".")) : null)} /></label>
        <label className="flex items-center gap-1" title="Solo se voluto: il prezzo scritto è NETTO e al cliente si aggiunge l'IVA"><input type="checkbox" disabled={ro} checked={!!r.iva} onChange={(e) => upd(i, "iva", e.target.checked)} />+IVA</label>
        {r.iva && <span className="font-medium text-amber-700">= {eur(rowTotal(r))} IVA compresa</span>}
      </div>
    </div>
  );
}
