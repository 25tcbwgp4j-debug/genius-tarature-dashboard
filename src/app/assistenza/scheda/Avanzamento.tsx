"use client";

// BARRA DI AVANZAMENTO della scheda (05/10/2026, specifica §8.9 — ordine vincolante):
// Ricevuta → Verifica → Preventivo → Inviato → Accettato/Rifiutato → In riparazione → Pronto → Da pagare → Pagato → Consegna.
// I passi arrivano calcolati dal backend (assistenza_v2.passi); qui si disegnano e il PROSSIMO PASSO è un pulsante.
import { ArrowRight, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Avanzamento as Av } from "@/lib/assistenza";

const AZIONI: Record<string, string> = {
  arrivato: "Dispositivo arrivato", preventivo: "Vai al preventivo", invia_preventivo: "INVIA PREVENTIVO", esito: "Accettato / Rifiutato",
  pronto: "PRONTO", incassa: "Incassa / Pagato", consegna: "CONSEGNA",
  assegna_verifica: "Assegna in verifica", chiudi_verifica: "Scrivi e chiudi la verifica", assegna_riparazione: "Assegna in riparazione",
  stato_riparazione: "Stato riparazione", aggiornamento: "Aggiornamento al cliente",
};

export function Avanzamento({ av, onAzione, disabilitato }: { av: Av; onAzione: (azione: string) => void; disabilitato?: boolean }) {
  const az = av.prossimo?.azione || "";
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <ol className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {av.passi.map((p, i) => (
          <li key={p.codice} className="flex min-w-[78px] flex-1 flex-col items-center gap-1 text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "opacity-0" : p.stato === "fatto" || p.stato === "attuale" ? "bg-emerald-500" : "bg-border")} />
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                p.stato === "fatto" && "border-emerald-500 bg-emerald-500 text-white",
                p.stato === "attuale" && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                p.stato === "da_fare" && "border-border bg-background text-muted-foreground",
                p.stato === "saltato" && "border-dashed border-border bg-muted text-muted-foreground")}>
                {p.stato === "fatto" ? <Check className="size-3.5" /> : p.stato === "saltato" ? <Minus className="size-3" /> : i + 1}
              </span>
              <span className={cn("h-0.5 flex-1", i === av.passi.length - 1 ? "opacity-0" : p.stato === "fatto" ? "bg-emerald-500" : "bg-border")} />
            </div>
            <span className={cn("text-[11px] leading-tight", p.stato === "attuale" ? "font-semibold text-foreground" : "text-muted-foreground")}>{p.etichetta}</span>
            {p.dettaglio && <span className="text-[10px] leading-tight text-muted-foreground">{p.dettaglio}</span>}
          </li>
        ))}
      </ol>
      {av.prossimo?.testo && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">Prossimo passo:</span>
          <span className="text-muted-foreground">{av.prossimo.testo}</span>
          {az && <Button size="sm" className="ml-auto" disabled={disabilitato} onClick={() => onAzione(az)}>{AZIONI[az] || az}<ArrowRight /></Button>}
        </div>
      )}
    </div>
  );
}
