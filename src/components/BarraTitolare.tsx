"use client";

// BARRA DEL TITOLARE (16/10/2026, richiesta di Christian): in alto, nella stessa riga, le tre società della
// fatturazione (Genius Lab · Gingy · Avantifiori Immobiliare) e le «Buste paga». Gingy, Avantifiori e Buste paga
// sono visibili SOLO all'account del titolare: allo staff la barra non compare e la fatturazione resta Genius.
// Il blocco vero resta sul backend (403); qui si nasconde soltanto.

import { useRouter } from "next/navigation";
import { Building2, HandCoins } from "lucide-react";
import { usePermessi } from "@/components/permessi";

export type VoceTitolare = "genius" | "gingy" | "avantifiori" | "buste-paga";
const SOCIETA: { codice: Exclude<VoceTitolare, "buste-paga">; label: string }[] = [
  { codice: "genius", label: "Genius Lab" },
  { codice: "gingy", label: "Gingy" },
  { codice: "avantifiori", label: "Avantifiori Immobiliare" },
];
const CHIAVE = "fatturazione.societa";   // la stessa chiave usata da app/fatturazione/societa.ts

export function useBustePagaVisibili(): boolean {
  const { permessi } = usePermessi();
  return !!permessi?.puo?.buste_paga;
}

/** Pulsante «Buste paga» da mettere accanto al selettore delle società (pagina Fatturazione). */
export function PulsanteBustePaga() {
  const router = useRouter();
  if (!useBustePagaVisibili()) return null;
  return (
    <button role="tab" aria-selected={false} onClick={() => router.push("/buste-paga")}
      className="flex items-center gap-1.5 rounded-md bg-background px-3 py-1.5 text-sm font-medium transition hover:bg-muted">
      <HandCoins className="size-4" /> Buste paga
    </button>
  );
}

/** Riga completa (pagina Buste paga): le società portano alla Fatturazione con quella società scelta. */
export function BarraTitolare({ attiva }: { attiva: VoceTitolare }) {
  const router = useRouter();
  const visibile = useBustePagaVisibili();
  if (!visibile) return null;
  const vai = (s: Exclude<VoceTitolare, "buste-paga">) => {
    try { window.localStorage.setItem(CHIAVE, s); } catch { /* storage non disponibile */ }
    router.push("/fatturazione");
  };
  const cls = (on: boolean) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${on ? "bg-primary text-primary-foreground shadow" : "bg-background hover:bg-muted"}`;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
      <Building2 className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium">Società</span>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Società e buste paga">
        {SOCIETA.map((s) => (
          <button key={s.codice} role="tab" aria-selected={attiva === s.codice} onClick={() => vai(s.codice)} className={cls(attiva === s.codice)}>
            {s.label}
          </button>
        ))}
        <button role="tab" aria-selected={attiva === "buste-paga"} onClick={() => router.push("/buste-paga")} className={cls(attiva === "buste-paga")}>
          <HandCoins className="size-4" /> Buste paga
        </button>
      </div>
    </div>
  );
}
