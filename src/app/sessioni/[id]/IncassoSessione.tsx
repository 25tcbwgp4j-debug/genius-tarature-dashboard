"use client";

// INCASSO DELLA SESSIONE (03/10/2026) — pagamenti parziali, misti, acconto e saldo.
// «La fattura comanda»: se la sessione ha la fattura, ogni incasso si registra SU di lei (anche in più volte e con metodi
// diversi: POST /api/pagamenti/sessione/{id}). Senza fattura si registra un ACCONTO sul pro forma della sessione:
// - scontrino d'acconto → Cassa col carrello pronto (/cassa?ordine=<pro forma>&tipo=acconto&importo=…);
// - fattura d'acconto (TD02) → bozza in Fatturazione.
// Il saldo poi scala gli acconti: «Converti in fattura» dal pro forma (TD01 con l'acconto in negativo) o lo scontrino del saldo.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Incassa } from "@/components/Incassa";
import { parseDec } from "@/components/DecInput";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { docIncassa, fetchAPI, type StatoPagamentoSessione } from "@/lib/api";
import { toastErrore } from "@/lib/errori";
import { apriConfermaBonifico, useBonificoDelDocumento } from "@/components/BonificiAvviso";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);

export function IncassoSessione({ sessionId, st, disabled, onFatto }: {
  sessionId: string; st: StatoPagamentoSessione | null; disabled?: boolean; onFatto: () => void;
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [operatore, setOperatore] = useOperatore();
  const [acconto, setAcconto] = useState("");
  const [busy, setBusy] = useState("");
  const r = st?.riepilogo;
  const fattura = st?.fattura || null;
  const pf = st?.proforma_doc && st.proforma_doc.stato === "aperto" ? st.proforma_doc : null;
  // bonifico arrivato e abbinato a questa sessione (05/10/2026): si apre la conferma precompilata, non la scelta del metodo
  const { bonifico: bon, correggi: bonCorreggi } = useBonificoDelDocumento(sessionId, fattura?.id, pf?.id);
  const totale = r?.totale ?? 0;
  const pagato = r?.pagato ?? 0;
  const residuo = r ? r.residuo : 0;
  if (st?.pagamento?.pagata && residuo <= 0.005) return null;

  const imp = parseDec(acconto);
  const accontoOk = imp !== null && !Number.isNaN(imp) && imp > 0 && imp <= residuo + 0.005;

  async function fatturaAcconto() {
    if (!pf || !accontoOk || !operatore) return;
    setBusy("fattura");
    try {
      const x = await docIncassa(pf.id, { importo: imp!, certificato: "fattura", operatore });
      toast.success(`Fattura ${x.fattura?.tipo_documento === "TD02" ? "d'acconto" : "del saldo"} pronta in bozza: registra il pagamento ed emettila`);
      setAperto(false); onFatto();
      if (x.fattura?.id) router.push(`/fatturazione?id=${x.fattura.id}`);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  return (
    <>
      <Button className="mt-1 h-11 w-full text-xs font-bold" variant="outline" disabled={disabled} onClick={() => (bon && !bonCorreggi ? apriConfermaBonifico() : setAperto(true))}
        title="Pagamento in più volte, con metodi diversi, acconto e saldo">
        <Wallet className="size-4" /> {pagato > 0.005 ? `INCASSA IL RESTO (${eur(residuo)})` : "INCASSA · ACCONTO"}
      </Button>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Incasso della sessione</DialogTitle>
            <DialogDescription>
              {fattura ? <>Si registra sulla fattura {fattura.numero || "(bozza)"}: anche in più volte e con metodi diversi.</>
                : <>La fattura non c&apos;è ancora: registra un <b>acconto</b> (scontrino o fattura d&apos;acconto). Il saldo poi lo scala.</>}
            </DialogDescription>
          </DialogHeader>
          {r?.badge && <div className="rounded-md bg-muted px-2 py-1.5 text-sm">{r.badge}</div>}
          <SceltaOperatore value={operatore} onChange={setOperatore} />
          {fattura ? (
            <Incassa modo="documento" totale={totale} giaPagato={pagato} documentoTipo="fattura"
              descrizione={`Fattura ${fattura.numero || "(bozza)"} sessione`} disabled={!operatore} motivo={!operatore ? "scegli l'operatore" : ""}
              onPagamento={async (p) => {
                await fetchAPI(`/api/pagamenti/sessione/${sessionId}`, { method: "POST", body: JSON.stringify({ ...p, operatore }) });
                return { id: fattura.id, descrizione: `Fattura ${fattura.numero || "(bozza)"}` };
              }}
              onFatto={() => { onFatto(); }} />
          ) : pf ? (
            <div className="space-y-3">
              <label className="block text-xs text-muted-foreground">Importo dell&apos;acconto (resta {eur(residuo)} sul pro forma {pf.sigla})
                <Input inputMode="decimal" className="mt-1 h-11 text-right text-lg font-semibold" placeholder="es. 100" value={acconto}
                  onChange={(e) => setAcconto(e.target.value)} /></label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button className="h-11" disabled={!accontoOk || !operatore || !!busy}
                  onClick={() => router.push(`/cassa?${new URLSearchParams({ ordine: pf.id, importo: imp!.toFixed(2), tipo: imp! < residuo - 0.005 ? "acconto" : "saldo" })}`)}>
                  <Receipt className="size-4" /> Scontrino d&apos;acconto</Button>
                <Button className="h-11" variant="secondary" disabled={!accontoOk || !operatore || !!busy} onClick={fatturaAcconto}>
                  {busy === "fattura" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Fattura d&apos;acconto</Button>
              </div>
              <p className="text-xs text-muted-foreground">Allo scontrino si sceglie come paga (anche contanti + carta). Al saldo, «Converti in fattura» dal pro forma scala da solo gli acconti.</p>
            </div>
          ) : (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:bg-amber-950/30">Prima prepara il pro forma della sessione (Azioni → PRO FORMA): l&apos;acconto si registra lì.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
