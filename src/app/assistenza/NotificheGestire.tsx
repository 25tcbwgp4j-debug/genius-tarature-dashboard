"use client";

// 30/10/2026 (Christian): NOTIFICHE DA GESTIRE. Diverse dagli avvisi automatici (che spariscono con «Ho visto»):
// «Segna come letta» NON la chiude; si chiude solo con «Chiudi: gestita» scrivendo l'esito (cosa è stato fatto).
// Finché non è chiusa resta qui, nella scheda e nel numero della sidebar.
import { useState } from "react";
import { toast } from "sonner";
import { BellRing, Check, ChevronDown, ChevronRight, Eye, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OPERATORI, type Operatore } from "@/components/Operatore";
import {
  assNotificaChiudi, assNotificaCrea, assNotificaLetta, assNotificaRiapri, assNotifiche, type NotificaGestire,
} from "@/lib/assistenza";
import { senzaIdWhatsApp } from "@/lib/formato";   // 13/11/2026: niente «…@c.us» / «@lid» nei testi
import { toastErrore } from "@/lib/errori";

const ora = (s: string) => new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const giorni = (s: string) => Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000));
const eta = (s: string) => { const g = giorni(s); return g === 0 ? "oggi" : g === 1 ? "da 1 giorno" : `da ${g} giorni`; };
const area = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const STILE: Record<NotificaGestire["livello"], string> = {
  urgente: "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-50",
  attenzione: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50",
  info: "border-sky-500 bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-50",
};
const ICONA: Record<NotificaGestire["livello"], string> = { urgente: "🚨", attenzione: "⚠️", info: "ℹ️" };

function SceltaChi({ op, setOp }: { op: string; setOp: (o: Operatore) => void }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-sm">Chi sei?</span>
      {OPERATORI.map((o) => (
        <button key={o} type="button" onClick={() => setOp(o)}
          className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${op === o ? "bg-foreground text-background" : "bg-background/60"}`}>{o}</button>
      ))}
    </span>
  );
}

/** Una notifica aperta: storia completa, «Da fare», letta / chiudi con esito obbligatorio. */
export function NotificaCard({ n, operatore, onScheda, onCambiata, compatta = false }: {
  n: NotificaGestire; operatore: string; onScheda?: (id: string) => void; onCambiata: () => void; compatta?: boolean;
}) {
  const [chi, setChi] = useState<Operatore | "">("");
  const [chiudendo, setChiudendo] = useState(false);
  const [esito, setEsito] = useState("");
  const [busy, setBusy] = useState(false);
  const [aperta, setAperta] = useState(!compatta);
  const op = chi || operatore;

  async function letta() {
    if (!op) { toast.error("Scegli chi sei (CHR · VALE · DUMY · MARTINA · ALTRO)"); return; }
    setBusy(true);
    try { await assNotificaLetta(n.id, op); toast.success("Segnata come letta: resta aperta finché non la chiudi"); onCambiata(); }
    catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  async function chiudi() {
    if (!op) { toast.error("Scegli chi sei (CHR · VALE · DUMY · MARTINA · ALTRO)"); return; }
    if (!esito.trim()) { toast.error("Scrivi l'esito: cosa è stato fatto"); return; }
    setBusy(true);
    try { await assNotificaChiudi(n.id, esito.trim(), op); toast.success("Notifica chiusa: gestita"); setChiudendo(false); setEsito(""); onCambiata(); }
    catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <div className={`rounded-xl border-2 p-3 shadow-sm ${STILE[n.livello] || STILE.attenzione}`}>
      <div className="flex flex-wrap items-start gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setAperta((x) => !x)}>
          {compatta && (aperta ? <ChevronDown className="mt-1 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0" />)}
          <span className="text-base font-bold leading-snug">{ICONA[n.livello]} {senzaIdWhatsApp(n.titolo)}</span>
        </button>
        <span className="text-xs opacity-80">{eta(n.created_at)} · {n.letta_il ? `letta da ${n.letta_da}` : <b>NON LETTA</b>}</span>
      </div>
      {n.sigla && (
        <div className="mt-1 text-sm">
          {onScheda && n.scheda_id
            ? <button type="button" className="font-semibold underline" onClick={() => onScheda(n.scheda_id!)}>Scheda {n.sigla}</button>
            : <b>Scheda {n.sigla}</b>}
          {(n.cliente || n.prodotto) && <span> · {[n.cliente, n.prodotto].filter(Boolean).join(" · ")}</span>}
        </div>
      )}
      {n.da_fare && <div className="mt-1.5 rounded-md bg-background/70 px-2 py-1 text-sm"><b>👉 Da fare:</b> <span className="whitespace-pre-line">{senzaIdWhatsApp(n.da_fare)}</span></div>}
      {aperta && (
        <>
          {n.storia && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{senzaIdWhatsApp(n.storia)}</p>}
          <p className="mt-1.5 text-xs opacity-75">Creata {n.creata_da ? `da ${n.creata_da} ` : ""}il {ora(n.created_at)}{n.letta_il ? ` · letta il ${ora(n.letta_il)}` : ""}</p>
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!operatore && <SceltaChi op={op} setOp={setChi} />}
        <div className="ml-auto flex flex-wrap gap-2">
          {!n.letta_il && <Button size="sm" variant="outline" disabled={busy} onClick={letta}><Eye />Segna come letta</Button>}
          {!chiudendo && <Button size="sm" disabled={busy} onClick={() => setChiudendo(true)}><Check />Chiudi: gestita</Button>}
        </div>
      </div>
      {chiudendo && (
        <div className="mt-2 space-y-2 rounded-lg border bg-background/80 p-2 text-foreground">
          <label className="text-sm font-medium">Esito — cosa è stato fatto (obbligatorio)</label>
          <textarea className={area} rows={3} autoFocus value={esito} onChange={(e) => setEsito(e.target.value)} placeholder="Es. scritto al cliente su WhatsApp, ha confermato il ritiro di lunedì" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setChiudendo(false); setEsito(""); }}>Annulla</Button>
            <Button size="sm" disabled={busy || !esito.trim()} onClick={chiudi}><Check />Chiudi come gestita{op ? ` (${op})` : ""}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chiuse({ lista, operatore, onCambiata }: { lista: NotificaGestire[]; operatore: string; onCambiata: () => void }) {
  async function riapri(id: string) {
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    if (!confirm("Riaprire la notifica? L'esito attuale resta scritto nella storia.")) return;
    try { await assNotificaRiapri(id, operatore); toast.success("Notifica riaperta"); onCambiata(); } catch (e) { toastErrore(e); }
  }
  if (!lista.length) return <p className="text-sm text-muted-foreground">Nessuna notifica chiusa.</p>;
  return (
    <div className="space-y-2">
      {lista.map((n) => (
        <div key={n.id} className="rounded-lg border p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <b>{ICONA[n.livello]} {senzaIdWhatsApp(n.titolo)}</b>
            {n.sigla && <span className="text-muted-foreground">· scheda {n.sigla}</span>}
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => riapri(n.id)}><RotateCcw />Riapri</Button>
          </div>
          {n.storia && <p className="mt-1 whitespace-pre-line text-muted-foreground">{senzaIdWhatsApp(n.storia)}</p>}
          {n.da_fare && <p className="mt-1"><b>Da fare:</b> {senzaIdWhatsApp(n.da_fare)}</p>}
          <p className="mt-1 rounded bg-green-50 px-2 py-1 text-green-950 dark:bg-green-950/40 dark:text-green-50">
            ✅ <b>Esito:</b> <span className="whitespace-pre-line">{senzaIdWhatsApp(n.esito)}</span>
            <span className="block text-xs opacity-75">chiusa da {n.chiusa_da} il {n.chiusa_il ? ora(n.chiusa_il) : ""} · creata il {ora(n.created_at)}{n.creata_da ? ` da ${n.creata_da}` : ""}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

function NuovaNotifica({ schedaId, operatore, onCreata, onAnnulla }: { schedaId: string; operatore: string; onCreata: () => void; onAnnulla: () => void }) {
  const [titolo, setTitolo] = useState("");
  const [storia, setStoria] = useState("");
  const [daFare, setDaFare] = useState("");
  const [livello, setLivello] = useState<NotificaGestire["livello"]>("attenzione");
  const [telegram, setTelegram] = useState(false);
  const [busy, setBusy] = useState(false);
  async function crea() {
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    if (!titolo.trim()) { toast.error("Scrivi il titolo"); return; }
    setBusy(true);
    try {
      await assNotificaCrea({ titolo: titolo.trim(), storia: storia.trim() || undefined, da_fare: daFare.trim() || undefined, livello, scheda_id: schedaId, telegram, operatore });
      toast.success("Notifica creata"); onCreata();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2 rounded-lg border bg-background p-3">
      <input className={area} placeholder="Titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} />
      <textarea className={area} rows={4} placeholder="Storia: cosa è successo (racconto completo)" value={storia} onChange={(e) => setStoria(e.target.value)} />
      <textarea className={area} rows={2} placeholder="Da fare: l'azione richiesta" value={daFare} onChange={(e) => setDaFare(e.target.value)} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>Livello:</span>
        {(["info", "attenzione", "urgente"] as const).map((l) => (
          <label key={l} className="inline-flex items-center gap-1"><input type="radio" checked={livello === l} onChange={() => setLivello(l)} />{ICONA[l]} {l}</label>
        ))}
        <label className="inline-flex items-center gap-1"><input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} />avvisa lo staff su Telegram</label>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onAnnulla}>Annulla</Button>
          <Button size="sm" disabled={busy || !titolo.trim()} onClick={crea}><Plus />Crea notifica</Button>
        </div>
      </div>
    </div>
  );
}

/** Nella SCHEDA: aperte ben visibili in alto, storico delle chiuse comprimibile, nuova notifica. */
export function NotificheScheda({ schedaId, aperte, operatore, onCambiata }: {
  schedaId: string; aperte: NotificaGestire[]; operatore: string; onCambiata: () => void;
}) {
  const [nuova, setNuova] = useState(false);
  const [chiuse, setChiuse] = useState<NotificaGestire[] | null>(null);
  async function caricaChiuse() {
    try { setChiuse((await assNotifiche("chiuse", schedaId)).notifiche); } catch (e) { toastErrore(e); }
  }
  const cambiata = () => { onCambiata(); if (chiuse) caricaChiuse(); };
  return (
    <div className="space-y-2">
      {aperte.length > 0 && (
        <div className="flex items-center gap-2 text-base font-bold text-red-700 dark:text-red-300">
          <BellRing className="h-5 w-5" /> {aperte.length === 1 ? "1 notifica da gestire" : `${aperte.length} notifiche da gestire`}
        </div>
      )}
      {aperte.map((n) => <NotificaCard key={n.id} n={n} operatore={operatore} onCambiata={cambiata} />)}
      {nuova && <NuovaNotifica schedaId={schedaId} operatore={operatore} onAnnulla={() => setNuova(false)} onCreata={() => { setNuova(false); cambiata(); }} />}
      <div className="flex flex-wrap justify-end gap-3 text-xs text-muted-foreground">
        {!nuova && <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => setNuova(true)}><Plus className="h-3 w-3" />nuova notifica da gestire</button>}
        <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => (chiuse ? setChiuse(null) : caricaChiuse())}>
          {chiuse ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}notifiche chiuse di questa scheda
        </button>
      </div>
      {chiuse && <Chiuse lista={chiuse} operatore={operatore} onCambiata={cambiata} />}
    </div>
  );
}

/** Sul BANCO (cruscotto): riquadro con il numero delle aperte; restano finché non sono chiuse. */
export function NotificheBanco({ notifiche, operatore, onScheda, onCambiata }: {
  notifiche: NotificaGestire[]; operatore: string; onScheda: (id: string) => void; onCambiata: () => void;
}) {
  const [chiuse, setChiuse] = useState<NotificaGestire[] | null>(null);
  const [ridotto, setRidotto] = useState(false);
  async function caricaChiuse() {
    try { setChiuse((await assNotifiche("chiuse")).notifiche); } catch (e) { toastErrore(e); }
  }
  const cambiata = () => { onCambiata(); if (chiuse) caricaChiuse(); };
  if (!notifiche.length && !chiuse) return null;
  return (
    <div className={`rounded-xl border-2 p-3 shadow-sm ${notifiche.length ? "border-red-600" : "border-muted"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className="h-5 w-5 text-red-600" />
        <span className="text-lg font-bold">Notifiche da gestire</span>
        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-red-600 px-2 text-sm font-bold text-white">{notifiche.length}</span>
        <div className="ml-auto flex gap-3 text-xs text-muted-foreground">
          {notifiche.length > 0 && <button type="button" className="underline" onClick={() => setRidotto((x) => !x)}>{ridotto ? "mostra" : "riduci"}</button>}
          <button type="button" className="underline" onClick={() => (chiuse ? setChiuse(null) : caricaChiuse())}>{chiuse ? "chiudi lo storico" : "storico chiuse"}</button>
        </div>
      </div>
      {!ridotto && notifiche.length > 0 && (
        <div className="mt-2 space-y-2">
          {notifiche.map((n) => <NotificaCard key={n.id} n={n} operatore={operatore} onScheda={onScheda} onCambiata={cambiata} compatta />)}
        </div>
      )}
      {chiuse && <div className="mt-3"><Chiuse lista={chiuse} operatore={operatore} onCambiata={cambiata} /></div>}
    </div>
  );
}
