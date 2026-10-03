"use client";

// INCASSA — un solo componente per tutti i pagamenti al banco (03/10/2026): cassa, fattura, pro forma, ordine, sessione,
// scheda. Pagamenti MISTI (50 contanti + 100 carta), PARZIALI e ACCONTI, con il residuo in tempo reale.
// Due modi:
// - «scontrino»: le righe di pagamento si raccolgono e poi parte UN solo scontrino con tutti i metodi (il registratore li
//   batte uno dopo l'altro; il resto si dà sui contanti). Se l'ultimo pagamento è il POS verificato e copre il totale,
//   lo scontrino parte da solo (come prima).
// - «documento»: ogni pagamento si registra subito sul documento (fattura, sessione…): pagamenti in momenti diversi e con
//   metodi diversi; la fattura diventa «parziale» finché non è tutto pagato.
// POS e PayPal passano SEMPRE dalla verifica SumUp/PayPal (PagaPos); il bonifico si sceglie dal conto o si dichiara
// (VerificaBonifico). Pulsanti grandi (≥ 44 px) per iPad e iPhone.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Banknote, CircleSlash, Link2, Loader2, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PagaPos } from "@/components/PagaPos";
import { VerificaBonifico, abbinaBonifico, type InfoBonifico } from "@/components/VerificaBonifico";
import { parseDec } from "@/components/DecInput";
import { toastErrore } from "@/lib/errori";
import type { IncassoPos, PagamentoScontrino } from "@/lib/api";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
export const NOMI_MODALITA: Record<string, string> = {
  contanti: "Contanti", pos_sumup: "Carta (POS)", carta_stripe: "Carta online (Stripe)", paypal: "PayPal", bonifico: "Bonifico",
  non_riscosso: "Non riscosso",
};

export type RigaIncasso = PagamentoScontrino & { chiave: string; bonifico?: InfoBonifico; etichetta?: string };
export type EsitoIncasso = { id?: string | null; descrizione?: string } | null | void;

export function Incassa({ totale, giaPagato = 0, modo, descrizione = "", testoCliente = "", documentoTipo = "documento",
  nonRiscosso = false, stripeLink, disabled = false, motivo = "", titolo, etichettaEmetti = "Emetti scontrino",
  onEmetti, onPagamento, onFatto, className = "", unMetodo = false }: {
  /** solo scontrino: un solo metodo che paga tutto (pagamento misto non ancora attivo sul registratore) */
  unMetodo?: boolean;
  /** totale del documento (IVA inclusa) */
  totale: number;
  /** già incassato prima (acconti): il residuo è totale − giaPagato */
  giaPagato?: number;
  modo: "scontrino" | "documento";
  descrizione?: string;
  /** nome del cliente: aiuta a trovare il bonifico */
  testoCliente?: string;
  /** scontrino · fattura · ordine: dove si abbina il bonifico */
  documentoTipo?: string;
  /** solo scontrino: quota «non riscossa» (il cliente paga dopo) */
  nonRiscosso?: boolean;
  /** solo documento: link di pagamento con carta (Stripe) per l'importo scelto; restituisce l'URL */
  stripeLink?: (importo: number) => Promise<string | undefined>;
  disabled?: boolean;
  /** perché è bloccato (es. «scegli l'operatore») */
  motivo?: string;
  titolo?: string;
  etichettaEmetti?: string;
  /** modo «scontrino»: emette il documento con tutti i pagamenti; restituisce l'id (per abbinare il bonifico) o null */
  onEmetti?: (pagamenti: PagamentoScontrino[]) => Promise<EsitoIncasso>;
  /** modo «documento»: registra UN pagamento; restituisce l'id del documento (per il bonifico) o null */
  onPagamento?: (p: PagamentoScontrino & { data?: string }) => Promise<EsitoIncasso>;
  /** dopo l'emissione / la registrazione */
  onFatto?: () => void;
  className?: string;
}) {
  const [righe, setRighe] = useState<RigaIncasso[]>([]);
  const [importoTxt, setImportoTxt] = useState("");
  const [consegnatoTxt, setConsegnatoTxt] = useState("");
  const [busy, setBusy] = useState("");
  const residuoDoc = r2(Math.max(0, totale - giaPagato));
  const nelleRighe = r2(righe.reduce((s, r) => s + r.importo, 0));
  const residuo = r2(Math.max(0, residuoDoc - nelleRighe));
  // importo del prossimo pagamento: quello scritto, altrimenti tutto il residuo
  const scritto = unMetodo && modo === "scontrino" ? null : parseDec(importoTxt);
  const importo = scritto !== null && !Number.isNaN(scritto) && scritto > 0 ? r2(scritto) : residuo;
  const consegnato = parseDec(consegnatoTxt);
  const resto = consegnato !== null && !Number.isNaN(consegnato) && consegnato > importo ? r2(consegnato - importo) : 0;
  const oltre = importo > residuo + 0.005;
  const blocca = disabled || !!busy || !(importo > 0) || oltre;
  const coperto = residuo <= 0.005 && righe.length > 0;

  // il residuo cambia (nuova riga, nuovo totale): l'importo scritto si azzera se non sta più nel residuo
  useEffect(() => { if (scritto !== null && scritto > residuo + 0.005) setImportoTxt(""); }, [residuo]); // eslint-disable-line react-hooks/exhaustive-deps
  const chiave = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // --- modo scontrino: righe e un solo documento -------------------------------------------------------------------
  const emettiRef = useRef<(lista: RigaIncasso[]) => Promise<void>>(async () => undefined);
  emettiRef.current = async (lista: RigaIncasso[]) => {
    if (!onEmetti || busy) return;
    setBusy("emetti");
    try {
      const pag: PagamentoScontrino[] = lista.map(({ chiave: _c, bonifico: _b, etichetta: _e, ...p }) => p); // eslint-disable-line @typescript-eslint/no-unused-vars
      const doc = await onEmetti(pag);
      if (doc === null) return;   // non emesso: le righe restano (si può correggere e riprovare)
      for (const r of lista.filter((x) => x.bonifico)) {
        await abbinaBonifico(r.bonifico!, { importo: r.importo, documentoTipo, documentoId: doc?.id, descrizione: doc?.descrizione || descrizione });
      }
      setRighe([]); setImportoTxt(""); setConsegnatoTxt("");
      onFatto?.();
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  };

  function aggiungi(r: Omit<RigaIncasso, "chiave">, emettiSeCoperto = false) {
    const nuova = [...righe, { ...r, chiave: chiave() }];
    setRighe(nuova); setImportoTxt(""); setConsegnatoTxt("");
    const copre = r2(residuoDoc - nuova.reduce((s, x) => s + x.importo, 0)) <= 0.005;
    if (emettiSeCoperto && copre) void emettiRef.current(nuova);
    else if (copre) toast.success("Totale coperto: controlla e premi «" + etichettaEmetti + "»");
  }

  // --- modo documento: ogni pagamento si registra subito -------------------------------------------------------------
  async function registra(p: PagamentoScontrino & { data?: string }, bonifico?: InfoBonifico): Promise<EsitoIncasso> {
    if (!onPagamento) return null;
    setBusy(p.modalita);
    try {
      const doc = await onPagamento(p);
      if (doc === null) return null;
      if (bonifico) await abbinaBonifico(bonifico, { importo: p.importo, documentoTipo, documentoId: doc?.id, descrizione: doc?.descrizione || descrizione });
      setImportoTxt(""); setConsegnatoTxt("");
      toast.success(`Registrato: ${NOMI_MODALITA[p.modalita] || p.modalita} ${eur(p.importo)}`);
      onFatto?.();
      return doc || { id: null };
    } catch (e) { toastErrore(e); return null; } finally { setBusy(""); }
  }

  function contanti() {
    if (blocca) return;
    const riga: PagamentoScontrino = { modalita: "contanti", importo, ...(resto > 0 ? { consegnato: r2(consegnato!) } : {}) };
    if (modo === "scontrino") aggiungi({ ...riga, etichetta: resto > 0 ? `dati ${eur(consegnato!)}, resto ${eur(resto)}` : undefined }, unMetodo);
    else void registra(riga);
  }
  function nonRisc() {
    if (blocca) return;
    if (!confirm(`${eur(importo)} NON RISCOSSI: il cliente paga dopo (si recupera con «Incassa credito»). Continuare?`)) return;
    aggiungi({ modalita: "non_riscosso", importo }, unMetodo);
  }
  async function pos(p: IncassoPos) {
    const modalita = p.metodo === "paypal" ? "paypal" : "pos_sumup";
    const imp = r2(Number(p.importo) || importo);
    const riga: PagamentoScontrino = { modalita, importo: imp, pos_incasso_id: p.id, transaction_code: p.transaction_code || undefined };
    if (modo === "scontrino") aggiungi({ ...riga, etichetta: p.transaction_code ? `SumUp ${p.transaction_code}` : "verificato" }, true);
    else await registra(riga);
  }

  const stile = "h-11 min-w-[44px] text-base";
  const titoloRes = modo === "scontrino" ? (coperto ? "Totale coperto" : "Manca") : "Resta da incassare";
  const elenco = useMemo(() => righe.map((r) => (
    <div key={r.chiave} className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-sm">
      <span><b>{NOMI_MODALITA[r.modalita] || r.modalita}</b> {eur(r.importo)}{r.etichetta ? <span className="text-xs text-muted-foreground"> · {r.etichetta}</span> : null}
        {r.bonifico ? <span className="text-xs text-muted-foreground"> · bonifico del {r.bonifico.data.split("-").reverse().join("/")}{r.bonifico.dichiarato ? " (dichiarato)" : ""}</span> : null}</span>
      <Button size="icon" variant="ghost" className="size-11 shrink-0" title="Togli questo pagamento" disabled={!!busy}
        onClick={() => {
          if (r.pos_incasso_id && !confirm("Il pagamento POS/PayPal è già stato incassato: se lo togli lo scontrino non lo userà e andrà rimborsato o usato su un altro documento. Togliere?")) return;
          setRighe((x) => x.filter((y) => y.chiave !== r.chiave));
        }}><Trash2 className="size-4" /></Button>
    </div>
  )), [righe, busy]);

  return (
    <div className={`space-y-3 ${className}`}>
      {titolo && <div className="text-sm font-semibold">{titolo}</div>}
      {/* quanto: totale, già pagato, residuo */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border p-2"><div className="text-[11px] uppercase text-muted-foreground">Totale</div><div className="font-semibold tabular-nums">{eur(totale)}</div></div>
        <div className="rounded-md border p-2"><div className="text-[11px] uppercase text-muted-foreground">{modo === "scontrino" ? "Pagato" : "Già pagato"}</div>
          <div className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{eur(r2(giaPagato + nelleRighe))}</div></div>
        <div className={`rounded-md border-2 p-2 ${residuo > 0.005 ? "border-amber-400" : "border-emerald-500"}`}>
          <div className="text-[11px] uppercase text-muted-foreground">{titoloRes}</div>
          <div className={`text-lg font-bold tabular-nums ${residuo > 0.005 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-400"}`}>{eur(residuo)}</div></div>
      </div>

      {righe.length > 0 && <div className="space-y-1">{elenco}</div>}

      {(residuo > 0.005 || modo === "documento") && (
        <>
          {/* quanto paga adesso con il prossimo metodo (default: tutto il residuo) e contanti consegnati per il resto */}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">{unMetodo && modo === "scontrino" ? "Un solo metodo per scontrino" : "Paga adesso"}
              <Input inputMode="decimal" className="mt-0.5 h-11 text-right text-lg font-semibold" placeholder={residuo > 0 ? eur(residuo) : "importo"}
                value={unMetodo && modo === "scontrino" ? "" : importoTxt} onChange={(e) => setImportoTxt(e.target.value)}
                disabled={residuo <= 0.005 || (unMetodo && modo === "scontrino")}
                title={unMetodo ? "Il pagamento misto si attiva con l'agente di cassa aggiornato sul server" : undefined} /></label>
            <label className="text-xs text-muted-foreground">Contanti dati dal cliente
              <Input inputMode="decimal" className="mt-0.5 h-11 text-right text-lg" placeholder="per il resto"
                value={consegnatoTxt} onChange={(e) => setConsegnatoTxt(e.target.value)} disabled={residuo <= 0.005} /></label>
          </div>
          {resto > 0 && <div className="rounded-md border-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-center text-lg font-bold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
            RESTO {eur(resto)}</div>}
          {oltre && <div className="text-xs font-semibold text-red-700">L&apos;importo supera quanto resta ({eur(residuo)}).</div>}
          {motivo && <div className="text-xs text-amber-700 dark:text-amber-300">Prima {motivo}.</div>}

          {/* metodi: pulsanti grandi */}
          <div className="grid grid-cols-2 gap-2">
            <Button className={`${stile} col-span-2 sm:col-span-1`} disabled={blocca} onClick={contanti}>
              {busy === "contanti" ? <Loader2 className="animate-spin" /> : <Banknote />} Contanti {importo > 0 ? eur(importo) : ""}</Button>
            <VerificaBonifico className={`${stile} col-span-2 sm:col-span-1`} size="default" importo={importo} testo={testoCliente}
              etichetta={`Bonifico ${importo > 0 ? eur(importo) : ""}`} differito={modo === "scontrino"} documentoTipo={documentoTipo} descrizione={descrizione}
              etichettaConferma={modo === "scontrino" ? "Aggiungi" : "Registra"} disabled={blocca}
              onConfermato={async (rif, _f, info) => {
                const riga: PagamentoScontrino = { modalita: "bonifico", importo, riferimento: rif };
                if (modo === "scontrino") { aggiungi({ ...riga, bonifico: info, etichetta: info.ordinante || undefined }, unMetodo); return { id: null }; }
                // documento: l'abbinamento lo fa VerificaBonifico con l'id restituito
                if (!onPagamento) return null;
                setBusy("bonifico");
                try {
                  const doc = await onPagamento({ ...riga, data: info.data });
                  if (doc !== null) { setImportoTxt(""); toast.success(`Registrato: bonifico ${eur(importo)}`); onFatto?.(); }
                  return doc === null ? null : (doc || { id: null });
                } catch (e) { toastErrore(e); return null; } finally { setBusy(""); }
              }} />
            <PagaPos importo={blocca ? 0 : importo} descrizione={`${descrizione || "GENIUS LAB"} ${eur(importo)}`.slice(0, 100)} rifTipo={documentoTipo}
              disabled={blocca} size="default" className={stile} onPagato={pos} />
            <PagaPos importo={blocca ? 0 : importo} descrizione={`${descrizione || "GENIUS LAB"} ${eur(importo)}`.slice(0, 100)} rifTipo={documentoTipo}
              disabled={blocca} size="default" className={stile} soloLettori={false} paypal onPagato={pos} />
            {modo === "documento" && stripeLink && (
              <Button variant="outline" className={`${stile} border-violet-400 text-violet-800 dark:text-violet-200`} disabled={blocca}
                title="Link di pagamento con carta (Stripe) per questo importo: il pagamento si registra da solo quando arriva"
                onClick={async () => {
                  setBusy("stripe");
                  try {
                    const url = await stripeLink(importo);
                    if (url) { await navigator.clipboard?.writeText(url).catch(() => undefined); toast.success(`Link Stripe da ${eur(importo)} copiato (valido 24 ore): mandalo al cliente`); }
                  } catch (e) { toastErrore(e); } finally { setBusy(""); }
                }}>{busy === "stripe" ? <Loader2 className="animate-spin" /> : <Link2 />} Link Stripe</Button>
            )}
            {modo === "scontrino" && nonRiscosso && (
              <Button variant="outline" className={`${stile} border-amber-400 text-amber-800 dark:text-amber-200`} disabled={blocca} onClick={nonRisc}
                title="Il cliente paga dopo: lo scontrino registra questa parte come NON RISCOSSA">
                <CircleSlash /> Non riscosso</Button>
            )}
          </div>
        </>
      )}

      {modo === "scontrino" && (
        <Button className={`${stile} w-full bg-emerald-600 text-white hover:bg-emerald-700`} disabled={!coperto || !!busy || disabled}
          onClick={() => void emettiRef.current(righe)}>
          {busy === "emetti" ? <Loader2 className="animate-spin" /> : <Receipt />}
          {coperto ? `${etichettaEmetti} · ${righe.map((r) => NOMI_MODALITA[r.modalita]).join(" + ")}` : `${etichettaEmetti} (manca ${eur(residuo)})`}
        </Button>
      )}
    </div>
  );
}
