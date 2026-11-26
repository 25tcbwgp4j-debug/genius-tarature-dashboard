"use client";

// AGGIORNAMENTI AUTOMATICI (17/11/2026, consumi Vercel DIGITALE-61): regola unica per tutti i polling della dashboard.
// - con la scheda nascosta non si chiede nulla;
// - fuori dall'orario di negozio (lun-sab 9:00-19:30, ora di Roma; sabato aperto dal 26/11/2026), dopo 10 minuti senza mouse/tastiera/tocco,
//   la pagina smette di aggiornarsi da sola: di notte una scheda Safari lasciata aperta chiamava le API ogni minuto.
//   Appena qualcuno tocca la pagina gli aggiornamenti ripartono (e ogni polling si rimette in pari al giro successivo).

const INATTIVO_MS = 10 * 60_000;
let ultimaAttivita = Date.now();

if (typeof window !== "undefined") {
  const segna = () => { ultimaAttivita = Date.now(); };
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"]) {
    window.addEventListener(ev, segna, { passive: true, capture: true });
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") segna(); });
}

/** Orario di negozio (ora di Roma): lunedì-sabato 9:00-19:30 (26/11/2026: aperti anche il sabato). */
export function inOrarioNegozio(): boolean {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const minuti = (Number(p.hour) % 24) * 60 + Number(p.minute);
  return p.weekday !== "Sun" && minuti >= 9 * 60 && minuti < 19 * 60 + 30;
}

/** true se un aggiornamento automatico (setInterval/setTimeout) può partire adesso. */
export function puoAggiornare(): boolean {
  if (typeof document === "undefined") return true;
  if (document.hidden) return false;
  if (!inOrarioNegozio() && Date.now() - ultimaAttivita > INATTIVO_MS) return false;
  return true;
}
