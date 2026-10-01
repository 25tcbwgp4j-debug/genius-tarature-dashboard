"use client";

// Quando esce una nuova versione della dashboard, le pagine già aperte sugli iMac si aggiornano da sole
// (01/10/2026: con la pagina vecchia mancavano pulsanti nuovi, es. la scelta dell'operatore). Non ricarica mai
// mentre si sta scrivendo o con una finestra aperta: in quel caso mostra un avviso con «Aggiorna ora».

import { useEffect, useState } from "react";

const MIA = process.env.NEXT_PUBLIC_BUILD_ID || "";

function occupato(): boolean {
  const a = document.activeElement as HTMLElement | null;
  const scrive = !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
  const finestra = !!document.querySelector('[role="dialog"], dialog[open]');
  return scrive || finestra;
}

export function AggiornaVersione() {
  const [nuova, setNuova] = useState(false);
  useEffect(() => {
    if (!MIA) return;
    let attiva = true;
    const controlla = async () => {
      try {
        const r = await fetch("/api/versione", { cache: "no-store" });
        const { v } = await r.json();
        if (!attiva || !v || v === MIA) return;
        if (!occupato()) window.location.reload();
        else setNuova(true);
      } catch { /* rete assente: si riprova al giro dopo */ }
    };
    const t = setInterval(controlla, 60_000);
    const vis = () => { if (document.visibilityState === "visible") controlla(); };
    document.addEventListener("visibilitychange", vis);
    return () => { attiva = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);
  if (!nuova) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-lg dark:bg-amber-950 dark:text-amber-100">
      È disponibile una nuova versione della dashboard.
      <button className="rounded-md bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700" onClick={() => window.location.reload()}>Aggiorna ora</button>
    </div>
  );
}
