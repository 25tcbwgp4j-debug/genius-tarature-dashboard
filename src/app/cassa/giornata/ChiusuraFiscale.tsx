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

export function ChiusuraFiscale({ giorno, oggi, operatore, onFatta }: { giorno: string; oggi: boolean; operatore: string | null; onFatta: () => void }) {
  const [richieste, setRichieste] = useState<RichiestaChiusura[]>([]);
  const [chiusure, setChiusure] = useState<ChiusuraRt[]>([]);
  const [invio, setInvio] = useState(false);
  const ultima = richieste[richieste.length - 1];
  const inCorso = !!ultima && ["da_stampare", "in_stampa"].includes(ultima.stato);

  const carica = useCallback(async () => {
    try {
      const r = await cassaChiusureFiscali(giorno);
      setRichieste(r.richieste); setChiusure(r.chiusure);
      return r;
    } catch { return null; }
  }, [giorno]);
  useEffect(() => { carica(); }, [carica]);

  // mentre la chiusura è in coda o in corso controllo ogni 3 secondi
  useEffect(() => {
    if (!inCorso) return;
    const t = setInterval(async () => {
      const r = await carica();
      const u = r?.richieste[r.richieste.length - 1];
      if (u && u.id === ultima.id && !["da_stampare", "in_stampa"].includes(u.stato)) {
        if (u.stato === "emesso") { toast.success("Chiusura fiscale fatta: il registratore ha stampato la chiusura e inviato i corrispettivi"); onFatta(); }
        else toast.error(`Chiusura NON fatta: ${u.errore || u.stato}`, { duration: 15000 });
      }
    }, 3000);
    return () => clearInterval(t);
  }, [inCorso, ultima, carica, onFatta]);

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
      {ultima && ultima.stato === "errore" && (
        <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-200">
          ❌ Ultima richiesta ({ora(ultima.created_at)}) non riuscita: {ultima.errore}
        </div>
      )}
      {oggi && (
        <Button className="w-full bg-indigo-700 hover:bg-indigo-800" disabled={invio || inCorso || !operatore} onClick={avvia}
          title={operatore ? "Fa la chiusura fiscale sul registratore" : "Scegli prima l'operatore"}>
          {invio || inCorso ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Printer className="mr-1 size-4" />}
          {chiusure.length ? "Nuova chiusura fiscale" : "Fai la chiusura fiscale"}
        </Button>
      )}
    </div>
  );
}
