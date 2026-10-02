"use client";

// Fattura della sessione di taratura (GENIUS LAB) — regole di Christian del 01/10/2026:
// - dalla sessione NON si emette e non si invia MAI la fattura allo SdI;
// - «Prepara bozza da controllare»: bozza dalla sessione, o DAL pro forma se c'è (il pro forma diventa «convertito»),
//   poi si va da soli in Fatturazione sul dettaglio della bozza (pagamento, operatore, emissione). Se la bozza c'è già si apre quella;
// - «Converti in scontrino» (il cliente non vuole la fattura): pagina Scontrino precompilata con le righe della sessione;
// - un solo pro forma per sessione; pro forma via email / WhatsApp con i pulsanti PROFORMA qui sopra;
// - pagamento arrivato (verifica pagamenti) e avviso «DA SPEDIRE» se la riconsegna va fatta col corriere.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, ExternalLink, FileEdit, FileSpreadsheet, FileText, Loader2, Receipt, ShoppingCart, Truck } from "lucide-react";
import { toast } from "sonner";
import { BadgeOperatore, SceltaOperatore, useOperatore } from "@/components/Operatore";
import {
  fattCollegaSessione, fattDaSessione, fattStatoSessione, getDocumentoPdfUrl, getProformaAnteprimaPdfUrl, incSessione, proformaSessioneCrea, proformaSessioneStato,
  type ApiError, type DaSpedire, type ProformaSessioneStato, type StatoPagamentoSessione,
} from "@/lib/api";
import { dataIt, testoPagamento } from "./PagamentoStato";

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

type Stato = StatoPagamentoSessione;

const STATO_SDI: Record<string, string> = {
  bozza: "bozza (non inviata)", inviata: "inviata allo SdI", consegnata: "consegnata dallo SdI", non_consegnata: "non consegnata (in cassetto fiscale)",
  scartata: "SCARTATA dallo SdI", errore: "errore di invio", accettata: "accettata", rifiutata: "rifiutata",
};

// Anteprima del pro forma: le STESSE righe e gli STESSI totali della fattura che esce dalla sessione.
export function ProformaDialog({ sessionId, onChiudi, onCreato }: { sessionId: string; onChiudi: () => void; onCreato: (sigla: string) => void }) {
  const [st, setSt] = useState<ProformaSessioneStato | null>(null);
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);
  const [operatore, setOperatore] = useOperatore();
  useEffect(() => { proformaSessioneStato(sessionId).then(setSt).catch((e: Error) => setErrore(e.message)); }, [sessionId]);
  const doc = st?.documento;
  const v = doc ? { righe: doc.righe_calcolate, imponibile: doc.imponibile, iva: doc.iva, totale: doc.totale } : st?.anteprima
    ? { righe: st.anteprima.righe_calcolate, imponibile: st.anteprima.imponibile, iva: st.anteprima.iva, totale: st.anteprima.totale } : null;

  // il ref blocca il secondo clic anche prima che React ridisegni il pulsante disabilitato
  const inCorso = useRef(false);
  const [creato, setCreato] = useState(false);
  async function conferma() {
    if (inCorso.current || creato) return;
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
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
        {!doc && <div className="border-t px-5 pt-3"><SceltaOperatore value={operatore} onChange={setOperatore} compatto /></div>}
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

export function FatturaPanel({ sessionId, aggiorna = 0, onCambio }: { sessionId: string; aggiorna?: number; onCambio?: () => void }) {
  const router = useRouter();
  const [dialogPf, setDialogPf] = useState(false);
  const [pf, setPf] = useState<ProformaSessioneStato["documento"]>(null);
  const [st, setSt] = useState<Stato | null>(null);
  const [busy, setBusy] = useState("");
  const inCorso = useRef(false);
  const [operatore, setOperatore] = useOperatore();
  const [inc, setInc] = useState<{ incassi: { id: string; fonte: string; data: string; importo: number; ordinante: string | null; esito: string | null }[]; da_spedire: DaSpedire | null } | null>(null);

  const carica = useCallback(() => {
    fattStatoSessione(sessionId).then(setSt).catch(() => undefined);
    incSessione(sessionId).then(setInc).catch(() => undefined);
    proformaSessioneStato(sessionId).then((r) => setPf(r.documento)).catch(() => undefined);
  }, [sessionId]);
  useEffect(() => { carica(); }, [carica, aggiorna]);
  // tornando sulla scheda (es. dopo aver emesso la fattura in Fatturazione) lo stato si aggiorna da solo
  useEffect(() => {
    const vis = () => { if (document.visibilityState === "visible") carica(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", carica);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", carica); };
  }, [carica]);
  // dopo ogni azione: si ricarica il pannello E la sessione (pulsanti PROFORMA, stato pagamento)
  const aggiornaTutto = useCallback(() => { carica(); onCambio?.(); }, [carica, onCambio]);

  async function bozza(forza = false) {
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    if (inCorso.current && !forza) return;
    inCorso.current = true;
    setBusy("bozza");
    try {
      const r = await fattDaSessione(sessionId, forza, operatore);
      if (r.gia_presente) toast.info(`Questa sessione ha già la fattura ${r.numero || "(bozza)"}: la apro`);
      else toast.success(pf ? `Bozza preparata dal pro forma ${pf.sigla}: scegli il pagamento ed emettila` : "Bozza preparata: scegli il pagamento ed emettila");
      aggiornaTutto();
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
            aggiornaTutto();
          } catch (e2) { toast.error((e2 as Error).message); }
        } else if (confirm("Creare comunque una NUOVA bozza di fattura per questa sessione?")) {
          return bozza(true);
        }
      } else toast.error(err.message);
    } finally { inCorso.current = false; setBusy(""); }
  }

  const f = st?.fattura;
  const tp = testoPagamento(st);
  const pfAperto = pf && pf.stato === "aperto" ? pf : null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Receipt className="size-5" />
        <div className="font-medium">Fattura</div>
        <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
          {pf ? (
            <button className="rounded bg-orange-500/15 px-1.5 py-0.5 text-orange-800 underline-offset-2 hover:underline dark:text-orange-200" onClick={() => setDialogPf(true)}>
              Pro forma {pf.sigla} · {eur(pf.totale)}{pf.stato === "convertito" ? ` · convertito${pf.convertito_in?.tipo === "scontrino" ? " in scontrino" : " in fattura"}` : ""}</button>
          ) : st?.proforma && <span className="rounded bg-muted px-1.5 py-0.5">Pro forma {st.proforma.proforma_number} · {eur(st.proforma.total)}</span>}
          {tp && <span className={`rounded border px-1.5 py-0.5 ${tp.colore}`}>{tp.breve}</span>}
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
        <div className="space-y-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span>Fattura <b>{f.numero || "bozza"}</b>{f.numero ? ` del ${dataIt(f.data)}` : ""} · <b>{eur(f.totale)}</b>
              {f.origine === "simplyfatt" ? <span className="text-xs text-muted-foreground"> · da SimplyFatt</span> : null}</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => router.push(`/fatturazione?id=${f.id}`)}>
              <ExternalLink /> {f.stato === "bozza" ? "Apri la bozza in Fatturazione" : "Apri la fattura"}</Button>
          </div>
          {/* una riga per cosa: SdI · modalità e termine · pagamento — gli stessi dati della scheda fattura */}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
            <div><dt className="inline text-muted-foreground">SdI: </dt><dd className={`inline ${["scartata", "errore"].includes(f.stato) ? "font-semibold text-red-600" : ""}`}>{STATO_SDI[f.stato] || f.stato}</dd></div>
            <div><dt className="inline text-muted-foreground">Termine: </dt><dd className="inline">
              {st?.pagamento.modalita_label || "—"} · {st?.pagamento.termine === "differito" ? "differito concordato" : "immediato"}
              {st?.pagamento.scadenza ? ` · scadenza ${dataIt(st.pagamento.scadenza)}` : ""}</dd></div>
            <div><dt className="inline text-muted-foreground">Pagamento: </dt><dd className={`inline font-medium ${st?.pagamento.pagata ? "text-emerald-700" : st?.pagamento.scaduta ? "text-red-600" : "text-amber-700"}`}>
              {st?.pagamento.pagata ? `pagata il ${dataIt(st.pagamento.pagato_il)}${st.pagamento.modalita_label ? ` con ${st.pagamento.modalita_label}` : ""}`
                : st?.pagamento.scaduta ? "da pagare — SCADUTA" : "da pagare"}</dd></div>
          </dl>
          {pf?.stato === "convertito" && pf.convertito_in?.tipo === "fattura" && (
            <p className="text-xs text-muted-foreground">Nasce dal pro forma <b>{pf.sigla}</b>, convertito in questa fattura.</p>
          )}
          {!!f.numero_altre && <p className="text-xs text-amber-700">Ci sono altre {f.numero_altre} fatture collegate a questa sessione: vale l&apos;ultima emessa.</p>}
          {!st?.pagamento.pagata && f.stato !== "bozza" && (
            <p className="text-xs text-muted-foreground">Quando arriva il pagamento si registra sulla fattura (o con BONIFICO / CONTANTI / POS nelle Azioni, che lo scrivono sulla fattura).</p>
          )}
        </div>
      ) : pf?.stato === "convertito" && pf.convertito_in?.tipo === "scontrino" ? (
        <p className="text-sm text-muted-foreground">Sessione chiusa con lo scontrino al registratore (il cliente non ha voluto la fattura).</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <b>Nessuna fattura collegata.</b> «Prepara bozza» crea la fattura da controllare{pfAperto ? <> (dal pro forma <b>{pfAperto.sigla}</b>)</> : null}
            e ti porta in Fatturazione per l&apos;emissione allo SdI. Se la fattura è già stata fatta (es. in SimplyFatt) te la propone da collegare.
            {tp ? <> Pagamento: <b>{tp.lungo}</b>.</> : null}
          </p>
          {/* Il pulsante verde «Apri il pro forma e convertilo in fattura» sta in ALTO nella scheda sessione
              (sotto «Scarica rapporti», sopra le Azioni) dal 02/10/2026: qui resta solo il richiamo. */}
          {pfAperto && (
            <button type="button" className="text-left text-sm text-emerald-700 underline underline-offset-2"
              onClick={() => router.push(`/proforma?id=${pfAperto.id}`)}>
              Pro forma {pfAperto.sigla} pronto: aprilo e convertilo in fattura (pulsante verde in alto)
            </button>
          )}
          <SceltaOperatore value={operatore} onChange={setOperatore} compatto />
          <div className="flex flex-wrap gap-2">
            <Button variant={pfAperto ? "outline" : "default"} onClick={() => bozza()} disabled={!!busy || !operatore}>
              {busy === "bozza" ? <Loader2 className="animate-spin" /> : <FileEdit />} Prepara bozza da controllare</Button>
            {!pf && (
              <Button variant="outline" onClick={() => setDialogPf(true)} disabled={!!busy}
                title="Anteprima del pro forma con le righe della fattura; si crea solo se confermi">
                <FileSpreadsheet /> Prepara pro forma di fattura</Button>
            )}
            <Button variant="outline" disabled={!!busy}
              title="Caso raro: il cliente non vuole la fattura. Apre lo Scontrino (registratore) con le righe della sessione"
              onClick={() => { if (confirm("Il cliente non vuole la fattura?\n\nApro lo Scontrino (registratore) con le righe di questa sessione: lì scegli operatore e pagamento.")) router.push(`/cassa?sessione=${sessionId}`); }}>
              <ShoppingCart /> Converti in scontrino</Button>
          </div>
        </>
      )}
      {dialogPf && <ProformaDialog sessionId={sessionId} onChiudi={() => setDialogPf(false)} onCreato={() => { setDialogPf(false); aggiornaTutto(); }} />}
    </Card>
  );
}
