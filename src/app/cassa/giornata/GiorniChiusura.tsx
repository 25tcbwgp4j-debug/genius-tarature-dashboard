"use client";

// GIORNI DI CHIUSURA della cassa del giorno (04/10/2026, richiesta di Christian).
// Sabato e domenica sono chiusi di default: dopo la chiusura del venerdì la cassa passa al lunedì e il riporto dei
// contanti va dal venerdì al lunedì. Qui il titolare (o l'operatore con la sua autorizzazione «calendario_cassa»):
//  - sblocca i sabati / le domeniche, a tempo indeterminato o per un periodo (es. Natale), e li blocca di nuovo;
//  - segna un giorno qualsiasi come festivo / chiuso / ferie / non lavorato (non si può se ci sono movimenti);
//  - conferma le festività nazionali proposte (non si attivano da sole);
//  - toglie una data segnata.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarOff, CalendarCheck, Loader2, Lock, Unlock, X } from "lucide-react";
import { toast } from "sonner";
import { toastErrore } from "@/lib/errori";
import {
  calendarioAnteprima, calendarioBlocca, calendarioCassa, calendarioChiudi, calendarioFestivita, calendarioRimuovi,
  calendarioSblocca, type VistaCalendario,
} from "@/lib/api";

const dataIt = (g: string, o?: Intl.DateTimeFormatOptions) =>
  new Date(`${g}T12:00:00Z`).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", ...(o || { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) });
const MOTIVI: [string, string][] = [["festivita", "Festività"], ["chiusura", "Chiusura"], ["ferie", "Ferie"], ["non_lavorato", "Non lavorato"]];

export function GiorniChiusura({ aperto, onChiudi, giornoIniziale, onCambiato }: {
  aperto: boolean; onChiudi: () => void; giornoIniziale: string; onCambiato: () => void;
}) {
  const [v, setV] = useState<VistaCalendario | null>(null);
  const [busy, setBusy] = useState("");
  const [periodo, setPeriodo] = useState<Record<5 | 6, { dal: string; al: string }>>({ 5: { dal: "", al: "" }, 6: { dal: "", al: "" } });
  const [giorno, setGiorno] = useState(giornoIniziale);
  const [motivo, setMotivo] = useState("non_lavorato");
  const [nota, setNota] = useState("");
  const [ante, setAnte] = useState<Awaited<ReturnType<typeof calendarioAnteprima>> | null>(null);
  const [scelte, setScelte] = useState<Set<string>>(new Set());

  const carica = useCallback(() => calendarioCassa().then(setV).catch(toastErrore), []);
  useEffect(() => { if (aperto) { setGiorno(giornoIniziale); carica(); } }, [aperto, giornoIniziale, carica]);
  useEffect(() => {
    if (!aperto || !giorno) return;
    let vivo = true;
    setAnte(null);
    calendarioAnteprima(giorno).then((r) => { if (vivo) setAnte(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [aperto, giorno, v]);

  async function fai(nome: string, fn: () => Promise<unknown>, ok: string) {
    if (busy) return;
    setBusy(nome);
    try { await fn(); toast.success(ok); await carica(); onCambiato(); }
    catch (e) { toastErrore(e); }
    finally { setBusy(""); }
  }

  const regole = (gs: 5 | 6) => (v?.regole || []).filter((r) => r.giorno_settimana === gs);
  const nomeGs = (gs: 5 | 6) => (gs === 5 ? "sabati" : "domeniche");
  const futuro = (v?.date || []).filter((d) => !d.passato);
  const recenti = (v?.date || []).filter((d) => d.passato).slice(-8);

  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarOff className="size-5" />Giorni di chiusura</DialogTitle>
          <DialogDescription>
            Nei giorni chiusi non si fanno scontrini né fatture: la cassa salta al giorno lavorativo successivo e i contanti
            si riportano dall&apos;ultimo giorno lavorato. Gli incassi elettronici (Stripe, PayPal, POS) di un giorno chiuso
            entrano nella cassa del giorno lavorativo dopo.
          </DialogDescription>
        </DialogHeader>
        {!v ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carico…</div> : (
          <div className="space-y-5">
            <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950/30">
              Oggi <b>{v.oggi.nome}</b>: {v.oggi.lavorativo ? "giorno lavorativo" : <>negozio chiuso ({v.oggi.etichetta})</>}.
              {" "}Prossimo giorno lavorativo: <b>{dataIt(v.prossimo_lavorativo, { weekday: "long", day: "numeric", month: "long" })}</b>.
            </div>

            {/* SABATI E DOMENICHE */}
            <section className="space-y-2">
              <h3 className="font-semibold">Sabati e domeniche</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {([5, 6] as const).map((gs) => {
                  const rr = regole(gs);
                  return (
                    <div key={gs} className={`space-y-2 rounded-lg border-2 p-3 ${rr.length ? "border-emerald-400" : "border-slate-300"}`}>
                      <div className="flex items-center gap-2 font-medium capitalize">
                        {rr.length ? <Unlock className="size-4 text-emerald-700" /> : <Lock className="size-4 text-slate-600" />}
                        {nomeGs(gs)}: {rr.length ? "sbloccati" : "bloccati (chiusi)"}
                      </div>
                      {rr.map((r) => (
                        <div key={r.id} className="flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1 text-sm dark:bg-emerald-950/30">
                          <span className="flex-1">
                            {r.dal || r.al ? <>{r.dal ? `dal ${dataIt(r.dal)}` : "da subito"} {r.al ? `al ${dataIt(r.al)}` : "a tempo indeterminato"}</> : "a tempo indeterminato"}
                            {r.nota ? ` · ${r.nota}` : ""}
                          </span>
                          <Button size="sm" variant="ghost" className="h-9" disabled={!!busy}
                            onClick={() => fai(`b${r.id}`, () => calendarioBlocca(gs, r.id), `Sblocco tolto`)}>
                            <X className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs text-muted-foreground">Dal (facoltativo)
                          <Input type="date" className="h-11" value={periodo[gs].dal} onChange={(e) => setPeriodo({ ...periodo, [gs]: { ...periodo[gs], dal: e.target.value } })} />
                        </label>
                        <label className="text-xs text-muted-foreground">Al (facoltativo)
                          <Input type="date" className="h-11" value={periodo[gs].al} onChange={(e) => setPeriodo({ ...periodo, [gs]: { ...periodo[gs], al: e.target.value } })} />
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={!!busy}
                          onClick={() => fai(`s${gs}`, () => calendarioSblocca(gs, periodo[gs].dal, periodo[gs].al),
                            `${nomeGs(gs).replace(/^./, (x) => x.toUpperCase())} sbloccati`).then(() => setPeriodo({ ...periodo, [gs]: { dal: "", al: "" } }))}>
                          {busy === `s${gs}` ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Unlock className="mr-1 size-4" />}
                          {gs === 5 ? "Sblocca i sabati" : "Sblocca le domeniche"}
                        </Button>
                        {rr.length > 0 && (
                          <Button variant="outline" className="h-11" disabled={!!busy}
                            onClick={() => fai(`k${gs}`, () => calendarioBlocca(gs), `${nomeGs(gs).replace(/^./, (x) => x.toUpperCase())} di nuovo chiusi`)}>
                            <Lock className="mr-1 size-4" />Blocca di nuovo
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* GIORNO FESTIVO / CHIUSO */}
            <section className="space-y-2">
              <h3 className="font-semibold">Giorno festivo / chiuso</h3>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted-foreground">Giorno
                  <Input type="date" className="h-11 w-44" value={giorno} onChange={(e) => e.target.value && setGiorno(e.target.value)} />
                </label>
                <Input className="h-11 min-w-[180px] flex-1" placeholder="nota (es. inventario, Natale…)" value={nota} onChange={(e) => setNota(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                {MOTIVI.map(([k, l]) => (
                  <Button key={k} variant={motivo === k ? "default" : "outline"} className="h-11" onClick={() => setMotivo(k)}>{l}</Button>
                ))}
              </div>
              {ante && (
                ante.fisici.length ? (
                  <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm dark:bg-red-950/30">
                    <b>{ante.nome}</b> ha già movimenti registrati: non si può segnare chiuso.
                    <ul className="mt-1 list-disc pl-5">{ante.fisici.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  </div>
                ) : (
                  <div className="rounded-md border border-slate-300 bg-muted/40 px-3 py-2 text-sm">
                    {ante.nome}: {ante.lavorativo ? "oggi risulta lavorativo" : <>già chiuso ({ante.etichetta})</>}. Nessuno scontrino, fattura o movimento di cassa.
                    {ante.elettronici.length > 0 && <> Incassi elettronici: {ante.elettronici.map((e) => e.testo).join(", ")} → passano alla cassa di {dataIt(ante.passano_al, { weekday: "long", day: "numeric", month: "numeric" })}.</>}
                  </div>
                )
              )}
              <Button className="h-11 w-full bg-slate-800 hover:bg-slate-900 sm:w-auto" disabled={!!busy || !ante || ante.fisici.length > 0}
                onClick={() => fai("chiudi", () => calendarioChiudi(giorno, motivo, nota.trim()), `${dataIt(giorno)} segnato come giorno di chiusura`).then(() => setNota(""))}>
                {busy === "chiudi" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CalendarOff className="mr-1 size-4" />}
                Segna {dataIt(giorno, { weekday: "long", day: "numeric", month: "numeric" })} come chiuso
              </Button>
            </section>

            {/* FESTIVITÀ PROPOSTE */}
            {v.festivita.filter((f) => !f.gia_chiuso).length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold">Festività proposte</h3>
                <p className="text-xs text-muted-foreground">Non chiudono da sole: tocca quelle in cui il negozio resta chiuso e conferma. «Si lavora» le toglie dalle proposte.</p>
                <div className="space-y-1.5">
                  {v.festivita.filter((f) => !f.gia_chiuso).slice(0, 14).map((f) => {
                    const sel = scelte.has(f.giorno);
                    return (
                      <div key={f.giorno} className={`flex items-center gap-2 rounded-md border px-2 py-1 ${sel ? "border-slate-700 bg-slate-100 dark:bg-slate-800" : ""}`}>
                        <button type="button" className="flex min-h-11 flex-1 items-center gap-2 text-left text-sm"
                          onClick={() => { const n = new Set(scelte); if (sel) n.delete(f.giorno); else n.add(f.giorno); setScelte(n); }}>
                          <span className={`flex size-5 items-center justify-center rounded border ${sel ? "bg-slate-800 text-white" : ""}`}>{sel ? "✓" : ""}</span>
                          <span className="w-32 font-medium">{dataIt(f.giorno)}</span><span>{f.nome}</span>
                        </button>
                        <Button size="sm" variant="ghost" className="h-9" disabled={!!busy}
                          onClick={() => fai(`a${f.giorno}`, () => calendarioFestivita([], [f.giorno]), `${f.nome}: si lavora`)}>Si lavora</Button>
                      </div>
                    );
                  })}
                </div>
                <Button className="h-11" disabled={!!busy || scelte.size === 0}
                  onClick={() => fai("fest", async () => {
                    const r = await calendarioFestivita(Array.from(scelte));
                    if (r.errori.length) toast.error(r.errori.map((e) => e.errore).join("\n"), { duration: 12000 });
                  }, `${scelte.size} festività confermate come chiuse`).then(() => setScelte(new Set()))}>
                  <CalendarCheck className="mr-1 size-4" />Conferma chiuse ({scelte.size})
                </Button>
              </section>
            )}

            {/* DATE SEGNATE */}
            {(futuro.length > 0 || recenti.length > 0) && (
              <section className="space-y-2">
                <h3 className="font-semibold">Date segnate</h3>
                <div className="space-y-1">
                  {[...recenti, ...futuro].map((d) => (
                    <div key={d.giorno} className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${d.passato ? "opacity-70" : ""}`}>
                      <span className="w-32 font-medium">{dataIt(d.giorno)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${d.stato === "chiuso" ? "bg-slate-200 dark:bg-slate-700" : "bg-emerald-100 text-emerald-800"}`}>
                        {d.stato === "chiuso" ? d.motivo_nome : "Lavorato"}
                      </span>
                      <span className="flex-1 truncate text-muted-foreground">{d.nota || ""}</span>
                      <Button size="sm" variant="ghost" className="h-9" disabled={!!busy} title="Togli: torna alla regola della settimana"
                        onClick={() => fai(`r${d.giorno}`, () => calendarioRimuovi(d.giorno), "Data tolta")}><X className="size-4" /></Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
