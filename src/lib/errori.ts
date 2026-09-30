// Messaggi d'errore uniformi: se l'incasso è bloccato perché la cassa del giorno è chiusa,
// il toast offre subito il pulsante per aprirla (e riaprirla).
import { toast } from "sonner";
import type { ApiError } from "@/lib/api";

export function eCassaChiusa(e: unknown) {
  const err = e as ApiError;
  return err?.status === 409 && /(cassa|giornata)[^.]*chiusa/i.test(err.message || "");
}

/** Operazione mandata all'amministratore per l'approvazione (dialog «Invia richiesta e attendi»): non è un errore. */
export function eInAttesa(e: unknown) {
  return !!(e as ApiError)?.inAttesa;
}

export function toastErrore(e: unknown) {
  const m = (e as Error)?.message || "Errore";
  if (eInAttesa(e)) {
    toast.info(m, { duration: 8000 });
  } else if (eCassaChiusa(e)) {
    toast.error(m, { duration: 12000, action: { label: "Apri cassa del giorno", onClick: () => { window.location.href = "/cassa/giornata"; } } });
  } else {
    toast.error(m);
  }
}
