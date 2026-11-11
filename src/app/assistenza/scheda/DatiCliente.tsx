"use client";

// 11/11/2026 (Christian): DATI DEL CLIENTE molto chiari, in cima alla scheda.
// «importanti» = tentare il recupero, NON formattare (banner ROSSO) · «formattabile» = si può resettare (banner VERDE) ·
// non indicato = riga grigia con i due pulsanti (e la proposta letta dai testi della scheda, mai salvata da sola).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DATI_CLIENTE, dataOra, type DatiCliente, type Scheda } from "@/lib/assistenza";

/** Badge piccolo per l'elenco del banco e i lavori dei tecnici. */
export function DatiBadge({ dati, nota }: { dati?: DatiCliente | null; nota?: string | null }) {
  if (!dati) return null;
  return (
    <span title={`${DATI_CLIENTE[dati].lungo}${nota ? ` — ${nota}` : ""}`}
      className={cn("inline-block whitespace-nowrap rounded px-1.5 py-px text-[10px] font-bold",
        dati === "importanti" ? "bg-red-600 text-white" : "bg-emerald-600 text-white")}>
      {dati === "importanti" ? "⚠️ DATI" : "✅ FORMATTABILE"}
    </span>
  );
}

export function BannerDati({ s, ro, onSalva }: {
  s: Scheda; ro: boolean;
  /** salva (PATCH) la scelta: valore null = togli l'indicazione */
  onSalva: (valore: DatiCliente | null, nota: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [modifica, setModifica] = useState(false);
  const [nota, setNota] = useState(s.dati_cliente_nota || "");
  const v = s.dati_cliente || null;
  const proposta = !v ? s.dati_cliente_proposta : null;
  const chiusa = ["consegnato", "annullata"].includes(s.stato);
  if (chiusa && !v) return null;

  async function scegli(x: DatiCliente | null) {
    setBusy(true);
    try { if (await onSalva(x, x ? nota.trim() : "")) setModifica(false); } finally { setBusy(false); }
  }
  const pulsanti = !ro && !chiusa && (
    <span className="flex flex-wrap items-center gap-1.5">
      <input className="h-8 w-56 rounded-md border border-current/30 bg-white/70 px-2 text-sm text-foreground dark:bg-black/30"
        placeholder="nota breve (es. dati su iCloud)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
      <Button size="sm" disabled={busy} variant={v === "importanti" ? "default" : "outline"}
        className={v === "importanti" ? "bg-red-600 text-white hover:bg-red-700" : "border-red-400 bg-white text-red-700 hover:bg-red-50 dark:bg-transparent"}
        onClick={() => scegli("importanti")}>⚠️ Dati importanti: recupero</Button>
      <Button size="sm" disabled={busy} variant={v === "formattabile" ? "default" : "outline"}
        className={v === "formattabile" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-emerald-500 bg-white text-emerald-800 hover:bg-emerald-50 dark:bg-transparent"}
        onClick={() => scegli("formattabile")}>✅ Si può formattare</Button>
      {v && <Button size="sm" variant="ghost" disabled={busy} onClick={() => scegli(null)} title="Togli l'indicazione (non indicato)">Non indicato</Button>}
    </span>
  );

  if (!v) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/40 px-3 py-2 text-sm" data-testid="banner-dati">
        <b>💾 DATI DEL CLIENTE: non indicato</b>
        {proposta && (
          <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", proposta.valore === "importanti" ? "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-100" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100")}
            title={`Letto nella scheda: «${proposta.motivo}». Non è salvato: conferma con il pulsante.`}>
            Proposta: {DATI_CLIENTE[proposta.valore].breve} (letto «{proposta.motivo}»)
          </span>)}
        <span className="ml-auto">{pulsanti}</span>
      </div>
    );
  }
  const rosso = v === "importanti";
  return (
    <div data-testid="banner-dati" data-dati={v}
      className={cn("rounded-xl border-2 px-3 py-2.5", rosso
        ? "border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-700"
        : "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-50")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("font-extrabold tracking-tight", rosso ? "text-xl" : "text-lg")}>
          {rosso ? "⚠️ DATI IMPORTANTI: tentare il recupero, NON formattare" : "✅ SI PUÒ FORMATTARE / RESETTARE"}</span>
        {s.dati_cliente_nota && <span className="text-base font-semibold">— {s.dati_cliente_nota}</span>}
        <span className="text-xs opacity-80">{s.dati_cliente_da ? `scelto da ${s.dati_cliente_da}` : ""}{s.dati_cliente_il ? ` · ${dataOra(s.dati_cliente_il)}` : ""}</span>
        {!ro && !chiusa && !modifica && <Button size="xs" variant="outline" className={cn("ml-auto", rosso && "border-white/70 bg-transparent text-white hover:bg-white/15")} onClick={() => setModifica(true)}>Cambia</Button>}
      </div>
      {modifica && <div className="mt-2">{pulsanti}</div>}
    </div>
  );
}
