"use client";
// Chiusura fiscale con UN pulsante: la dashboard mette in coda il comando, l'agente sul server del negozio fa
// l'azzeramento Z01 sul registratore (che stampa la chiusura e invia i corrispettivi), poi rilegge le Z del giorno
// e ne scrive il totale nel controllo «Scontrini».
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { cassaChiusuraFiscale, cassaChiusureFiscali, type ChiusuraRt, type RichiestaChiusura } from "@/lib/api";
import { toastErrore } from "@/lib/errori";

const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const ora = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
// dopo 5 minuti senza risposta la rotellina si ferma e si spiega cosa controllare (02/10/2026: rimasta ferma per ore)
const ATTESA_MAX_MS = 5 * 60 * 1000;
const PRIMA = (a: RichiestaChiusura) => ["da_stampare", "in_stampa"].includes(a.stato);
/** Z registrate dopo la richiesta: la chiusura c'è anche se l'agente ha segnato un errore (es. risposta lenta del registratore). */
function zDopo(chiusure: ChiusuraRt[], r?: RichiestaChiusura) {
  if (!r) return [];
  const hhmm = ora(r.created_at);
  return chiusure.filter((c) => (c.ora || "") >= hhmm);
}

export function ChiusuraFiscale({ giorno, oggi, operatore, onFatta }: { giorno: string; oggi: boolean; operatore: string | null; onFatta: () => void }) {
  const [richieste, setRichieste] = useState<RichiestaChiusura[]>([]);
  const [chiusure, setChiusure] = useState<ChiusuraRt[]>([]);
  const [invio, setInvio] = useState(false);
  const [adesso, setAdesso] = useState(() => Date.now());
  const ultima = richieste[richieste.length - 1];
  const inAttesa = !!ultima && PRIMA(ultima);
  const scaduta = inAttesa && adesso - new Date(ultima.created_at).getTime() > ATTESA_MAX_MS;
  const inCorso = inAttesa && !scaduta;
  const zFatte = zDopo(chiusure, ultima);

  const carica = useCallback(async () => {
    try {
      const r = await cassaChiusureFiscali(giorno);
      setRichieste(r.richieste); setChiusure(r.chiusure);
      return r;
    } catch { return null; }
  }, [giorno]);
  useEffect(() => { carica(); }, [carica]);

  // mentre la chiusura è in coda o in corso controllo ogni 3 secondi (dopo 5 minuti ogni 30: la Z può arrivare tardi)
  useEffect(() => {
    if (!inAttesa) return;
    const t = setInterval(async () => {
      setAdesso(Date.now());
      const r = await carica();
      const u = r?.richieste[r.richieste.length - 1];
      if (u && u.id === ultima.id && !PRIMA(u)) {
        const z = zDopo(r?.chiusure || [], u);
        if (u.stato === "emesso") { toast.success("Chiusura fiscale fatta: il registratore ha stampato la chiusura e inviato i corrispettivi"); onFatta(); }
        else if (z.length) { toast.success(`Chiusura fiscale fatta: Z ${z.map((c) => c.z).join(", ")} registrata (l'agente ha segnalato: ${u.errore || u.stato})`, { duration: 15000 }); onFatta(); }
        else toast.error(`Chiusura NON fatta: ${u.errore || u.stato}`, { duration: 15000 });
      }
    }, scaduta ? 30000 : 3000);
    return () => clearInterval(t);
  }, [inAttesa, scaduta, ultima, carica, onFatta]);

  async function avvia() {
    if (!operatore) { toast.error("Scegli prima l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    if (!confirm("Fare ADESSO la chiusura fiscale del registratore?\n\nDopo la chiusura gli scontrini di oggi non si possono più annullare dal registratore. Falla solo a fine giornata, dopo l'ultimo scontrino.")) return;
    setInvio(true);
    try { await cassaChiusuraFiscale(operatore); toast.info("Chiusura richiesta: il registratore la sta facendo…"); await carica(); }
    catch (e) { toastErrore(e); }
    finally { setInvio(false); }
  }

  return (
    <div className="mt-2 space-y-1.5">
      {chiusure.map((c) => (
        <div key={c.z} className="rounded bg-background/70 px-2 py-1 text-xs">
          <b>Z {c.z}</b> delle {c.ora} · <b>{eur(c.totale)}</b> · {c.documenti} doc.
          <span className="text-muted-foreground"> (contanti {eur(c.contanti)} · elettronico {eur(c.elettronico)}{c.annulli ? ` · annulli ${eur(c.annulli)}` : ""})</span>
        </div>
      ))}
      {chiusure.length > 1 && <div className="text-xs font-medium">Totale chiusure del giorno: {eur(chiusure.reduce((s, c) => s + c.totale, 0))}</div>}
      {inCorso && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Loader2 className="size-4 animate-spin" />
          {ultima.stato === "da_stampare" ? "Chiusura richiesta alle " + ora(ultima.created_at) + ": in attesa del registratore…" : "Chiusura in corso: invio corrispettivi…"}
        </div>
      )}
      {scaduta && (
        <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-200">
          ⚠️ Nessuna risposta dal registratore da più di 5 minuti (richiesta delle {ora(ultima.created_at)}). <b>Non rifare la chiusura</b>:
          guarda se il registratore ha stampato lo scontrino di chiusura e se il server del negozio (agente di cassa) è acceso.
          Se la Z c&apos;è, comparirà qui da sola appena l&apos;agente la rilegge.
        </div>
      )}
      {ultima && ultima.stato === "errore" && zFatte.length > 0 && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          ✅ Chiusura fatta: Z {zFatte.map((c) => c.z).join(", ")} registrata dopo la richiesta delle {ora(ultima.created_at)}.
          <span className="text-muted-foreground"> L&apos;agente aveva segnalato: {ultima.errore || "errore"}</span>
        </div>
      )}
      {ultima && ultima.stato === "errore" && zFatte.length === 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-200">
          ❌ Ultima richiesta ({ora(ultima.created_at)}) non riuscita: {ultima.errore}
        </div>
      )}
      {oggi && (
        <Button className="w-full bg-indigo-700 hover:bg-indigo-800" disabled={invio || inAttesa || !operatore} onClick={avvia}
          title={operatore ? "Fa la chiusura fiscale sul registratore" : "Scegli prima l'operatore"}>
          {invio || inCorso ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Printer className="mr-1 size-4" />}
          {chiusure.length ? "Nuova chiusura fiscale" : "Fai la chiusura fiscale"}
        </Button>
      )}
    </div>
  );
}
