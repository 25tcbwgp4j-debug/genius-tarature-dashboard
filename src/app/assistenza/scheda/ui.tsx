"use client";

// Mattoni comuni della scheda assistenza (05/10/2026): sezioni, campi, finestre, badge. Stile del gestionale (shadcn/tailwind).
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLORE_STATO, ETICHETTA_STATO } from "@/lib/assistenza";

export const campo = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-70";
export const area = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-70";
export const etich = "mb-0.5 block text-xs font-medium text-muted-foreground";

export function Badge({ stato }: { stato: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLORE_STATO[stato] || ""}`}>{ETICHETTA_STATO[stato] || stato}</span>;
}

export function Pill({ children, tono = "grigio", title }: { children: React.ReactNode; tono?: "grigio" | "verde" | "ambra" | "rosso" | "blu"; title?: string }) {
  const t = {
    grigio: "bg-muted text-muted-foreground border-border", verde: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200",
    ambra: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100", rosso: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200",
    blu: "bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-100",
  }[tono];
  return <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", t)}>{children}</span>;
}

/** Riquadro della scheda con titolo, icona e azioni a destra. */
export function Sezione({ titolo, icona, azioni, children, className, sottotitolo }: {
  titolo: React.ReactNode; icona?: React.ReactNode; azioni?: React.ReactNode; children: React.ReactNode; className?: string; sottotitolo?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-3 shadow-sm md:p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {icona && <span className="text-muted-foreground [&_svg]:size-4">{icona}</span>}
        <h3 className="text-sm font-semibold tracking-tight">{titolo}</h3>
        {sottotitolo && <span className="text-xs text-muted-foreground">{sottotitolo}</span>}
        {azioni && <div className="ml-auto flex flex-wrap items-center gap-1.5">{azioni}</div>}
      </div>
      {children}
    </section>
  );
}

export function Campo({ label, children, className, aiuto }: { label: string; children: React.ReactNode; className?: string; aiuto?: React.ReactNode }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className={etich}>{label}</span>
      {children}
      {aiuto && <span className="mt-0.5 block text-[11px] text-muted-foreground">{aiuto}</span>}
    </label>
  );
}

export function Modale({ titolo, onClose, children, largo = false, piedi }: {
  titolo: React.ReactNode; onClose: () => void; children: React.ReactNode; largo?: boolean; piedi?: React.ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-0 sm:p-4 md:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className={cn("flex min-h-full w-full flex-col bg-background shadow-xl sm:min-h-0 sm:rounded-xl sm:border", largo ? "sm:max-w-4xl" : "sm:max-w-xl")}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur sm:rounded-t-xl">
          <h2 className="text-base font-semibold">{titolo}</h2>
          <button onClick={onClose} aria-label="Chiudi" className="rounded-md p-1.5 hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div className="flex-1 p-4">{children}</div>
        {piedi && <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:rounded-b-xl">{piedi}</div>}
      </div>
    </div>
  );
}

/** Interruttore a scelta (segmented control). */
export function Scelta<T extends string>({ valore, opzioni, onChange, disabled, piccolo }: {
  valore: T | null | undefined; opzioni: [T, React.ReactNode][]; onChange: (v: T) => void; disabled?: boolean; piccolo?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-0.5">
      {opzioni.map(([k, l]) => (
        <button key={k} type="button" disabled={disabled} onClick={() => onChange(k)} aria-pressed={valore === k}
          className={cn("rounded-md px-2.5 font-medium transition-colors disabled:opacity-60", piccolo ? "h-7 text-xs" : "h-8 text-sm",
            valore === k ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>{l}</button>
      ))}
    </div>
  );
}
