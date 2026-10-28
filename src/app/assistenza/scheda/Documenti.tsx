"use client";

// DOCUMENTI E SPEDIZIONI della scheda (05/10/2026, specifica §6b e §8.10-8.11): scontrino, acconto, fattura (bozza),
// pro forma (per la spedizione con bonifico) — come Tarature e la cassa. L'«ordine al cliente» non serve più qui.
// Corriere: «Spedisco io» (etichetta UPS o DHL) · etichetta per farci arrivare il dispositivo · corriere del cliente.
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, FileText, Receipt, Send, ShoppingCart, Trash2, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { fattElimina } from "@/lib/api";
import { assAzione, eur, type FatturaCollegata, type Scheda } from "@/lib/assistenza";
import { Pill, Sezione } from "./ui";

export function Documenti({ s, ro, busy, onScontrino, onAcconto, onRichiediAcconto, onPagamentoAnticipato, onVendi, onPagato, onCorriere, onFatturaEliminata }: {
  s: Scheda; ro: boolean; busy: boolean; onScontrino: () => void; onAcconto: () => void; onRichiediAcconto: () => void;
  onPagamentoAnticipato?: (documento: "proforma" | "fattura") => void;
  onVendi: (t: "fattura" | "proforma") => void; onPagato: () => void; onCorriere: () => void;
  /** 26/10/2026 (63197): la bozza di fattura (mai numerata) si elimina dalla scheda */
  onFatturaEliminata?: () => void;
}) {
  // 14/10/2026: ultima richiesta d'acconto mandata al cliente (mail + WhatsApp)
  const rich = (s.fasi as Record<string, { il?: string; importo?: number } | undefined> | undefined)?.richiesta_acconto;
  const c = s.collegamenti || {};
  return (
    <Sezione titolo="Documenti, pagamento e spedizioni" icona={<Wallet />}
      sottotitolo={s.pagata ? <Pill tono="verde"><CheckCircle2 className="size-3" />pagata</Pill> : s.saldo > 0 ? <Pill tono="ambra">saldo {eur(s.saldo)}</Pill> : null}>
      <div className="space-y-3">
        {!ro && (
          <div className="grid grid-cols-2 gap-1.5 [&_button]:h-auto [&_button]:min-h-9 [&_button]:whitespace-normal [&_button]:py-1.5 [&_button]:text-left">
            <Button variant="outline" onClick={onScontrino} title="Apre la cassa con le righe della scheda"><ShoppingCart />Scontrino</Button>
            <Button variant="outline" onClick={onAcconto} title="Scontrino d'acconto: al saldo si scala da solo"><Receipt />Acconto</Button>
            <Button variant="outline" disabled={busy} onClick={onRichiediAcconto} title="Chiede al cliente un acconto (importo a scelta) per mail e WhatsApp, con IBAN, causale e preventivo allegato"><Send />Richiedi acconto</Button>
            <Button variant="outline" disabled={!!s.fattura_id || busy} onClick={() => onVendi("fattura")} title="Fattura in bozza con le righe della scheda (nulla va allo SdI finché non la emetti)"><FileText />Fattura</Button>
            <Button variant="outline" disabled={!!s.documento_id || busy} onClick={() => onVendi("proforma")} title="Pro forma per il pagamento con bonifico (poi «Converti in fattura»)"><FileText />Pro forma</Button>
            <Button variant={s.stato === "pronto" && !s.pagata ? "default" : "outline"} disabled={busy || s.pagata} onClick={onPagato} title="Pagamento arrivato (bonifico, PayPal, contanti, POS)"><CheckCircle2 />Pagato</Button>
            <Button variant="outline" onClick={onCorriere}><Truck />Corriere</Button>
          </div>
        )}
        {!ro && !s.pagata && s.saldo > 0 && <VerificaPagamento s={s} />}
        {/* 27/10/2026 (Christian, Tecnoservice 63163): il cliente paga SUBITO, in qualsiasi stato, per far partire il dispositivo
            appena pronto. Riquadro a parte (nella griglia i pulsanti si sovrapponevano e non si leggevano) */}
        {/* solo PRIMA della fine lavorazione: dopo il pronto si manda il consuntivo (passo «Da pagare») */}
        {!ro && onPagamentoAnticipato && !s.pagata && s.saldo > 0 && !["pronto", "consegnato"].includes(s.stato) && s.riparazione_stato !== "finita" && (
          <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3 dark:bg-emerald-950/30">
            <div className="text-sm font-semibold">💶 Il cliente vuole pagare subito? Pagamento anticipato di {eur(s.saldo)}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">Parte una mail con il documento allegato, IBAN e causale, e un WhatsApp. La scheda non cambia stato.</p>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <Button className="h-auto min-h-10 w-full whitespace-normal bg-emerald-700 py-2 text-white hover:bg-emerald-800" disabled={busy} onClick={() => onPagamentoAnticipato("proforma")}
                title="Crea il pro forma (se non c'è) e lo manda al cliente"><Send />Con PRO FORMA</Button>
              <Button className="h-auto min-h-10 w-full whitespace-normal bg-emerald-700 py-2 text-white hover:bg-emerald-800" disabled={busy} onClick={() => onPagamentoAnticipato("fattura")}
                title="Crea la fattura, la invia allo SdI da incassare e la manda al cliente"><Send />Con FATTURA (da incassare)</Button>
            </div>
          </div>
        )}
        {(() => {
          const pa = (s.fasi as Record<string, { il?: string; importo?: number; documento?: string } | undefined> | undefined)?.pagamento_anticipato;
          return pa?.il && !s.pagata ? (
            <div className="rounded-lg border border-emerald-300 bg-white p-2 text-sm dark:bg-background">
              <b>Pagamento anticipato richiesto</b> il {new Date(pa.il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {pa.importo ? ` · ${eur(pa.importo)}` : ""} · con {pa.documento === "fattura" ? "fattura (da incassare)" : "pro forma"} · in attesa del bonifico
            </div>
          ) : null;
        })()}
        {/* 24/10/2026: quando e come è stata pagata, da quale documento */}
        {c.pagamento ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
            <b>Pagata</b>{c.pagamento.il ? ` il ${dataIt(c.pagamento.il)}` : ""}{c.pagamento.modo ? ` · ${c.pagamento.modo}` : ""}
            <span className="text-muted-foreground"> · da {c.pagamento.fonte}</span>
            {c.pagamento.rimborso && <div className="mt-1 text-red-700"><b>Rimborsata {eur(c.pagamento.rimborso.importo)}</b> con nota di credito n. {c.pagamento.rimborso.note_credito}</div>}
          </div>
        ) : s.saldo > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
            <b>Da pagare {eur(s.saldo)}</b> <span className="text-muted-foreground">· nessuno scontrino, fattura pagata o bonifico collegato</span>
          </div>
        ) : null}
        <div className="space-y-1 text-sm">
          {c.scontrino && <div className="flex flex-wrap items-center gap-2"><Receipt className="size-4 text-muted-foreground" />Scontrino {c.scontrino.numero_rt || ""} {eur(c.scontrino.totale)}
            {c.scontrino.data_rt ? <span className="text-muted-foreground">del {dataIt(c.scontrino.data_rt)}</span> : null}
            {(c.scontrino.pagamenti || []).map((p, i) => <span key={i} className="text-muted-foreground">· {p.modalita} {eur(p.importo)}</span>)}
            <Pill>{c.scontrino.stato}</Pill></div>}
          {c.fattura && <RigaFattura f={c.fattura} onEliminata={ro ? undefined : onFatturaEliminata} />}
          {(c.altre_fatture || []).map((f) => <RigaFattura key={f.id} f={f} altra />)}
          {(c.bonifici || []).map((b) => <div key={b.id} className="flex flex-wrap items-center gap-2"><Wallet className="size-4 text-muted-foreground" />Bonifico {eur(b.importo)}
            <span className="text-muted-foreground">del {dataIt(b.data)} da {b.ordinante || "—"}</span> <Pill>{b.stato}</Pill></div>)}
          {c.documento && <div className="flex items-center gap-2"><FileText className="size-4 text-muted-foreground" />
            <Link className="underline" href={c.documento.sigla.startsWith("PF") ? `/proforma?id=${c.documento.id}` : `/ordini?id=${c.documento.id}`}>{c.documento.sigla}</Link> {eur(c.documento.totale)} <Pill>{c.documento.stato}</Pill></div>}
          {Number(s.acconto || 0) > 0 && <div className="text-muted-foreground">Acconto versato {eur(s.acconto)}</div>}
          {rich?.importo ? <div className="text-muted-foreground">Acconto richiesto {eur(rich.importo)}{rich.il ? ` il ${new Date(rich.il).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : ""}{Number(s.acconto || 0) >= Number(rich.importo) ? " · versato" : " · in attesa"}</div> : null}
          {!c.scontrino && !c.fattura && !c.documento && !s.spedizioni.length && <div className="text-xs text-muted-foreground">Nessun documento ancora. Prezzi della scheda IVA compresa.</div>}
        </div>
        {s.spedizioni.length > 0 && (
          <div className="space-y-1 rounded-lg border p-2 text-xs">
            {s.spedizioni.map((x) => <RigaSpedizione key={x.id} s={s} x={x} ro={ro} />)}
          </div>
        )}
      </div>
    </Sezione>
  );
}

const dataIt = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });

function RigaFattura({ f, altra, onEliminata }: { f: FatturaCollegata; altra?: boolean; onEliminata?: () => void }) {
  const nc = f.tipo_documento === "TD04";
  const [via, setVia] = useState(false);
  async function elimina() {
    if (!confirm(`Eliminare la bozza di fattura da ${eur(f.totale)}? Non è mai stata numerata né inviata allo SdI.`)) return;
    setVia(true);
    try { await fattElimina(f.id); toast.success("Bozza di fattura eliminata"); onEliminata?.(); } catch (e) { toastErrore(e); } finally { setVia(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2"><FileText className="size-4 text-muted-foreground" />
      {nc ? "Nota di credito" : altra ? "Altra fattura" : "Fattura"} <Link className="underline" href={`/fatturazione?id=${f.id}`}>{f.numero || "bozza"}</Link> {eur(f.totale)}
      {f.data ? <span className="text-muted-foreground">del {dataIt(f.data)}</span> : null}
      {f.pagamento_stato === "pagata" ? <Pill tono="verde">pagata{f.pagato_il ? ` il ${dataIt(f.pagato_il)}` : ""}{f.pagamento_modalita ? ` · ${f.pagamento_modalita}` : ""}</Pill>
        : f.pagamento_stato ? <Pill tono="ambra">{f.pagamento_stato}</Pill> : null}
      <Pill>{f.stato}</Pill>
      {onEliminata && f.stato === "bozza" && !f.numero && (
        <Button size="xs" variant="ghost" className="text-red-700" disabled={via} onClick={elimina}><Trash2 />Elimina bozza</Button>)}
    </div>
  );
}

type Spedizione = Scheda["spedizioni"][number];

function RigaSpedizione({ s, x, ro }: { s: Scheda; x: Spedizione; ro: boolean }) {
  const [busy, setBusy] = useState(false);
  const [annullata, setAnnullata] = useState(x.status === "annullata");
  const cor = x.carrier || "UPS";
  async function annulla() {
    if (!confirm(`Annullare la spedizione ${cor} ${x.tracking}${x.pickup_prn ? ` e il ritiro ${x.pickup_prn}` : ""}${x.test_mode ? " (prova)" : ""}?`)) return;
    setBusy(true);
    try {
      const r = await assAzione(s.id, `spedizioni/${x.id}/annulla`, {});
      toast.success(`${cor}: ritiro ${r.pickup ?? "—"} · etichetta ${r.void ?? "—"}`);
      setAnnullata(true);
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  return (
    <div className={annullata ? "text-muted-foreground line-through" : ""}>
      <b>{cor}</b> {x.direction === "ritiro" ? "verso di noi (etichetta al cliente)" : "spedizione al cliente"}{x.test_mode ? " (prova)" : ""}:{" "}
      {x.tracking_url ? <a className="underline" href={x.tracking_url} target="_blank" rel="noreferrer">{x.tracking}</a> : x.tracking}
      {x.pickup_prn ? ` · ritiro ${x.pickup_prn}${x.pickup_date ? ` il ${x.pickup_date.split("-").reverse().join("/")}` : ""}${x.pickup_location === "lab" ? " da noi" : ""}` : ""}
      {x.pickup_error ? <span className="text-red-700"> · ERRORE ritiro: {x.pickup_error}</span> : null}
      {/* 28/10/2026 (Christian, 63019): una spedizione annullata non deve sembrare vera (prima era solo barrata) */}
      {annullata && <span className="ml-1 rounded bg-red-100 px-1 text-xs font-semibold text-red-800 no-underline dark:bg-red-950/40 dark:text-red-200" style={{ textDecoration: "none", display: "inline-block" }}>ANNULLATA · non è partita (etichetta mai usata)</span>}
      {" · "}<a className="underline" href={`/api/backend/api/shipments/${x.id}/label-pdf`} target="_blank" rel="noreferrer">etichetta</a>
      {!annullata && !ro && <>{" · "}<button className="text-red-700 underline disabled:opacity-50" disabled={busy} onClick={annulla}>annulla</button></>}
    </div>
  );
}


type Trovato = { id: string; fonte: string; codice: string; data: string; importo: number; ordinante: string | null; causale: string | null;
  stato: string; perche: string[]; commissione: number | null };
type EsitoVerifica = { saldo: number; paypal_con_3: number; trovati: Trovato[];
  paypal?: { codice: string; data: string; importo: number; commissione: number; netto: number; amici_familiari: boolean; stato_paypal: string } };

/** 28/10/2026 (Christian, 63188 Medianet): «il cliente dice che ha pagato» → si verifica dalla scheda. Col codice transazione
 *  PayPal (mail «Hai ricevuto denaro» o ricevuta del cliente) il controllo è IN DIRETTA; senza, si rileggono subito PayPal,
 *  POS e conto (l'elenco PayPal arriva con ~3 ore di ritardo). */
function VerificaPagamento({ s }: { s: Scheda }) {
  const [codice, setCodice] = useState("");
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState<EsitoVerifica | null>(null);
  async function vai() {
    setBusy(true);
    try { setE(await assAzione(s.id, "verifica-pagamento", codice.trim() ? { codice: codice.trim() } : {}) as EsitoVerifica); }
    catch (err) { toastErrore(err); } finally { setBusy(false); }
  }
  const pp = e?.paypal;
  return (
    <div className="rounded-lg border p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">🔎 Il cliente dice che ha pagato?</span>
        <input className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" placeholder="codice transazione PayPal (facoltativo)"
          value={codice} onChange={(x) => setCodice(x.target.value)} />
        <Button size="sm" variant="outline" disabled={busy} onClick={vai}>{busy ? "Verifico…" : "Verifica pagamento"}</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Con il codice transazione PayPal la verifica è immediata. Senza codice si rileggono adesso PayPal, POS e conto: i pagamenti PayPal compaiono con circa 3 ore di ritardo.</p>
      {pp && (
        <div className={`mt-2 rounded-md p-2 ${pp.stato_paypal === "COMPLETED" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-amber-50 dark:bg-amber-950/30"}`}>
          <b>PayPal {pp.stato_paypal === "COMPLETED" ? "✓ ARRIVATO" : pp.stato_paypal}</b> · {eur(pp.importo)} il {new Date(pp.data).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          <br />Commissione {eur(pp.commissione)} · netto {eur(pp.netto)} · {pp.amici_familiari ? "inviato come «Amici e familiari» (nessuna commissione)" : "pagamento per beni e servizi"}
          <br /><span className="text-xs">Dovuto {eur(e!.saldo)} (con PayPal +3%: {eur(e!.paypal_con_3)}){Math.abs(pp.importo - e!.saldo) > 0.01 && Math.abs(pp.importo - e!.paypal_con_3) > 0.01 ? ` · differenza ${eur(pp.importo - e!.saldo)} sul dovuto` : ""}</span>
        </div>
      )}
      {e && (e.trovati.length ? (
        <ul className="mt-2 space-y-1">
          {e.trovati.map((x) => (
            <li key={x.id} className="rounded-md border px-2 py-1 text-xs">
              <b>{x.fonte.toUpperCase()} {eur(x.importo)}</b> · {new Date(x.data).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {x.ordinante ? ` · ${x.ordinante}` : ""}{x.causale ? ` · «${x.causale}»` : ""} <span className="text-muted-foreground">({x.perche.join(", ")})</span>
            </li>))}
          <li className="text-xs text-muted-foreground">Se è quello giusto: «Pagato» qui sopra (PayPal, con il codice transazione come riferimento).</li>
        </ul>
      ) : <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">Nessun pagamento trovato negli ultimi 30 giorni. Se è PayPal fatto da poco, chiedi il codice transazione o riprova più tardi.</p>)}
    </div>
  );
}
