"use client";

// BARRA DI AVANZAMENTO della scheda (05/10/2026, specifica §8.9 — ordine vincolante):
// Ricevuta → Verifica → Preventivo → Inviato → Accettato/Rifiutato → In riparazione → Pronto → Da pagare → Pagato → Consegna.
// I passi arrivano calcolati dal backend (assistenza_v2.passi); qui si disegnano e il PROSSIMO PASSO è un pulsante.
import type React from "react";
import { ArrowRight, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Avanzamento as Av } from "@/lib/assistenza";

const AZIONI: Record<string, string> = {
  arrivato: "Dispositivo arrivato", preventivo: "Vai al preventivo", invia_preventivo: "INVIA PREVENTIVO", esito: "Accettato / Rifiutato",
  pronto: "PRONTO", incassa: "Incassa / Pagato", consegna: "CONSEGNA",
  assegna_verifica: "Assegna in verifica", chiudi_verifica: "Scrivi e chiudi la verifica", assegna_riparazione: "Assegna in riparazione",
  stato_riparazione: "Stato riparazione", aggiornamento: "Aggiornamento al cliente", trova: "Invia le istruzioni «Trova il mio»",
  rimontaggio: "Da richiudere: assegna a un tecnico", rimontato: "✔ Richiuso: pronto da ritirare",
  ricevuta: "INVIA RICEVUTA", in_vendita: "🏷️ Metti IN VENDITA",
};

export function Avanzamento({ av, onAzione, disabilitato, chiusa, onGiaFatto, onRiconsegna, rinvii }: {
  av: Av; onAzione: (azione: string) => void; disabilitato?: boolean;
  /** 27/10/2026 (Christian, 63224): i RINVII al cliente (ricevuta, preventivo, aggiornamento, pronto da pagare) e CAMBIA STATO,
   *  qui accanto al prossimo passo, in qualsiasi momento */
  rinvii?: React.ReactNode;
  /** 26/10/2026: scheda chiusa (niente «già fatto tutto») · chiusura in un passo · cosa si riconsegna davvero */
  chiusa?: boolean; onGiaFatto?: () => void; onRiconsegna?: () => void;
}) {
  const az = av.prossimo?.azione || "";
  const bloccata = av.prossimo?.blocco === "trova";
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
        <div className={cn("mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm",
          bloccata ? "border border-red-300 bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100" : "bg-primary/5")}>
          <span className="font-medium">{bloccata ? "🔒 Prossimo passo:" : "Prossimo passo:"}</span>
          <span className={bloccata ? "font-medium" : "text-muted-foreground"}>{av.prossimo.testo}</span>
          {av.prossimo.poi && <span className="text-xs text-muted-foreground">· poi: {av.prossimo.poi}</span>}
          {av.prossimo.alternativa === "invia_consuntivo" && (
            <Button size="sm" variant="outline" className="ml-auto border-emerald-400" disabled={disabilitato} onClick={() => onAzione("pronto")}
              title="Rimanda al cliente il consuntivo di pagamento (mail + WhatsApp, con IBAN e PDF): si apre il pannello PRONTO già compilato">📨 Invia consuntivo di pagamento</Button>)}
          {av.prossimo.alternativa === "rifiutato_diretto" && (
            <Button size="sm" variant="outline" className="ml-auto border-red-300 text-red-700" disabled={disabilitato} onClick={() => onAzione("rifiutato_diretto")}
              title="Preventivo negativo (es. irreparabile): si segna RIFIUTATO senza mandarlo al cliente da accettare, poi si va al PRONTO">Negativo: segna RIFIUTATO</Button>)}
          {az === "ricevuta" && <Button size="sm" variant="ghost" className="ml-auto" disabled={disabilitato} onClick={() => onAzione("ricevuta_no")} title="Il cliente non vuole la ricevuta / l'ha già avuta">Non serve</Button>}
          {/* 26/10/2026 (63202): rifiutato → chiuso (si restituisce subito) oppure smontato (un tecnico lo rimonta) */}
          {az === "rimontaggio" && !(av.passi.find((p) => p.codice === "riparazione")?.stato === "attuale") && (
            <Button size="sm" variant="outline" className="ml-auto" disabled={disabilitato} onClick={() => onAzione("rimontaggio_chiuso")}>È chiuso: invia il pronto</Button>)}
          {az && <Button size="sm" className={(az === "rimontaggio" && av.passi.find((p) => p.codice === "riparazione")?.stato !== "attuale") || az === "ricevuta" || av.prossimo.alternativa ? "" : "ml-auto"}
            variant={bloccata ? "destructive" : "default"} disabled={disabilitato} onClick={() => onAzione(az)}>{AZIONI[az] || az}<ArrowRight /></Button>}
        </div>
      )}
      {rinvii && <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-sm">{rinvii}</div>}
      {av.prossimo?.avviso && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">🔒 {av.prossimo.avviso}</div>
      )}
      {/* 26/10/2026 (63079): cosa si riconsegna davvero, scritto in chiaro e modificabile */}
      {(av.prossimo?.riconsegna || (!chiusa && onRiconsegna)) && (
        <div className={cn("mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm",
          av.prossimo?.riconsegna ? "border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" : "")}>
          {av.prossimo?.riconsegna ? <><span className="font-semibold">📦 Si riconsegna:</span><span className="font-medium">{av.prossimo.riconsegna}</span></>
            : <span className="text-xs text-muted-foreground">Si riconsegna tutto quello che è arrivato.</span>}
          <span className="ml-auto flex gap-1">
            {onRiconsegna && !chiusa && <Button size="xs" variant="outline" disabled={disabilitato} onClick={onRiconsegna}>{av.prossimo?.riconsegna ? "Modifica" : "Si riconsegna solo una parte…"}</Button>}
            {onGiaFatto && !chiusa && <Button size="xs" variant="outline" disabled={disabilitato} onClick={onGiaFatto} title="Già lavorata e riconsegnata: chiude saltando i passaggi (resta nel registro)">✔ Già fatto tutto: chiudi</Button>}
          </span>
        </div>
      )}
    </div>
  );
}
