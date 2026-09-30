"use client";

// LIVELLI DI ACCESSO (01/10/2026): cosa può fare l'utente collegato, chiesto UNA volta al backend
// (/api/autorizzazioni/io) e condiviso con sidebar e pagine. Per l'amministratore tiene anche il numero
// di richieste di autorizzazione in attesa (badge della voce «Autorizzazioni»).
// Nascondere i pulsanti è solo comodità: il blocco vero è sul backend (403).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { autElenco, autIo, type Permessi } from "@/lib/api";

const PUBBLICHE = ["/login", "/forgot-password", "/reset-password"];

interface Ctx {
  permessi: Permessi | null;
  /** true solo quando il backend ha confermato che è un amministratore (mentre carica: false) */
  admin: boolean;
  caricato: boolean;
  nInAttesa: number;
  aggiornaInAttesa: () => void;
}
const PermessiCtx = createContext<Ctx>({ permessi: null, admin: false, caricato: false, nInAttesa: 0, aggiornaInAttesa: () => undefined });

export function usePermessi() { return useContext(PermessiCtx); }

export function PermessiProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const pubblica = PUBBLICHE.some((p) => pathname === p || pathname.startsWith(p + "/"));
  // i permessi valgono per la sessione: passando da una pagina pubblica (login) si richiedono di nuovo (può essere un altro utente)
  const [caricati, setCaricati] = useState<Permessi | null>(null);
  const daRileggere = useRef(true);
  const [nInAttesa, setNInAttesa] = useState(0);
  const permessi = pubblica ? null : caricati;

  useEffect(() => {
    if (pubblica) { daRileggere.current = true; return; }
    if (!daRileggere.current) return;
    let annullato = false;
    // se fallisce (backend in avvio) si riprova al prossimo cambio pagina
    autIo().then((p) => { if (!annullato) { daRileggere.current = false; setCaricati(p); } }).catch(() => undefined);
    return () => { annullato = true; };
  }, [pubblica, pathname]);

  const admin = !!permessi?.admin;
  const aggiornaInAttesa = useCallback(() => {
    if (!admin) return;
    autElenco("in_attesa").then((l) => setNInAttesa(l.length)).catch(() => undefined);
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    aggiornaInAttesa();
    const t = setInterval(() => { if (!document.hidden) aggiornaInAttesa(); }, 30_000);
    return () => clearInterval(t);
  }, [admin, aggiornaInAttesa]);

  return (
    <PermessiCtx.Provider value={{ permessi, admin, caricato: !!permessi, nInAttesa: admin ? nInAttesa : 0, aggiornaInAttesa }}>
      {children}
    </PermessiCtx.Provider>
  );
}
