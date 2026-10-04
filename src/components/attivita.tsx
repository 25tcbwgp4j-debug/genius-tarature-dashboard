"use client";

// GENIUS LAB GESTIONALE (02/10/2026): due attività sulla stessa P.IVA, TARATURE e APPLE.
// Il selettore in alto (sidebar) vale per la postazione: è ricordato nel browser (localStorage) e mandato al
// backend su ogni chiamata come header X-Attivita (lib/api.ts), così i nuovi documenti nascono con l'attività
// giusta. Fatturazione e numerazione restano uniche: l'attività è solo un'indicazione (badge, filtro, PDF).

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { attivitaSalvata, CHIAVE_ATTIVITA, type Attivita } from "@/lib/attivita";

export type { Attivita };
export { attivitaSalvata };
export const ATTIVITA: { codice: Attivita; etichetta: string }[] = [
  { codice: "tarature", etichetta: "Tarature" },
  { codice: "apple", etichetta: "Apple" },
];
const CHIAVE = CHIAVE_ATTIVITA;

interface Ctx {
  attivita: Attivita;
  setAttivita: (a: Attivita) => void;
}
const AttivitaCtx = createContext<Ctx>({ attivita: "tarature", setAttivita: () => undefined });

export function useAttivita() {
  return useContext(AttivitaCtx);
}

// piccolo «negozio» esterno: useSyncExternalStore evita setState negli effect e le differenze server/browser
const ascoltatori = new Set<() => void>();
function iscriviti(f: () => void) {
  ascoltatori.add(f);
  const suStorage = (e: StorageEvent) => { if (e.key === CHIAVE) f(); };   // altre schede della stessa postazione
  window.addEventListener("storage", suStorage);
  return () => { ascoltatori.delete(f); window.removeEventListener("storage", suStorage); };
}

export function AttivitaProvider({ children }: { children: React.ReactNode }) {
  const attivita = useSyncExternalStore(iscriviti, attivitaSalvata, () => "tarature" as Attivita);
  const setAttivita = useCallback((a: Attivita) => {
    try {
      window.localStorage.setItem(CHIAVE, a);
    } catch {
      /* navigazione privata: non si ricorda */
    }
    ascoltatori.forEach((f) => f());
  }, []);
  return <AttivitaCtx.Provider value={{ attivita, setAttivita }}>{children}</AttivitaCtx.Provider>;
}

/** Selettore Tarature / Apple (in alto nella sidebar). */
export function SelettoreAttivita({ onCambia }: { onCambia?: (a: Attivita) => void } = {}) {
  const { attivita, setAttivita } = useAttivita();
  return (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800" role="radiogroup" aria-label="Attività">
      {ATTIVITA.map((a) => {
        const on = attivita === a.codice;
        return (
          <button
            key={a.codice}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => { if (a.codice !== attivita) { setAttivita(a.codice); onCambia?.(a.codice); } }}
            className={`px-2 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              on
                ? a.codice === "apple"
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "bg-emerald-600 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700"
            }`}
          >
            {a.etichetta}
          </button>
        );
      })}
    </div>
  );
}

/** Badge «Tarature» / «Apple» negli elenchi. */
export function BadgeAttivita({ a, className = "" }: { a?: string | null; className?: string }) {
  if (a !== "tarature" && a !== "apple") return null;
  const cls =
    a === "tarature"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
      : "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${cls} ${className}`}>
      {a === "tarature" ? "Tarature" : "Apple"}
    </span>
  );
}

/** Filtro per attività negli elenchi: "" = tutte. */
export function FiltroAttivita({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 text-sm ${className}`}
      aria-label="Filtra per attività"
    >
      <option value="">Tutte le attività</option>
      <option value="tarature">Solo Tarature</option>
      <option value="apple">Solo Apple</option>
    </select>
  );
}

/** Scelta dell'attività su un documento in bozza (o, per il titolare, su uno emesso). */
export function SceltaAttivita({ value, onChange, disabled = false }: { value?: string | null; onChange: (a: Attivita) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden" role="radiogroup" aria-label="Attività del documento">
      {ATTIVITA.map((a) => (
        <button
          key={a.codice}
          type="button"
          disabled={disabled}
          onClick={() => onChange(a.codice)}
          className={`px-3 py-1 text-sm font-medium disabled:opacity-60 ${
            value === a.codice
              ? a.codice === "apple"
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "bg-emerald-600 text-white"
              : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          {a.etichetta}
        </button>
      ))}
    </div>
  );
}
