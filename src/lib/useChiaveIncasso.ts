"use client";
// 15/11/2026 (piano Genius 5.5): chiave di idempotenza del dialogo di incasso — generata all'apertura (montaggio),
// riusata se l'operatore ripreme, `rinnova()` dopo un incasso riuscito. Vedi lib/idempotenza.ts.
import { useCallback, useState } from "react";
import { nuovaChiave } from "@/lib/idempotenza";

export function useChiaveIncasso() {
  const [chiave, setChiave] = useState(nuovaChiave);
  const rinnova = useCallback(() => setChiave(nuovaChiave()), []);
  return { chiave, rinnova };
}
