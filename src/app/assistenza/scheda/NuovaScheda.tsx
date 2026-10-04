"use client";

// NUOVA SCHEDA (05/10/2026, specifica §8.6): cliente dalla rubrica (un clic = scheda cliente completa) o nuovo,
// apparecchio con prodotto a menu e difetto in evidenza. Alla creazione: etichetta Brother SÌ, «Stampa accettazione
// A4» SEMPRE spenta di default, ricevuta d'ingresso SEMPRE per mail + WhatsApp, PDF della ricevuta da scaricare.
import { useState } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, FileText, Loader2, Mail, MessageCircle, Plus, Printer, Tag, UserRoundPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SceltaOperatore, type Operatore } from "@/components/Operatore";
import { toastErrore } from "@/lib/errori";
import { assCrea, assDocUrl, type Anagrafica, type ConfigAssistenza, type Esito, type Scheda } from "@/lib/assistenza";
import { Apparecchio, type ValoriApparecchio } from "./Apparecchio";
import { CercaCliente, PillTipo, SchedaClienteModal } from "./Cliente";
import { copia } from "./Comunicazioni";
import { Campo, Modale, campo } from "./ui";

export function NuovaScheda({ cfg, operatore, setOperatore, onClose, onCreata }: {
  cfg: ConfigAssistenza | null; operatore: string; setOperatore: (o: Operatore) => void; onClose: () => void; onCreata: (s: Scheda) => void;
}) {
  const [cli, setCli] = useState<{ azienda: string; telefono: string; email: string; referente: string; indirizzo_spedizione: string; note: string }>(
    { azienda: "", telefono: "", email: "", referente: "", indirizzo_spedizione: "", note: "" });
  const [anag, setAnag] = useState<Anagrafica | null>(null);
  const [schedaCli, setSchedaCli] = useState(false);
  const [app, setApp] = useState<ValoriApparecchio>({});
  const [stampaA4, setStampaA4] = useState(false);       // SEMPRE spenta di default (Christian 04/10)
  const [stampaEt, setStampaEt] = useState(true);
  const [inArrivo, setInArrivo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creata, setCreata] = useState<(Scheda & { esiti: Record<string, unknown> }) | null>(null);
  const setA = (k: keyof ValoriApparecchio, v: unknown) => setApp((x) => ({ ...x, [k]: v }));

  function daRubrica(a: Anagrafica) {
    setAnag(a);
    const sped = [a.sped_presso, a.sped_indirizzo, [a.sped_cap, a.sped_comune, a.sped_provincia].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    setCli((x) => ({ ...x, azienda: a.denominazione, telefono: a.cellulare_whatsapp || a.cellulare || a.telefono || x.telefono, email: a.email || x.email,
      referente: a.referente || x.referente, indirizzo_spedizione: sped || [a.indirizzo, a.cap, a.comune, a.provincia].filter(Boolean).join(" ") || x.indirizzo_spedizione }));
  }

  async function crea() {
    if (!operatore) { toast.error("Scegli l'operatore"); return; }
    if (!cli.azienda.trim()) { toast.error("Scrivi il nome del cliente"); return; }
    if (!app.famiglia) { toast.error("Scegli il prodotto"); return; }
    setBusy(true);
    try {
      const s = await assCrea({ ...cli, ...app, prodotto: app.prodotto || app.famiglia, operatore, anagrafica_id: anag?.id, in_arrivo: inArrivo,
        invia_ricevuta: true, invia_wa: true, stampa: inArrivo ? {} : { accettazione: stampaA4, etichetta: stampaEt } });
      toast.success(`Scheda ${s.sigla} creata`);
      setCreata(s);
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  if (creata) {
    const es = (creata.esiti?.ricevuta || {}) as Esito;
    return (
      <Modale titolo={`Scheda ${creata.sigla} creata`} onClose={() => onCreata(creata)}
        piedi={<Button onClick={() => onCreata(creata)}>Apri la scheda</Button>}>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-2xl font-bold tabular-nums">N. {creata.sigla}</div>
            <div className="text-muted-foreground">{creata.azienda} · {creata.modello || creata.prodotto}</div>
          </div>
          {creata.stato === "in_arrivo" ? <p>Dispositivo in arrivo col corriere: la ricevuta parte quando arriva («Dispositivo arrivato»).</p> : (
            <div className="space-y-1">
              <div><Mail className="mr-1 inline size-4" />Ricevuta per mail: {es.mail || "—"}</div>
              <div><MessageCircle className="mr-1 inline size-4" />WhatsApp: {es.whatsapp || "—"}</div>
              {es.whatsapp_testo && es.whatsapp && !es.whatsapp.startsWith("in coda") && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button size="sm" variant="outline" onClick={() => copia(es.whatsapp_testo || "")}>Copia testo WhatsApp</Button>
                  {es.whatsapp_link && <a className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted" href={es.whatsapp_link} target="_blank" rel="noreferrer"><MessageCircle className="size-3.5" />Apri chat</a>}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <a className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted" href={assDocUrl(creata.id, "ricevuta", true)}><Download className="size-4" />Scarica PDF ricevuta</a>
            <a className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted" href={assDocUrl(creata.id, "ricevuta")} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Apri</a>
          </div>
        </div>
      </Modale>
    );
  }

  const C = (k: keyof typeof cli, l: string, extra: React.ComponentProps<"input"> = {}) => (
    <Campo label={l}><input className={campo} value={cli[k]} onChange={(e) => setCli((x) => ({ ...x, [k]: e.target.value }))} {...extra} /></Campo>
  );
  return (
    <Modale titolo="Nuova scheda di assistenza" onClose={onClose} largo
      piedi={<>
        <span className="mr-auto hidden text-xs text-muted-foreground sm:block">Ctrl/Cmd+Invio per creare</span>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button disabled={busy || !operatore} onClick={crea}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}Crea scheda</Button></>}>
      <div className="space-y-4" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") crea(); }}>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">Cliente</div>
            <CercaCliente autoFocus onScelto={(a) => { daRubrica(a); setSchedaCli(true); }} />
            {anag && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm dark:bg-emerald-950/20">
                Dalla rubrica: <b>{anag.denominazione}</b><PillTipo a={anag} />
                <Button size="xs" variant="outline" className="ml-auto" onClick={() => setSchedaCli(true)}><UserRoundPen />Scheda cliente</Button>
                <button className="text-xs underline" onClick={() => setAnag(null)}>scollega</button>
              </div>
            )}
            {C("azienda", "Nome e cognome / azienda *")}
            <div className="grid grid-cols-2 gap-2">{C("telefono", "Cellulare (WhatsApp)", { inputMode: "tel" })}{C("email", "Email", { type: "email" })}</div>
            {!anag && <Button size="sm" variant="outline" onClick={() => setSchedaCli(true)}><UserRoundPen />Scheda cliente completa (P.IVA, fattura, spedizione…)</Button>}
            <div className="grid grid-cols-2 gap-2">{C("referente", "Referente")}{C("indirizzo_spedizione", "Indirizzo di spedizione")}</div>
          </div>
          <div className="space-y-3">
            <div className="text-sm font-semibold">Apparecchio</div>
            <Apparecchio v={app} set={setA} famiglie={cfg?.famiglie} compatto />
          </div>
        </div>
        <div className="space-y-3 border-t pt-3">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={inArrivo} onChange={(e) => setInArrivo(e.target.checked)} />Arriva col corriere (scheda «in arrivo»)</label>
            {!inArrivo && <>
              <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={stampaEt} onChange={(e) => setStampaEt(e.target.checked)} /><Tag className="size-4" />Etichetta Brother</label>
              <label className="flex items-center gap-1.5 text-muted-foreground"><input type="checkbox" className="size-4" checked={stampaA4} onChange={(e) => setStampaA4(e.target.checked)} /><Printer className="size-4" />Stampa accettazione A4</label>
            </>}
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><FileText className="size-4" />
            {inArrivo ? "La ricevuta d'ingresso parte (mail + WhatsApp) quando il dispositivo arriva." : `La ricevuta d'ingresso parte sempre: mail con PDF + WhatsApp${cfg && !cfg.numerazione_live ? ` (PROVA: mail solo a ${cfg.email_test}, WhatsApp da mandare a mano)` : ""}.`}</div>
          <SceltaOperatore value={operatore as Operatore} onChange={setOperatore} compatto />
        </div>
      </div>
      {schedaCli && (
        <SchedaClienteModal id={anag?.id || null} iniziale={anag ? undefined : { denominazione: cli.azienda, cellulare: cli.telefono, email: cli.email, referente: cli.referente }}
          onClose={() => setSchedaCli(false)} onSalvato={(a) => { daRubrica(a); setSchedaCli(false); }} />
      )}
    </Modale>
  );
}
