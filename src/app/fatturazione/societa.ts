"use client";

// Società selezionata nella sezione Fatturazione (15/10/2026): pilota TUTTE le schede. Default Genius (uso quotidiano
// invariato); Gingy e Avantifiori solo per l'amministratore (il backend risponde 403 allo staff). La scelta si ricorda
// nel browser (localStorage, con try/catch: in finestra privata può non esserci).

import { useCallback, useEffect, useMemo, useState } from "react";
import { fattConfig, type FattConfig, type FattSocieta, type FattSocietaCfg } from "@/lib/api";

const CHIAVE = "fatturazione.societa";
const NOTE: FattSocieta[] = ["genius", "gingy", "avantifiori"];

function letta(): FattSocieta {
  try {
    const v = window.localStorage.getItem(CHIAVE) as FattSocieta | null;
    return v && NOTE.includes(v) ? v : "genius";
  } catch {
    return "genius";
  }
}

export function useSocietaFatturazione() {
  const [scelta, setScelta] = useState<FattSocieta>("genius");
  const [cfg, setCfg] = useState<FattConfig | null>(null);
  // la scelta ricordata si applica quando il backend ha detto quali società può vedere l'utente
  useEffect(() => { fattConfig().then((c) => { setCfg(c); setScelta(letta()); }).catch(() => undefined); }, []);
  const permesse = useMemo(() => (cfg?.societa || []).map((s) => s.codice), [cfg]);
  // finché la configurazione non arriva, o se la società ricordata non è permessa: Genius
  const societa: FattSocieta = permesse.includes(scelta) ? scelta : "genius";
  const setSocieta = useCallback((s: FattSocieta) => {
    setScelta(s);
    try { window.localStorage.setItem(CHIAVE, s); } catch { /* storage non disponibile: vale per questa pagina */ }
  }, []);
  const info: FattSocietaCfg | undefined = cfg?.societa.find((s) => s.codice === societa);
  return { societa, setSocieta, cfg, info, permesse };
}
