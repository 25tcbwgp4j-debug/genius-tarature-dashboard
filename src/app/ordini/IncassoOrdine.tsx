"use client";

// INCASSO SU UN ORDINE CLIENTE (01/10/2026, Christian) — stesso flusso per acconto, intero e saldo al ritiro.
// 1) quanto: «Acconto» (importo libero) o «Intero importo» (= quanto resta da pagare);
// 2) SCONTRINO o FATTURA. Qui NON si sceglie il metodo di pagamento:
//    · Scontrino → pagina Cassa col carrello già pronto (/cassa?ordine=…&importo=…&tipo=…): lì l'operatore incassa
//      come per ogni scontrino (contanti, POS, bonifico verificato, PayPal) e lo scontrino si collega all'ordine;
//    · Fattura → bozza TD02 (acconto) o fattura che scala gli acconti (saldo) DA PAGARE: si apre in Fatturazione,
//      dove si registra il pagamento e si emette. Sull'ordine conta come pagata quando la fattura risulta pagata.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Receipt, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDec } from "@/components/DecInput";
import { toastErrore } from "@/lib/errori";
import { docIncassa, type DocumentoCliente, type EsitoIncassoOrdine } from "@/lib/api";

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);

export function IncassoOrdine({ d, operatore, modo: modoIniziale = "intero", titolo, poiRitira, onFatto, onChiudi }: {
  d: DocumentoCliente; operatore: string | null;
  modo?: "acconto" | "intero"; titolo?: string; poiRitira?: boolean;
  /** solo per la fattura: la bozza è nata (la pagina poi apre Fatturazione) */
  onFatto: (r: EsitoIncassoOrdine) => void | Promise<void>; onChiudi: () => void;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"acconto" | "intero">(modoIniziale);
  const [importoTxt, setImportoTxt] = useState("");
  const [busy, setBusy] = useState(false);

  // quanto si può ancora certificare: il residuo meno le fatture già fatte e in attesa di pagamento
  const resta = d.da_certificare ?? d.residuo;
  const saldo = d.pagato > 0 || (d.in_attesa || 0) > 0;
  const acc = parseDec(importoTxt);
  const importo = modo === "intero" ? resta : (acc !== null && !Number.isNaN(acc) ? Math.round(acc * 100) / 100 : 0);
  const importoOk = importo > 0 && importo <= resta + 0.001;
  // un «acconto» che copre tutto il residuo è di fatto il saldo
  const eAcconto = modo === "acconto" && importo < resta - 0.001;
  const motivo = !operatore ? "scegli l'operatore" : !importoOk ? (modo === "acconto" ? `scrivi l'importo dell'acconto (max ${eur(resta)})` : "niente da incassare") : "";

  function scontrino() {
    if (motivo) { toast.error(`Prima ${motivo}`); return; }
    const q = new URLSearchParams({ ordine: d.id, importo: importo.toFixed(2), tipo: eAcconto ? "acconto" : "saldo", ...(poiRitira ? { ritiro: "1" } : {}) });
    router.push(`/cassa?${q.toString()}`);
  }

  async function fattura() {
    if (motivo || busy) { if (motivo) toast.error(`Prima ${motivo}`); return; }
    setBusy(true);
    try {
      const r = await docIncassa(d.id, { ...(modo === "intero" || !eAcconto ? { intero: true } : { importo }), certificato: "fattura", operatore: operatore! });
      toast.success(`${r.fattura?.tipo_documento === "TD02" ? "Fattura d'acconto" : "Fattura"} di ${eur(importo)} pronta in bozza: registra il pagamento ed emettila`);
      await onFatto(r);
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  const tasto = (attivo: boolean) => `flex-1 rounded-md border-2 px-3 py-2 text-left text-sm transition ${attivo ? "border-primary bg-primary/10 font-semibold" : "border-input hover:bg-muted"}`;

  return (
    <Card className="space-y-3 border-2 border-primary/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{titolo || (saldo ? "Pagamento del saldo" : "Pagamento dell'ordine")}</div>
          <div className="text-xs text-muted-foreground">Totale {eur(d.totale)} · già pagato {eur(d.pagato)}
            {(d.in_attesa || 0) > 0 ? ` · fatture da incassare ${eur(d.in_attesa)}` : ""} · <b>resta {eur(resta)}</b></div>
        </div>
        <Button size="icon" variant="ghost" onClick={onChiudi} disabled={busy}><X className="size-4" /></Button>
      </div>

      {/* 1. quanto */}
      <div className="space-y-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">1 · Quanto paga</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={tasto(modo === "intero")} onClick={() => setModo("intero")}>
            {saldo ? "Saldo" : "Pagamento totale"}<div className="text-lg tabular-nums">{eur(resta)}</div></button>
          <button type="button" className={tasto(modo === "acconto")} onClick={() => setModo("acconto")}>
            Acconto<div className="text-xs font-normal text-muted-foreground">importo libero</div></button>
        </div>
        {modo === "acconto" && (
          <Input autoFocus className="h-10 w-40 border-2 text-right text-lg font-semibold" inputMode="decimal" placeholder={`max ${eur(resta)}`}
            value={importoTxt} onChange={(e) => setImportoTxt(e.target.value)} />
        )}
      </div>

      {/* 2. scontrino o fattura */}
      <div className="space-y-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">2 · Scontrino o fattura {importoOk ? `(${eur(importo)})` : ""}</div>
        {motivo && <div className="text-xs text-amber-700 dark:text-amber-300">Prima {motivo}.</div>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={tasto(false)} disabled={!!motivo || busy} onClick={scontrino}>
            <Receipt className="mr-1 inline size-4" />Scontrino
            <div className="text-xs font-normal text-muted-foreground">vai alla Cassa con l&apos;importo già pronto: lì scegli come paga</div></button>
          <button type="button" className={tasto(false)} disabled={!!motivo || busy} onClick={fattura}>
            {busy ? <Loader2 className="mr-1 inline size-4 animate-spin" /> : <FileText className="mr-1 inline size-4" />}Fattura
            <div className="text-xs font-normal text-muted-foreground">
              {eAcconto ? "bozza di fattura d'acconto" : saldo ? "bozza di fattura che scala gli acconti" : "bozza di fattura"} · il pagamento si registra in Fatturazione</div></button>
        </div>
      </div>
    </Card>
  );
}
