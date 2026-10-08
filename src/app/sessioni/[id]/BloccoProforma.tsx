"use client";

// BLOCCO «PRO FORMA · FATTURA · PAGAMENTO» della sessione — 07/10/2026 (Christian, 2° giro):
// un solo posto con tutto lo stato del documento e dell'incasso, al posto dei riquadri «Pro forma» e «Pagamento»
// delle Azioni e della sezione «Fattura» in fondo alla pagina (tolta).
// - pro forma: numero, data, importo, Vedi, EMAIL, WHATSAPP, Prepara pro forma di fattura, Converti in fattura, Converti in scontrino;
// - fattura (se il pro forma è stato convertito o la fattura è collegata): «Fattura n. X del …», stato SdI, link;
// - pagamento: come e quando (Stripe, bonifico, POS…), residuo se parziale; registrazione manuale (BONIFICO/CONTANTI/POS,
//   INCASSA · ACCONTO con il componente Incassa, link Stripe); pagamenti arrivati e avviso «DA SPEDIRE»;
// - in piccolo la via di riserva «Fattura diretta senza pro forma (o collega una fattura già fatta)».
// Regola invariata: dalla sessione non si emette e non si invia MAI la fattura allo SdI (si fa in Fatturazione).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, Euro, ExternalLink, Eye, FileOutput, FileSpreadsheet, Loader2, Mail, MessageCircle, ShoppingCart, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OPERATORI_TARATURE, useOperatore, type Operatore } from "@/components/Operatore";
import {
  fetchAPI, fattCollegaSessione, fattDaSessione, incSessione, markSessionPaid,
  type ApiError, type DaSpedire, type ProformaSessioneStato, type StatoPagamentoSessione,
} from "@/lib/api";
import { dataIt, testoPagamento } from "./PagamentoStato";
import { IncassoSessione } from "./IncassoSessione";

type Sess = Record<string, any>;  // eslint-disable-line @typescript-eslint/no-explicit-any

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

const STATO_SDI: Record<string, string> = {
  bozza: "bozza (non inviata allo SdI)", inviata: "inviata allo SdI", consegnata: "consegnata dallo SdI", non_consegnata: "non consegnata (in cassetto fiscale)",
  scartata: "SCARTATA dallo SdI", errore: "errore di invio", accettata: "accettata", rifiutata: "rifiutata",
};

function breve(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  } catch { return null; }
}

/** Una riga dello stato: etichetta a sinistra, contenuto a destra. */
function Riga({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
      <dt className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{k}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

interface Props {
  sessionId: string;
  session: Sess;
  pfDoc?: ProformaSessioneStato["documento"];
  statoPag?: StatoPagamentoSessione | null;
  actionLoading: string | null;
  setActionLoading: (v: string | null) => void;
  handleAction: (action: string, fn: () => Promise<unknown>, successMsg: string) => Promise<void>;
  previewLoading: boolean;
  apriAnteprimaProforma: (ch: "email" | "whatsapp") => void;
  apriDialogProforma: () => void;
  onRicarica?: () => void;
  /** avviso «registrazione non completata» prima di prepara/converti */
  controllaRegistrazione?: (azione: string, poi: () => void) => void;
}

export function BloccoProforma({ sessionId, session, pfDoc, statoPag, actionLoading, setActionLoading, handleAction,
  previewLoading, apriAnteprimaProforma, apriDialogProforma, onRicarica, controllaRegistrazione = (_a, poi) => poi() }: Props) {
  const router = useRouter();
  const occupato = actionLoading !== null;
  const pf = pfDoc || null;
  const pfAperto = pf && pf.stato === "aperto" ? pf : null;
  const pfInScontrino = pf?.stato === "convertito" && pf.convertito_in?.tipo === "scontrino";
  const fattura = statoPag?.fattura || null;
  const pag = statoPag?.pagamento || null;
  const isPaid = pag ? pag.pagata : session.payment_status === "pagato";
  const tp = testoPagamento(statoPag || null);
  const spedizione = session.shipping_by_customer
    ? "a carico del cliente (0 €)"
    : session.shipping_included && Number(session.shipping_amount_gross) > 0
      ? `${Number(session.shipping_amount_gross).toFixed(2).replace(".", ",")} €`
      : "nessuna";

  // pagamenti arrivati (banca, Stripe…) e avviso «DA SPEDIRE» — prima stavano nella sezione «Fattura» in fondo
  const [inc, setInc] = useState<{ incassi: { id: string; fonte: string; data: string; importo: number; ordinante: string | null; esito: string | null }[]; da_spedire: DaSpedire | null } | null>(null);
  const caricaInc = useCallback(() => { incSessione(sessionId).then(setInc).catch(() => undefined); }, [sessionId]);
  useEffect(() => { caricaInc(); }, [caricaInc, statoPag]);
  // tornando sulla scheda (es. dopo aver emesso la fattura in Fatturazione) lo stato si aggiorna da solo
  useEffect(() => {
    const agg = () => { if (document.visibilityState === "visible") onRicarica?.(); };
    document.addEventListener("visibilitychange", agg);
    return () => document.removeEventListener("visibilitychange", agg);
  }, [onRicarica]);

  // operatore della pagina sessione (Christian/Dumy), lo stesso scelto accanto a «Genera rapporti»
  const [opDispositivo] = useOperatore();
  const operatore = (OPERATORI_TARATURE as readonly Operatore[]).includes(opDispositivo as Operatore) ? opDispositivo : "";

  // VIA DI RISERVA (ex «Prepara bozza da controllare»): bozza dalla sessione (o dal pro forma se c'è) → Fatturazione;
  // se la fattura è già stata fatta fuori (SimplyFatt) propone di collegarla invece di rifarla.
  const inCorso = useRef(false);
  const [busy, setBusy] = useState(false);
  async function bozza(forza = false) {
    if (!operatore) { toast.error("Scegli chi sta facendo l'operazione (Christian o Dumy) in alto, accanto a «Genera rapporti»"); return; }
    if (inCorso.current && !forza) return;
    inCorso.current = true;
    setBusy(true);
    try {
      const r = await fattDaSessione(sessionId, forza, operatore);
      if (r.gia_presente) toast.info(`Questa sessione ha già la fattura ${r.numero || "(bozza)"}: la apro`);
      else toast.success(pf ? `Bozza preparata dal pro forma ${pf.sigla}: scegli il pagamento ed emettila` : "Bozza preparata: scegli il pagamento ed emettila");
      onRicarica?.();
      router.push(`/fatturazione?id=${r.id}`);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.detail?.fattura) {
        const dop = err.detail.fattura as { id: string; numero: string };
        if (confirm(`${err.message}.\n\nOK = collega la fattura ${dop.numero} a questa sessione (niente doppione)\nAnnulla = scegli se crearne comunque una nuova`)) {
          try {
            await fattCollegaSessione(sessionId, dop.id);
            toast.success(`Fattura ${dop.numero} collegata alla sessione`);
            onRicarica?.();
          } catch (e2) { toast.error((e2 as Error).message); }
        } else if (confirm("Creare comunque una NUOVA bozza di fattura per questa sessione?")) {
          inCorso.current = false;
          return bozza(true);
        }
      } else toast.error(err.message);
    } finally { inCorso.current = false; setBusy(false); }
  }

  const btn = "h-11 whitespace-normal px-1.5 text-[11px] leading-tight";

  // 08/10/2026: con una riga di assistenza ancora a 0 né scontrino né fattura (il preventivo va scritto o la riga tolta)
  async function assistenzaOk(poi: () => void) {
    try {
      const r = await fetchAPI(`/api/sessions/${sessionId}/assistenze`, { cache: "no-store" }) as { senza_importo?: number };
      if (r.senza_importo) {
        toast.error("Riga di assistenza senza importo: inserisci il preventivo o toglila", { duration: 7000 });
        document.getElementById("assistenza")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
    } catch { /* se il controllo non risponde decide il backend */ }
    poi();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-orange-200 bg-orange-50/30 p-2.5 sm:p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-800">Pro forma · fattura · pagamento</p>

      {/* STATO in un unico posto */}
      <dl className="space-y-1 rounded-md border border-gray-200 bg-white p-2">
        <Riga k="Pro forma">
          {pf ? (
            <>
              <b>{pf.sigla}</b> del {dataIt(pf.data)} · <b>{eur(pf.totale)}</b>
              {pf.stato === "convertito" ? <span className="text-gray-600"> · convertito{pf.convertito_in?.tipo === "scontrino" ? " in scontrino" : " in fattura"}</span>
                : pf.stato === "aperto" ? <span className="text-gray-600"> · aperto</span> : <span className="text-gray-600"> · {pf.stato}</span>}
            </>
          ) : statoPag?.proforma ? (
            <span className="text-gray-700">vecchio pro forma {statoPag.proforma.proforma_number} · {eur(statoPag.proforma.total)}</span>
          ) : <span className="text-gray-400">non ancora preparato</span>}
        </Riga>
        <Riga k="Fattura">
          {fattura ? (
            <span className="flex flex-wrap items-center gap-x-2">
              <span>Fattura <b>{fattura.numero || "bozza"}</b>{fattura.numero ? ` del ${dataIt(fattura.data)}` : ""} · <b>{eur(fattura.totale)}</b></span>
              <span className={["scartata", "errore"].includes(fattura.stato) ? "font-semibold text-red-600" : "text-gray-600"}>· SdI: {STATO_SDI[fattura.stato] || fattura.stato}</span>
              {fattura.origine === "simplyfatt" && <span className="text-xs text-gray-500">· da SimplyFatt</span>}
              <a href={`/fatturazione?id=${fattura.id}`} className="inline-flex items-center gap-0.5 text-blue-700 underline underline-offset-2">
                <ExternalLink className="size-3.5" />{fattura.stato === "bozza" ? "apri la bozza" : "apri"}</a>
            </span>
          ) : pfInScontrino ? (
            <span className="text-gray-700">nessuna: chiusa con lo scontrino al registratore</span>
          ) : <span className="text-gray-400">non ancora fatta{pfAperto ? " — «Converti in fattura» dal pro forma" : ""}</span>}
          {!!fattura?.numero_altre && <span className="block text-xs text-amber-700">Ci sono altre {fattura.numero_altre} fatture collegate: vale l&apos;ultima emessa.</span>}
        </Riga>
        <Riga k="Pagamento">
          {tp ? <span className={`inline-block rounded border px-1.5 py-0.5 text-[12px] font-medium leading-snug ${tp.colore}`}>{tp.lungo}</span> : <span className="text-gray-400">—</span>}
          {!!inc?.incassi.length && (
            <span className="mt-1 block space-y-0.5 text-xs text-gray-600">
              {inc.incassi.map((x) => (
                <span key={x.id} className="flex items-center gap-1"><Banknote className="size-3.5 shrink-0" />
                  Arrivato: {x.fonte === "banca" ? "bonifico" : x.fonte} {eur(x.importo)} del {new Date(x.data).toLocaleDateString("it-IT")}
                  {x.ordinante ? ` da ${x.ordinante}` : ""}{x.esito ? ` — ${x.esito}` : ""}</span>
              ))}
            </span>
          )}
        </Riga>
        <Riga k="Spedizione">
          {spedizione} ·{" "}
          <button type="button" className="text-xs underline" onClick={() => document.getElementById("spedizioni")?.scrollIntoView({ behavior: "smooth" })}>modifica</button>
        </Riga>
      </dl>

      {inc?.da_spedire && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
          <Truck className="size-4" /> <b>Pagata: DA SPEDIRE</b> <span className="text-muted-foreground">({inc.da_spedire.motivo})</span>
          <Button size="sm" variant="outline" className="ml-auto"
            onClick={() => document.getElementById("spedizioni")?.scrollIntoView({ behavior: "smooth" })}><Truck /> Vai alla spedizione</Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {/* DOCUMENTO: invio + Vedi + Prepara / Converti */}
        <div className="flex flex-col gap-1.5 rounded-md border border-gray-200 bg-white p-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Documento</p>
          <div className="grid grid-cols-3 gap-1.5">
            {([["email", "EMAIL", Mail, "bg-orange-600 hover:bg-orange-700", session.proforma_email_at, "proforma_email"],
              ["whatsapp", "WHATSAPP", MessageCircle, "bg-orange-700 hover:bg-orange-800", session.proforma_whatsapp_at, "proforma_wa"]] as const).map(([ch, label, Icona, cls, ts, key]) => (
              <div key={ch}>
                <Button className={`h-11 w-full px-1 text-[11px] font-bold text-white ${cls}`} disabled={occupato || previewLoading}
                  title={`Invia il pro forma al cliente via ${label.toLowerCase()} (prima vedi l'anteprima)`}
                  onClick={() => apriAnteprimaProforma(ch)}>
                  {actionLoading === key ? <Loader2 className="size-4 animate-spin" /> : <Icona className="size-4" />} {label}
                </Button>
                <p className={`mt-0.5 text-center text-[10px] leading-none ${ts ? "text-gray-600" : "text-gray-300"}`}>{ts ? `✓ ${breve(ts)}` : "—"}</p>
              </div>
            ))}
            <div>
              <Button variant="outline" className={`w-full ${btn}`} disabled={!pf} onClick={apriDialogProforma}
                title={pf ? `Vedi il pro forma ${pf.sigla}` : "Si attiva quando il pro forma è stato preparato"}>
                <Eye className="size-4 shrink-0" /> Vedi
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Button variant="outline" disabled={occupato || !!pf || !!fattura} onClick={() => controllaRegistrazione("preparare il pro forma di fattura", apriDialogProforma)}
              className={`${btn} border-orange-300 text-orange-800 hover:bg-orange-50`}
              title={pf ? `Il pro forma ${pf.sigla} c'è già` : fattura ? "La sessione ha già la fattura" : "Anteprima del pro forma con le righe della fattura; si crea solo se confermi"}>
              <FileSpreadsheet className="size-4 shrink-0" /> {pf ? "Pro forma pronto" : "Prepara pro forma di fattura"}
            </Button>
            <Button disabled={!pfAperto || !!fattura} onClick={() => pfAperto && controllaRegistrazione("convertire il pro forma in fattura", () => assistenzaOk(() => router.push(`/proforma?id=${pfAperto.id}`)))}
              className={`${btn} bg-emerald-600 font-semibold text-white hover:bg-emerald-700`}
              title={fattura ? "La fattura c'è già" : pfAperto ? `Apre il pro forma ${pfAperto.sigla}: lì «Converti in fattura»` : "Prima prepara il pro forma"}>
              <FileOutput className="size-4 shrink-0" /> Converti in fattura
            </Button>
            <Button variant="outline" disabled={occupato || !!fattura || pf?.stato === "convertito"} className={btn}
              title={fattura ? "La sessione ha già la fattura" : "Caso raro: il cliente non vuole la fattura. Apre lo Scontrino (registratore) con le righe della sessione"}
              onClick={() => controllaRegistrazione("convertire in scontrino", () => assistenzaOk(() => { if (confirm("Il cliente non vuole la fattura?\n\nApro lo Scontrino (registratore) con le righe di questa sessione: lì scegli operatore e pagamento.")) router.push(`/cassa?sessione=${sessionId}`); }))}>
              <ShoppingCart className="size-4 shrink-0" /> Converti in scontrino
            </Button>
          </div>
          {!fattura && !pfInScontrino && (
            <button type="button" className="self-start text-[11px] text-gray-500 underline underline-offset-2 disabled:opacity-50" disabled={busy}
              title={operatore ? "Crea la bozza di fattura direttamente dalla sessione e apre Fatturazione" : "Scegli prima chi sta facendo l'operazione (in alto, accanto a «Genera rapporti»)"}
              onClick={() => controllaRegistrazione("preparare la fattura diretta", () => bozza())}>
              {busy ? "Preparo la bozza…" : "Fattura diretta senza pro forma (o collega una fattura già fatta)"}
            </button>
          )}
        </div>

        {/* PAGAMENTO a mano: quando i soldi sono già arrivati (ex riquadro «Pagamento» delle Azioni) */}
        <div className="flex flex-col gap-1.5 rounded-md border border-gray-200 bg-white p-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Registra il pagamento a mano</p>
          {isPaid && fattura ? (
            <a href={`/fatturazione?id=${fattura.id}`}
              className="flex h-11 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-2 text-center text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100">
              ✓ Incassata su fattura {fattura.numero || "bozza"} — per cambiare il metodo vai in Fatturazione
            </a>
          ) : (
            <>
              <p className="text-[10px] leading-tight text-gray-500">{isPaid ? "Per cambiare il metodo:" : <>Premi solo quando i soldi sono <b>già arrivati</b>{fattura ? <> — si registra sulla fattura {fattura.numero || "(bozza)"}</> : null}:</>}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([["bonifico", "BONIFICO"], ["contanti", "CONTANTI"], ["pos", "POS"]] as const).map(([method, label]) => {
                  const isActive = isPaid && session.payment_method === method;
                  const key = `mark_paid_${method}`;
                  return (
                    <Button key={method} disabled={occupato || isActive}
                      className={`h-11 px-1 text-[11px] font-bold text-white ${isActive ? "bg-emerald-700 ring-2 ring-emerald-900 ring-offset-1" : isPaid ? "bg-emerald-400 opacity-70 hover:bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-700"}`}
                      title={isActive ? `Incassato con ${label} (attuale)` : isPaid ? `Modificare il metodo a ${label}` : `Incassato con ${label}: il pagamento è già arrivato`}
                      onClick={() => {
                        const msg = isPaid
                          ? `Modificare il metodo di pagamento da "${session.payment_method?.toUpperCase() || "—"}" a "${label}"?`
                          : `Il pagamento con ${label} è GIÀ ARRIVATO?\n\nSe il cliente pagherà più avanti (anche a bonifico) NON confermare: la modalità e la scadenza stanno nella fattura.`
                            + (fattura ? `\n\nOK = segno incassata la fattura ${fattura.numero || "(bozza)"} e la sessione si allinea.` : "");
                        if (!confirm(msg)) return;
                        handleAction(key, () => markSessionPaid(sessionId, { payment_method: method }), isPaid ? `Metodo aggiornato a ${label}!` : `Incasso registrato (${label})!`);
                      }}>
                      {actionLoading === key ? <Loader2 className="size-4 animate-spin" /> : <Euro className="size-3.5" />}
                      {isActive ? `✓ ${label}` : label}
                    </Button>
                  );
                })}
              </div>
            </>
          )}
          {/* pagamento in più volte / misto / acconto e saldo / altri metodi (componente Incassa) */}
          <IncassoSessione sessionId={sessionId} st={statoPag || null} disabled={occupato} onFatto={() => onRicarica?.()} />
          {!isPaid && (
            <button type="button" className="flex h-10 w-full items-center justify-center rounded-md border border-purple-300 px-2 text-[11px] text-purple-700 hover:bg-purple-50 disabled:opacity-50" disabled={occupato}
              title="Genera link Stripe Checkout — il cliente paga in 1 clic con la carta"
              onClick={async () => {
                if (!confirm("Generare un link Stripe Checkout? Il cliente potrà pagare con carta in 1 click. Riceverai notifica Telegram al pagamento.")) return;
                setActionLoading("stripe_link");
                try {
                  const r = await fetch(`/api/backend/api/sessions/${sessionId}/checkout-link`, { method: "POST" });
                  if (!r.ok) throw new Error(`Backend ${r.status}`);
                  const data = await r.json();
                  if (data.url) {
                    try { await navigator.clipboard.writeText(data.url); } catch { /* noop */ }
                    window.open(data.url, "_blank");
                    toast.success("Link Stripe generato e copiato", { description: `EUR ${data.amount_eur?.toFixed(2)} — condividilo via WhatsApp/email`, duration: 10000 });
                  } else toast.error("Errore: nessun URL ricevuto");
                } catch (e: unknown) {
                  toast.error(`Errore generazione link: ${(e as Error).message}`);
                } finally { setActionLoading(null); }
              }}>
              {actionLoading === "stripe_link" ? "Genero il link Stripe…" : "💳 Link Stripe (paga online con carta)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
