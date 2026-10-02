"use client";

// BANCO ASSISTENZA — come la schermata «SCHEDA ASSISTENZA» di FileMaker: elenco a sinistra, la scheda intera a destra,
// pulsantiera delle fasi in alto (RICEVUTA · PREVENTIVO · AGGIORNAMENTO · ACCETTATO/RIFIUTATO · PRONTO · PAGATO · CONSEGNA),
// stampa (A4 del banco + etichetta Brother), «Stesso modello», decodifica seriale, spedizione UPS e vendita collegata.
// Tastiera: F2 o Alt+N nuova scheda · «/» cerca · Alt+← / Alt+→ scheda precedente/successiva · Ctrl/Cmd+S salva · Esc chiude.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Copy, FileText, Loader2, Mail, Package, Plus, Printer, RefreshCw, Save, Search, Send, ShoppingCart, Tag, Trash2, Truck, Wrench, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { toastErrore } from "@/lib/errori";
import {
  assAnteprimaMail, assAzione, assClienti, assConfig, assContatori, assCrea, assElenco, assEtichettaUrl, assListino, assModifica, assPdfUrl,
  assPerNumero, assPreventivi, assTrackUrl, assScheda, assSeriale, assSetConfig, assStessoModello, COLORE_STATO, dataOra, ETICHETTA_STATO, eur, FASI,
  type Anagrafica, type ConfigAssistenza, type Coppia, type Scheda, type SchedaBreve, type Seriale, type VoceListino,
} from "@/lib/assistenza";
import { parseEstimate, total, totalWith, type EstimateLine } from "@/lib/assistenza-preventivo";

const campo = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-70";
const area = "w-full rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-70";
const etich = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

function Badge({ stato }: { stato: string }) {
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold ${COLORE_STATO[stato] || ""}`}>{ETICHETTA_STATO[stato] || stato}</span>;
}

function Modale({ titolo, onClose, children, largo = false }: { titolo: string; onClose: () => void; children: React.ReactNode; largo?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 md:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`w-full ${largo ? "max-w-4xl" : "max-w-xl"} rounded-lg border bg-background p-4 shadow-xl`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{titolo}</h2>
          <button onClick={onClose} aria-label="Chiudi" className="rounded p-1 hover:bg-muted"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function Banco() {
  const router = useRouter();
  const sp = useSearchParams();
  const [cfg, setCfg] = useState<ConfigAssistenza | null>(null);
  const [operatore, setOperatore] = useOperatore();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("aperte");
  const [elenco, setElenco] = useState<SchedaBreve[] | null>(null);
  const [totale, setTotale] = useState(0);
  const [contatori, setContatori] = useState<Record<string, number>>({});
  const [salto, setSalto] = useState("");
  const [nuova, setNuova] = useState(false);
  const cerca = useRef<HTMLInputElement>(null);
  const idLink = sp.get("id");
  const [apertaLocale, setAperta] = useState<string | null>(null);
  const aperta = apertaLocale ?? idLink;

  useEffect(() => { assConfig().then(setCfg).catch(() => undefined); }, []);
  const carica = useCallback(() => {
    assElenco(q, filtro).then((r) => { setElenco(r.schede); setTotale(r.totale); }).catch((e) => { toastErrore(e); setElenco([]); });
    assContatori().then((r) => setContatori(r.contatori)).catch(() => undefined);
  }, [q, filtro]);
  useEffect(() => { const t = setTimeout(carica, 250); return () => clearTimeout(t); }, [carica]);
  useEffect(() => {
    const n = sp.get("n");
    if (n) assPerNumero(n).then((r) => setAperta(r.id)).catch(toastErrore);
  }, [sp]);

  const apri = useCallback((id: string) => { setAperta(id); router.replace(`/assistenza?id=${id}`); }, [router]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const scrivendo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "F2" || (e.altKey && (e.key === "n" || e.key === "N" || e.code === "KeyN"))) { e.preventDefault(); setNuova(true); }
      else if (e.key === "/" && !scrivendo) { e.preventDefault(); cerca.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  async function salta() {
    if (!salto.trim()) return;
    try {
      const r = await assPerNumero(salto.trim());
      if (!r.esatta) toast.info(`La scheda ${salto} non c'è: aperta la più vicina (${r.sigla})`);
      apri(r.id); setSalto("");
    } catch (e) { toastErrore(e); }
  }

  if (cfg && !cfg.visibile) {
    return <div className="p-6 text-muted-foreground">Le schede di assistenza sono in prova: per ora le vede solo il titolare.</div>;
  }

  return (
    <div className="space-y-2 p-1 md:p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="size-6" />
        <h1 className="mr-2 text-2xl font-semibold">Schede di assistenza</h1>
        {cfg && !cfg.numerazione_live && (
          <span className="rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            title="FileMaker è ancora in uso: le schede nuove hanno numeri da 900001, le mail vanno solo all'indirizzo di prova e i WhatsApp non partono">
            PROVA · numeri da 900001 · mail solo a {cfg.email_test} · WhatsApp spenti
          </span>
        )}
        {cfg?.admin && (
          <label className="ml-auto flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={cfg.operatori_abilitati}
              onChange={(e) => assSetConfig({ operatori_abilitati: e.target.checked }).then((c) => { setCfg(c); toast.success(c.operatori_abilitati ? "Ora la vedono anche gli operatori" : "Di nuovo solo per il titolare"); }).catch(toastErrore)} />
            Visibile agli operatori
          </label>
        )}
        <Button className={cfg?.admin ? "" : "ml-auto"} onClick={() => setNuova(true)} title="F2 o Alt+N"><Plus className="mr-1 size-4" />NUOVO</Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
        {/* elenco */}
        <Card className="flex max-h-[calc(100vh-8rem)] flex-col gap-2 p-2">
          <div className="flex gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
              <Input ref={cerca} className="h-8 pl-7" placeholder="Cerca: cliente, seriale, «air 2020 logica»…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Input className="h-8 w-24" placeholder="N. scheda" value={salto} onChange={(e) => setSalto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") salta(); }} inputMode="numeric" />
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            {([["aperte", "Aperte"], ["da_preventivare", "Da preventivare"], ["preventivo_inviato", "Prev. inviato"], ["accettato", "In lavorazione"],
              ["rifiutato", "Rifiutate"], ["pronto", "Pronte"], ["in_arrivo", "In arrivo"], ["consegnato", "Consegnate"], ["tutte", "Tutte"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => { setFiltro(k); setElenco(null); }}
                className={`rounded-full border px-2 py-0.5 ${filtro === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {l}{contatori[k] ? ` ${contatori[k]}` : ""}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">{elenco ? `${totale.toLocaleString("it-IT")} schede${totale > elenco.length ? ` (le ${elenco.length} più recenti)` : ""}` : "…"}</div>
          <div className="-mx-2 flex-1 overflow-y-auto">
            {elenco === null && <div className="p-4 text-center"><Loader2 className="inline size-4 animate-spin" /></div>}
            {elenco?.map((s) => (
              <button key={s.id} onClick={() => apri(s.id)}
                className={`block w-full border-t px-3 py-1.5 text-left text-sm hover:bg-muted/60 ${aperta === s.id ? "bg-primary/10" : ""}`}>
                <div className="flex items-center gap-2">
                  <b className="tabular-nums">{s.sigla}</b>
                  <span className="truncate">{s.azienda || s.nominativo}</span>
                  <span className="ml-auto"><Badge stato={s.stato} /></span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{s.prodotto}{s.difetto ? ` · ${s.difetto}` : ""}</div>
              </button>
            ))}
          </div>
        </Card>

        {/* scheda */}
        <div>
          {aperta ? <SchedaView key={aperta} id={aperta} operatore={operatore} setOperatore={setOperatore} admin={!!cfg?.admin}
            onApri={apri} onCambiata={carica} />
            : <Card className="p-8 text-center text-muted-foreground">Scegli una scheda dall&apos;elenco, scrivi il numero, oppure <b>NUOVO</b> (F2).</Card>}
        </div>
      </div>
      {nuova && <NuovaScheda operatore={operatore} setOperatore={setOperatore} onClose={() => setNuova(false)}
        onCreata={(s) => { setNuova(false); carica(); apri(s.id); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NUOVA SCHEDA

function CercaCliente({ onScelto }: { onScelto: (a: Anagrafica) => void }) {
  const [q, setQ] = useState("");
  const [r, setR] = useState<Anagrafica[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setR([]); return; }
      assClienti(q).then((x) => setR(x.clienti)).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <Input className="h-8" placeholder="Cerca in rubrica: nome, telefono, email, P.IVA" value={q} onChange={(e) => setQ(e.target.value)} />
      {r.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
          {r.map((a) => (
            <button key={a.id} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { onScelto(a); setQ(""); setR([]); }}>
              <b>{a.denominazione}</b> <span className="text-xs text-muted-foreground">{[a.telefono, a.email, a.piva].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NuovaScheda({ operatore, setOperatore, onClose, onCreata }: {
  operatore: string; setOperatore: (o: "CHR" | "VALE" | "DUMY" | "ALTRO") => void; onClose: () => void; onCreata: (s: Scheda) => void;
}) {
  const [f, setF] = useState<Record<string, string>>({});
  const [anag, setAnag] = useState<Anagrafica | null>(null);
  const [stampaA4, setStampaA4] = useState(true);
  const [stampaEt, setStampaEt] = useState(true);
  const [ricevuta, setRicevuta] = useState(false);
  const [inArrivo, setInArrivo] = useState(false);
  const [ser, setSer] = useState<Seriale | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const primo = useRef<HTMLInputElement>(null);
  useEffect(() => { primo.current?.focus(); }, []);

  async function decodifica() {
    if (!f.seriale) return;
    try {
      const r = await assSeriale(f.seriale);
      setSer(r);
      if (r.modello && !f.modello) set("modello", r.modello);
      if (r.famiglia && !f.prodotto) set("prodotto", r.famiglia);
    } catch (e) { toastErrore(e); }
  }
  async function crea() {
    if (!operatore) { toast.error("Scegli l'operatore"); return; }
    setBusy(true);
    try {
      const s = await assCrea({ ...f, operatore, anagrafica_id: anag?.id, in_arrivo: inArrivo, invia_ricevuta: ricevuta,
        stampa: inArrivo ? {} : { accettazione: stampaA4, etichetta: stampaEt } });
      toast.success(`Scheda ${s.sigla} creata${stampaA4 && !inArrivo ? " · stampa in coda" : ""}`);
      onCreata(s);
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  const C = (k: string, l: string, extra: React.ComponentProps<"input"> = {}) => (
    <label className="block"><span className={etich}>{l}</span><input className={campo} value={f[k] || ""} onChange={(e) => set(k, e.target.value)} {...extra} /></label>
  );
  return (
    <Modale titolo="Nuova scheda di assistenza" onClose={onClose} largo>
      <div className="grid gap-4 md:grid-cols-2" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") crea(); }}>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Cliente</div>
          <CercaCliente onScelto={(a) => { setAnag(a); setF((x) => ({ ...x, azienda: a.denominazione, telefono: a.telefono || x.telefono || "", email: a.email || x.email || "",
            referente: a.referente || x.referente || "", indirizzo_spedizione: [a.indirizzo, a.cap, a.comune, a.provincia].filter(Boolean).join(" ") || x.indirizzo_spedizione || "" })); }} />
          {anag && <div className="text-xs text-emerald-700">Collegata alla rubrica: <b>{anag.denominazione}</b> <button className="underline" onClick={() => setAnag(null)}>scollega</button></div>}
          {C("azienda", "Azienda / cliente *", { ref: primo })}
          {C("nominativo", "Nominativo")}
          <div className="grid grid-cols-2 gap-2">{C("telefono", "Telefono")}{C("email", "E-mail", { type: "email" })}</div>
          <div className="grid grid-cols-2 gap-2">{C("referente", "Referente")}{C("telefono_referente", "Tel. referente")}</div>
          {!anag && C("piva", "P.IVA (per non creare doppioni)")}
          {C("indirizzo_spedizione", "Indicazioni di spedizione")}
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold">Dispositivo</div>
          {C("prodotto", "Prodotto * (es. MACBOOK AIR 13\" RETINA)")}
          <div className="flex items-end gap-1">
            <div className="flex-1">{C("seriale", "Numero di serie", { onBlur: decodifica })}</div>
            <Button size="sm" variant="outline" onClick={decodifica} title="Decodifica il seriale">Decodifica</Button>
          </div>
          {ser && <div className="rounded border bg-muted/40 p-1.5 text-xs">{ser.modello ? <>Modello: <b>{ser.modello}</b> ({ser.visti} visti al banco)</> : ser.nota}
            {ser.precedenti.length > 0 && <div className="mt-1 text-amber-800">⚠️ Già passato dal banco: {ser.precedenti.map((p) => p.sigla).join(", ")}</div>}</div>}
          {C("modello", "Modello Apple")}
          <div className="grid grid-cols-2 gap-2">{C("imei", "IMEI")}{C("password_dispositivo", "Codice / password")}</div>
          <div className="grid grid-cols-2 gap-2">{C("apple_id", "Apple ID")}{C("password_apple_id", "Password Apple ID")}</div>
          {C("accessori", "Accessori consegnati")}
          <label className="block"><span className={etich}>Difetto indicato</span>
            <textarea className={area} rows={3} value={f.difetto || ""} onChange={(e) => set("difetto", e.target.value)} /></label>
        </div>
      </div>
      <div className="mt-3 space-y-2 border-t pt-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={inArrivo} onChange={(e) => setInArrivo(e.target.checked)} />Il dispositivo arriva col corriere (scheda «in arrivo»)</label>
          {!inArrivo && <>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={stampaA4} onChange={(e) => setStampaA4(e.target.checked)} /><Printer className="size-4" />Stampa accettazione (A4)</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={stampaEt} onChange={(e) => setStampaEt(e.target.checked)} /><Tag className="size-4" />Etichetta (Brother)</label>
          </>}
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={ricevuta} onChange={(e) => setRicevuta(e.target.checked)} /><Mail className="size-4" />Mail RICEVUTA d&apos;ingresso</label>
        </div>
        <SceltaOperatore value={operatore as "CHR"} onChange={setOperatore} compatto />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={busy || !operatore} onClick={crea} title="Ctrl/Cmd+Invio">{busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}Crea scheda</Button>
        </div>
      </div>
    </Modale>
  );
}

// ---------------------------------------------------------------------------
// LA SCHEDA

type Bozza = Partial<Scheda>;
type CampoTesto = keyof Scheda;

function SchedaView({ id, operatore, setOperatore, admin, onApri, onCambiata }: {
  id: string; operatore: string; setOperatore: (o: "CHR" | "VALE" | "DUMY" | "ALTRO") => void; admin: boolean;
  onApri: (id: string) => void; onCambiata: () => void;
}) {
  const router = useRouter();
  const [s, setS] = useState<Scheda | null>(null);
  const [b, setB] = useState<Bozza>({});
  const [busy, setBusy] = useState("");
  const [dialogo, setDialogo] = useState<null | "mail" | "pronto" | "spedizione" | "stesso" | "consegna" | "esito">(null);
  const [mailTipo, setMailTipo] = useState("preventivo");
  const [mostraPw, setMostraPw] = useState(false);
  const [ser, setSer] = useState<Seriale | null>(null);

  const ricarica = useCallback(() => assScheda(id).then((x) => { setS(x); setB({}); }).catch(toastErrore), [id]);
  useEffect(() => { ricarica(); }, [ricarica]);
  const sporca = Object.keys(b).length > 0;
  const v = <K extends keyof Scheda>(k: K): Scheda[K] | undefined => (k in b ? (b as Scheda)[k] : s?.[k]);
  const set = (k: keyof Scheda, val: unknown) => setB((x) => ({ ...x, [k]: val }));
  const ro = !!s?.sola_lettura || s?.stato === "annullata";

  const salva = useCallback(async (silenzioso = false): Promise<boolean> => {
    if (!s || !sporca) return true;
    try {
      const n = await assModifica(s.id, { ...b, operatore });
      setS(n); setB({});
      if (!silenzioso) toast.success("Salvata");
      onCambiata();
      return true;
    } catch (e) { toastErrore(e); return false; }
  }, [s, b, sporca, operatore, onCambiata]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); salva(); }
      if (e.altKey && e.key === "ArrowLeft" && s?.precedente) { e.preventDefault(); onApri(s.precedente.id); }
      if (e.altKey && e.key === "ArrowRight" && s?.successiva) { e.preventDefault(); onApri(s.successiva.id); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [salva, s, onApri]);

  async function azione(nome: string, body: Record<string, unknown>, msg: string) {
    if (!s) return null;
    if (!operatore) { toast.error("Scegli l'operatore"); return null; }
    if (sporca && !(await salva(true))) return null;
    setBusy(nome);
    try {
      const r = await assAzione(s.id, nome, { operatore, ...body });
      const esito = (r && (r.esito || r.esiti)) as { mail?: string; whatsapp?: string } | undefined;
      toast.success(msg + (esito?.mail ? ` · mail ${esito.mail}` : "") + (esito?.whatsapp ? ` · WhatsApp ${esito.whatsapp}` : ""), { duration: 7000 });
      await ricarica(); onCambiata();
      return r;
    } catch (e) { toastErrore(e); return null; } finally { setBusy(""); }
  }
  async function stampa(tipo: "accettazione" | "interna" | "etichetta") {
    if (!s) return;
    try {
      const r = await assAzione(s.id, "stampa", { tipo, copie: 1 });
      toast.success(r.agente_attivo ? `In stampa al banco (${tipo})` : "Messa in coda, ma l'agente di stampa non risponde: apro il PDF");
      if (!r.agente_attivo) window.open(tipo === "etichetta" ? assEtichettaUrl(s.id) : assPdfUrl(s.id, tipo === "interna" ? "interna" : "cliente"), "_blank");
    } catch (e) { toastErrore(e); }
  }
  async function vendi(tipo: "scontrino" | "fattura" | "ordine") {
    if (!s) return;
    if (sporca && !(await salva(true))) return;
    if (tipo === "scontrino") { router.push(`/cassa?scheda=${s.id}`); return; }
    const r = await azione("vendi", { tipo }, tipo === "fattura" ? "Fattura in bozza creata" : "Ordine cliente creato");
    if (r?.url) router.push(r.url);
  }
  async function decodifica() {
    const x = String(v("seriale") || "");
    if (!x) return;
    try { const r = await assSeriale(x); setSer(r); if (r.modello && !v("modello")) set("modello", r.modello); } catch (e) { toastErrore(e); }
  }

  if (!s) return <Card className="p-8 text-center"><Loader2 className="inline size-5 animate-spin" /></Card>;
  const righe: EstimateLine[] = (v("preventivo_righe") as EstimateLine[]) || [];
  const Tx = (k: CampoTesto, l: string, tipo = "text") => (
    <label className="block min-w-0"><span className={etich}>{l}</span>
      <input className={campo} type={tipo} disabled={ro} value={(v(k) as string) || ""} onChange={(e) => set(k, e.target.value)} /></label>
  );
  const Ta = (k: CampoTesto, l: string, rows = 3) => (
    <label className="block"><span className={etich}>{l}</span>
      <textarea className={area} rows={rows} disabled={ro} value={(v(k) as string) || ""} onChange={(e) => set(k, e.target.value)} /></label>
  );
  const fasi = s.fasi || {};
  const st = s.stato;

  return (
    <div className="space-y-2">
      {/* testata */}
      <Card className="flex flex-wrap items-center gap-2 p-2">
        <Button size="icon-xs" variant="outline" disabled={!s.precedente} onClick={() => s.precedente && onApri(s.precedente.id)} title="Precedente (Alt+←)"><ArrowLeft /></Button>
        <span className="text-2xl font-bold tabular-nums">{s.sigla}</span>
        <Button size="icon-xs" variant="outline" disabled={!s.successiva} onClick={() => s.successiva && onApri(s.successiva.id)} title="Successiva (Alt+→)"><ArrowRight /></Button>
        <Badge stato={st} />
        {s.ritirato && <span className="text-xs text-muted-foreground">{s.ritirato}</span>}
        {s.sola_lettura && <span className="rounded bg-slate-200 px-1.5 text-xs dark:bg-slate-700">storica FileMaker · sola lettura</span>}
        {s.origine === "prova" && <span className="rounded bg-amber-200 px-1.5 text-xs text-amber-900">scheda di PROVA</span>}
        <span className="text-xs text-muted-foreground">creata {dataOra(s.created_at)}{s.operatore_accettazione ? ` · ${s.operatore_accettazione}` : ""}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={ricarica} title="Ricarica"><RefreshCw /></Button>
          {!ro && <Button size="sm" disabled={!sporca} onClick={() => salva()} title="Ctrl/Cmd+S"><Save className="mr-1" />Salva{sporca ? " *" : ""}</Button>}
        </div>
        <div className="w-full"><SceltaOperatore value={operatore as "CHR"} onChange={setOperatore} compatto /></div>
      </Card>

      {/* pulsantiera FileMaker */}
      {!ro && (
        <Card className="flex flex-wrap gap-1.5 p-2">
          {st === "in_arrivo" && <Button size="sm" disabled={!!busy} onClick={() => azione("arrivato", {}, "Dispositivo arrivato")}><Package className="mr-1" />ARRIVATO</Button>}
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { setMailTipo("ricevuta"); setDialogo("mail"); }}><Mail className="mr-1" />RICEVUTA</Button>
          <Button size="sm" variant={st === "da_preventivare" ? "default" : "outline"} disabled={!!busy || st === "in_arrivo"} onClick={() => { setMailTipo("preventivo"); setDialogo("mail"); }}><Send className="mr-1" />PREVENTIVO</Button>
          <Button size="sm" variant="outline" disabled={!!busy || st === "in_arrivo"} onClick={() => { setMailTipo("aggiornamento"); setDialogo("mail"); }}>AGGIORNAMENTO</Button>
          <Button size="sm" variant={st === "preventivo_inviato" ? "default" : "outline"} disabled={!!busy || !s.preventivo_testo} onClick={() => setDialogo("esito")}>ACCETTATO / RIFIUTATO</Button>
          <Button size="sm" variant={st === "accettato" || st === "rifiutato" ? "default" : "outline"} disabled={!!busy || st === "in_arrivo"} onClick={() => setDialogo("pronto")}>PRONTO</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => azione("pagamento", {}, "Pagamento registrato")}>PAGATO</Button>
          <Button size="sm" variant={st === "pronto" ? "default" : "outline"} disabled={!!busy || st === "consegnato"} onClick={() => setDialogo("consegna")}>CONSEGNA</Button>
          <span className="mx-1 w-px bg-border" />
          <Button size="sm" variant="outline" onClick={() => setDialogo("spedizione")}><Truck className="mr-1" />UPS</Button>
          <Button size="sm" variant="outline" onClick={() => vendi("scontrino")} title="Apre la cassa con le righe della scheda"><ShoppingCart className="mr-1" />Scontrino</Button>
          <Button size="sm" variant="outline" disabled={!!s.fattura_id || !!busy} onClick={() => vendi("fattura")}><FileText className="mr-1" />Fattura</Button>
          <Button size="sm" variant="outline" disabled={!!s.documento_id || !!busy} onClick={() => vendi("ordine")}>Ordine</Button>
        </Card>
      )}
      <Card className="flex flex-wrap items-center gap-1.5 p-2 text-sm">
        <Printer className="size-4" />
        <Button size="xs" variant="outline" onClick={() => stampa("accettazione")}>Stampa A4</Button>
        <Button size="xs" variant="outline" onClick={() => stampa("interna")}>Stampa interna</Button>
        <Button size="xs" variant="outline" onClick={() => stampa("etichetta")}>Etichetta</Button>
        <a className="text-xs underline" href={assPdfUrl(s.id)} target="_blank" rel="noreferrer">PDF cliente</a>
        <a className="text-xs underline" href={assPdfUrl(s.id, "interna")} target="_blank" rel="noreferrer">PDF interno</a>
        <a className="text-xs underline" href={assTrackUrl(s.token_pubblico)} target="_blank" rel="noreferrer" title="Pagina pubblica per il cliente (senza dati personali)">pagina per il cliente</a>
        <span className="ml-auto" />
        <Button size="xs" variant="outline" onClick={() => setDialogo("stesso")}><Copy />Stesso modello</Button>
        {!ro && <Button size="xs" variant="outline" onClick={async () => {
          if (!operatore) { toast.error("Scegli l'operatore"); return; }
          try { const n = await assAzione(s.id, "duplica", { operatore, stesso_dispositivo: confirm("Stesso dispositivo? (OK = sì, Annulla = solo stesso cliente)") }); toast.success(`Nuova scheda ${n.sigla}`); onCambiata(); onApri(n.id); }
          catch (e) { toastErrore(e); }
        }}>DUPLICA</Button>}
        {st === "consegnato" && !ro && <Button size="xs" variant="outline" onClick={() => azione("riapri", {}, "Scheda riaperta")}>Riapri</Button>}
        {admin && !ro && <Button size="xs" variant="ghost" className="text-red-700" onClick={() => {
          const m = prompt("Motivo dell'annullamento della scheda?");
          if (m !== null) azione("annulla", { motivo: m }, "Scheda annullata");
        }}><Trash2 />Annulla</Button>}
      </Card>

      <div className="grid gap-2 xl:grid-cols-2">
        {/* dispositivo */}
        <Card className="space-y-2 p-3">
          <div className="text-sm font-semibold">Dispositivo</div>
          {Tx("prodotto", "Prodotto")}
          <div className="flex items-end gap-1">
            <div className="flex-1">{Tx("seriale", "Numero di serie")}</div>
            <Button size="sm" variant="outline" onClick={decodifica}>Decodifica</Button>
          </div>
          {ser && <div className="rounded border bg-muted/40 p-1.5 text-xs">{ser.modello ? <>Modello: <b>{ser.modello}</b> · famiglia {ser.famiglia} ({ser.visti} visti)</> : ser.nota}
            {ser.precedenti.filter((p) => p.id !== s.id).length > 0 && <div className="mt-1">Già passato: {ser.precedenti.filter((p) => p.id !== s.id).map((p) =>
              <button key={p.id} className="mr-1 underline" onClick={() => onApri(p.id)}>{p.sigla}</button>)}</div>}
            {ser.prezzi && ser.prezzi.length > 0 && <div className="mt-1 text-muted-foreground">Prezzi mediani: {ser.prezzi.slice(0, 6).map((p) => `${p.intervention} ${eur(p.price)}`).join(" · ")}</div>}</div>}
          {Tx("modello", "Modello Apple")}
          <div className="grid grid-cols-2 gap-2">{Tx("imei", "Specifiche - IMEI")}{Tx("anno_garanzia", "Anno garanzia")}</div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block"><span className={etich}>Codice/password</span>
              <input className={campo} type={mostraPw ? "text" : "password"} disabled={ro} value={(v("password_dispositivo") as string) || ""} onChange={(e) => set("password_dispositivo", e.target.value)} /></label>
            {Tx("apple_id", "Apple ID")}
            <label className="block"><span className={etich}>Password Apple ID</span>
              <input className={campo} type={mostraPw ? "text" : "password"} disabled={ro} value={(v("password_apple_id") as string) || ""} onChange={(e) => set("password_apple_id", e.target.value)} /></label>
          </div>
          <button className="text-xs underline" onClick={() => setMostraPw((x) => !x)}>{mostraPw ? "nascondi" : "mostra"} codici</button>
          {Tx("accessori", "Accessori / note dispositivo")}
          {Ta("difetto", "Difetto indicato", 3)}
        </Card>

        {/* cliente */}
        <Card className="space-y-2 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">Cliente
            {s.anagrafica ? <span className="text-xs font-normal text-emerald-700">in rubrica: {s.anagrafica.denominazione}{s.anagrafica.piva ? ` · P.IVA ${s.anagrafica.piva}` : ""}</span>
              : <span className="text-xs font-normal text-muted-foreground">non collegato alla rubrica</span>}</div>
          {!ro && <CercaCliente onScelto={(a) => { set("anagrafica_id", a.id); set("azienda", a.denominazione); if (a.telefono) set("telefono", a.telefono); if (a.email) set("email", a.email); }} />}
          <div className="grid grid-cols-2 gap-2">{Tx("azienda", "Azienda")}{Tx("nominativo", "Nominativo")}</div>
          <div className="grid grid-cols-2 gap-2">{Tx("telefono", "Telefono")}{Tx("email", "E-mail")}</div>
          <div className="grid grid-cols-2 gap-2">{Tx("referente", "Referente")}{Tx("telefono_referente", "Tel.")}</div>
          {Tx("note", "Note (visibili al cliente)")}
          {Tx("indirizzo_spedizione", "Indicazioni di spedizione")}
          {Ta("note_interne", "Note interne di lavorazione (mai al cliente)", 2)}
        </Card>

        {/* preventivo */}
        <Card className="space-y-2 p-3 xl:col-span-2">
          <EditorPreventivo righe={righe} ro={ro} onChange={(r) => set("preventivo_righe", r)} testoStorico={s.preventivo_righe?.length ? null : s.preventivo_testo}
            dataPreventivo={fasi.preventivo?.il} esito={s.preventivo_esito} acconto={v("acconto") as number | null}
            onAcconto={(x) => set("acconto", x)} />
        </Card>

        {/* lavorazione */}
        <Card className="space-y-2 p-3 xl:col-span-2">
          <div className="text-sm font-semibold">Lavorazione effettuata</div>
          <div className="grid gap-2 md:grid-cols-[1fr_260px]">
            {Ta("lavorazione", "Lavorazione", 4)}
            <div className="space-y-2">
              <label className="block"><span className={etich}>Totale lavorazione €</span>
                <input className={campo} inputMode="decimal" disabled={ro} value={v("totale_lavorazione") ?? ""} onChange={(e) => set("totale_lavorazione", e.target.value.replace(",", "."))} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className={etich}>Esito</span>
                  <select className={campo} disabled={ro} value={(v("esito") as string) || ""} onChange={(e) => set("esito", e.target.value)}>
                    <option value="" /><option>EFFETTUATO</option><option>NEGATIVO</option><option>DA ULTIMARE</option></select></label>
                {Tx("tecnico", "Tecnico")}
              </div>
              <div className="text-xs">TOTALE <b>{eur(v("totale_lavorazione") ?? s.preventivo_totale)}</b> · acconto {eur(v("acconto") || 0)} · SALDO{" "}
                <b>{eur(Number(v("totale_lavorazione") ?? s.preventivo_totale ?? 0) - Number(v("acconto") || 0))}</b></div>
            </div>
          </div>
        </Card>

        {/* timeline */}
        <Card className="p-3">
          <div className="mb-1 text-sm font-semibold">Fasi</div>
          <table className="w-full text-sm">
            <tbody>
              {FASI.map(([k, l]) => (
                <tr key={k} className="border-t"><td className="py-1 pr-2">{l}</td><td className="tabular-nums">{dataOra(fasi[k]?.il) || <span className="text-muted-foreground">—</span>}</td>
                  <td className="text-xs">{fasi[k]?.operatore || ""}</td><td className="text-xs text-muted-foreground">{fasi[k]?.sede || ""}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 space-y-0.5 text-xs">
            {s.collegamenti?.scontrino && <div>Scontrino: {eur(s.collegamenti.scontrino.totale)} ({s.collegamenti.scontrino.stato})</div>}
            {s.collegamenti?.fattura && <div>Fattura: <Link className="underline" href={`/fatturazione?id=${s.collegamenti.fattura.id}`}>{s.collegamenti.fattura.numero || "bozza"}</Link> {eur(s.collegamenti.fattura.totale)} ({s.collegamenti.fattura.stato})</div>}
            {s.collegamenti?.documento && <div>Ordine: <Link className="underline" href={`/ordini?id=${s.collegamenti.documento.id}`}>{s.collegamenti.documento.sigla}</Link> ({s.collegamenti.documento.stato})</div>}
            {s.spedizioni.map((x) => <div key={x.id}>UPS {x.direction}{x.test_mode ? " (prova)" : ""}: {x.tracking_url ? <a className="underline" href={x.tracking_url} target="_blank" rel="noreferrer">{x.tracking}</a> : x.tracking}
              {x.pickup_prn ? ` · ritiro ${x.pickup_prn}` : ""} · <a className="underline" href={`/api/backend/api/shipments/${x.id}/label-pdf`} target="_blank" rel="noreferrer">etichetta</a></div>)}
          </div>
        </Card>
        <Card className="max-h-72 overflow-y-auto p-3">
          <div className="mb-1 text-sm font-semibold">Registro</div>
          {s.eventi.length === 0 && <div className="text-xs text-muted-foreground">{s.sola_lettura ? "Scheda storica: le fasi vengono da FileMaker." : "Nessun evento"}</div>}
          {s.eventi.map((e) => (
            <div key={e.id} className="border-t py-1 text-xs"><span className="tabular-nums text-muted-foreground">{dataOra(e.created_at)}</span> {e.operatore ? <b>{e.operatore}</b> : null} {e.descrizione}</div>
          ))}
        </Card>
      </div>

      {dialogo === "mail" && <DialogoMail s={s} tipo={mailTipo} busy={!!busy} onClose={() => setDialogo(null)}
        onInvia={async (body) => {
          const nome = mailTipo === "ricevuta" ? "ricevuta" : "preventivo";
          const corpo = mailTipo === "ricevuta" ? body : { ...body, tipo: mailTipo, righe };
          if (await azione(nome, corpo, mailTipo === "ricevuta" ? "Ricevuta" : mailTipo === "aggiornamento" ? "Aggiornamento preventivo" : "Preventivo")) setDialogo(null);
        }} />}
      {dialogo === "esito" && <Modale titolo="Risposta del cliente al preventivo" onClose={() => setDialogo(null)}>
        <div className="space-y-2">
          {righe.filter((r) => r.opt != null).map((r, i) => (
            <Button key={i} className="w-full justify-start" variant="outline" onClick={async () => { if (await azione("esito-preventivo", { esito: "accettato", ipotesi: r.opt }, `Accettata la ${i + 1}° ipotesi`)) setDialogo(null); }}>
              ACCETTA {i + 1}° IPOTESI — {r.t} ({eur(totalWith(righe, r.opt as number))})</Button>
          ))}
          <Button className="w-full" onClick={async () => { if (await azione("esito-preventivo", { esito: "accettato" }, "Preventivo accettato")) setDialogo(null); }}>
            ACCETTATO ({eur(total(righe))})</Button>
          <Button className="w-full" variant="outline" onClick={async () => { if (await azione("esito-preventivo", { esito: "rifiutato" }, "Preventivo rifiutato")) setDialogo(null); }}>RIFIUTATO</Button>
        </div>
      </Modale>}
      {dialogo === "pronto" && <DialogoPronto s={s} bozzaLav={v("lavorazione") as string} totale={v("totale_lavorazione") as number | null} busy={!!busy} onClose={() => setDialogo(null)}
        onInvia={async (body) => { if (await azione("pronto", body, "PRONTO")) setDialogo(null); }} />}
      {dialogo === "consegna" && <Modale titolo={`Consegna scheda ${s.sigla}`} onClose={() => setDialogo(null)}>
        <div className="grid grid-cols-2 gap-2">
          {([["ritiro", "RITIRATO al banco"], ["spedizione", "SPEDITO"], ["rottamato", "ROTTAMATO"], ["venduto", "VENDUTO"]] as const).map(([k, l]) => (
            <Button key={k} variant={k === "ritiro" ? "default" : "outline"} onClick={async () => { if (await azione("consegna", { modo: k }, l)) setDialogo(null); }}>{l}</Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Per incassare: «Scontrino», «Fattura» oppure «Ordine» dalla pulsantiera (prima o dopo la consegna).</p>
      </Modale>}
      {dialogo === "spedizione" && <DialogoSpedizione s={s} operatore={operatore} onClose={() => setDialogo(null)} onFatta={() => { setDialogo(null); ricarica(); onCambiata(); }} />}
      {dialogo === "stesso" && <DialogoStessoModello s={s} ro={ro} onClose={() => setDialogo(null)} onApri={onApri}
        onCopia={(r) => { set("preventivo_righe", r); setDialogo(null); toast.success("Preventivo copiato nelle righe: controlla i prezzi sul GSX e salva"); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PREVENTIVO A IPOTESI

function EditorPreventivo({ righe, ro, onChange, testoStorico, dataPreventivo, esito, acconto, onAcconto }: {
  righe: EstimateLine[]; ro: boolean; onChange: (r: EstimateLine[]) => void; testoStorico: string | null; dataPreventivo?: string; esito: string;
  acconto: number | null; onAcconto: (v: string) => void;
}) {
  const [listino, setListino] = useState<{ voci: VoceListino[]; coppie: Coppia[] } | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [trovati, setTrovati] = useState<{ preventivi: (SchedaBreve & { preventivo_testo: string | null })[]; sintesi: { n: number; min: number; max: number; mediana: number } | null } | null>(null);
  useEffect(() => { if (!ro) assListino().then(setListino).catch(() => undefined); }, [ro]);
  const upd = (i: number, k: keyof EstimateLine, val: unknown) => onChange(righe.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  const nIpotesi = righe.filter((r) => r.opt != null).length;
  const scegli = (opt: number) => onChange(righe.map((r) => (r.opt == null ? r : { ...r, on: r.opt === opt })));
  const aggiungi = (r: EstimateLine) => onChange([...righe, r]);
  const tot = total(righe);

  async function cercaPrev() {
    if (ricerca.trim().length < 2) return;
    try { setTrovati(await assPreventivi(ricerca)); } catch (e) { toastErrore(e); }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <b>Preventivo</b>
        <span className="text-xs text-muted-foreground">Data/Ora: {dataOra(dataPreventivo) || "—"} · esito {esito === "accettato" ? "ACCETTATO" : esito === "rifiutato" ? "RIFIUTATO" : "in attesa"}</span>
        <label className="ml-auto flex items-center gap-1 text-xs">Acconto €
          <input className="h-7 w-20 rounded border px-1 text-right" inputMode="decimal" disabled={ro} value={acconto ?? ""} onChange={(e) => onAcconto(e.target.value.replace(",", "."))} /></label>
        <span>Importo preventivo <b>{eur(tot)}</b></span>
      </div>
      {testoStorico && righe.length === 0 && (
        <div className="rounded border bg-muted/30 p-2 text-sm">
          <div className="whitespace-pre-wrap">{testoStorico}</div>
          {!ro && <Button size="xs" variant="outline" className="mt-1" onClick={() => onChange(parseEstimate(testoStorico))}>Trasforma in righe</Button>}
        </div>
      )}
      <div className="space-y-1">
        {righe.map((r, i) => (
          <div key={i} className={`grid items-center gap-1 rounded border p-1 text-sm md:grid-cols-[auto_1fr_90px_auto] ${r.opt != null && !r.on ? "opacity-60" : ""}`}>
            <span className="w-24 text-xs">
              {r.opt != null
                ? <label className="flex items-center gap-1"><input type="radio" disabled={ro} checked={!!r.on} onChange={() => scegli(r.opt as number)} />{righe.filter((x) => x.opt != null).indexOf(r) + 1}° IPOTESI</label>
                : "voce fissa"}
            </span>
            <input className={campo} disabled={ro} value={r.t} onChange={(e) => upd(i, "t", e.target.value)} />
            <input className={`${campo} text-right`} disabled={ro} inputMode="decimal" placeholder="€" value={r.p ?? ""} onChange={(e) => upd(i, "p", e.target.value.replace(",", "."))} />
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <label className="flex items-center gap-0.5"><input type="checkbox" disabled={ro} checked={!!r.iva} onChange={(e) => upd(i, "iva", e.target.checked)} />+IVA</label>
              <select className="h-7 rounded border px-1" disabled={ro} value={r.nota || ""} onChange={(e) => upd(i, "nota", e.target.value || null)}>
                <option value="">recupero dati…</option><option>compreso recupero dati</option><option>senza recupero dati</option><option>solo recupero dati</option></select>
              <input className="h-7 w-16 rounded border px-1" disabled={ro} placeholder="barrato" title="Prezzo barrato: «scontato da € …» (non si somma)" value={r.listino ?? ""} onChange={(e) => upd(i, "listino", e.target.value ? Number(e.target.value) : null)} />
              {!ro && <button title={r.opt == null ? "Rendi ipotesi alternativa" : "Rendi voce fissa"} className="rounded border px-1" onClick={() => onChange(righe.map((x, j) => (j !== i ? x
                : x.opt == null ? { ...x, opt: nIpotesi, on: nIpotesi === 0 } : { ...x, opt: null, on: false })))}>{r.opt == null ? "→ipotesi" : "→fissa"}</button>}
              {!ro && <button title="Togli" className="rounded p-0.5 hover:bg-muted" onClick={() => onChange(righe.filter((_, j) => j !== i))}><X className="size-3.5" /></button>}
            </div>
          </div>
        ))}
      </div>
      {!ro && listino && (
        <div className="flex flex-wrap gap-1">
          <select className="h-8 max-w-md rounded border px-1 text-sm" value="" onChange={(e) => {
            const x = listino.voci.find((y) => y.id === e.target.value);
            if (x) aggiungi({ t: x.label, p: x.price ?? "", opt: null, on: false });
          }}>
            <option value="">+ voce dal listino…</option>
            {listino.voci.map((x) => <option key={x.id} value={x.id}>{x.label}{x.price ? ` (€ ${x.price})` : ""}</option>)}
          </select>
          <select className="h-8 rounded border px-1 text-sm" value="" onChange={(e) => {
            const c = listino.coppie.find((y) => y.id === e.target.value);
            if (c) onChange([...righe.filter((r) => r.opt == null),
              { t: c.first_line.t.replace(/^\d°\s*IPOTESI:\s*/i, ""), p: "", nota: c.first_line.nota || null, opt: 0, on: true },
              { t: c.second_line.t.replace(/^\d°\s*IPOTESI:\s*/i, ""), p: "", nota: c.second_line.nota || null, opt: 1, on: false }]);
          }}>
            <option value="">+ due ipotesi…</option>
            {listino.coppie.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={() => aggiungi({ t: "", p: "", opt: null, on: false })}><Plus />riga</Button>
          <div className="ml-auto flex gap-1">
            <Input className="h-8 w-56" placeholder="Cerca preventivi: «air 2020 logica»" value={ricerca} onChange={(e) => setRicerca(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") cercaPrev(); }} />
            <Button size="sm" variant="outline" onClick={cercaPrev}><Search /></Button>
          </div>
        </div>
      )}
      {trovati && (
        <div className="max-h-64 overflow-y-auto rounded border p-1 text-xs">
          <div className="mb-1 flex items-center gap-2">{trovati.sintesi ? <>Trovati {trovati.sintesi.n}: min {eur(trovati.sintesi.min)} · mediana <b>{eur(trovati.sintesi.mediana)}</b> · max {eur(trovati.sintesi.max)} — ordine di grandezza: verificare sul GSX</> : "Nessun preventivo"}
            <button className="ml-auto" onClick={() => setTrovati(null)}><X className="size-3.5" /></button></div>
          {trovati.preventivi.map((p) => (
            <div key={p.id} className="flex gap-2 border-t py-1">
              <span className="w-14 shrink-0 tabular-nums">{p.sigla}</span>
              <span className="flex-1"><b>{p.modello || p.prodotto}</b> — {p.preventivo_testo}</span>
              <span className="shrink-0">{eur(p.totale_lavorazione ?? p.preventivo_totale)}</span>
              <button className="shrink-0 underline" onClick={() => onChange(parseEstimate(p.preventivo_testo || ""))}>usa</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DIALOGHI

function Anteprima({ s, corpo }: { s: Scheda; corpo: Record<string, unknown> }) {
  const [a, setA] = useState<{ oggetto: string; corpo: string; prova: boolean; destinatario: string | null; whatsapp: string } | null>(null);
  const chiave = JSON.stringify(corpo);
  useEffect(() => { assAnteprimaMail(s.id, JSON.parse(chiave)).then(setA).catch(() => setA(null)); }, [s.id, chiave]);
  if (!a) return <div className="text-xs text-muted-foreground">anteprima…</div>;
  return (
    <div className="space-y-1 rounded border bg-muted/30 p-2 text-xs">
      {a.prova && <div className="font-semibold text-amber-800">PROVA: la mail va a {a.destinatario}, non al cliente ({s.email || "senza email"}). WhatsApp non inviato.</div>}
      <div>A: <b>{a.destinatario || "— (manca l'email)"}</b> · Oggetto: <b>{a.oggetto}</b> · allegato {s.sigla}.pdf</div>
      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">{a.corpo}</pre>
    </div>
  );
}

function DialogoMail({ s, tipo, busy, onClose, onInvia }: { s: Scheda; tipo: string; busy: boolean; onClose: () => void; onInvia: (b: Record<string, unknown>) => void }) {
  const [mail, setMail] = useState(true);
  const [wa, setWa] = useState(false);
  const [nota, setNota] = useState("");
  const titolo = tipo === "ricevuta" ? "RICEVUTA d'ingresso" : tipo === "aggiornamento" ? "AGGIORNAMENTO PREVENTIVO" : "PREVENTIVO";
  return (
    <Modale titolo={`${titolo} — scheda ${s.sigla}`} onClose={onClose}>
      <div className="space-y-2">
        {tipo !== "ricevuta" && <p className="text-xs text-muted-foreground">Si salvano le righe del preventivo, se ne tiene copia nello storico e si manda la mail con il PDF della scheda.</p>}
        {tipo === "aggiornamento" && <textarea className={area} rows={2} placeholder="Nota nel corpo della mail (es. TROVA IL MIO IPHONE ATTIVO DA DISABILITARE)" value={nota} onChange={(e) => setNota(e.target.value)} />}
        <Anteprima s={s} corpo={{ tipo, nota }} />
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} />Mail con PDF</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} />WhatsApp (linea Genius)</label>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={busy} onClick={() => onInvia({ invia_mail: mail, invia_wa: wa, nota })}>{busy ? <Loader2 className="mr-1 animate-spin" /> : <Send className="mr-1" />}{mail ? "Invia" : "Registra senza mail"}</Button></div>
      </div>
    </Modale>
  );
}

function DialogoPronto({ s, bozzaLav, totale, busy, onClose, onInvia }: {
  s: Scheda; bozzaLav: string; totale: number | null; busy: boolean; onClose: () => void; onInvia: (b: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    consegna_modo: s.consegna_modo || "ritiro", pagamento_modo: s.pagamento_modo || "al_banco",
    totale_lavorazione: String(totale ?? s.totale_lavorazione ?? (s.preventivo_esito === "accettato" ? s.preventivo_totale ?? "" : "")),
    esito: s.esito || (s.preventivo_esito === "rifiutato" ? "NEGATIVO" : "EFFETTUATO"), indirizzo_spedizione: s.indirizzo_spedizione || "",
  });
  const [mail, setMail] = useState(true);
  const [wa, setWa] = useState(false);
  const pag = f.pagamento_modo === "al_banco" ? "" : f.pagamento_modo;
  const corpo = useMemo(() => ({ consegna_modo: f.consegna_modo, pagamento_modo: pag, totale_lavorazione: f.totale_lavorazione, indirizzo_spedizione: f.indirizzo_spedizione }), [f, pag]);
  return (
    <Modale titolo={`PRONTO — scheda ${s.sigla}`} onClose={onClose} largo>
      <div className="space-y-2">
        <div className="grid gap-2 md:grid-cols-4">
          <label><span className={etich}>Consegna</span><select className={campo} value={f.consegna_modo} onChange={(e) => setF({ ...f, consegna_modo: e.target.value })}>
            <option value="ritiro">Ritiro in sede</option><option value="spedizione">Spedizione</option></select></label>
          <label><span className={etich}>Pagamento</span><select className={campo} value={f.pagamento_modo} onChange={(e) => setF({ ...f, pagamento_modo: e.target.value })}>
            <option value="al_banco">Al banco (contanti/POS)</option><option value="bonifico">Bonifico (IBAN)</option><option value="paypal">PayPal (+3%)</option><option value="fine_mese">Fine mese (rivenditore)</option></select></label>
          <label><span className={etich}>Totale €</span><input className={campo} inputMode="decimal" value={f.totale_lavorazione} onChange={(e) => setF({ ...f, totale_lavorazione: e.target.value.replace(",", ".") })} /></label>
          <label><span className={etich}>Esito</span><select className={campo} value={f.esito} onChange={(e) => setF({ ...f, esito: e.target.value })}>
            <option>EFFETTUATO</option><option>NEGATIVO</option><option>DA ULTIMARE</option></select></label>
        </div>
        {f.consegna_modo === "spedizione" && <label className="block"><span className={etich}>Indirizzo di spedizione (va nella causale)</span>
          <input className={campo} value={f.indirizzo_spedizione} onChange={(e) => setF({ ...f, indirizzo_spedizione: e.target.value })} /></label>}
        {!bozzaLav && !s.lavorazione && <p className="text-xs text-amber-700">La lavorazione è vuota: si riempie con le righe accettate del preventivo.</p>}
        <Anteprima s={s} corpo={f.pagamento_modo === "fine_mese" ? { ...corpo, tipo: "pronto" } : corpo} />
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} />Mail con PDF</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} />WhatsApp</label>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={busy} onClick={() => onInvia({ ...corpo, esito: f.esito, pagamento_modo: pag === "fine_mese" ? "fine_mese" : pag || null, invia_mail: mail, invia_wa: wa })}>
            {busy ? <Loader2 className="mr-1 animate-spin" /> : null}PRONTO{mail ? " e invia" : ""}</Button></div>
      </div>
    </Modale>
  );
}

function DialogoSpedizione({ s, operatore, onClose, onFatta }: { s: Scheda; operatore: string; onClose: () => void; onFatta: () => void }) {
  const [dir, setDir] = useState<"riconsegna" | "ritiro">(s.stato === "in_arrivo" ? "ritiro" : "riconsegna");
  const [ind, setInd] = useState<Record<string, string>>({});
  const [ante, setAnte] = useState<{ indirizzo: Record<string, string>; mancanti: string[]; indirizzo_libero: string | null; oggetto: string; corpo: string; prova: boolean; email: string | null } | null>(null);
  const [giorno, setGiorno] = useState("");
  const [prova, setProva] = useState(true);
  const [busy, setBusy] = useState(false);
  const chiave = JSON.stringify({ dir, ind });
  useEffect(() => {
    const t = setTimeout(() => assAzione(s.id, "spedizione/anteprima", { direzione: dir, indirizzo: JSON.parse(chiave).ind, giorno_ritiro: giorno })
      .then((a) => { setAnte(a); }).catch(toastErrore), 300);
    return () => clearTimeout(t);
  }, [s.id, chiave, dir, giorno]);
  async function crea() {
    if (!operatore) { toast.error("Scegli l'operatore"); return; }
    if (!prova && !confirm(`Creare l'etichetta UPS VERA (costo sul conto UPS)${dir === "ritiro" && giorno ? " e prenotare il corriere" : ""}?`)) return;
    setBusy(true);
    try {
      const r = await assAzione(s.id, "spedizione", { operatore, direzione: dir, indirizzo: ind, giorno_ritiro: giorno || undefined, test: prova });
      toast.success(`UPS ${r.test ? "(PROVA) " : ""}${r.tracking}${r.prn ? ` · ritiro ${r.prn}` : ""}${r.pickup_error ? ` · ERRORE ritiro: ${r.pickup_error}` : ""}`, { duration: 9000 });
      window.open(`/api/backend${r.label_url}`, "_blank");
      onFatta();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  const a = ante?.indirizzo || {};
  const C = (k: string, l: string) => <label className="block"><span className={etich}>{l}</span>
    <input className={campo} value={ind[k] ?? a[k] ?? ""} onChange={(e) => setInd({ ...ind, [k]: e.target.value })} /></label>;
  return (
    <Modale titolo={`Spedizione UPS — scheda ${s.sigla}`} onClose={onClose} largo>
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button size="sm" variant={dir === "riconsegna" ? "default" : "outline"} onClick={() => setDir("riconsegna")}>Riconsegna al cliente (UPS passa alle 16:30)</Button>
          <Button size="sm" variant={dir === "ritiro" ? "default" : "outline"} onClick={() => setDir("ritiro")}>Ritiro dal cliente</Button>
        </div>
        {ante?.indirizzo_libero && <div className="text-xs text-muted-foreground">Indicazioni sulla scheda: {ante.indirizzo_libero}</div>}
        <div className="grid gap-2 md:grid-cols-3">{C("name", "Ragione sociale")}{C("attention", "Alla c.a.")}{C("phone", "Telefono")}
          {C("street", "Indirizzo")}{C("city", "Città")}<div className="grid grid-cols-2 gap-2">{C("zip", "CAP")}{C("province", "Prov.")}</div></div>
        {dir === "ritiro" && <label className="block w-48"><span className={etich}>Giorno del ritiro (vuoto = senza prenotazione)</span>
          <input type="date" className={campo} value={giorno} onChange={(e) => setGiorno(e.target.value)} /></label>}
        {ante?.mancanti.length ? <div className="text-sm text-red-700">Mancano: {ante.mancanti.join(", ")}</div> : null}
        {ante && <div className="rounded border bg-muted/30 p-2 text-xs">{ante.prova && <div className="font-semibold text-amber-800">PROVA: mail solo a {ante.email}</div>}
          <b>{ante.oggetto}</b><pre className="whitespace-pre-wrap font-sans">{ante.corpo}</pre></div>}
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={prova} onChange={(e) => setProva(e.target.checked)} />Ambiente di PROVA UPS (nessun costo, nessun corriere, nessuna mail)</label>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button disabled={busy || !!ante?.mancanti.length} onClick={crea}>{busy ? <Loader2 className="mr-1 animate-spin" /> : <Truck className="mr-1" />}Crea etichetta{prova ? " (prova)" : ""}</Button></div>
      </div>
    </Modale>
  );
}

function DialogoStessoModello({ s, ro, onClose, onApri, onCopia }: { s: Scheda; ro: boolean; onClose: () => void; onApri: (id: string) => void; onCopia: (r: EstimateLine[]) => void }) {
  const [r, setR] = useState<{ criterio: string; schede: (SchedaBreve & { preventivo_testo: string | null })[] } | null>(null);
  useEffect(() => { assStessoModello(s.id).then(setR).catch(toastErrore); }, [s.id]);
  return (
    <Modale titolo={`Stesso modello — ${s.modello || s.prodotto || ""}`} onClose={onClose} largo>
      {!r ? <Loader2 className="animate-spin" /> : (
        <div className="space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">{r.criterio ? `Per ${r.criterio}, dal più recente. I prezzi cambiano: verificare sul GSX.` : "Scrivi il modello o il seriale sulla scheda."}</div>
          {r.schede.length === 0 && <div className="text-muted-foreground">Nessuna scheda con lo stesso modello e un preventivo.</div>}
          {r.schede.map((x) => (
            <div key={x.id} className="flex gap-2 border-t py-1">
              <button className="w-14 shrink-0 text-left font-semibold underline" onClick={() => { onClose(); onApri(x.id); }}>{x.sigla}</button>
              <div className="flex-1"><div className="text-xs text-muted-foreground">{dataOra(x.created_at)} · {x.modello || x.prodotto} · {x.difetto}</div>
                <div className="whitespace-pre-wrap">{x.preventivo_testo}</div></div>
              <div className="shrink-0 text-right">{eur(x.totale_lavorazione ?? x.preventivo_totale)}<div className="text-xs">{x.preventivo_esito}</div>
                {!ro && <Button size="xs" variant="outline" onClick={() => onCopia(parseEstimate(x.preventivo_testo || ""))}>Copia preventivo</Button>}</div>
            </div>
          ))}
        </div>
      )}
    </Modale>
  );
}
