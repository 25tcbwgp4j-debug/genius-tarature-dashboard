// Messaggi d'errore uniformi: se l'incasso è bloccato perché la cassa del giorno è chiusa,
// il toast offre subito il pulsante per aprirla (e riaprirla).
import { toast } from "sonner";
import type { ApiError } from "@/lib/api";
import { eMessaggioSchedaCambiata } from "@/lib/versioneScheda";

export function eCassaChiusa(e: unknown) {
  const err = e as ApiError;
  return err?.status === 409 && /(cassa|giornata)[^.]*chiusa/i.test(err.message || "");
}

/** Operazione mandata all'amministratore per l'approvazione (dialog «Invia richiesta e attendi»): non è un errore. */
export function eInAttesa(e: unknown) {
  return !!(e as ApiError)?.inAttesa;
}

/** 15/11/2026 (piano 5.2): 409 «scheda modificata da un altro operatore» — lo gestisce il dialogo «ricarica» della scheda. */
export function eSchedaCambiata(e: unknown) {
  const err = e as ApiError;
  return err?.status === 409 && eMessaggioSchedaCambiata(err.message);
}

export function toastErrore(e: unknown) {
  const m = (e as Error)?.message || "Errore";
  if (eSchedaCambiata(e)) return;   // niente toast: c'è già il dialogo «Qualcuno ha modificato la scheda: ricarica»
  if (eInAttesa(e)) {
    toast.info(m, { duration: 8000 });
  } else if (eCassaChiusa(e)) {
    toast.error(m, { duration: 12000, action: { label: "Apri cassa del giorno", onClick: () => { window.location.href = "/cassa/giornata"; } } });
  } else {
    toast.error(m);
  }
}

/** 15/11/2026: codice dell'errore strutturato del server (detail.codice: «proposta_cambiata», «preventivo_testi», …). */
export function codiceErrore(e: unknown): string | undefined {
  const d = (e as ApiError)?.detail;
  return d && typeof d === "object" && typeof d.codice === "string" ? d.codice : undefined;
}

/** 15/11/2026: il dettaglio strutturato dell'errore (problemi, blocchi, mancano…), o un oggetto vuoto. */
export function dettaglioErrore(e: unknown): Record<string, unknown> {
  const d = (e as ApiError)?.detail;
  return d && typeof d === "object" ? (d as Record<string, unknown>) : {};
}

/** 15/11/2026 (piano 5.3/5.4): il server chiede la FORZATURA DEL TITOLARE con il motivo (consegna senza pagamento,
 *  chiusura con pagamento fuori dal gestionale, comunicazione fuori stato): 403 «lo può fare solo il titolare»,
 *  400 «scrivi il motivo», 409 «oppure il titolare conferma…» / «il titolare può forzare con il motivo». */
export function eServeTitolare(e: unknown) {
  const err = e as ApiError;
  const m = err?.message || "";
  return (err?.status === 403 && /solo il titolare/i.test(m)) || (err?.status === 400 && /scrivi il motivo/i.test(m))
    || (err?.status === 409 && /il titolare (conferma|può forzare)/i.test(m));
}
