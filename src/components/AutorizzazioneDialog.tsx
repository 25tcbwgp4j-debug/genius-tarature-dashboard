"use client";

// DIALOG GLOBALE «Serve l'autorizzazione dell'amministratore» (01/10/2026).
// Montato una volta nel layout: si registra in lib/api.ts e si apre da solo quando una qualsiasi chiamata
// riceve 403 «autorizzazione_richiesta». Due strade:
//  (a) l'amministratore è al banco: digita email e password (+ motivo) → la STESSA chiamata viene ripetuta con
//      gli header X-Admin-* e l'operazione è eseguita subito;
//  (b) «Invia richiesta e attendi»: la richiesta è già registrata sul server; l'admin la approva dalla pagina
//      Autorizzazioni (o dal Telegram) e il server la esegue. Qui controlliamo ogni tanto l'esito e lo notifichiamo.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Send, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { autElenco, registraGestoreAutorizzazione, type ApiError, type RichiestaAutorizzazione } from "@/lib/api";

type InCoda = RichiestaAutorizzazione & { resolve: (v: unknown) => void; reject: (e: unknown) => void };
const CHIAVE_EMAIL = "gt-admin-email";

function erroreInAttesa(r: RichiestaAutorizzazione): ApiError {
  const e = new Error("Richiesta inviata all'amministratore: l'operazione sarà eseguita appena la approva.") as ApiError;
  e.status = 403; e.inAttesa = true; e.autorizzazioneId = r.id;
  return e;
}

/** Controlla ogni 10 s (fino a 30 min) se l'admin ha deciso e avvisa l'operatore. */
function seguiRichiesta(id: string) {
  if (!id) return;
  const inizio = Date.now();
  const giro = async () => {
    if (Date.now() - inizio > 30 * 60_000) return;
    try {
      const a = (await autElenco("")).find((x) => x.id === id);
      if (a && a.stato !== "in_attesa") {
        const ricarica = { label: "Aggiorna la pagina", onClick: () => window.location.reload() };
        if (a.stato === "eseguita" || a.stato === "approvata") toast.success(`Autorizzato da ${a.decisa_da || "l'amministratore"}: operazione eseguita`, { duration: 20000, action: ricarica });
        else if (a.stato === "rifiutata") toast.error(`L'amministratore ha rifiutato: ${a.descrizione || "operazione"}`, { duration: 20000 });
        else toast.error("Approvata, ma l'operazione non è riuscita: controlla nella pagina Autorizzazioni", { duration: 20000 });
        return;
      }
    } catch { /* rete: si riprova */ }
    setTimeout(giro, 10_000);
  };
  setTimeout(giro, 10_000);
}

export function AutorizzazioneDialog() {
  const [coda, setCoda] = useState<InCoda[]>([]);
  const corrente = coda[0] || null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registraGestoreAutorizzazione((r) => new Promise((resolve, reject) => {
      setCoda((c) => [...c, { ...r, resolve, reject }]);
    }));
    return () => registraGestoreAutorizzazione(null);
  }, []);

  // a ogni nuova richiesta: campi puliti, email dell'ultimo admin che ha autorizzato da questo dispositivo
  const idCorrente = corrente ? `${corrente.id}-${corrente.percorso}` : "";
  const [visto, setVisto] = useState("");
  if (idCorrente && idCorrente !== visto) {
    setVisto(idCorrente);
    let em = "";
    try { em = localStorage.getItem(CHIAVE_EMAIL) || ""; } catch { /* storage non disponibile */ }
    setEmail(em); setPassword(""); setMotivo(""); setErrore(""); setBusy(false);
  }

  const togli = useCallback(() => setCoda((c) => c.slice(1)), []);

  function attendi() {
    if (!corrente || busy) return;
    corrente.reject(erroreInAttesa(corrente));
    seguiRichiesta(corrente.id);
    togli();
  }

  async function autorizza(e?: React.FormEvent) {
    e?.preventDefault();
    if (!corrente || busy) return;
    if (!email.trim() || !password) { setErrore("Scrivi email e password dell'amministratore"); return; }
    setBusy(true); setErrore("");
    try {
      const r = await corrente.esegui({ "X-Admin-Email": email, "X-Admin-Password": password, "X-Motivo": motivo });
      try { localStorage.setItem(CHIAVE_EMAIL, email.trim()); } catch { /* storage non disponibile */ }
      toast.success(`Autorizzato da ${email.trim()}`);
      corrente.resolve(r);
      togli();
    } catch (err) {
      const e2 = err as ApiError;
      setPassword("");
      setErrore(e2?.status === 403 ? (e2.message || "Credenziali dell'amministratore non valide") : (e2?.message || "Errore"));
      // l'operazione è stata tentata ma è fallita per un motivo suo (es. cassa chiusa): la chiamata originale riceve l'errore
      if (e2?.status && e2.status !== 403) { corrente.reject(err); togli(); }
      else setTimeout(() => pwRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!corrente} onOpenChange={(o) => { if (!o) attendi(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-amber-600" /> Serve l&apos;autorizzazione dell&apos;amministratore</DialogTitle>
          <DialogDescription>
            {corrente?.messaggio || "Questa operazione può farla solo un amministratore."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={autorizza} className="space-y-3">
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <b>L&apos;amministratore è qui?</b> Digiti la sua email e password: l&apos;operazione viene eseguita subito e resta registrato chi l&apos;ha autorizzata.
          </div>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Email amministratore</span>
            <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} /></label>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Password amministratore</span>
            <Input ref={pwRef} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} autoFocus /></label>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Motivo (facoltativo)</span>
            <Input value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} disabled={busy} placeholder="es. cliente ha restituito il prodotto" /></label>
          {errore && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{errore}</div>}
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={attendi} disabled={busy}
              title="La richiesta è già stata registrata: l'amministratore la approva dalla pagina Autorizzazioni">
              <Send /> Invia richiesta e attendi
            </Button>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Autorizza ed esegui</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
