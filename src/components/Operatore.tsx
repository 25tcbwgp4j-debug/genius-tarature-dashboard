"use client";

// OPERATORE del negozio (01/10/2026): chi sta facendo il documento — CHR · VALE · DUMY · MARTINA · ALTRO.
// Obbligatorio prima di emettere/salvare scontrini, fatture, pro forma, preventivi, ordini, righe di cassa e storni:
// senza scelta i pulsanti restano bloccati. L'ultimo operatore scelto si ricorda su questo dispositivo (localStorage)
// ed è sempre mostrato in evidenza; tutte le schede/finestre aperte restano allineate.

import { useCallback, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export const OPERATORI = ["CHR", "VALE", "DUMY", "MARTINA", "ALTRO"] as const;   // 11/11/2026: + Martina
export type Operatore = (typeof OPERATORI)[number];

// Pagina SESSIONE Tarature (07/10/2026, Christian): lì si sceglie solo tra Christian e Dumy, senza «Altro».
// Cassa, fatturazione, ordini ecc. continuano a usare tutti e quattro gli operatori.
export const OPERATORI_TARATURE = ["CHR", "DUMY"] as const satisfies readonly Operatore[];
export const NOMI_OPERATORI: Partial<Record<Operatore, string>> = { CHR: "Christian", DUMY: "Dumy" };

const CHIAVE = "gl_operatore";
const CHIAVE_IL = "gl_operatore_il";   // 15/11/2026: quando è stato scelto / usato l'ultima volta
const EVENTO = "gl-operatore";
// 15/11/2026 (piano 2.15): sugli account CONDIVISI del banco (iMac SX/DX, iPad) l'operatore si ricorda per 15 minuti
// di inattività, poi si richiede (al banco si danno il cambio); sugli account PERSONALI si propone da solo.
const DURATA_CONDIVISO_MS = 15 * 60 * 1000;

type Account = { condiviso: boolean; proposto: Operatore | "" };
let accountCache: Promise<Account> | null = null;
/** Chi è collegato (una sola richiesta per pagina): account condiviso del banco o personale, e l'operatore da proporre. */
function leggiAccount(): Promise<Account> {
  if (!accountCache) {
    accountCache = fetch("/api/backend/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: { email?: string; full_name?: string | null } | null) => {
        const email = (u?.email || "").toLowerCase();
        const nome = `${u?.full_name || ""} ${email}`.toLowerCase();
        const condiviso = /imac|ipad|negozio|banco|postazione/.test(email);
        let proposto: Operatore | "" = "";
        if (!condiviso) {
          if (/christian|avantifiori|admin/.test(nome)) proposto = "CHR";
          else if (/valentina|vale\b/.test(nome)) proposto = "VALE";
          else if (/dumy/.test(nome)) proposto = "DUMY";
          else if (/martina/.test(nome)) proposto = "MARTINA";
        }
        return { condiviso, proposto };
      })
      .catch(() => ({ condiviso: false, proposto: "" as const }));
  }
  return accountCache;
}

function leggi(condiviso = false): Operatore | "" {
  try {
    const v = localStorage.getItem(CHIAVE) || "";
    if (!(OPERATORI as readonly string[]).includes(v)) return "";
    if (condiviso && Date.now() - Number(localStorage.getItem(CHIAVE_IL) || 0) > DURATA_CONDIVISO_MS) return "";
    return v as Operatore;
  } catch { return ""; }
}

/** Operatore scelto su questo dispositivo ("" = nessuno) e la funzione per cambiarlo. */
export function useOperatore(): [Operatore | "", (o: Operatore | "") => void] {
  const [op, setOpState] = useState<Operatore | "">("");
  const [condiviso, setCondiviso] = useState(false);
  const setOp = useCallback((o: Operatore | "") => {
    try {
      if (o) { localStorage.setItem(CHIAVE, o); localStorage.setItem(CHIAVE_IL, String(Date.now())); }
      else localStorage.removeItem(CHIAVE);
    } catch { /* storage non disponibile */ }
    setOpState(o);
    window.dispatchEvent(new Event(EVENTO));
  }, []);
  useEffect(() => {
    setOpState(leggi());
    let vivo = true;
    leggiAccount().then((a) => {
      if (!vivo) return;
      setCondiviso(a.condiviso);
      const ora = leggi(a.condiviso);
      if (!ora && a.proposto) setOp(a.proposto);   // account personale: si propone da solo (si può cambiare)
      else setOpState(ora);
    });
    const agg = () => setOpState(leggi());
    window.addEventListener(EVENTO, agg);
    window.addEventListener("storage", agg);
    return () => { vivo = false; window.removeEventListener(EVENTO, agg); window.removeEventListener("storage", agg); };
  }, [setOp]);
  // account condiviso: chi lavora tiene vivo l'operatore (un tocco o un tasto rinnova i 15 minuti, al massimo una volta al minuto);
  // dopo 15 minuti senza toccare nulla l'operatore si azzera e si richiede
  useEffect(() => {
    if (!condiviso) return;
    let ultimo = 0;
    const attivita = () => {
      const n = Date.now();
      if (n - ultimo < 60_000) return;
      ultimo = n;
      try { if (leggi(true)) localStorage.setItem(CHIAVE_IL, String(n)); } catch { /* */ }
    };
    const controllo = setInterval(() => setOpState(leggi(true)), 30_000);
    window.addEventListener("pointerdown", attivita);
    window.addEventListener("keydown", attivita);
    return () => { clearInterval(controllo); window.removeEventListener("pointerdown", attivita); window.removeEventListener("keydown", attivita); };
  }, [condiviso]);
  return [op, setOp];
}

/** Riquadro con i 4 pulsanti: chi sta facendo l'operazione. Bordo rosso finché non si sceglie. */
export function SceltaOperatore({ value, onChange, className, compatto = false, opzioni = OPERATORI, nomi }: {
  value: Operatore | ""; onChange: (o: Operatore) => void; className?: string; compatto?: boolean;
  /** sottoinsieme degli operatori ammessi (es. OPERATORI_TARATURE); un valore fuori elenco vale «non scelto» */
  opzioni?: readonly Operatore[];
  /** nome da mostrare sul pulsante al posto del codice (es. CHR → Christian) */
  nomi?: Partial<Record<Operatore, string>>;
}) {
  if (value && !opzioni.includes(value)) value = "";
  return (
    <div className={cn("rounded-md border p-2", value ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-red-300 bg-red-50 dark:bg-red-950/30", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1 font-medium"><UserRound className="size-3.5" /> Chi sta facendo l&apos;operazione?</span>
        {value ? <span className="text-emerald-700 dark:text-emerald-300">Operatore: <b>{nomi?.[value] || value}</b></span>
          : <span className="font-semibold text-red-700 dark:text-red-300">Scegli l&apos;operatore</span>}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${opzioni.length}, minmax(0, 1fr))` }}>
        {opzioni.map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o}
            className={cn("rounded-md border font-semibold tracking-wide transition-colors", compatto ? "h-7 text-xs max-sm:h-10" : "h-9 text-sm max-sm:h-10",
              value === o ? "border-emerald-600 bg-emerald-600 text-white shadow-sm" : "border-input bg-background hover:bg-muted")}>
            {nomi?.[o] || o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Etichetta piccola dell'operatore negli elenchi. */
export function BadgeOperatore({ op, className }: { op?: string | null; className?: string }) {
  if (!op) return null;
  return <span className={cn("inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100", className)}
    title="Operatore">{op}</span>;
}
