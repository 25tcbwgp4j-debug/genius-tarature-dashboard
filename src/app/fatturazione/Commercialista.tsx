"use client";

// COMMERCIALISTA (02/10/2026) — solo titolare. La contabilità di Genius Lab parte DA SOLA allo studio Gargiulo:
// il giorno 5 alle 9:00 il backend prepara il pacchetto del mese prima, esegue i controlli e, se tornano tutti, lo invia
// (da info@avantifiori.it, copia nascosta a Christian). Se un controllo non torna non parte nulla: Telegram e nuovo
// tentativo ogni giorno. Qui: stato dei mesi, anteprima di mail e allegati, controlli, Ricontrolla / Invia ora / Rimanda.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, Download, Loader2, Mail, NotebookPen, RefreshCw, Send, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  commAnnota, commConfig, commElenco, commInvia, commPeriodo, commRicontrolla, commRimanda, commTogliAnnotazione,
  STATI_COMM, type Annotazione, type ConfigComm, type Controllo, type DettaglioPeriodo, type PeriodoVista,
} from "@/lib/commercialista";
import { eur } from "./util";

const dIt = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const dtIt = (s?: string | null) => (s ? new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const mb = (b?: number | null) => (b ? `${(b / 1048576).toFixed(1)} MB` : "");
const err = (e: unknown) => (e instanceof Error ? e.message : "Errore");

function Stato({ s }: { s: keyof typeof STATI_COMM }) {
  const x = STATI_COMM[s] || STATI_COMM.da_preparare;
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${x.cls}`}>{x.label}</span>;
}

export function Commercialista({ periodoIniziale }: { periodoIniziale?: string }) {
  const [cfg, setCfg] = useState<ConfigComm | null>(null);
  const [periodi, setPeriodi] = useState<PeriodoVista[]>([]);
  const [annot, setAnnot] = useState<Annotazione[]>([]);
  const [sel, setSel] = useState<string>(periodoIniziale || "");
  const [det, setDet] = useState<DettaglioPeriodo | null>(null);
  const [caricaDet, setCaricaDet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [modDest, setModDest] = useState(false);
  const [dest, setDest] = useState({ a: "", cc: "", ccn: "" });
  const [altro, setAltro] = useState<{ tipo: "trimestre" | "intervallo"; anno: number; t: number; dal: string; al: string }>(
    { tipo: "trimestre", anno: new Date().getFullYear(), t: Math.max(1, Math.floor(new Date().getMonth() / 3)), dal: "", al: "" });

  const caricaElenco = useCallback(async () => {
    try {
      const r = await commElenco();
      setCfg(r.config); setPeriodi(r.periodi); setAnnot(r.annotazioni);
      setSel((s) => s || r.periodi.find((p) => p.stato !== "mese_in_corso")?.chiave || "");
    } catch (e) { toast.error(err(e)); }
  }, []);
  useEffect(() => { caricaElenco(); }, [caricaElenco]);

  const caricaPeriodo = useCallback(async (k: string, silenzioso = false) => {
    if (!k) return;
    if (!silenzioso) setCaricaDet(true);
    try { setDet(await commPeriodo(k)); } catch (e) { if (!silenzioso) toast.error(err(e)); setDet(null); } finally { setCaricaDet(false); }
  }, []);
  useEffect(() => { if (sel) caricaPeriodo(sel); }, [sel, caricaPeriodo]);

  // mentre il server lavora (preparazione o invio) si aggiorna da solo
  const lavora = !!det && (det.in_corso || det.riga?.stato === "in_preparazione" || det.riga?.stato === "in_invio");
  useEffect(() => {
    if (!lavora || !sel) return;
    const t = setInterval(() => { caricaPeriodo(sel, true); }, 3000);
    return () => clearInterval(t);
  }, [lavora, sel, caricaPeriodo]);
  const eraLavoro = useRef(false);
  useEffect(() => {
    if (lavora) eraLavoro.current = true;
    else if (eraLavoro.current) {
      eraLavoro.current = false;
      caricaElenco();
      const st = det?.riga?.stato;
      if (st === "inviato") toast.success(`Contabilità di ${det?.etichetta} inviata allo studio`);
      else if (st === "pronto") toast.success("Controlli superati: pronto per l'invio");
      else if (st === "controlli_ko") toast.warning("Alcuni controlli non tornano: niente invio");
    }
  }, [lavora, caricaElenco, det]);

  async function ricontrolla(k = sel) {
    setBusy("ricontrolla");
    try { await commRicontrolla(k); toast.info("Preparo il pacchetto e rifaccio i controlli…"); await caricaPeriodo(k, true); }
    catch (e) { toast.error(err(e)); } finally { setBusy(null); }
  }

  async function inviaOra() {
    if (!det) return;
    const c = det.config;
    if (!confirm(`Inviare ADESSO la contabilità di ${det.etichetta} allo studio?\n\nDa: ${c.mittente_nome} <${c.mittente_email}>\nA: ${c.a.join(", ")}\nCc: ${c.cc.join(", ")}\nCcn: ${c.ccn.join(", ")}\n\nPrima rifaccio tutti i controlli con i dati di adesso: se uno non torna la mail NON parte.`)) return;
    setBusy("invia");
    try { await commInvia(det.chiave); toast.info("Ricontrollo e invio in corso…"); await caricaPeriodo(det.chiave, true); }
    catch (e) { toast.error(err(e)); } finally { setBusy(null); }
  }

  async function rimanda() {
    if (!det) return;
    const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const al = prompt("Rimanda il tentativo automatico al giorno (AAAA-MM-GG):", domani);
    if (!al) return;
    const motivo = prompt("Motivo (facoltativo):", "") || "";
    setBusy("rimanda");
    try { await commRimanda(det.chiave, al, motivo); toast.success(`Rimandato al ${dIt(al)}`); await caricaPeriodo(det.chiave, true); caricaElenco(); }
    catch (e) { toast.error(err(e)); } finally { setBusy(null); }
  }

  async function annota(c: Controllo, i: number) {
    const a = c.anomalie[i];
    if (!a.tipo || !a.riferimento) return;
    const motivo = prompt(`Spiega l'anomalia (la legge anche lo studio nel foglio «Controlli»):\n\n${a.testo}`);
    if (!motivo) return;
    try { await commAnnota(a.tipo, a.riferimento, motivo, a.importo); toast.success("Annotata: ricontrollo"); await ricontrolla(); caricaElenco(); }
    catch (e) { toast.error(err(e)); }
  }

  async function togliAnnotazione(tipo: string, rif: string) {
    if (!confirm("Togliere l'annotazione? Al prossimo controllo l'anomalia tornerà a bloccare l'invio.")) return;
    try { await commTogliAnnotazione(tipo, rif); toast.success("Annotazione tolta"); caricaElenco(); if (sel) ricontrolla(); }
    catch (e) { toast.error(err(e)); }
  }

  async function salvaDest(extra?: Partial<ConfigComm>) {
    try {
      const r = await commConfig(extra || { a: dest.a.split(/[,;\s]+/).filter(Boolean), cc: dest.cc.split(/[,;\s]+/).filter(Boolean), ccn: dest.ccn.split(/[,;\s]+/).filter(Boolean) });
      setCfg(r); setModDest(false); toast.success("Salvato");
    } catch (e) { toast.error(err(e)); }
  }

  function apriAltro() {
    const k = altro.tipo === "trimestre" ? `${altro.anno}-T${altro.t}` : `${altro.dal}_${altro.al}`;
    if (altro.tipo === "intervallo" && (!altro.dal || !altro.al)) { toast.error("Scegli le due date"); return; }
    setSel(k);
    ricontrolla(k);
  }

  const r = det?.riga || null;
  const ctr = r?.controlli || [];
  const contenuto = useMemo(() => {
    const g: Record<string, { n: number; byte: number }> = {};
    for (const x of r?.riepilogo?.contenuto || []) {
      const parti = x.file.split("/");
      const k = parti.length > 1 ? parti.slice(0, parti.length > 2 ? 2 : 1).join("/") : x.file;
      g[k] = { n: (g[k]?.n || 0) + 1, byte: (g[k]?.byte || 0) + x.byte };
    }
    return Object.entries(g);
  }, [r]);

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Mail className="size-4" />
          <span className="font-medium">Contabilità allo studio Gargiulo</span>
          <span className="text-muted-foreground">— ogni mese il giorno {cfg?.giorno_invio ?? 5} alle 9:00 preparo, controllo e invio da solo il mese prima
            {cfg ? ` (dal mese ${cfg.primo_mese_auto.slice(5)}/${cfg.primo_mese_auto.slice(0, 4)})` : ""}. Se un controllo non torna non parte nulla: ti avviso su Telegram e riprovo ogni giorno.</span>
          {cfg && (
            <label className="ml-auto flex items-center gap-1 text-xs">
              <input type="checkbox" checked={cfg.invio_automatico} onChange={(e) => salvaDest({ invio_automatico: e.target.checked })} />
              invio automatico attivo
            </label>
          )}
        </div>
        {cfg && !modDest && (
          <div className="grid gap-x-4 gap-y-0.5 text-xs md:grid-cols-2">
            <div><span className="text-muted-foreground">Da:</span> {cfg.mittente_nome} &lt;{cfg.mittente_email}&gt;</div>
            <div><span className="text-muted-foreground">A:</span> {cfg.a.join(", ")}</div>
            <div><span className="text-muted-foreground">Cc:</span> {cfg.cc.join(", ")}</div>
            <div className="flex items-center gap-2"><span><span className="text-muted-foreground">Ccn:</span> {cfg.ccn.join(", ")}</span>
              <button className="text-blue-600 underline" onClick={() => { setDest({ a: cfg.a.join(", "), cc: cfg.cc.join(", "), ccn: cfg.ccn.join(", ") }); setModDest(true); }}>modifica</button></div>
          </div>
        )}
        {modDest && (
          <div className="grid gap-2 text-xs md:grid-cols-3">
            {(["a", "cc", "ccn"] as const).map((k) => (
              <label key={k} className="flex flex-col gap-0.5">{k.toUpperCase()}
                <textarea className="min-h-14 rounded-md border border-input bg-background p-1 text-xs" value={dest[k]} onChange={(e) => setDest({ ...dest, [k]: e.target.value })} />
              </label>
            ))}
            <div className="flex gap-2 md:col-span-3"><Button size="sm" onClick={() => salvaDest()}>Salva destinatari</Button>
              <Button size="sm" variant="outline" onClick={() => setModDest(false)}>Annulla</Button></div>
          </div>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-2">
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Periodo</th><th className="p-2 text-left">Stato</th><th className="p-2 text-right">Totale</th></tr></thead>
              <tbody>
                {periodi.map((p) => (
                  <tr key={p.chiave} onClick={() => p.stato !== "mese_in_corso" && setSel(p.chiave)}
                    className={`border-t ${p.stato === "mese_in_corso" ? "text-muted-foreground" : "cursor-pointer hover:bg-muted/40"} ${sel === p.chiave ? "bg-primary/5" : ""}`}>
                    <td className="p-2"><div className="font-medium capitalize">{p.etichetta}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.stato === "inviato" ? <>inviato il {dtIt(p.inviato_il)}{p.invio?.a ? ` a ${p.invio.a.join(", ")}` : ""}</>
                          : p.rimanda_al ? <>rimandato al {dIt(p.rimanda_al)}</>
                          : p.prossimo_tentativo ? <>invio automatico dal {dIt(p.prossimo_tentativo)}</>
                          : p.tipo === "mese" ? "solo con «Invia ora»" : p.tipo}
                      </div></td>
                    <td className="p-2"><Stato s={p.stato} />{p.stato === "controlli_ko" && <div className="text-[11px] text-red-700">{p.controlli_ko} su {p.controlli_n}</div>}</td>
                    <td className="p-2 text-right text-xs">{p.riepilogo?.totale != null ? eur(p.riepilogo.totale) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="space-y-2 p-3 text-xs">
            <div className="font-medium">Altro periodo (trimestre o date a scelta)</div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="h-8 rounded-md border border-input bg-background px-1" value={altro.tipo} onChange={(e) => setAltro({ ...altro, tipo: e.target.value as "trimestre" | "intervallo" })}>
                <option value="trimestre">Trimestre</option><option value="intervallo">Dal… al…</option>
              </select>
              {altro.tipo === "trimestre" ? (<>
                <select className="h-8 rounded-md border border-input bg-background px-1" value={altro.t} onChange={(e) => setAltro({ ...altro, t: +e.target.value })}>
                  {[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}° trim.</option>)}
                </select>
                <input type="number" className="h-8 w-20 rounded-md border border-input bg-background px-1" value={altro.anno} onChange={(e) => setAltro({ ...altro, anno: +e.target.value })} />
              </>) : (<>
                <input type="date" className="h-8 rounded-md border border-input bg-background px-1" value={altro.dal} onChange={(e) => setAltro({ ...altro, dal: e.target.value })} />
                <input type="date" className="h-8 rounded-md border border-input bg-background px-1" value={altro.al} onChange={(e) => setAltro({ ...altro, al: e.target.value })} />
              </>)}
              <Button size="sm" variant="outline" onClick={apriAltro}>Prepara e controlla</Button>
            </div>
          </Card>
          {annot.length > 0 && (
            <Card className="space-y-1 p-3 text-xs">
              <div className="font-medium">Annotazioni (anomalie spiegate, non bloccano l&apos;invio)</div>
              {annot.map((a) => (
                <div key={a.id} className="flex gap-2 border-t pt-1">
                  <div className="flex-1"><b>{a.tipo} {a.riferimento}</b>{a.importo != null ? ` (${eur(a.importo)})` : ""}: {a.motivo}
                    <div className="text-muted-foreground">{a.creato_da} · {dtIt(a.created_at)}</div></div>
                  <button className="text-red-600" title="Togli" onClick={() => togliAnnotazione(a.tipo, a.riferimento)}><Undo2 className="size-3.5" /></button>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div className="space-y-3">
          {caricaDet && !det ? <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div> : !det ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Scegli un periodo</Card>
          ) : (<>
            <Card className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold capitalize">{det.etichetta}</div>
                <Stato s={lavora ? (r?.stato === "in_invio" ? "in_invio" : "in_preparazione") : (r?.stato || "da_preparare")} />
                {r?.preparato_il && <span className="text-xs text-muted-foreground">preparato il {dtIt(r.preparato_il)}{r.tentativi ? ` · ${r.tentativi} preparazioni` : ""}</span>}
                <div className="ml-auto flex flex-wrap gap-2">
                  {r?.stato !== "inviato" && (<>
                    <Button size="sm" variant="outline" disabled={!!busy || lavora} onClick={() => ricontrolla()}>
                      {busy === "ricontrolla" || (lavora && r?.stato !== "in_invio") ? <Loader2 className="mr-1 size-4 animate-spin" /> : <RefreshCw className="mr-1 size-4" />}Ricontrolla</Button>
                    <Button size="sm" disabled={!!busy || lavora || r?.stato !== "pronto"} onClick={inviaOra}
                      title={r?.stato === "pronto" ? "Ricontrolla con i dati di adesso e invia allo studio" : "Si può inviare solo quando tutti i controlli tornano"}>
                      {busy === "invia" || r?.stato === "in_invio" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Send className="mr-1 size-4" />}Invia ora</Button>
                    {det.tipo === "mese" && <Button size="sm" variant="outline" disabled={!!busy} onClick={rimanda}><Clock className="mr-1 size-4" />Rimanda a…</Button>}
                  </>)}
                  {det.download && <a href={det.download}><Button size="sm" variant="outline"><Download className="mr-1 size-4" />ZIP</Button></a>}
                </div>
              </div>
              {r?.stato === "inviato" && r.invio && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <div className="flex items-center gap-1 font-medium"><CheckCircle2 className="size-3.5" />Inviato il {dtIt(r.inviato_il)} da {r.inviato_da} ({r.invio.trigger})</div>
                  <div>A: {r.invio.a.join(", ")} · Cc: {r.invio.cc.join(", ")} · Ccn: {r.invio.ccn.join(", ")}</div>
                  <div>Allegati: {(r.invio.allegati || []).map((x) => `${x.file} (${mb(x.byte)}, ${x.modo})`).join(", ")} · id invio {r.invio.resend_id} · {r.invio.esito}</div>
                </div>
              )}
              {r?.rimanda_al && r.stato !== "inviato" && <div className="text-xs text-amber-700">Tentativo automatico rimandato al {dIt(r.rimanda_al)}{r.rimanda_motivo ? `: ${r.rimanda_motivo}` : ""}</div>}
              {r?.errore && <div className="rounded-md border border-red-300 p-2 text-xs text-red-700">{r.errore}</div>}
              {!r && !lavora && <div className="text-sm text-muted-foreground">Periodo mai preparato. «Ricontrolla» genera il pacchetto e lancia i controlli (non invia nulla).</div>}
            </Card>

            {ctr.length > 0 && (
              <Card className="space-y-2 p-3 text-sm">
                <div className="font-medium">Controlli prima dell&apos;invio {ctr.every((c) => c.ok) ? <span className="text-emerald-700">— tutti superati</span> : <span className="text-red-700">— {ctr.filter((c) => !c.ok).length} non tornano: la mail non parte</span>}</div>
                {ctr.map((c) => (
                  <div key={c.chiave} className="border-t pt-1.5">
                    <div className="flex items-start gap-1.5">
                      {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
                      <div className="min-w-0 flex-1"><b>{c.nome}</b> <span className="text-xs text-muted-foreground">— {c.dettaglio}</span>
                        {c.anomalie.map((a, i) => (
                          <div key={i} className={`mt-1 flex gap-2 text-xs ${a.annotata ? "text-muted-foreground" : "text-red-700"}`}>
                            {a.annotata ? <NotebookPen className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
                            <div className="flex-1">{a.testo}{a.annotata && <div className="italic">Annotazione: {a.annotata}</div>}</div>
                            {!a.annotata && a.tipo && a.riferimento && r?.stato !== "inviato" &&
                              <button className="shrink-0 text-blue-600 underline" onClick={() => annota(c, i)}>Annota</button>}
                          </div>
                        ))}
                        {c.note.length > 0 && (
                          <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">{c.note.length} note</summary>
                            {c.note.map((n, i) => <div key={i} className="mt-0.5">· {n}</div>)}</details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {r?.corpo && (
              <Card className="space-y-2 p-3 text-sm">
                <div className="font-medium">Anteprima della mail {r.stato !== "inviato" && <span className="text-xs font-normal text-muted-foreground">(si aggiorna a ogni controllo)</span>}</div>
                <div className="grid gap-0.5 text-xs">
                  <div><span className="text-muted-foreground">Da:</span> {r.destinatari?.mittente_nome} &lt;{r.destinatari?.mittente_email}&gt;</div>
                  <div><span className="text-muted-foreground">A:</span> {r.destinatari?.a.join(", ")}</div>
                  <div><span className="text-muted-foreground">Cc:</span> {r.destinatari?.cc.join(", ")}</div>
                  <div><span className="text-muted-foreground">Ccn:</span> {r.destinatari?.ccn.join(", ")}</div>
                  <div><span className="text-muted-foreground">Oggetto:</span> <b>{r.oggetto}</b></div>
                  <div><span className="text-muted-foreground">Allegato:</span> {(r.allegati || []).map((x) => `${x.file} (${mb(x.byte)}${x.modo === "link" ? ", troppo grande: va come link firmato valido un anno" : ""})`).join(", ")}</div>
                </div>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 font-sans text-xs">{r.corpo}</pre>
                {contenuto.length > 0 && (
                  <details className="text-xs"><summary className="cursor-pointer font-medium">Contenuto dello ZIP ({r.riepilogo?.contenuto?.length} file)</summary>
                    <table className="mt-1 w-full"><tbody>
                      {contenuto.map(([k, v]) => <tr key={k} className="border-t"><td className="p-1">{k}</td><td className="p-1 text-right">{v.n} file</td><td className="p-1 text-right">{mb(v.byte) || `${Math.ceil(v.byte / 1024)} KB`}</td></tr>)}
                    </tbody></table></details>
                )}
              </Card>
            )}

            {(r?.eventi?.length ?? 0) > 0 && (
              <Card className="p-3 text-xs">
                <details><summary className="cursor-pointer font-medium">Registro ({r?.eventi.length})</summary>
                  {[...(r?.eventi || [])].reverse().map((e, i) => <div key={i} className="border-t py-0.5"><span className="text-muted-foreground">{dtIt(e.quando)}</span> — {e.evento}</div>)}
                </details>
              </Card>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
