"use client";

// BONIFICI IN ENTRATA (02/10/2026, Christian): su QUALSIASI pagina un pulsante rosso col numero dei bonifici arrivati
// sul conto SumUp da gestire. Il pannello mostra importo, data, causale, ordinante e le proposte di abbinamento.
// «Accetta il match» apre il documento (non segna nulla): la barra in basso mostra la quietanza (bonifico, data valuta,
// riferimento) e l'operatore conferma lì — bozza → Emetti e invia · pro forma → fattura · sessione → incasso ·
// ordine → acconto/saldo. Poi il bonifico sparisce dal pulsante.

import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Banknote, Check, ExternalLink, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ControllaSumUp } from "@/components/ControllaSumUp";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { usePermessi } from "@/components/permessi";
import { fetchAPI } from "@/lib/api";
import { toastErrore } from "@/lib/errori";
import {
  NOME_TIPO, bonAccetta, bonAnnullaAccettazione, bonConferma, bonDettaglio, bonElenco, bonIgnora, bonStato,
  type BonControllo, type BonProposta, type BonStato, type Bonifico,
} from "@/lib/bonifici";

const EVENTO = "bonifici:aggiorna";
const CHIAVE = "bonifico_in_verifica";
const SENZA = ["/login", "/forgot-password", "/reset-password"];

const eur = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));
const dataOra = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const giorno = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const aggiorna = () => window.dispatchEvent(new Event(EVENTO));

function leggiInVerifica(): string | null {
  try { return sessionStorage.getItem(CHIAVE); } catch { return null; }
}
function salvaInVerifica(id: string | null) {
  try { if (id) sessionStorage.setItem(CHIAVE, id); else sessionStorage.removeItem(CHIAVE); } catch { /* storage non disponibile */ }
  window.dispatchEvent(new Event(CHIAVE));
}
function sottoscrivi(cb: () => void) {
  window.addEventListener(CHIAVE, cb);
  return () => window.removeEventListener(CHIAVE, cb);
}

function testoControllo(c: BonControllo | null) {
  if (!c) return "nessun controllo ancora registrato";
  const quando = dataOra(c.eseguito_il);
  if (c.esito === "ok") return `${quando} · ${c.letti} bonifici letti, ${c.nuovi} nuovi${c.gia_incassati ? `, ${c.gia_incassati} già incassati` : ""}`;
  return `${quando} · ${c.esito === "mancato" ? "NON eseguito" : "errore"}: ${c.nota || ""}`;
}

export function BonificiAvviso() {
  return <Suspense fallback={null}><Avviso /></Suspense>;
}

function Avviso() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [st, setSt] = useState<BonStato | null>(null);
  const [aperto, setAperto] = useState(false);
  const [chiusi, setChiusi] = useState<string[]>([]);
  const { admin } = usePermessi();

  const carica = useCallback(() => { bonStato().then(setSt).catch(() => undefined); }, []);
  useEffect(() => {
    if (SENZA.some((p) => pathname.startsWith(p))) return;
    carica();
    const t = setInterval(carica, 60_000);
    window.addEventListener(EVENTO, carica);
    window.addEventListener("focus", carica);
    return () => { clearInterval(t); window.removeEventListener(EVENTO, carica); window.removeEventListener("focus", carica); };
  }, [carica, pathname]);

  // bonifico accettato: arriva con ?bonifico=<id> e resta (sessionStorage) anche se la pagina riscrive l'indirizzo
  const daUrl = sp.get("bonifico");
  const salvato = useSyncExternalStore(sottoscrivi, leggiInVerifica, () => null);
  useEffect(() => { if (daUrl) salvaInVerifica(daUrl); }, [daUrl]);
  const inVerifica = daUrl && !chiusi.includes(daUrl) ? daUrl : salvato;
  const fineVerifica = useCallback(() => {
    const id = leggiInVerifica();
    salvaInVerifica(null);
    setChiusi((c) => [...c, ...(id ? [id] : []), ...(daUrl ? [daUrl] : [])]);
    carica();
  }, [carica, daUrl]);

  if (SENZA.some((p) => pathname.startsWith(p))) return null;
  const n = st?.da_gestire || 0;
  const problema = st?.ultimo_controllo && st.ultimo_controllo.esito !== "ok";
  const dich = admin ? st?.dichiarati_da_riscontrare || 0 : 0;

  return (
    <>
      {(n > 0 || problema || dich > 0) && !aperto && (
        <button type="button" onClick={() => setAperto(true)}
          className={`fixed right-4 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg print:hidden ${inVerifica ? "bottom-36 sm:bottom-24" : "bottom-4"} ${n > 0 ? "bg-red-600 hover:bg-red-700" : problema ? "bg-amber-500 hover:bg-amber-600" : "bg-slate-500 hover:bg-slate-600"}`}
          title={n > 0 ? "Bonifici arrivati sul conto SumUp da gestire" : `Ultimo controllo bonifici: ${testoControllo(st?.ultimo_controllo || null)}`}>
          {n > 0 && <span className="absolute -left-1 -top-1 size-3 animate-ping rounded-full bg-red-400" />}
          <Banknote className="size-4" />
          {n > 0 ? <>{n} {n === 1 ? "bonifico nuovo" : "bonifici nuovi"} da gestire</> : problema ? <>Controllo bonifici non riuscito</>
            : <>{dich} bonifici dichiarati da riscontrare</>}
        </button>
      )}
      {aperto && <Pannello onClose={() => { setAperto(false); carica(); }} />}
      {inVerifica && <BarraConferma key={inVerifica} id={inVerifica} onFine={fineVerifica} />}
    </>
  );
}

// ---------------------------------------------------------------------------
interface Dichiarato { id: string; data_bonifico: string; importo: number; ordinante: string | null; causale: string | null;
  documento_tipo: string; documento_descrizione: string | null; dichiarato_da: string | null; operatore: string | null; created_at: string }

function Pannello({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { admin } = usePermessi();
  const [dichiarati, setDichiarati] = useState<Dichiarato[]>([]);
  useEffect(() => {
    if (admin) fetchAPI("/api/bonifici/al-banco/dichiarati").then((r) => setDichiarati(r.dichiarati)).catch(() => undefined);
  }, [admin]);
  const [dati, setDati] = useState<Awaited<ReturnType<typeof bonElenco>> | null>(null);
  const [busy, setBusy] = useState("");
  const [cerca, setCerca] = useState<Record<string, string>>({});
  const [trovati, setTrovati] = useState<Record<string, BonProposta[]>>({});
  const [tipoCerca, setTipoCerca] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string[]>([]);
  const [operatore, setOperatore] = useOperatore();

  const carica = useCallback(() => { bonElenco().then(setDati).catch((e) => toastErrore(e)); }, []);
  useEffect(() => { carica(); }, [carica]);

  async function accetta(b: Bonifico, p: BonProposta, manuale = false) {
    setBusy(b.id);
    try {
      const r = await bonAccetta(b.id, p, manuale);
      salvaInVerifica(b.id);
      aggiorna();
      onClose();
      router.push(r.url);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function ignora(b: Bonifico) {
    const motivo = window.prompt(`Ignorare il bonifico di ${eur(b.importo)} da ${b.ordinante || "—"}?\nScrivi il motivo (es. giroconto, rimborso fornitore, scheda assistenza Genius gestita fuori dashboard):`);
    if (!motivo?.trim()) return;
    setBusy(b.id);
    try { await bonIgnora(b.id, motivo.trim()); toast.success("Bonifico ignorato"); carica(); aggiorna(); }
    catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function annulla(b: Bonifico) {
    setBusy(b.id);
    try { await bonAnnullaAccettazione(b.id); if (leggiInVerifica() === b.id) salvaInVerifica(null); carica(); aggiorna(); }
    catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function cercaDoc(b: Bonifico) {
    const q = (cerca[b.id] || "").trim();
    const tipo = tipoCerca[b.id] || "";
    if (q.length < 2 && !tipo) { toast.info("Scrivi il numero o il cliente, oppure scegli il tipo di documento"); return; }
    try {
      const r = await fetchAPI(`/api/bonifici/cerca?q=${encodeURIComponent(q)}&tipo=${tipo}`);
      setTrovati((t) => ({ ...t, [b.id]: r.documenti }));
    } catch (e) { toastErrore(e); }
  }
  /** I bonifici su cui agire: la selezione multipla se questo è selezionato, altrimenti solo questo. */
  const quali = (b: Bonifico) => (sel.includes(b.id) && sel.length > 1 ? sel : [b.id]);
  function scontrino(ids: string[]) {
    if (!operatore) { toast.error("Scegli l'operatore in alto"); return; }
    onClose();
    router.push(`/cassa?bonifici=${ids.join(",")}`);
  }
  async function creaDoc(ids: string[], tipo: "fattura" | "proforma" | "ordine") {
    if (!operatore) { toast.error("Scegli l'operatore in alto"); return; }
    setBusy(ids[0]);
    try {
      const p = await fetchAPI(`/api/bonifici/prepara?ids=${ids.join(",")}`);
      const cliente = p.cliente ? `${p.cliente.denominazione}${p.cliente.piva ? ` (P.IVA ${p.cliente.piva})` : ""}`
        : `${p.ordinante || "—"} — non trovato in rubrica: lo completi nel documento`;
      const quando = String(p.data_valuta).split("-").reverse().join("/");
      let totale: number = Number(p.totale), descrizione: string = p.descrizione;
      if (tipo === "fattura") {
        if (!confirm(`Creare una FATTURA IN BOZZA di ${eur(p.totale)}?\n\nCliente: ${cliente}\nRiga: «${p.descrizione}»\nGià quietanzata: bonifico del ${quando} (${p.riferimento}).\n\nPoi la completi e la emetti.`)) return;
      } else {
        const nome = tipo === "ordine" ? "ORDINE A CLIENTE" : "PRO FORMA";
        const d = window.prompt(`${nome} per ${cliente}\nDescrizione della riga:`, p.descrizione);
        if (d === null) return;
        const t = window.prompt(`Totale del documento (il bonifico di ${eur(p.totale)} vale come acconto; se il totale è uguale è il saldo):`, String(p.totale).replace(".", ","));
        if (t === null) return;
        totale = Number(t.replace(/\./g, "").replace(",", "."));
        if (!(totale >= Number(p.totale))) { toast.error("Il totale non può essere minore del bonifico"); return; }
        descrizione = d.trim() || p.descrizione;
      }
      const r = await fetchAPI("/api/bonifici/crea", { method: "POST", body: JSON.stringify({ ids, tipo, operatore, totale, descrizione }) });
      toast.success(r.esito);
      setSel([]); aggiorna(); onClose();
      router.push(r.url);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  function azioniCrea(ids: string[], dis: boolean) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{ids.length > 1 ? `Con i ${ids.length} bonifici selezionati:` : "Crea dal bonifico:"}</span>
        <Button size="xs" variant="outline" disabled={dis} onClick={() => scontrino(ids)}>Emetti scontrino</Button>
        <Button size="xs" variant="outline" disabled={dis} onClick={() => creaDoc(ids, "fattura")}>Crea fattura</Button>
        <Button size="xs" variant="outline" disabled={dis} onClick={() => creaDoc(ids, "proforma")}>Crea pro forma</Button>
        <Button size="xs" variant="outline" disabled={dis} onClick={() => creaDoc(ids, "ordine")}>Crea ordine a cliente</Button>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 print:hidden" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 space-y-1 border-b bg-background px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Banknote className="size-5 text-red-600" /> Bonifici arrivati da gestire</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Chiudi"><X /></Button>
          </div>
          {dati && (
            <div className="text-xs text-muted-foreground">
              Ultimo controllo: <span className={dati.ultimo_controllo && dati.ultimo_controllo.esito !== "ok" ? "font-medium text-amber-700 dark:text-amber-300" : ""}>
                {testoControllo(dati.ultimo_controllo)}</span>
              {dati.prossimo_controllo && <> · prossimo {dataOra(dati.prossimo_controllo)}</>}
              <div>Orari: {dati.orari}. Conto SumUp letto dal Mac del negozio.</div>
            </div>
          )}
          <ControllaSumUp origine="pannello" aperta={dati?.richiesta_aperta} onFinito={carica} />
          <SceltaOperatore value={operatore} onChange={setOperatore} compatto />
          {sel.length > 1 && dati && (
            <div className="space-y-1 rounded-md border border-sky-400 bg-sky-50 p-2 text-sm dark:bg-sky-950/30">
              <div><b>{sel.length} bonifici selezionati</b> · totale {eur(dati.bonifici.filter((x) => sel.includes(x.id)).reduce((t, x) => t + Number(x.importo), 0))}
                <button type="button" className="ml-2 text-xs underline" onClick={() => setSel([])}>togli la selezione</button></div>
              {azioniCrea(sel, !!busy)}
            </div>
          )}
        </div>

        <div className="space-y-3 p-4">
          {!dati && <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>}
          {dati && !dati.bonifici.length && (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nessun bonifico da gestire.</div>
          )}
          {dati?.bonifici.map((b) => (
            <div key={b.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {!b.proposta_accettata && (
                  <input type="checkbox" className="size-4 self-center" title="Seleziona per un unico documento con più bonifici"
                    checked={sel.includes(b.id)} onChange={(e) => setSel((x) => e.target.checked ? [...x, b.id] : x.filter((y) => y !== b.id))} />
                )}
                <span className="text-xl font-semibold tabular-nums">{eur(b.importo)}</span>
                <span className="font-medium">{b.ordinante || "—"}</span>
                <span className="ml-auto text-xs text-muted-foreground">{dataOra(b.data)}{b.data_valuta ? ` · valuta ${giorno(b.data_valuta)}` : ""}</span>
              </div>
              <div className="rounded bg-muted/50 px-2 py-1 text-sm"><span className="text-xs text-muted-foreground">Causale: </span>{b.causale || "—"}</div>
              {b.iban && <div className="text-xs text-muted-foreground">IBAN ordinante: <span className="font-mono">{b.iban}</span></div>}

              {b.proposta_accettata ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400/50 bg-amber-500/10 p-2 text-sm">
                  <span>In verifica: <b>{NOME_TIPO[b.proposta_accettata.tipo]} {b.proposta_accettata.numero}</b> {b.proposta_accettata.nome}</span>
                  <Button size="xs" disabled={busy === b.id} onClick={() => accetta(b, b.proposta_accettata!, !!b.proposta_accettata!.manuale)}>
                    <ExternalLink /> Apri e conferma</Button>
                  <Button size="xs" variant="ghost" disabled={busy === b.id} onClick={() => annulla(b)}>Annulla abbinamento</Button>
                </div>
              ) : (
                <>
                  {b.proposte?.length ? b.proposte.map((p, i) => (
                    <div key={i} className={`flex flex-wrap items-center gap-2 rounded-md p-2 text-sm ${p.avviso ? "border border-amber-300 bg-amber-500/5" : i === 0 && (p.punti || 0) >= 90 ? "bg-emerald-500/10" : "bg-muted/40"}`}>
                      <div className="min-w-0 flex-1">
                        <b>{NOME_TIPO[p.tipo]} {p.numero}</b> · {p.nome} · {eur(p.importo)}
                        <span className={`ml-2 rounded px-1 text-[10px] font-semibold ${(p.punti || 0) >= 90 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"}`}>{p.punti}</span>
                        <div className="text-xs text-muted-foreground">{p.perche}</div>
                        {p.avviso && <div className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5" /> {p.avviso}</div>}
                      </div>
                      <Button size="xs" disabled={busy === b.id} onClick={() => accetta(b, p)}><Check /> Accetta il match</Button>
                    </div>
                  )) : (
                    <div className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="size-4" /> Nessun documento riconosciuto da solo: abbinalo a mano o ignoralo
                    </div>
                  )}
                  {azioniCrea(quali(b), busy === b.id)}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Abbina a</span>
                    <select className="h-7 rounded-md border border-input bg-background px-1 text-xs" value={tipoCerca[b.id] || ""}
                      onChange={(e) => setTipoCerca((t) => ({ ...t, [b.id]: e.target.value }))}>
                      <option value="">qualsiasi documento</option><option value="fattura">fattura (anche bozza)</option>
                      <option value="proforma">pro forma</option><option value="ordine">ordine a cliente</option>
                      <option value="sessione">sessione di taratura</option><option value="preventivo">preventivo</option>
                    </select>
                    <Input className="h-7 w-48 text-xs" placeholder="n. documento o cliente"
                      value={cerca[b.id] || ""} onChange={(e) => setCerca((c) => ({ ...c, [b.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") cercaDoc(b); }} />
                    <Button size="xs" variant="outline" onClick={() => cercaDoc(b)}><Search /> Cerca</Button>
                    <Button size="xs" variant="ghost" className="ml-auto" disabled={busy === b.id} onClick={() => ignora(b)}>Ignora…</Button>
                  </div>
                  {trovati[b.id] && (
                    <div className="space-y-1">
                      {!trovati[b.id].length && <div className="text-xs text-muted-foreground">Nessun documento da incassare trovato.</div>}
                      {trovati[b.id].map((p, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-xs">
                          <span className="flex-1"><b>{NOME_TIPO[p.tipo]} {p.numero}</b> · {p.nome} · {eur(p.importo)} · {giorno(p.data)}</span>
                          <Button size="xs" variant="outline" disabled={busy === b.id} onClick={() => accetta(b, p, true)}>Abbina</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {admin && dichiarati.length > 0 && (
            <div className="rounded-lg border border-slate-300 p-3">
              <div className="mb-1 text-sm font-medium">Bonifici dichiarati al banco non ancora riscontrati ({dichiarati.length})</div>
              <ul className="space-y-1 text-xs">
                {dichiarati.map((d) => (
                  <li key={d.id}>
                    <b className="tabular-nums">{eur(d.importo)}</b> · bonifico del {giorno(d.data_bonifico)}{d.ordinante ? ` · ${d.ordinante}` : ""}
                    {d.causale ? ` · ${d.causale}` : ""} → {d.documento_descrizione || d.documento_tipo}
                    <span className="text-muted-foreground"> · dichiarato il {dataOra(d.created_at)} da {d.dichiarato_da || "—"}{d.operatore ? ` (${d.operatore})` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dati?.controlli?.length ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Registro dei controlli</summary>
              <ul className="mt-1 space-y-0.5">
                {dati.controlli.map((c) => (
                  <li key={c.id} className={c.esito !== "ok" ? "text-amber-700 dark:text-amber-300" : ""}>
                    {dataOra(c.eseguito_il)} · {c.origine === "agente_mac" ? "Mac" : c.origine} · {c.esito}
                    {c.esito === "ok" ? ` · ${c.letti} letti, ${c.nuovi} nuovi` : ""}{c.nota ? ` · ${c.nota}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra nella pagina del documento: quietanza proposta + conferma definitiva dell'operatore
function BarraConferma({ id, onFine }: { id: string; onFine: () => void }) {
  const router = useRouter();
  const [b, setB] = useState<Bonifico | null>(null);
  const [operatore, setOperatore] = useOperatore();
  const [sdi, setSdi] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bonDettaglio(id).then((r) => {
      if (!r.bonifico.proposta_accettata || !["nuovo", "abbinato"].includes(r.bonifico.stato)) onFine();
      else setB(r.bonifico);
    }).catch(() => onFine());
  }, [id, onFine]);
  if (!b || !b.proposta_accettata) return null;
  const p = b.proposta_accettata;
  const acconto = p.tipo === "ordine" && Number(b.importo) + 0.005 < Number(p.importo);
  const conSdi = ["bozza", "proforma", "pf", "ordine", "preventivo"].includes(p.tipo);

  async function conferma(extra: { emetti?: boolean; crea_fattura?: boolean } = {}) {
    if (!operatore) { toast.error("Scegli l'operatore prima di confermare"); return; }
    setBusy(true);
    try {
      const r = await bonConferma(id, { operatore, emetti: sdi, ...extra });
      toast.success(r.bonifico.esito || "Bonifico abbinato");
      if (r.invio && !r.invio.ok) toast.warning(`Invio allo SdI non riuscito: ${r.invio.errore || ""}`, { duration: 15000 });
      onFine();
      aggiorna();
      if (r.fattura_id) router.push(`/fatturazione?id=${r.fattura_id}`);
      else window.location.reload();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  async function annulla() {
    setBusy(true);
    try { await bonAnnullaAccettazione(id); onFine(); aggiorna(); } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-amber-500 bg-amber-50 px-3 py-2 shadow-2xl dark:bg-amber-950/90 print:hidden lg:left-64">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            Bonifico {eur(b.importo)} da {b.ordinante || "—"} → {NOME_TIPO[p.tipo]} {p.numero} {p.nome ? `(${p.nome})` : ""} {eur(p.importo)}
          </div>
          <div className="text-xs text-muted-foreground">
            Quietanza: <b>bonifico</b> · valuta {giorno(b.data_valuta || b.data)} · rif. SumUp {b.codice.split(":").pop()} · causale «{b.causale || "—"}»
            {Math.abs(Number(b.importo) - Number(p.importo)) > 0.005 && <span className="ml-1 font-semibold text-red-700 dark:text-red-300">· importo diverso dal documento: verifica!</span>}
          </div>
        </div>
        <SceltaOperatore className="w-72" value={operatore} onChange={setOperatore} compatto />
        {conSdi && (
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={sdi} onChange={(e) => setSdi(e.target.checked)} /> invia subito allo SdI</label>
        )}
        <div className="flex flex-wrap gap-1.5">
          {p.tipo === "bozza" && <Button size="sm" disabled={busy} onClick={() => conferma()}>{busy ? <Loader2 className="animate-spin" /> : <Check />} {sdi ? "Emetti e invia" : "Quietanza (emetto dopo)"}</Button>}
          {p.tipo === "fattura" && <Button size="sm" disabled={busy} onClick={() => conferma()}><Check /> Conferma incasso</Button>}
          {p.tipo === "fatture" && <Button size="sm" disabled={busy} onClick={() => conferma()}><Check /> Conferma incasso delle fatture</Button>}
          {(p.tipo === "proforma" || p.tipo === "pf") && <Button size="sm" disabled={busy} onClick={() => conferma()}><Check /> Trasforma in fattura</Button>}
          {p.tipo === "sessione" && <>
            <Button size="sm" disabled={busy} onClick={() => conferma({ crea_fattura: false })}><Check /> Registra incasso</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => conferma({ crea_fattura: true })}>Incasso + fattura quietanzata</Button>
          </>}
          {p.tipo === "ordine" && <Button size="sm" disabled={busy} onClick={() => conferma()}><Check /> Registra {acconto ? "acconto" : "saldo"} con fattura</Button>}
          {p.tipo === "preventivo" && <Button size="sm" disabled={busy} onClick={() => conferma()}><Check /> Converti in ordine e registra incasso</Button>}
          <Button size="sm" variant="ghost" disabled={busy} onClick={annulla}>Non corrisponde</Button>
          <Link href="#" onClick={(e) => { e.preventDefault(); onFine(); }} className="self-center text-xs underline">Nascondi</Link>
        </div>
      </div>
    </div>
  );
}
