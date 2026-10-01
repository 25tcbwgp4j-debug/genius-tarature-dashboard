"use client";

// INCASSO SU UN ORDINE CLIENTE (01/10/2026) — stesso flusso per acconto, intero e saldo al ritiro.
// 1) quanto: «Acconto» (importo libero) o «Intero importo» (= quanto resta da pagare);
// 2) certificazione OBBLIGATORIA: «Scontrino» (parte da solo al registratore) o «Fattura» (TD02 d'acconto se acconto,
//    fattura normale se intero/saldo, che scala gli acconti: nasce in bozza già pagata e si apre in Fatturazione);
// 3) metodo: contanti, «Paga con POS piccolo», «Incassato con POS P8», PayPal (QR) o bonifico istantaneo verificato.
//    POS, PayPal e bonifico registrano l'incasso SOLO a pagamento verificato.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Banknote, FileText, Loader2, Receipt, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PagaPos } from "@/components/PagaPos";
import { VerificaBonifico } from "@/components/VerificaBonifico";
import { parseDec } from "@/components/DecInput";
import { oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";
import { cassaGiornata, docIncassa, type DocumentoCliente, type EsitoIncassoOrdine } from "@/lib/api";

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
type Modalita = "contanti" | "pos_sumup" | "paypal" | "bonifico";

export function IncassoOrdine({ d, operatore, modo: modoIniziale = "intero", titolo, onFatto, onChiudi }: {
  d: DocumentoCliente; operatore: string | null;
  modo?: "acconto" | "intero"; titolo?: string;
  onFatto: (r: EsitoIncassoOrdine) => void | Promise<void>; onChiudi: () => void;
}) {
  const [modo, setModo] = useState<"acconto" | "intero">(modoIniziale);
  const [importoTxt, setImportoTxt] = useState("");
  const [cert, setCert] = useState<"" | "scontrino" | "fattura">("");
  const [busy, setBusy] = useState(false);
  const [cassaChiusa, setCassaChiusa] = useState(false);
  useEffect(() => { cassaGiornata(oggiRoma()).then((r) => setCassaChiusa(r.giornata.stato === "chiusa")).catch(() => undefined); }, []);

  const saldo = d.pagato > 0;
  const acc = parseDec(importoTxt);
  const importo = modo === "intero" ? d.residuo : (acc !== null && !Number.isNaN(acc) ? Math.round(acc * 100) / 100 : 0);
  const importoOk = importo > 0 && importo <= d.residuo + 0.001;
  // un «acconto» che copre tutto il residuo è di fatto il saldo
  const eAcconto = modo === "acconto" && importo < d.residuo - 0.001;
  const pronto = importoOk && !!cert && !!operatore && !busy;
  const motivo = !operatore ? "scegli l'operatore" : !importoOk ? (modo === "acconto" ? "scrivi l'importo dell'acconto" : "niente da incassare")
    : !cert ? "scegli scontrino o fattura" : "";

  async function registra(modalita: Modalita, extra: { pos_incasso_id?: string; riferimento?: string } = {}) {
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    if (!importoOk) { toast.error(modo === "acconto" ? `Scrivi l'acconto (massimo ${eur(d.residuo)})` : "Niente da incassare"); return; }
    if (!cert) { toast.error("Scegli come certificare l'incasso: scontrino o fattura"); return; }
    setBusy(true);
    try {
      const r = await docIncassa(d.id, { ...(modo === "intero" ? { intero: true } : { importo }), modalita, certificato: cert, operatore, ...extra });
      toast.success(cert === "scontrino" ? `Incasso di ${eur(importo)} registrato: lo scontrino è partito verso il registratore`
        : `Incasso di ${eur(importo)} registrato: ${r.fattura?.tipo_documento === "TD02" ? "fattura d'acconto" : "fattura"} in bozza già pagata`);
      await onFatto(r);
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  const tasto = (attivo: boolean) => `flex-1 rounded-md border-2 px-3 py-2 text-left text-sm transition ${attivo ? "border-primary bg-primary/10 font-semibold" : "border-input hover:bg-muted"}`;

  return (
    <Card className="space-y-3 border-2 border-primary/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{titolo || (saldo ? "Pagamento del saldo" : "Pagamento dell'ordine")}</div>
          <div className="text-xs text-muted-foreground">Totale {eur(d.totale)} · già pagato {eur(d.pagato)} · <b>resta {eur(d.residuo)}</b></div>
        </div>
        <Button size="icon" variant="ghost" onClick={onChiudi} disabled={busy}><X className="size-4" /></Button>
      </div>

      {/* 1. quanto */}
      <div className="space-y-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">1 · Quanto incassi</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={tasto(modo === "intero")} onClick={() => setModo("intero")}>
            {saldo ? "Saldo" : "Intero importo"}<div className="text-lg tabular-nums">{eur(d.residuo)}</div></button>
          <button type="button" className={tasto(modo === "acconto")} onClick={() => setModo("acconto")}>
            Acconto<div className="text-xs font-normal text-muted-foreground">importo libero</div></button>
        </div>
        {modo === "acconto" && (
          <Input autoFocus className="h-10 w-40 border-2 text-right text-lg font-semibold" inputMode="decimal" placeholder={`max ${eur(d.residuo)}`}
            value={importoTxt} onChange={(e) => setImportoTxt(e.target.value)} />
        )}
      </div>

      {/* 2. certificazione */}
      <div className="space-y-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">2 · Come certifichi l&apos;incasso (obbligatorio)</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={tasto(cert === "scontrino")} onClick={() => setCert("scontrino")}>
            <Receipt className="mr-1 inline size-4" />Scontrino<div className="text-xs font-normal text-muted-foreground">parte da solo al registratore</div></button>
          <button type="button" className={tasto(cert === "fattura")} onClick={() => setCert("fattura")}>
            <FileText className="mr-1 inline size-4" />Fattura<div className="text-xs font-normal text-muted-foreground">
              {eAcconto ? "fattura d'acconto (TD02)" : saldo ? "fattura che scala gli acconti" : "fattura"} · bozza già pagata</div></button>
        </div>
      </div>

      {cassaChiusa && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
          La cassa di oggi è CHIUSA: per incassare va prima riaperta. <a className="font-medium underline" href="/cassa/giornata">Apri cassa del giorno</a>
        </div>
      )}

      {/* 3. metodo */}
      <div className="space-y-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">3 · Come paga il cliente {importoOk ? `(${eur(importo)})` : ""}</div>
        {motivo && <div className="text-xs text-amber-700 dark:text-amber-300">Prima {motivo}.</div>}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!pronto} onClick={() => { if (confirm(`Incassare ${eur(importo)} in CONTANTI con ${cert === "scontrino" ? "scontrino" : "fattura"}?`)) registra("contanti"); }}>
            {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Banknote className="mr-1 size-4" />}Contanti</Button>
          <PagaPos importo={importoOk ? importo : 0} descrizione={`${eAcconto ? "Acconto" : "Saldo"} ${d.sigla}`} rifTipo={`ordine_${eAcconto ? "acconto" : "saldo"}`} rifId={d.id}
            disabled={!pronto} paypal onPagato={(p) => registra(p.metodo === "paypal" ? "paypal" : "pos_sumup", { pos_incasso_id: p.id })} />
          <VerificaBonifico importo={importoOk ? importo : 0} testo={d.cliente_nome || ""} etichettaConferma="Registra l'incasso" disabled={!pronto}
            onConfermato={(rif) => registra("bonifico", { riferimento: rif })} />
        </div>
      </div>
    </Card>
  );
}
