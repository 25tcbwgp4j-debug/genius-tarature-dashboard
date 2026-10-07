"use client";

// 07/10/2026 (2° giro): il pannello «Fattura» in fondo alla sessione è stato tolto; stato fattura, pagamento e pulsanti
// stanno in BloccoProforma.tsx. Qui resta il dialogo del pro forma (ProformaDialog).
// Storico — Fattura della sessione di taratura (GENIUS LAB) — regole di Christian del 01/10/2026:
// - dalla sessione NON si emette e non si invia MAI la fattura allo SdI;
// - 07/10/2026 (Christian): «Prepara pro forma di fattura» e «Converti in scontrino» stanno IN ALTO, nel riquadro
//   «Pro forma» delle Azioni; la fattura nasce dal pro forma («Converti in fattura» sulla scheda del pro forma).
//   Qui resta solo il link discreto «fattura diretta senza pro forma» (ex «Prepara bozza da controllare»): bozza dalla
//   sessione, o DAL pro forma se c'è, poi si va in Fatturazione; propone anche di collegare una fattura già fatta in SimplyFatt;
// - un solo pro forma per sessione; pro forma via email / WhatsApp con i pulsanti PROFORMA qui sopra;
// - pagamento arrivato (verifica pagamenti) e avviso «DA SPEDIRE» se la riconsegna va fatta col corriere.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BadgeOperatore, NOMI_OPERATORI, OPERATORI_TARATURE, SceltaOperatore, useOperatore, type Operatore } from "@/components/Operatore";
import { getDocumentoPdfUrl, getProformaAnteprimaPdfUrl, proformaSessioneCrea, proformaSessioneStato, type ProformaSessioneStato } from "@/lib/api";

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

// Anteprima del pro forma: le STESSE righe e gli STESSI totali della fattura che esce dalla sessione.
export function ProformaDialog({ sessionId, onChiudi, onCreato }: { sessionId: string; onChiudi: () => void; onCreato: (sigla: string) => void }) {
  const [st, setSt] = useState<ProformaSessioneStato | null>(null);
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);
  const [opDispositivo, setOperatore] = useOperatore();
  // pagina sessione Tarature: solo Christian (CHR) o Dumy (DUMY)
  const operatore = (OPERATORI_TARATURE as readonly Operatore[]).includes(opDispositivo as Operatore) ? opDispositivo : "";
  useEffect(() => { proformaSessioneStato(sessionId).then(setSt).catch((e: Error) => setErrore(e.message)); }, [sessionId]);
  const doc = st?.documento;
  const v = doc ? { righe: doc.righe_calcolate, imponibile: doc.imponibile, iva: doc.iva, totale: doc.totale } : st?.anteprima
    ? { righe: st.anteprima.righe_calcolate, imponibile: st.anteprima.imponibile, iva: st.anteprima.iva, totale: st.anteprima.totale } : null;

  // il ref blocca il secondo clic anche prima che React ridisegni il pulsante disabilitato
  const inCorso = useRef(false);
  const [creato, setCreato] = useState(false);
  async function conferma() {
    if (inCorso.current || creato) return;
    if (!operatore) { toast.error("Scegli chi sta facendo l'operazione: Christian o Dumy"); return; }
    inCorso.current = true;
    setBusy(true);
    try {
      const r = await proformaSessioneCrea(sessionId, operatore);
      const sigla = r.documento.sigla || `PF ${r.documento.numero}/${r.documento.anno}`;
      toast.success(r.gia_presente ? `C'era già il pro forma ${sigla}` : `Pro forma ${sigla} preparato`);
      setCreato(true);   // dopo la conferma il pulsante non torna più attivo
      onCreato(sigla);
    } catch (e) { toast.error((e as Error).message); inCorso.current = false; } finally { setBusy(false); }
  }

  // anteprima = lo STESSO PDF del pro forma definitivo (stesso layout della fattura: cedente, cessionario, IVA, IBAN)
  // URL fisso per tutta la vita del dialogo (le funzioni aggiungono ?t=ora: a ogni render l'iframe si ricaricherebbe)
  const pdfUrl = useMemo(() => (doc ? getDocumentoPdfUrl(doc.id) : getProformaAnteprimaPdfUrl(sessionId)), [doc, sessionId]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={onChiudi}>
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b px-5 py-3">
          <h3 className="text-lg font-semibold">{doc ? `Pro forma ${doc.sigla}` : "Prepara pro forma di fattura"}</h3>
          <p className="text-xs text-muted-foreground">{doc && doc.operatore ? <>fatto da <BadgeOperatore op={doc.operatore} /> · </> : null}{doc ? `del ${new Date(doc.data).toLocaleDateString("it-IT")} · ${doc.stato}` : "Anteprima: è il documento che verrà creato, con le righe e i totali della fattura di questa sessione"}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-3 text-sm sm:px-5">
          {errore && <p className="text-red-600">{errore}</p>}
          {!v && !errore && <Loader2 className="animate-spin" />}
          {v && (
            <>
              <iframe src={pdfUrl} title="Anteprima pro forma" className="h-[65vh] w-full rounded border bg-white" />
              <div className="flex flex-wrap justify-end gap-x-4 text-xs text-muted-foreground">
                <span>Imponibile <b className="font-mono">{eur(v.imponibile)}</b></span>
                <span>IVA <b className="font-mono">{eur(v.iva)}</b></span>
                <span className="text-base font-bold text-orange-700">Totale {eur(v.totale)}</span>
              </div>
              {!v.righe.length && <p className="text-muted-foreground">Nessuno strumento in sessione</p>}
            </>
          )}
        </div>
        {!doc && <div className="border-t px-5 pt-3"><SceltaOperatore value={operatore} onChange={setOperatore} compatto opzioni={OPERATORI_TARATURE} nomi={NOMI_OPERATORI} /></div>}
        <div className="flex gap-2 border-t bg-muted/40 px-5 py-3">
          <Button variant="outline" className="flex-1" onClick={onChiudi}>Chiudi</Button>
          {doc ? (
            <Button className="flex-1" onClick={() => window.open(getDocumentoPdfUrl(doc.id), "_blank")}><FileText /> Apri PDF</Button>
          ) : (
            <Button className="flex-1 bg-orange-600 hover:bg-orange-700" disabled={busy || creato || !v || !v.righe.length || !operatore} onClick={conferma}>
              {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Conferma e crea pro forma</Button>
          )}
        </div>
      </div>
    </div>
  );
}
