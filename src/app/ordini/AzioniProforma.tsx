"use client";

// AZIONI SUL PRO FORMA (05/10/2026, caso PF 10/2026 Fabrizio Esposito) — su TUTTI i pro forma, anche convertiti:
// PDF · Stampa al banco (coda «normale» dell'iMac SX) · Stampa qui (stampa del browser) · Email · WhatsApp ·
// Sposta in Apple/Tarature · Spedisci (UPS/DHL). Mittente, firma e linea WhatsApp vengono dalla DIVISIONE del documento.
// WhatsApp Apple: la linea 334 è in SOLA LETTURA → mai invio automatico, si apre WhatsApp sul telefono col testo pronto.

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, FileText, Loader2, Mail, MessageCircle, Printer, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOperatore } from "@/components/Operatore";
import { usePermessi } from "@/components/permessi";
import { SpedisciDocumento } from "@/components/SpedisciDocumento";
import { toastErrore } from "@/lib/errori";
import { docInvia, docInvioAnteprima, docSposta, docStampa, getDocumentoPdfUrl, type DocumentoCliente, type InvioAnteprima } from "@/lib/api";

const oraIt = (s?: string | null) => s ? new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

export function AzioniProforma({ d, onCambiato }: { d: DocumentoCliente; onCambiato: (d?: DocumentoCliente) => void }) {
  const [busy, setBusy] = useState("");
  const [invio, setInvio] = useState<InvioAnteprima | null>(null);
  const { admin } = usePermessi();
  const att = d.attivita || (d.session_id ? "tarature" : "apple");
  const altra = att === "apple" ? "tarature" : "apple";
  const aperto = d.stato === "aperto";

  async function stampaBanco() {
    setBusy("stampa");
    try {
      const r = await docStampa(d.id);
      toast.success(r.agente_attivo ? `${d.sigla} in stampa al banco (stampante normale)` : `${d.sigla} in coda, ma l'agente di stampa del banco non risponde: usa «Stampa qui»`,
        { duration: 8000 });
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  function stampaQui() {
    // il PDF in una finestra nuova + la stampa del browser (Safari/Chrome)
    const w = window.open(getDocumentoPdfUrl(d.id), "_blank");
    if (!w) { toast.error("Il browser ha bloccato la finestra: consenti i popup"); return; }
    w.addEventListener?.("load", () => { try { w.focus(); w.print(); } catch { /* la stampa la avvia l'utente dal visore PDF */ } });
  }
  async function apriInvio(canale: "email" | "whatsapp") {
    setBusy(canale);
    try { setInvio(await docInvioAnteprima(d.id, canale)); } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function sposta() {
    const nome = altra === "apple" ? "Apple" : "Tarature";
    let corpo: { attivita: "tarature" | "apple"; conferma?: boolean; anche_collegati?: boolean } = { attivita: altra };
    if (!aperto) {
      if (!confirm(`${d.sigla} è già ${d.stato}. Spostarlo in ${nome}?\n\nCambia solo l'ETICHETTA interna (anche dello scontrino/fattura nati dalla conversione): numerazione unica, XML e registratore non cambiano.`)) return;
      corpo = { ...corpo, conferma: true, anche_collegati: true };
    } else if (!confirm(`Spostare ${d.sigla} in ${nome}? Cambiano mittente e firma delle mail, linea WhatsApp ed etichetta del PDF.`)) return;
    setBusy("sposta");
    try {
      const r = await docSposta(d.id, corpo);
      toast.success(`${d.sigla} spostato in ${nome}${r.collegati_spostati?.length ? ` (anche ${r.collegati_spostati.join(", ")})` : ""}`);
      onCambiato(r);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  const invii = (d.avvisi || []).filter((a) => a.tipo === "invio_proforma");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button size="sm" variant="outline" onClick={() => window.open(getDocumentoPdfUrl(d.id), "_blank")}><FileText className="mr-1 size-4" />PDF</Button>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={stampaBanco} title="Stampante normale del banco (iMac SX)">
          {busy === "stampa" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Printer className="mr-1 size-4" />}Stampa al banco</Button>
        <Button size="sm" variant="ghost" onClick={stampaQui}><Printer className="mr-1 size-4" />Stampa qui</Button>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => apriInvio("email")}>
          {busy === "email" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Mail className="mr-1 size-4" />}Invia per email</Button>
        <Button size="sm" variant="outline" className="border-green-500 text-green-800 dark:text-green-300" disabled={!!busy} onClick={() => apriInvio("whatsapp")}>
          {busy === "whatsapp" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <MessageCircle className="mr-1 size-4" />}Invia per WhatsApp</Button>
        {d.stato !== "annullato" && <Button size="sm" variant="ghost" disabled={!!busy} onClick={sposta}
          title={!aperto && !admin ? "Pro forma convertito: serve l'autorizzazione del titolare" : undefined}>
          <ArrowRightLeft className="mr-1 size-4" />Sposta in {altra === "apple" ? "Apple" : "Tarature"}</Button>}
      </div>
      <SpedisciDocumento link={{ documento_id: d.id }} />
      {!!invii.length && (
        <div className="text-xs text-muted-foreground" data-testid="invii-proforma">
          {invii.map((a, i) => <div key={i}>{a.canale === "email" ? "✉️ Email" : "💬 WhatsApp"} {a.modo === "wa.me" ? "preparato (aperto sul telefono)" : a.modo === "in_coda" ? "in coda" : "inviata"} il {oraIt(a.il)} a {a.destinatario}
            {a.mittente ? ` da ${a.mittente}` : ""}{a.operatore ? ` · ${a.operatore}` : ""}</div>)}
        </div>
      )}
      {invio && <FinestraInvio d={d} a={invio} onChiudi={() => setInvio(null)} onInviato={() => { setInvio(null); onCambiato(); }} />}
    </div>
  );
}

function FinestraInvio({ d, a, onChiudi, onInviato }: { d: DocumentoCliente; a: InvioAnteprima; onChiudi: () => void; onInviato: () => void }) {
  const [dest, setDest] = useState(a.destinatario || "");
  const [oggetto, setOggetto] = useState(a.oggetto || "");
  const [testo, setTesto] = useState(a.testo);
  const [busy, setBusy] = useState(false);
  const [operatore] = useOperatore();
  const chiudiRef = useRef(onChiudi);
  useEffect(() => { chiudiRef.current = onChiudi; });
  useEffect(() => {
    // Esc chiude solo questa finestra (il pannello del pro forma resta aperto)
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); chiudiRef.current(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
  const email = a.canale === "email";
  const numero = dest.replace(/\D/g, "").replace(/^00/, "");
  const cel = numero.length >= 9 && numero.length <= 10 && numero.startsWith("3") ? `39${numero}` : numero;
  const waLink = cel.length >= 10 ? `https://wa.me/${cel}?text=${encodeURIComponent(testo)}` : null;

  async function invia() {
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    if (email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dest.trim())) { toast.error("Email del destinatario non valida"); return; }
      if (!confirm(`Inviare ${d.sigla} a ${dest.trim()} da ${a.mittente}?`)) return;
    } else if (!waLink) { toast.error("Numero WhatsApp non valido"); return; }
    setBusy(true);
    try {
      if (email) {
        const r = await docInvia(d.id, { canale: "email", destinatario: dest.trim(), oggetto, testo, operatore });
        toast.success(`Email inviata a ${r.a} da ${r.mittente}`);
      } else if (a.automatica) {
        const r = await docInvia(d.id, { canale: "whatsapp", destinatario: dest, testo, operatore });
        toast.success(`WhatsApp in coda sulla linea ${a.numero} per ${r.a}`);
      } else {
        // linea Apple (sola lettura) o non collegata: si apre WhatsApp sul telefono/computer col testo pronto
        window.open(waLink!, "_blank", "noopener");
        await docInvia(d.id, { canale: "whatsapp", destinatario: dest, testo, operatore, solo_link: true });
        toast.success("WhatsApp aperto col messaggio pronto: premi Invia");
      }
      onInviato();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true"
      aria-label={email ? "Invia per email" : "Invia per WhatsApp"} onClick={onChiudi}>
      <div className="max-h-[95vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-t-xl bg-background p-4 shadow-2xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">{email ? <Mail className="size-5" /> : <MessageCircle className="size-5 text-green-600" />}
            {d.sigla} per {email ? "email" : "WhatsApp"}</h2>
          <Button size="icon-sm" variant="ghost" onClick={onChiudi} aria-label="Chiudi"><X /></Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {email ? <>Da <b>{a.mittente}</b> · allegato <b>{a.allegato}</b> · firma della divisione {a.attivita === "apple" ? "Apple" : "Tarature"}</>
            : <>Linea <b>{a.etichetta} {a.numero}</b> · link al PDF nel messaggio</>}
        </div>
        {!email && !a.automatica && (
          <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100" data-testid="wa-non-attiva">
            {a.attivita === "apple"
              ? <><b>Linea 334 non ancora attiva</b> per l&apos;invio dal gestionale: si apre WhatsApp sul telefono col testo pronto.</>
              : <>{a.avviso}.</>} Nessun invio automatico.
          </div>
        )}
        <label className="block text-xs text-muted-foreground">{email ? "Destinatario (email)" : "Numero WhatsApp"}
          <Input className="h-9" value={dest} onChange={(e) => setDest(e.target.value)} placeholder={email ? "cliente@esempio.it" : "+39 3..."} /></label>
        {email && <label className="block text-xs text-muted-foreground">Oggetto<Input className="h-9" value={oggetto} onChange={(e) => setOggetto(e.target.value)} /></label>}
        <label className="block text-xs text-muted-foreground">Messaggio
          <textarea className="mt-1 h-56 w-full rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground" value={testo} onChange={(e) => setTesto(e.target.value)} /></label>
        {email && a.firma && <div className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">Firma (automatica):{"\n"}{a.firma}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button disabled={busy || !operatore} onClick={invia} className={email ? "" : "bg-green-600 text-white hover:bg-green-700"}>
            {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Send className="mr-1 size-4" />}
            {email ? "Invia email" : a.automatica ? "Metti in coda WhatsApp" : "Apri WhatsApp col testo pronto"}</Button>
        </div>
        {!operatore && <div className="text-right text-xs text-red-700">Scegli l&apos;operatore nel pannello del pro forma.</div>}
      </div>
    </div>
  );
}
