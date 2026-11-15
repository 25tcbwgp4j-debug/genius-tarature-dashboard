// VERSIONE DELLA SCHEDA APERTA (15/11/2026, piano Genius 5.2 — backend 9e074b9).
// Il server confronta l'header «X-Scheda-Versione» (l'updated_at letto dalla dashboard) con quello salvato: se un altro
// operatore ha scritto nel frattempo risponde 409 «La scheda è stata modificata da un altro operatore…» e NON salva nulla.
// Qui teniamo l'updated_at delle schede APERTE (SchedaView le apre e le chiude) e fetchAPI lo usa da solo:
//  - GET /api/assistenza/schede/{id}                     → versione letta all'apertura / alla ricarica;
//  - POST/PATCH/PUT/DELETE /api/assistenza/schede/{id}…  → header X-Scheda-Versione;
//  - risposta di una scrittura che restituisce la scheda → versione aggiornata (le scritture successive partono da lì);
//  - scrittura sulla scheda che NON restituisce la scheda → versione dimenticata (niente header fino alla prossima lettura:
//    meglio nessun controllo che un falso «qualcuno l'ha modificata»; SchedaView ricarica dopo ogni azione);
//  - 409 di concorrenza → evento «scheda-cambiata» per il dialogo «Qualcuno ha modificato la scheda: ricarica».
// Nessun import da api.ts (niente dipendenze circolari).

export const EVENTO_SCHEDA_CAMBIATA = "gl-scheda-cambiata";
export type DettaglioSchedaCambiata = { sid: string; corpo: Record<string, unknown> | null; messaggio: string };

const aperte = new Map<string, number>();     // sid → quante viste la tengono aperta
const versioni = new Map<string, string>();   // sid → updated_at letto
const SCRITTURE = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const RE_SCHEDA = /^\/api\/assistenza\/schede\/([^/?#]+)(\/[^?#]*)?(?:\?.*)?$/;

/** Testo del 409 di concorrenza del backend (MSG_SCHEDA_CAMBIATA). */
export const eMessaggioSchedaCambiata = (m: string | undefined | null) => /modificata da un altro operatore/i.test(m || "");

export function apriScheda(sid: string) { aperte.set(sid, (aperte.get(sid) || 0) + 1); }
export function chiudiScheda(sid: string) {
  const n = (aperte.get(sid) || 0) - 1;
  if (n > 0) { aperte.set(sid, n); return; }
  aperte.delete(sid); versioni.delete(sid);
}
/** Per le prove e per il pannello: la versione che partirebbe adesso. */
export const versioneScheda = (sid: string) => versioni.get(sid) || null;

function schedaDelPercorso(path: string): { sid: string; resto: string } | null {
  const m = RE_SCHEDA.exec(path);
  return m ? { sid: decodeURIComponent(m[1]), resto: m[2] || "" } : null;
}

function registra(sid: string, v: unknown) {
  if (aperte.has(sid) && typeof v === "string" && v) versioni.set(sid, v);
}

/** Header da aggiungere alla richiesta (vuoto se non è una scrittura su una scheda aperta con la versione nota). */
export function intestazioniScheda(path: string, metodo: string): Record<string, string> {
  if (!SCRITTURE.has(metodo.toUpperCase())) return {};
  const p = schedaDelPercorso(path);
  const v = p && versioni.get(p.sid);
  return v ? { "X-Scheda-Versione": v } : {};
}

/** Dopo una risposta riuscita: aggiorna (o dimentica) la versione. */
export function dopoRispostaScheda(path: string, metodo: string, dati: unknown) {
  const m = metodo.toUpperCase();
  const p = schedaDelPercorso(path);
  if (m === "GET") {
    // solo la lettura della scheda intera (non /pdf, /proposte, /numero/…)
    if (p && !p.resto && dati && typeof dati === "object") registra(p.sid, (dati as { updated_at?: unknown }).updated_at);
    return;
  }
  if (!SCRITTURE.has(m)) return;
  // la scheda nella risposta: in cima ({id, updated_at, …}) o in «scheda»
  const o = (dati && typeof dati === "object" ? dati : {}) as Record<string, unknown>;
  const candidati = [o, o.scheda].filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  let trovata = false;
  for (const c of candidati) {
    if (typeof c.id === "string" && aperte.has(c.id) && typeof c.updated_at === "string") { registra(c.id, c.updated_at); trovata = trovata || c.id === p?.sid; }
  }
  if (p && !trovata) versioni.delete(p.sid);
}

/** 409 di concorrenza: avvisa la scheda aperta (dialogo «ricarica»), con il corpo che si stava mandando. */
export function segnalaSchedaCambiata(path: string, corpo: BodyInit | null | undefined, messaggio: string) {
  const p = schedaDelPercorso(path);
  if (!p || typeof window === "undefined") return;
  let c: Record<string, unknown> | null = null;
  if (typeof corpo === "string") { try { const j = JSON.parse(corpo); c = j && typeof j === "object" && !Array.isArray(j) ? j : null; } catch { c = null; } }
  window.dispatchEvent(new CustomEvent<DettaglioSchedaCambiata>(EVENTO_SCHEDA_CAMBIATA, { detail: { sid: p.sid, corpo: c, messaggio } }));
}
