"use client";

// CAMPAGNA OFFERTE (Christian 18/10/2026): «non vedo le mail inviate, non so se vengono inviate, voglio vedere chi è
// stato contattato e cosa è successo». Le offerte partono da Resend (email) e dal WABA / linea staff (WhatsApp), non
// dalla casella Mail: qui si vede tutto. Dati dal backend (campagna_dashboard.py), solo titolare.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Megaphone, Mail, MessageSquare, RefreshCw, Loader2, Search, Eye, ChevronLeft, ChevronRight,
  CheckCircle2, AlertTriangle, XCircle, Reply, MousePointerClick, MailOpen, Ban, Truck, FileText, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/* ---------- tipi ---------- */
type Agg = {
  email: { inviate: number; errori: number; consegnate: number; aperte: number; cliccate: number; rimbalzate: number;
    spam: number; soppresse: number; in_ritardo: number; in_viaggio: number; non_tracciate: number; risposte: number };
  whatsapp: { inviati: number; errori: number; consegnati: number; letti: number; falliti: number; in_viaggio: number;
    risposte: number; stop: number };
  linea_staff: { inviati: number; risposte: number };
  pulsanti: { ritiro: number; preventivo: number };
  risposte_totali: number;
  risposte_vere?: number;
  contatti_unici: number;
  esclusioni?: { stop_whatsapp?: number; disiscrizioni_email?: number; rimbalzi_esclusi?: number; segnalazioni_spam?: number };
};
type Cruscotto = {
  ora_roma: string;
  oggi: Agg;
  sette_giorni: Agg;
  per_mittente: Record<string, Record<string, number>>;
  per_categoria: Record<string, Record<string, number>>;
  etichette_categoria: Record<string, string>;
  resend_leggibile: boolean;
  note: string[];
};
type Mittente = {
  tetto: number; gia_oggi: number; residuo: number; salute?: string; fermo?: string | null; motivo?: string;
  salute_dettaglio?: { esito?: string; inviate?: number; tasso_rimbalzi?: number; tasso_spam?: number; tasso_aperture?: number };
};
type Piano = {
  ora_roma: string;
  attiva?: boolean;
  interruttori: Record<string, boolean>;
  canali?: { email: boolean; waba: boolean; openwa: boolean; template: string; qualita_numero: string };
  fasce: string;
  in_fascia_whatsapp: boolean;
  tetti_giorno?: Record<string, { tetto_giorno?: number; tetto_salute?: number; rimasti?: number }>;
  gia_oggi?: Record<string, number>;
  giri_restanti: { email: number; whatsapp: number };
  prossimo_giro: { email: string | null; whatsapp: string | null };
  rimasti?: Record<string, number>;
  giorni_per_finire?: Record<string, number | null>;
  giorni_obiettivo: number;
  mittenti: Record<string, Mittente>;
  mittenti_non_verificati: string[];
  platea_per_categoria: { email_verificata: Record<string, number>; email: Record<string, number>;
    whatsapp: Record<string, number>; solo_cellulare: Record<string, number> };
  avvisi: string[];
};
type Contatto = {
  id: string; tipo: "email" | "waba" | "openwa"; canale: "email" | "whatsapp"; destinatario: string; sent_at: string;
  ok: boolean; errore?: string | null; oggetto?: string | null; nome?: string | null; categoria: string;
  provincia?: string | null; comune?: string | null; mittente?: string | null; template?: string | null;
  stato?: string | null; risposto: boolean; risposta?: { quando?: string; oggetto?: string | null; testo?: string | null } | null;
  pulsante?: "ritiro" | "preventivo" | null; stop: boolean; chat_url?: string | null; risposta_vera?: boolean;
};
type Messaggio = {
  canale: string; tipo: string; destinatario: string; sent_at: string; nome?: string; rigenerato: boolean;
  oggetto?: string; mittente?: string; html?: string; testo?: string; template?: string; nota?: string; allegato?: string;
};

/* ---------- etichette ---------- */
const CATEGORIE = ["fgas", "elettricisti", "caldaisti", "antincendio", "alimentare", "officine", "manutentori", "pa"];
const ETICHETTE: Record<string, string> = {
  fgas: "F-GAS", elettricisti: "Elettricisti", caldaisti: "Caldaisti", antincendio: "Antincendio",
  alimentare: "Alimentare/HACCP", officine: "Officine", manutentori: "Manutentori", pa: "PA",
};
const STATI: Record<string, { label: string; cls: string }> = {
  delivered: { label: "Consegnata", cls: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" },
  opened: { label: "Aperta", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300" },
  clicked: { label: "Cliccata", cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300" },
  bounced: { label: "Rimbalzata", cls: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
  complained: { label: "Spam", cls: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200" },
  suppressed: { label: "Soppressa", cls: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
  delivery_delayed: { label: "In ritardo", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" },
  sent: { label: "Inviato", cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  inviato: { label: "Inviato", cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  read: { label: "Letto", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300" },
  failed: { label: "Fallito", cls: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
  errore: { label: "Non partito", cls: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
  "non tracciato": { label: "Senza stato", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  "n.d.": { label: "Senza stato", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};
const ESITI = [
  ["", "Tutti gli esiti"], ["consegnata", "Consegnata"], ["aperta", "Aperta"], ["cliccata", "Cliccata"],
  ["letto", "Letto (WhatsApp)"], ["rimbalzata", "Rimbalzata"], ["spam", "Spam"], ["fallito", "Fallito / non partito"],
  ["in_viaggio", "In viaggio"], ["risposta_vera", "Ha risposto davvero"], ["risposto", "Ha risposto (anche automatiche)"], ["pulsante", "Pulsante ritiro/preventivo"], ["stop", "STOP"],
];
const SALUTE_CLS: Record<string, string> = {
  ok: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  attenzione: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  critico: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

const n = (v?: number | null) => (v ?? 0).toLocaleString("it-IT");
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");
const quando = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
};

function Stato({ s }: { s?: string | null }) {
  const v = STATI[s || ""] || { label: s || "—", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${v.cls}`}>{v.label}</span>;
}

function Numero({ label, valore, sotto, icon: Icon, colore }: {
  label: string; valore: number | string; sotto?: string; icon: typeof Mail; colore: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${colore}`} />{label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{valore}</div>
      {sotto && <div className="text-xs text-muted-foreground">{sotto}</div>}
    </div>
  );
}

/* ---------- blocco numeri (oggi / 7 giorni) ---------- */
function BloccoNumeri({ a }: { a: Agg }) {
  const e = a.email, w = a.whatsapp, x = a.esclusioni || {};
  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Mail className="h-4 w-4 text-blue-600" />Email</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Numero label="Inviate" valore={n(e.inviate)} sotto={e.errori ? `${e.errori} non partite` : undefined} icon={Mail} colore="text-blue-600" />
          <Numero label="Consegnate" valore={n(e.consegnate)} sotto={pct(e.consegnate, e.inviate)} icon={CheckCircle2} colore="text-green-600" />
          <Numero label="Aperte" valore={n(e.aperte)} sotto={pct(e.aperte, e.consegnate)} icon={MailOpen} colore="text-blue-500" />
          <Numero label="Cliccate" valore={n(e.cliccate)} icon={MousePointerClick} colore="text-indigo-500" />
          <Numero label="Rimbalzate" valore={n(e.rimbalzate)} sotto={pct(e.rimbalzate, e.inviate)} icon={XCircle} colore="text-red-500" />
          <Numero label="Spam" valore={n(e.spam)} sotto={e.non_tracciate ? `${e.non_tracciate} senza stato` : undefined} icon={AlertTriangle} colore="text-red-600" />
        </div>
      </div>
      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-green-600" />WhatsApp</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Numero label="Template inviati" valore={n(w.inviati)} icon={MessageSquare} colore="text-green-600" />
          <Numero label="Consegnati" valore={n(w.consegnati)} sotto={pct(w.consegnati, w.inviati)} icon={CheckCircle2} colore="text-green-600" />
          <Numero label="Letti" valore={n(w.letti)} sotto={pct(w.letti, w.inviati)} icon={Eye} colore="text-blue-500" />
          <Numero label="Falliti" valore={n(w.falliti)} icon={XCircle} colore="text-red-500" />
          <Numero label="Linea staff 375" valore={n(a.linea_staff.inviati)} icon={MessageSquare} colore="text-emerald-700" />
          <Numero label="STOP ricevuti" valore={n(x.stop_whatsapp ?? w.stop)} icon={Ban} colore="text-red-600" />
        </div>
      </div>
      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Reply className="h-4 w-4 text-purple-600" />Risultati</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Numero label="Risposte vere" valore={n(a.risposte_vere)} sotto={`su ${n(a.risposte_totali)} (email ${n(e.risposte)} · WA ${n(w.risposte + a.linea_staff.risposte)}), senza automatiche e STOP`} icon={Reply} colore="text-purple-600" />
          <Numero label="Prenoto il ritiro" valore={n(a.pulsanti.ritiro)} icon={Truck} colore="text-orange-600" />
          <Numero label="Voglio un preventivo" valore={n(a.pulsanti.preventivo)} icon={FileText} colore="text-orange-500" />
          <Numero label="Disiscrizioni email" valore={n(x.disiscrizioni_email)} icon={Ban} colore="text-gray-500" />
          <Numero label="Rimbalzi esclusi" valore={n(x.rimbalzi_esclusi)} sotto="non più contattati" icon={XCircle} colore="text-gray-500" />
          <Numero label="Contatti raggiunti" valore={n(a.contatti_unici)} icon={CheckCircle2} colore="text-gray-600" />
        </div>
      </div>
    </div>
  );
}

/* ---------- anteprima messaggio ---------- */
function Anteprima({ id, onChiudi }: { id: string | null; onChiudi: () => void }) {
  const [m, setM] = useState<Messaggio | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let annullato = false;
    fetchAPI(`/api/campagna-offerta/messaggio/${id}`, { timeoutMs: 30000 })
      .then((r: Messaggio) => { if (!annullato) { setM(r); setErrore(null); } })
      .catch((e: Error) => { if (!annullato) setErrore(e.message); });
    return () => { annullato = true; setM(null); setErrore(null); };
  }, [id]);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {m?.canale === "email" ? <Mail className="size-5" /> : <MessageSquare className="size-5" />}
            {m?.nome || m?.destinatario || "Messaggio"}
          </DialogTitle>
          <DialogDescription>
            {m ? `${m.destinatario} · ${quando(m.sent_at)}${m.mittente ? ` · da ${m.mittente}` : ""}${m.template ? ` · ${m.template}` : ""}` : ""}
          </DialogDescription>
        </DialogHeader>
        {!m && !errore && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {errore && <p className="text-sm text-red-600">{errore}</p>}
        {m && (
          <div className="space-y-2">
            {m.oggetto && <p className="text-sm"><span className="text-muted-foreground">Oggetto:</span> <strong>{m.oggetto}</strong></p>}
            {m.rigenerato && m.nota && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">{m.nota}</p>}
            {m.html ? (
              <iframe title="Anteprima email" sandbox="" srcDoc={m.html} className="h-[60vh] w-full rounded-md border bg-white" />
            ) : (
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-sm">{m.testo}</pre>
            )}
            {m.allegato && <p className="text-xs text-muted-foreground">Allegato: <a className="underline" href={m.allegato} target="_blank" rel="noreferrer">listino PDF</a></p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- pagina ---------- */
export default function CampagnaPage() {
  const [cr, setCr] = useState<Cruscotto | null>(null);
  const [pi, setPi] = useState<Piano | null>(null);
  const [errPiano, setErrPiano] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<"oggi" | "sette_giorni">("oggi");
  const [caricando, setCaricando] = useState(true);
  // elenco
  const [righe, setRighe] = useState<Contatto[]>([]);
  const [totale, setTotale] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [canale, setCanale] = useState("");
  const [categoria, setCategoria] = useState("");
  const [esito, setEsito] = useState("");
  const [giorni, setGiorni] = useState(7);
  const [cerca, setCerca] = useState("");
  const [q, setQ] = useState("");
  const [aperto, setAperto] = useState<string | null>(null);
  const PER_PAGINA = 50;

  // richieste al backend: lo stato si aggiorna solo nelle callback (niente setState sincrono negli effect)
  const richiedi = useCallback(() => {
    fetchAPI("/api/campagna-offerta/cruscotto", { timeoutMs: 90000 })
      .then((r: Cruscotto) => setCr(r))
      .catch((e: Error) => toast.error(`Numeri della campagna non caricati: ${e.message}`))
      .finally(() => setCaricando(false));
    fetchAPI("/api/campagna-offerta/piano", { timeoutMs: 180000 })
      .then((r: Piano) => { setPi(r); setErrPiano(null); })
      .catch((e: Error) => setErrPiano(e.message));
  }, []);
  const caricaCruscotto = () => { setCaricando(true); setErrPiano(null); richiedi(); };

  useEffect(() => { richiedi(); }, [richiedi]);

  useEffect(() => {
    const t = setTimeout(() => { setQ(cerca.trim()); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [cerca]);

  // l'elenco è «in caricamento» finché la risposta arrivata non è quella dei filtri attuali
  const parametri = (() => {
    const p = new URLSearchParams({ giorni: String(giorni), pagina: String(pagina), per_pagina: String(PER_PAGINA) });
    if (canale) p.set("canale", canale);
    if (categoria) p.set("categoria", categoria);
    if (esito) p.set("esito", esito);
    if (q) p.set("q", q);
    return p.toString();
  })();
  const [caricati, setCaricati] = useState<string | null>(null);
  const caricandoElenco = caricati !== parametri;
  useEffect(() => {
    let annullato = false;
    fetchAPI(`/api/campagna-offerta/contatti?${parametri}`, { timeoutMs: 90000 })
      .then((r: { totale: number; contatti: Contatto[] }) => { if (!annullato) { setRighe(r.contatti); setTotale(r.totale); } })
      .catch((e: Error) => { if (!annullato) toast.error(`Elenco non caricato: ${e.message}`); })
      .finally(() => { if (!annullato) setCaricati(parametri); });
    return () => { annullato = true; };
  }, [parametri]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const sel = "rounded-md border bg-background px-2 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      {/* Intestazione */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Campagna offerte</h1>
            <p className="text-sm text-muted-foreground">
              Email (Resend) e WhatsApp (template e linea staff): chi è stato contattato e cosa è successo
              {cr ? ` · aggiornato alle ${cr.ora_roma.slice(11)}` : ""}
            </p>
          </div>
        </div>
        <button onClick={caricaCruscotto} disabled={caricando}
          className="flex items-center gap-1.5 self-start rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
          {caricando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Aggiorna
        </button>
      </div>

      {pi && pi.attiva === false && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
          <AlertTriangle className="mr-1.5 inline h-4 w-4" /><strong>Campagna spenta</strong> (CAMPAGNA_OFFERTA_ATTIVA su Railway).
        </div>
      )}
      {pi?.avvisi?.map((a) => (
        <div key={a} className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />{a}
        </div>
      ))}

      {/* 1. Numeri */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Numeri</h2>
          <div className="ml-auto inline-flex rounded-md border p-0.5 text-sm">
            {(["oggi", "sette_giorni"] as const).map((p) => (
              <button key={p} onClick={() => setPeriodo(p)}
                className={`rounded px-3 py-1 ${periodo === p ? "bg-blue-600 text-white" : "hover:bg-muted"}`}>
                {p === "oggi" ? "Oggi" : "Ultimi 7 giorni"}
              </button>
            ))}
          </div>
        </div>
        {!cr ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <BloccoNumeri a={cr[periodo]} />
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {cr.note.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </>
        )}
      </section>

      {/* 2. Mittenti */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Mittenti email</h2>
        {!pi && !errPiano && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calcolo di tetti e salute (può volerci mezzo minuto)…</p>}
        {errPiano && <p className="text-sm text-red-600">Piano non disponibile: {errPiano}</p>}
        {pi && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(pi.mittenti).map(([m, d]) => {
              const s = d.salute_dettaglio?.esito || d.salute || "n.d.";
              const usati = cr?.per_mittente?.[m] || {};
              return (
                <div key={m} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="break-all text-sm font-semibold">{m}</div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SALUTE_CLS[s] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>{d.fermo ? "fermo" : s}</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold tabular-nums">{n(d.gia_oggi)}<span className="text-base font-normal text-muted-foreground"> / {n(d.tetto)} oggi</span></div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                    <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, d.tetto ? (100 * d.gia_oggi) / d.tetto : 0)}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    7 giorni: {n(usati.inviate_7gg)} inviate · {n(usati.consegnate_7gg)} consegnate · {n(usati.aperte_7gg)} aperte · {n(usati.rimbalzate_7gg)} rimbalzate
                    {d.salute_dettaglio?.tasso_rimbalzi != null && ` · rimbalzi ${d.salute_dettaglio.tasso_rimbalzi}% · spam ${d.salute_dettaglio.tasso_spam}%`}
                  </p>
                  {d.motivo && <p className="mt-1 text-xs text-muted-foreground">Warm-up: {d.motivo}</p>}
                  {d.fermo && <p className="mt-1 text-xs text-red-600">{d.fermo}</p>}
                </div>
              );
            })}
            {pi.mittenti_non_verificati.map((m) => (
              <div key={m} className="rounded-lg border border-dashed bg-card p-3 text-sm text-muted-foreground">
                <div className="break-all font-semibold">{m}</div>non ancora verificato su Resend: non invia
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Categorie */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Per categoria</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Categoria</th>
                <th className="px-3 py-2 text-right">Email oggi</th>
                <th className="px-3 py-2 text-right">WA oggi</th>
                <th className="px-3 py-2 text-right">Email 7 gg</th>
                <th className="px-3 py-2 text-right">WA 7 gg</th>
                <th className="px-3 py-2 text-right">Risposte 7 gg</th>
                <th className="px-3 py-2 text-right">Da fare: email verificata</th>
                <th className="px-3 py-2 text-right">Da fare: WhatsApp</th>
                <th className="px-3 py-2 text-right">Solo cellulare</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIE.map((k) => {
                const v = cr?.per_categoria?.[k] || {};
                const pp = pi?.platea_per_categoria;
                return (
                  <tr key={k} className="border-t">
                    <td className="px-3 py-2 font-medium">{ETICHETTE[k]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(v.email_oggi)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(v.whatsapp_oggi)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(v.email_7gg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(v.whatsapp_7gg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(v.risposte_7gg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pp ? n(pp.email_verificata[k]) : "…"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pp ? n(pp.whatsapp[k]) : "…"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pp ? n(pp.solo_cellulare[k]) : "…"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Piano */}
      {pi && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Piano</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {([["email", "Email", Mail, "email"], ["waba", "WhatsApp template", MessageSquare, "whatsapp"]] as const).map(([k, label, Icon, kg]) => {
              const t = pi.tetti_giorno?.[k] || {};
              const fatti = pi.gia_oggi?.[k] ?? 0;
              const acceso = k === "email" ? pi.canali?.email : pi.canali?.waba;
              return (
                <div key={k} className="rounded-lg border bg-card p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4" />{label}
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${acceso ? SALUTE_CLS.ok : SALUTE_CLS.attenzione}`}>{acceso ? "attivo" : "fermo"}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                    <span className="text-muted-foreground">Tetto di oggi</span><span className="text-right tabular-nums">{n(t.tetto_giorno)} (salute {n(t.tetto_salute)})</span>
                    <span className="text-muted-foreground">Già inviati oggi</span><span className="text-right tabular-nums">{n(fatti)}</span>
                    <span className="text-muted-foreground">Ancora oggi</span><span className="text-right tabular-nums">{n(Math.max(0, (t.tetto_giorno || 0) - fatti))}</span>
                    <span className="text-muted-foreground">Giri restanti</span><span className="text-right tabular-nums">{pi.giri_restanti[kg]}</span>
                    <span className="text-muted-foreground">Prossimo giro</span><span className="text-right"><Clock className="mr-1 inline h-3.5 w-3.5" />{pi.prossimo_giro[kg] || "domani"}</span>
                    <span className="text-muted-foreground">Platea rimasta</span><span className="text-right tabular-nums">{n(pi.rimasti?.[k])}</span>
                    <span className="text-muted-foreground">Per finirla</span><span className="text-right tabular-nums">{pi.giorni_per_finire?.[k] != null ? `~${pi.giorni_per_finire[k]} giorni` : "—"}</span>
                  </div>
                  {k === "waba" && pi.canali && <p className="mt-2 text-xs text-muted-foreground">Template: {pi.canali.template} · qualità numero: {pi.canali.qualita_numero}</p>}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Orari WhatsApp: {pi.fasce}. Le email partono ogni 30 minuti, giorno e notte. Obiettivo: platea finita in {pi.giorni_obiettivo} giorni.</p>
        </section>
      )}

      {/* 4. Elenco */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contatti raggiunti</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nome, email, telefono, comune"
              className="w-full rounded-md border bg-background py-1.5 pl-8 pr-2 text-sm" />
          </div>
          <select className={sel} value={giorni} onChange={(e) => { setGiorni(Number(e.target.value)); setPagina(1); }}>
            <option value={1}>Oggi</option><option value={7}>7 giorni</option><option value={14}>14 giorni</option>
          </select>
          <select className={sel} value={canale} onChange={(e) => { setCanale(e.target.value); setPagina(1); }}>
            <option value="">Email e WhatsApp</option><option value="email">Solo email</option><option value="whatsapp">Solo WhatsApp</option>
          </select>
          <select className={sel} value={categoria} onChange={(e) => { setCategoria(e.target.value); setPagina(1); }}>
            <option value="">Tutte le categorie</option>
            {CATEGORIE.map((k) => <option key={k} value={k}>{ETICHETTE[k]}</option>)}
          </select>
          <select className={sel} value={esito} onChange={(e) => { setEsito(e.target.value); setPagina(1); }}>
            {ESITI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">{caricandoElenco ? "Caricamento…" : `${n(totale)} invii`}</p>

        {/* telefono: schede */}
        <div className="space-y-2 md:hidden">
          {righe.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.nome || c.destinatario}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.destinatario}</div>
                </div>
                <Stato s={c.stato} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <span>{quando(c.sent_at)}</span>
                <span>{c.canale === "email" ? "Email" : c.tipo === "openwa" ? "WA staff" : "WhatsApp"}</span>
                <span>{ETICHETTE[c.categoria] || c.categoria}</span>
                {(c.comune || c.provincia) && <span>{c.comune || ""}{c.provincia ? ` (${c.provincia})` : ""}</span>}
              </div>
              <Risposta c={c} />
              <button onClick={() => setAperto(c.id)} className="mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                <Eye className="h-3.5 w-3.5" />Vedi messaggio
              </button>
            </div>
          ))}
        </div>

        {/* schermo grande: tabella */}
        <div className="hidden overflow-x-auto rounded-lg border md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Azienda</th>
                <th className="px-3 py-2 text-left">Dove</th>
                <th className="px-3 py-2 text-left">Categoria</th>
                <th className="px-3 py-2 text-left">Canale</th>
                <th className="px-3 py-2 text-left">Stato</th>
                <th className="px-3 py-2 text-left">Risposta</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {righe.map((c) => (
                <tr key={c.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{quando(c.sent_at)}</td>
                  <td className="max-w-[260px] px-3 py-2">
                    <div className="truncate font-medium">{c.nome || "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.destinatario}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{c.comune || ""}{c.provincia ? ` (${c.provincia})` : ""}</td>
                  <td className="px-3 py-2 text-xs">{ETICHETTE[c.categoria] || c.categoria}</td>
                  <td className="max-w-[220px] px-3 py-2 text-xs">
                    <div className="flex items-center gap-1">{c.canale === "email" ? <Mail className="h-3.5 w-3.5 text-blue-600" /> : <MessageSquare className="h-3.5 w-3.5 text-green-600" />}
                      {c.canale === "email" ? "Email" : c.tipo === "openwa" ? "WA staff" : "WhatsApp"}</div>
                    <div className="truncate text-muted-foreground" title={c.mittente || c.template || ""}>{c.mittente || c.template}</div>
                  </td>
                  <td className="px-3 py-2"><Stato s={c.stato} />{c.errore && <div className="mt-0.5 max-w-[180px] truncate text-xs text-red-600" title={c.errore}>{c.errore}</div>}</td>
                  <td className="max-w-[240px] px-3 py-2"><Risposta c={c} /></td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setAperto(c.id)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs hover:bg-muted">
                      <Eye className="h-3.5 w-3.5" />Vedi messaggio
                    </button>
                  </td>
                </tr>
              ))}
              {!caricandoElenco && righe.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Nessun invio con questi filtri</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pagine > 1 && (
          <div className="flex items-center justify-center gap-3 pt-1 text-sm">
            <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} className="rounded-md border p-1.5 disabled:opacity-40" aria-label="Pagina precedente"><ChevronLeft className="h-4 w-4" /></button>
            <span>Pagina {pagina} di {pagine}</span>
            <button onClick={() => setPagina((p) => Math.min(pagine, p + 1))} disabled={pagina >= pagine} className="rounded-md border p-1.5 disabled:opacity-40" aria-label="Pagina successiva"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </section>

      <Anteprima id={aperto} onChiudi={() => setAperto(null)} />
    </div>
  );
}

function Risposta({ c }: { c: Contatto }) {
  if (!c.risposto && !c.stop) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="mt-1 space-y-0.5 text-xs md:mt-0">
      {c.pulsante && (
        <span className="mr-1 inline-block rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-800 dark:bg-orange-900/50 dark:text-orange-300">
          {c.pulsante === "ritiro" ? "Prenota il ritiro" : "Vuole un preventivo"}
        </span>
      )}
      {c.risposto && !c.risposta_vera && !c.stop && !c.pulsante && <span className="mr-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">automatica</span>}
      {c.stop && <span className="mr-1 inline-block rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800 dark:bg-red-900/50 dark:text-red-300">STOP</span>}
      {c.risposta && (
        <div className="line-clamp-2 text-muted-foreground">
          {quando(c.risposta.quando)} · {c.risposta.oggetto || c.risposta.testo}
        </div>
      )}
      {c.chat_url ? (
        <Link href={c.chat_url} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><MessageSquare className="h-3 w-3" />Apri la chat</Link>
      ) : c.risposto ? (
        <a href={`mailto:${c.destinatario}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline"><Mail className="h-3 w-3" />Scrivi</a>
      ) : null}
    </div>
  );
}
