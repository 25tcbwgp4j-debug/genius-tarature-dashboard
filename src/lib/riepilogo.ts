"use client";

// RIEPILOGO AVVISI condiviso (15/11/2026, consumi Vercel DIGITALE-61 / B-34): un solo giro al minuto per tutti gli
// avvisi della pagina (bonifici, Stripe, da richiamare, notifiche da gestire) con UNA chiamata a /api/riepilogo.
// Niente chiamate con la scheda nascosta; al ritorno sulla scheda (o al focus) si aggiorna subito.
// Cambiando pagina non si richiede nulla se i dati hanno meno di 30 secondi.
import { attivitaSalvata } from "@/lib/attivita";
import { puoAggiornare } from "@/lib/polling";   // 17/11/2026 DIGITALE-61: niente polling a scheda nascosta o di notte senza attività

export type VoceRiepilogo = "bonifici" | "stripe" | "richiamare" | "notifiche";
type Ascoltatore = (dati: unknown) => void;

const OGNI_MS = 60_000;
const FRESCO_MS = 30_000;
const ascoltatori = new Map<VoceRiepilogo, Set<Ascoltatore>>();
const ultimi = new Map<VoceRiepilogo, { dati: unknown; quando: number }>();
let timer: ReturnType<typeof setInterval> | null = null;
let inCorso: Promise<void> | null = null;
const inAttesa = new Set<VoceRiepilogo>();
let attesaProgrammata = false;

function giro(voci?: VoceRiepilogo[], forza = false): Promise<void> {
  if (!puoAggiornare() && !forza) return Promise.resolve();
  const ora = Date.now();
  const daChiedere = (voci || [...ascoltatori.keys()]).filter((v) => (ascoltatori.get(v)?.size || 0) > 0
    && (forza || ora - (ultimi.get(v)?.quando || 0) >= FRESCO_MS));
  if (!daChiedere.length) return Promise.resolve();
  if (inCorso && !forza) return inCorso;
  const p = fetch(`/api/riepilogo?voci=${daChiedere.join(",")}`, { cache: "no-store", headers: { "X-Attivita": attivitaSalvata() } })
    .then(async (r) => {
      if (r.status === 401) { window.location.href = "/login?error=session_expired"; return; }
      if (!r.ok) return;
      const corpo = (await r.json()) as Record<string, { status: number; dati: unknown }>;
      for (const v of daChiedere) {
        const e = corpo[v];
        if (!e || e.status !== 200) continue;   // errore di una voce: resta il dato precedente, come prima
        ultimi.set(v, { dati: e.dati, quando: Date.now() });
        ascoltatori.get(v)?.forEach((cb) => cb(e.dati));
      }
    })
    .catch(() => undefined)
    .finally(() => { if (inCorso === p) inCorso = null; });
  inCorso = p;
  return p;
}

const alRitorno = () => { if (!document.hidden) void giro(); };

function avvia() {
  if (timer) return;
  timer = setInterval(() => void giro(), OGNI_MS);
  document.addEventListener("visibilitychange", alRitorno);
  window.addEventListener("focus", alRitorno);
}
function fermaSeVuoto() {
  if ([...ascoltatori.values()].some((s) => s.size)) return;
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener("visibilitychange", alRitorno);
  window.removeEventListener("focus", alRitorno);
}

/** Si iscrive a una voce: riceve subito l'ultimo dato (se c'è) e poi ogni aggiornamento. Ritorna la disiscrizione. */
export function iscriviRiepilogo(voce: VoceRiepilogo, cb: Ascoltatore): () => void {
  if (!ascoltatori.has(voce)) ascoltatori.set(voce, new Set());
  ascoltatori.get(voce)!.add(cb);
  const u = ultimi.get(voce);
  if (u) cb(u.dati);
  avvia();
  // le iscrizioni dello stesso render si raccolgono in un'unica chiamata
  inAttesa.add(voce);
  if (!attesaProgrammata) {
    attesaProgrammata = true;
    setTimeout(() => {
      attesaProgrammata = false;
      const voci = [...inAttesa]; inAttesa.clear();
      const parti = () => giro(voci);
      // se c'è già un giro in corso (per altre voci) si aspetta che finisca, poi si chiedono queste
      void (inCorso ? inCorso.then(parti) : parti());
    }, 0);
  }
  return () => { ascoltatori.get(voce)?.delete(cb); fermaSeVuoto(); };
}

/** Dopo un'azione (es. «Visto», «Richiamato»): rilegge subito le voci indicate. */
export function aggiornaRiepilogo(...voci: VoceRiepilogo[]): Promise<void> {
  return giro(voci.length ? voci : undefined, true);
}
