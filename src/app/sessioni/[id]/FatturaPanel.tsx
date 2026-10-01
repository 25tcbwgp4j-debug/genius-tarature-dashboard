"use client";

// Fattura della sessione di taratura (GENIUS LAB):
// - EMETTI FATTURA SUBITO (cliente al banco): crea e invia allo SdI in un colpo solo
// - PRO FORMA → pagamento (pulsanti PROFORMA qui sopra) → TRASFORMA IN FATTURA (riprende pro forma e pagamento)
// - oppure bozza da controllare prima dell'invio.
// - pagamento arrivato (verifica pagamenti) e avviso «DA SPEDIRE» se la riconsegna va fatta col corriere.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, ExternalLink, FileEdit, FileSpreadsheet, FileText, Loader2, Receipt, Send, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  fattCollegaSessione, fattDaSessione, fattStatoSessione, getDocumentoPdfUrl, incSessione, proformaSessioneCrea, proformaSessioneStato,
  type ApiError, type DaSpedire, type ProformaSessioneStato,
} from "@/lib/api";

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

interface Stato {
  fattura: { id: string; numero: string | null; stato: string; totale: number; pagamento_stato: string; data: string } | null;
  sessione: { payment_status?: string; payment_method?: string; total_amount?: number; proforma_sent_at?: string | null };
  proforma: { proforma_number: string; total: number; payment_status: string } | null;
}

// Anteprima del pro forma: le STESSE righe e gli STESSI totali della fattura che esce dalla sessione.
export function ProformaDialog({ sessionId, onChiudi, onCreato }: { sessionId: string; onChiudi: () => void; onCreato: (sigla: string) => void }) {
  const [st, setSt] = useState<ProformaSessioneStato | null>(null);
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { proformaSessioneStato(sessionId).then(setSt).catch((e: Error) => setErrore(e.message)); }, [sessionId]);
  const doc = st?.documento;
  const v = doc ? { righe: doc.righe_calcolate, imponibile: doc.imponibile, iva: doc.iva, totale: doc.totale } : st?.anteprima
    ? { righe: st.anteprima.righe_calcolate, imponibile: st.anteprima.imponibile, iva: st.anteprima.iva, totale: st.anteprima.totale } : null;

  async function conferma() {
    setBusy(true);
    try {
      const r = await proformaSessioneCrea(sessionId);
      const sigla = r.documento.sigla || `PF ${r.documento.numero}/${r.documento.anno}`;
      toast.success(r.gia_presente ? `C'era già il pro forma ${sigla}` : `Pro forma ${sigla} preparato`);
      onCreato(sigla);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onChiudi}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b px-5 py-4">
          <h3 className="text-lg font-semibold">{doc ? `Pro forma ${doc.sigla}` : "Prepara pro forma di fattura"}</h3>
          <p className="text-xs text-muted-foreground">{doc ? `del ${new Date(doc.data).toLocaleDateString("it-IT")} · ${doc.stato}` : "Anteprima: righe e totali sono quelli della fattura di questa sessione"}</p>
        </div>
        <div className="space-y-2 px-5 py-4 text-sm">
          {errore && <p className="text-red-600">{errore}</p>}
          {!v && !errore && <Loader2 className="animate-spin" />}
          {v && (
            <>
              <div className="rounded border">
                <table className="w-full text-xs"><tbody>
                  {v.righe.map((r, i) => (
                    <tr key={i} className={"border-b last:border-0 " + (/spedizion/i.test(r.descrizione) ? "bg-blue-50 dark:bg-blue-950/30" : "")}>
                      <td className="px-2 py-1.5">{r.quantita !== 1 ? `${r.quantita} × ` : ""}{r.descrizione}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{eur(r.lordo ?? r.prezzo_totale * (1 + r.aliquota / 100))}</td>
                    </tr>
                  ))}
                  {!v.righe.length && <tr><td className="p-2 text-muted-foreground">Nessuno strumento in sessione</td></tr>}
                </tbody></table>
              </div>
              {st?.anteprima?.shipping_by_customer && <p className="text-xs text-amber-700">Spedizione a carico del cliente: nessun costo di spedizione.</p>}
              <div className="flex justify-between text-xs text-muted-foreground"><span>Imponibile</span><span className="font-mono">{eur(v.imponibile)}</span></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>IVA</span><span className="font-mono">{eur(v.iva)}</span></div>
              <div className="mt-2 flex justify-between border-t-2 border-orange-600 pt-2 text-base font-bold"><span>TOTALE (IVA incl.)</span><span className="font-mono text-orange-700">{eur(v.totale)}</span></div>
            </>
          )}
        </div>
        <div className="flex gap-2 border-t bg-muted/40 px-5 py-3">
          <Button variant="outline" className="flex-1" onClick={onChiudi}>Chiudi</Button>
          {doc ? (
            <Button className="flex-1" onClick={() => window.open(getDocumentoPdfUrl(doc.id), "_blank")}><FileText /> Apri PDF</Button>
          ) : (
            <Button className="flex-1 bg-orange-600 hover:bg-orange-700" disabled={busy || !v || !v.righe.length} onClick={conferma}>
              {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Conferma e crea pro forma</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function FatturaPanel({ sessionId, aggiorna = 0 }: { sessionId: string; aggiorna?: number }) {
  const router = useRouter();
  const [dialogPf, setDialogPf] = useState(false);
  const [pf, setPf] = useState<ProformaSessioneStato["documento"]>(null);
  const [st, setSt] = useState<Stato | null>(null);
  const [busy, setBusy] = useState("");
  const [inc, setInc] = useState<{ incassi: { id: string; fonte: string; data: string; importo: number; ordinante: string | null; esito: string | null }[]; da_spedire: DaSpedire | null } | null>(null);

  const carica = useCallback(() => {
    fattStatoSessione(sessionId).then(setSt).catch(() => undefined);
    incSessione(sessionId).then(setInc).catch(() => undefined);
    proformaSessioneStato(sessionId).then((r) => setPf(r.documento)).catch(() => undefined);
  }, [sessionId]);
  useEffect(() => { carica(); }, [carica, aggiorna]);

  async function crea(emetti: boolean, forza = false) {
    if (emetti && !forza && !confirm("Emettere subito la fattura e inviarla allo SdI?")) return;
    setBusy(emetti ? "emetti" : "bozza");
    try {
      const r = await fattDaSessione(sessionId, emetti, forza);
      if (r.gia_presente) { toast.info(`Questa sessione ha già la fattura ${r.numero || "(bozza)"}`); router.push(`/fatturazione?id=${r.id}`); return; }
      if (emetti) {
        if (r.invio?.ok) toast.success(`Fattura ${r.invio.numero} emessa e inviata allo SdI`);
        else toast.error(`Fattura in bozza: ${r.invio?.errore || "da completare"}`);
      } else toast.success("Bozza di fattura preparata: controllala e inviala allo SdI");
      router.push(`/fatturazione?id=${r.id}`);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.detail?.fattura) {
        // fattura già fatta fuori dalla dashboard (SimplyFatt): la si collega invece di rifarla
        const dop = err.detail.fattura as { id: string; numero: string };
        if (confirm(`${err.message}.\n\nOK = collega la fattura ${dop.numero} a questa sessione (niente doppione)\nAnnulla = scegli se crearne comunque una nuova`)) {
          try {
            await fattCollegaSessione(sessionId, dop.id);
            toast.success(`Fattura ${dop.numero} collegata alla sessione`);
            carica();
          } catch (e2) { toast.error((e2 as Error).message); }
        } else if (confirm("Creare comunque una NUOVA fattura per questa sessione?")) {
          setBusy("");
          return crea(emetti, true);
        }
      } else toast.error(err.message);
    } finally { setBusy(""); }
  }

  const pagata = st?.sessione?.payment_status === "pagato";
  const f = st?.fattura;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Receipt className="size-5" />
        <div className="font-medium">Fattura</div>
        <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
          {pf ? (
            <button className="rounded bg-orange-500/15 px-1.5 py-0.5 text-orange-800 underline-offset-2 hover:underline dark:text-orange-200" onClick={() => setDialogPf(true)}>
              Pro forma {pf.sigla} · {eur(pf.totale)}</button>
          ) : st?.proforma && <span className="rounded bg-muted px-1.5 py-0.5">Pro forma {st.proforma.proforma_number} · {eur(st.proforma.total)}</span>}
          <span className={`rounded px-1.5 py-0.5 ${pagata ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
            {pagata ? `Pagata (${st?.sessione?.payment_method || "—"})` : "Da pagare"}</span>
        </div>
      </div>

      {inc?.da_spedire && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
          <Truck className="size-4" /> <b>Pagata: DA SPEDIRE</b> <span className="text-muted-foreground">({inc.da_spedire.motivo})</span>
          <Button size="sm" variant="outline" className="ml-auto"
            onClick={() => document.getElementById("spedizioni")?.scrollIntoView({ behavior: "smooth" })}><Truck /> Vai alla spedizione</Button>
        </div>
      )}
      {!!inc?.incassi.length && (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {inc.incassi.map((x) => (
            <div key={x.id} className="flex items-center gap-1"><Banknote className="size-3.5" />
              Pagamento arrivato: {x.fonte === "banca" ? "bonifico" : x.fonte} {eur(x.importo)} del {new Date(x.data).toLocaleDateString("it-IT")}
              {x.ordinante ? ` da ${x.ordinante}` : ""}{x.esito ? ` — ${x.esito}` : ""}</div>
          ))}
        </div>
      )}

      {f ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Fattura <b>{f.numero || "bozza"}</b> · {eur(f.totale)} · {f.stato} · {f.pagamento_stato === "pagata" ? "incassata" : "da incassare"}</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => router.push(`/fatturazione?id=${f.id}`)}><ExternalLink /> Apri</Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {st?.proforma
              ? pagata ? "La pro forma è pagata: trasformala in fattura." : "Pro forma inviata: quando il cliente paga (o anche prima) puoi trasformarla in fattura."
              : "Cliente al banco? Emetti subito la fattura. Altrimenti prepara il PRO FORMA (qui sotto), invialo con PROFORMA EMAIL / WHATSAPP, fatti pagare e poi trasformalo in fattura."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => crea(true)} disabled={!!busy}>
              {busy === "emetti" ? <Loader2 className="animate-spin" /> : <Send />} {st?.proforma ? "Trasforma pro forma in fattura e invia" : "Emetti fattura subito"}</Button>
            <Button variant="outline" onClick={() => crea(false)} disabled={!!busy}>
              {busy === "bozza" ? <Loader2 className="animate-spin" /> : <FileEdit />} Prepara bozza da controllare</Button>
            <Button variant="outline" onClick={() => setDialogPf(true)} disabled={!!busy}
              title={pf ? "Il pro forma della sessione esiste già: aprilo" : "Anteprima del pro forma con le righe della fattura; si crea solo se confermi"}>
              <FileSpreadsheet /> {pf ? `Pro forma ${pf.sigla}` : "Prepara pro forma di fattura"}</Button>
          </div>
        </>
      )}
      {dialogPf && <ProformaDialog sessionId={sessionId} onChiudi={() => setDialogPf(false)} onCreato={() => { setDialogPf(false); carica(); }} />}
    </Card>
  );
}
