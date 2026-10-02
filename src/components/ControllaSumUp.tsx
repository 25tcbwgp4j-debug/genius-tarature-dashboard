"use client";

// «CONTROLLA ADESSO IL CONTO SUMUP» (02/10/2026, Christian): il cliente al banco dice «ti ho appena fatto un bonifico
// istantaneo». Il pulsante registra una richiesta; l'iMac del negozio la vede entro ~20 secondi e lancia subito la lettura
// del conto (circa 1 minuto). Qui si segue la richiesta ogni 3 secondi; a fine giro il chiamante ricarica la lista.
// Se l'iMac non la prende entro 3 minuti il backend la chiude («l'iMac del negozio non ha risposto»).
// Limiti del backend: una richiesta aperta alla volta (chi preme mentre un controllo è in corso segue quello) e al
// massimo una lettura ogni 2 minuti, per non far bloccare l'accesso da SumUp.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOperatore } from "@/components/Operatore";
import { toastErrore } from "@/lib/errori";
import { bonRichiedi, bonRichiesta, type BonRichiesta } from "@/lib/bonifici";

const APERTA = ["in_attesa", "in_corso"];

export function ControllaSumUp({ origine, onFinito, aperta, className = "" }: {
  /** pannello · cassa · fattura */
  origine: string;
  /** a controllo concluso (evaso, errore o scaduto): ricaricare la lista dei bonifici */
  onFinito?: (r: BonRichiesta) => void;
  /** richiesta già aperta da qualcun altro (stato del backend): la si segue */
  aperta?: BonRichiesta | null;
  className?: string;
}) {
  const [operatore] = useOperatore();
  const [ric, setRic] = useState<BonRichiesta | null>(null);
  const [busy, setBusy] = useState(false);
  const [ora, setOra] = useState(() => Date.now());
  const fine = useRef(onFinito);
  useEffect(() => { fine.current = onFinito; }, [onFinito]);

  // segue una richiesta aperta da un altro pulsante / un altro operatore
  useEffect(() => { if (aperta && APERTA.includes(aperta.stato)) setRic((r) => (r && APERTA.includes(r.stato) ? r : aperta)); }, [aperta]);

  const inCorso = !!ric && APERTA.includes(ric.stato);
  const id = ric?.id;
  useEffect(() => {
    if (!inCorso || !id) return;
    const t = setInterval(async () => {
      setOra(Date.now());
      try {
        const { richiesta } = await bonRichiesta(id);
        setRic(richiesta);
        if (!APERTA.includes(richiesta.stato)) {
          if (richiesta.stato === "evasa") {
            const n = richiesta.nuovi || 0;
            toast.success(n ? `Conto SumUp letto: ${n} ${n === 1 ? "bonifico nuovo" : "bonifici nuovi"}` : "Conto SumUp letto: nessun bonifico nuovo");
          } else if (richiesta.stato === "scaduta") {
            toast.error("L'iMac del negozio non ha risposto: il conto non è stato letto", { duration: 12000 });
          } else {
            toast.error(richiesta.esito || "Controllo non riuscito", { duration: 12000 });
          }
          window.dispatchEvent(new Event("bonifici:aggiorna"));
          fine.current?.(richiesta);
        }
      } catch { /* rete: si riprova al giro dopo */ }
    }, 3000);
    return () => clearInterval(t);
  }, [inCorso, id]);

  const avvia = useCallback(async () => {
    setBusy(true);
    try {
      const { richiesta } = await bonRichiedi(origine, operatore || undefined);
      setRic(richiesta);
      setOra(Date.now());
      if (richiesta.gia_in_corso) toast.info("Un controllo del conto è già in corso: aspetto quello");
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }, [origine, operatore]);

  const secondi = ric ? Math.max(0, Math.round((ora - new Date(ric.richiesto_il).getTime()) / 1000)) : 0;
  return (
    <div className={`space-y-1 ${className}`}>
      <Button size="sm" variant="outline" className="w-full border-sky-400 text-sky-800 dark:text-sky-200" disabled={busy || inCorso} onClick={avvia}>
        {busy || inCorso ? <Loader2 className="animate-spin" /> : <Zap />} Controlla adesso il conto SumUp
      </Button>
      {inCorso && (
        <div className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs dark:bg-sky-950/30">
          <b>Controllo in corso… (circa 1 minuto)</b> · {ric!.stato === "in_attesa" ? "in attesa dell'iMac del negozio" : "l'iMac sta leggendo il conto"} · {secondi} s
          {ric!.stato === "in_attesa" && secondi > 60 && <div className="text-amber-700 dark:text-amber-300">L&apos;iMac non ha ancora risposto: si aspetta fino a 3 minuti.</div>}
        </div>
      )}
      {ric && !inCorso && ric.stato !== "evasa" && (
        <div className="flex items-start gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {ric.stato === "scaduta" ? "L'iMac del negozio non ha risposto (spento, in stop o senza rete): il conto non è stato letto." : ric.esito}
        </div>
      )}
      {ric && ric.stato === "evasa" && (
        <div className="text-xs text-emerald-700 dark:text-emerald-300">{ric.esito} · lista aggiornata</div>
      )}
    </div>
  );
}
