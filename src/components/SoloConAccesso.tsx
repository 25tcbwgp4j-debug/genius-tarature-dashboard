"use client";

// 13/11/2026 (Christian): gli avvisi fissi (bonifici, Stripe, da richiamare, chiamata in arrivo, dopo bonifico)
// comparivano anche prima dell'accesso. Prima bastava l'indirizzo della pagina (/login); ora si mostrano SOLO quando
// il backend ha confermato la sessione (permessi caricati): pagina di accesso, sessione scaduta o app appena aperta → niente.

import type { ReactNode } from "react";
import { usePermessi } from "@/components/permessi";

export function SoloConAccesso({ children }: { children: ReactNode }) {
  const { caricato } = usePermessi();
  return caricato ? <>{children}</> : null;
}
