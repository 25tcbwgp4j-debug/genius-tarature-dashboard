"use client";

// PILA DEGLI AVVISI FISSI (13/11/2026, revisione grafica): i pulsanti fissi in basso a destra (bonifici, Stripe,
// da richiamare) erano messi uno sopra l'altro con posizioni a mano (bottom-4 / bottom-16 / bottom-40) e coprivano
// filtri, chip delle sezioni e pulsanti delle pagine. Ora stanno tutti in UNA sola fila compatta in basso a destra:
// - ogni avviso entra nella fila con <NellaPila> (portale React), senza cambiare la sua logica;
// - su iPhone si vede solo l'icona con il numero (il testo completo resta nel title/aria-label);
// - l'altezza della fila è scritta nella variabile CSS --pila-avvisi-h, che il <main> usa come spazio di sicurezza in
//   fondo alla pagina: arrivati in fondo, nessun contenuto resta sotto i pulsanti;
// - se è aperta la barra verde «conferma del bonifico» (in fondo allo schermo) la fila sale sopra di essa
//   (variabile --barra-bonifico-h, scritta da BonificiAvviso).

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const ID_PILA = "pila-avvisi";

/** Contenitore unico (montato una volta nel layout, dentro SoloConAccesso). */
export function PilaAvvisi() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const scrivi = () => {
      // fila vuota → nessuno spazio extra; altrimenti altezza della fila + margine
      const h = el.childElementCount ? Math.ceil(el.getBoundingClientRect().height) + 16 : 0;
      root.style.setProperty("--pila-avvisi-h", `${h}px`);
    };
    scrivi();
    const ro = new ResizeObserver(scrivi);
    ro.observe(el);
    const mo = new MutationObserver(scrivi);
    mo.observe(el, { childList: true });
    return () => { ro.disconnect(); mo.disconnect(); root.style.setProperty("--pila-avvisi-h", "0px"); };
  }, []);
  return (
    <div
      id={ID_PILA}
      ref={ref}
      aria-label="Avvisi"
      className="pointer-events-none fixed right-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-row-reverse flex-wrap-reverse items-end justify-start gap-2 empty:hidden print:hidden sm:right-4"
      style={{ bottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + var(--barra-bonifico-h, 0px))" }}
    />
  );
}

// il contenitore esiste solo nel browser: si legge dopo l'idratazione senza setState negli effect
const nessuno = () => () => undefined;
const trovaPila = () => document.getElementById(ID_PILA);

/** Mette un pulsante di avviso nella pila unica (se la pila non c'è, non mostra nulla). */
export function NellaPila({ children }: { children: ReactNode }) {
  const pila = useSyncExternalStore(nessuno, trovaPila, () => null);
  if (!pila) return null;
  return createPortal(<div className="pointer-events-auto">{children}</div>, pila);
}

/** Classi comuni dei pulsanti della pila: tondo con icona e numero su iPhone, pillola con testo da 640px in su. */
export const CLASSI_PULSANTE_PILA =
  "relative flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white shadow-lg sm:px-4";
