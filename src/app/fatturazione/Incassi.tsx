"use client";

// VERIFICA PAGAMENTI (30/09/2026): cosa è arrivato su banca SumUp, POS, PayPal, Stripe e a cosa corrisponde.
// Per ogni pagamento: le proposte (fattura, più fatture, pro forma, sessione) e il pulsante che chiude il giro:
// fattura incassata · pro forma → fattura quietanzata allo SdI · sessione pagata → apri la sessione e spedisci.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Banknote, CheckCircle2, CreditCard, ExternalLink, FileUp, Loader2, Receipt, RefreshCw,
  Smartphone, Truck, Wallet, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  incAzione, incElenco, incImportaCsv, incVerifica,
  type ApiError, type DaSpedire, type IncFonte, type IncFontiStato, type IncProposta, type Incasso,
} from "@/lib/api";
import { dataIt, eur } from "./util";

const FONTI: { k: IncFonte; label: string; icon: typeof Banknote }[] = [
  { k: "banca", label: "Banca (bonifici)", icon: Banknote },
  { k: "pos", label: "POS SumUp", icon: Smartphone },
  { k: "paypal", label: "PayPal", icon: Wallet },
  { k: "stripe", label: "Carta Stripe", icon: CreditCard },
];
const NOME_FONTE: Record<string, string> = { banca: "Bonifico", pos: "POS", paypal: "PayPal", stripe: "Stripe", manuale: "Manuale" };

export function Incassi({ onClose, onApriFattura, onCambiato }: {
  onClose: () => void; onApriFattura: (id: string) => void; onCambiato: () => void;
}) {
  const [lista, setLista] = useState<Incasso[]>([]);
  const [sped, setSped] = useState<DaSpedire[]>([]);
  const [fonti, setFonti] = useState<IncFontiStato>({});
  const [esito, setEsito] = useState<Record<string, { ok: boolean; nuovi?: number; nota?: string }> | null>(null);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const file = useRef<HTMLInputElement>(null);

  const carica = useCallback(async () => {
    try {
      const r = await incElenco();
      setLista(r.incassi); setSped(r.da_spedire); setFonti(r.fonti);
    } catch (e) { toast.error((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carica(); }, [carica]);

  async function verifica(f: IncFonte[]) {
    setBusy("verifica");
    try {
      const r = await incVerifica(f);
      setEsito(r.fonti); setSped(r.da_spedire); setFonti(r.stato_fonti);
      const tutti = await incElenco();
      setLista(tutti.incassi);
      const nuovi = Object.values(r.fonti).reduce((s, x) => s + (x.nuovi || 0), 0);
      toast.success(nuovi ? `${nuovi} pagamenti nuovi` : "Nessun pagamento nuovo");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  }

  async function caricaCsv(fl: File) {
    setBusy("csv");
    try {
      const r = await incImportaCsv(fl);
      setLista(r.incassi);
      toast.success(`CSV letto: ${r.letti} movimenti, ${r.nuovi} nuovi, ${r.gia_presenti} già visti`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); if (file.current) file.current.value = ""; }
  }

  async function esegui(inc: Incasso, body: Parameters<typeof incAzione>[1], conferma: string) {
    if (!confirm(conferma)) return;
    setBusy(inc.id);
    try {
      const r = await incAzione(inc.id, body);
      toast.success(r.incasso?.esito || "Fatto");
      if (r.da_spedire) {
        toast.warning(`Sessione ${r.da_spedire.numero || ""} ${r.da_spedire.cliente || ""}: pagata, DA SPEDIRE`, {
          action: { label: "Apri sessione", onClick: () => window.open(`/sessioni/${r.da_spedire.session_id}`, "_blank") },
          duration: 15000,
        });
      }
      onCambiato();
      carica();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.detail?.fattura && body.session_id) {
        const dop = err.detail.fattura as { id: string; numero: string };
        setBusy("");
        if (confirm(`${err.message}.\n\nOK = collega la fattura ${dop.numero} alla sessione e segnala incassata con questo pagamento (niente doppione)`)) {
          return esegui(inc, { azione: "collega_fattura", session_id: body.session_id, fattura_ids: [dop.id] }, "Confermi?");
        }
        if (confirm("Creare comunque una NUOVA fattura quietanzata?")) return esegui(inc, { ...body, forza: true }, "Confermi la nuova fattura?");
      } else toast.error(err.message);
    } finally { setBusy(""); }
  }

  function azioni(inc: Incasso, p: IncProposta) {
    const q = `${NOME_FONTE[inc.fonte]} di ${eur(inc.importo)} del ${dataIt(inc.data)}`;
    const b = busy === inc.id;
    const out = [];
    if (p.tipo === "fattura" && p.id) {
      out.push(<Button key="f" size="xs" disabled={b} onClick={() => esegui(inc, { azione: "fattura_pagata", fattura_ids: [p.id!] },
        `${q}: segnare la fattura ${p.numero} (${p.nome}) come incassata?${p.session_id ? "\nSi chiude anche la sessione di taratura." : ""}`)}>
        <CheckCircle2 /> Segna fattura {p.numero} incassata</Button>);
      out.push(<Button key="a" size="xs" variant="ghost" onClick={() => onApriFattura(p.id!)}><ExternalLink /> Apri fattura</Button>);
    }
    if (p.tipo === "fatture" && p.ids) {
      out.push(<Button key="ff" size="xs" disabled={b} onClick={() => esegui(inc, { azione: "fattura_pagata", fattura_ids: p.ids },
        `${q}: segnare incassate le fatture ${p.numero}?`)}><CheckCircle2 /> Segna incassate le fatture {p.numero}</Button>);
    }
    if (p.tipo === "proforma") {
      out.push(<Button key="pf" size="xs" disabled={b} onClick={() => esegui(inc, { azione: "proforma_in_fattura", proforma_id: p.id, session_id: p.session_id, emetti: true },
        `${q}: trasformare la pro forma ${p.numero} (${p.nome}) in FATTURA QUIETANZATA e inviarla allo SdI?\nLa sessione viene segnata pagata.`)}>
        <Receipt /> Pro forma → fattura quietanzata e SdI</Button>);
      out.push(<Button key="ps" size="xs" variant="outline" disabled={b} onClick={() => esegui(inc, { azione: "sessione_pagata", session_id: p.session_id },
        `${q}: segnare pagata la sessione, senza fare ancora la fattura?`)}>Solo segna pagata</Button>);
    }
    if (p.tipo === "sessione") {
      out.push(<Button key="sf" size="xs" disabled={b} onClick={() => esegui(inc, { azione: "sessione_in_fattura", session_id: p.session_id, emetti: true },
        `${q}: emettere la fattura quietanzata della sessione ${p.numero} (${p.nome}) e inviarla allo SdI?`)}>
        <Receipt /> Fattura quietanzata e SdI</Button>);
      out.push(<Button key="ss" size="xs" variant="outline" disabled={b} onClick={() => esegui(inc, { azione: "sessione_pagata", session_id: p.session_id },
        `${q}: segnare pagata la sessione ${p.numero}?`)}>Solo segna pagata</Button>);
    }
    if (p.session_id) {
      out.push(<Link key="s" href={`/sessioni/${p.session_id}`} target="_blank"><Button size="xs" variant="ghost"><ExternalLink /> Apri sessione</Button></Link>);
    }
    return out;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 space-y-2 border-b bg-background px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Verifica pagamenti</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Chiudi"><X /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!!busy} onClick={() => verifica(["banca", "pos", "paypal", "stripe"])}>
              {busy === "verifica" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Verifica tutti i pagamenti
            </Button>
            {FONTI.map((f) => (
              <Button key={f.k} size="sm" variant="outline" disabled={!!busy} onClick={() => verifica([f.k])}
                title={fonti[f.k]?.nota}>
                <f.icon /> {f.label}{fonti[f.k] && !fonti[f.k].api ? " ·" : ""}
              </Button>
            ))}
            <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && caricaCsv(e.target.files[0])} />
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => file.current?.click()}>
              {busy === "csv" ? <Loader2 className="animate-spin" /> : <FileUp />} Carica CSV SumUp
            </Button>
          </div>
          {esito && (
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(esito).map(([k, v]) => (
                <span key={k} className={`rounded px-1.5 py-0.5 ${v.ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                  {NOME_FONTE[k] || k}: {v.ok ? `${v.nuovi || 0} nuovi` : v.nota}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 p-4">
          {sped.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium"><Truck className="size-4" /> Pagate e da spedire ({sped.length})</div>
              <ul className="space-y-1 text-sm">
                {sped.map((s) => (
                  <li key={s.session_id} className="flex flex-wrap items-center gap-2">
                    <Link className="font-medium underline" href={`/sessioni/${s.session_id}`} target="_blank">Sessione {s.numero}</Link>
                    <span>{s.cliente}{s.citta ? ` (${s.citta})` : ""}</span>
                    <span className="text-xs text-muted-foreground">pagata {dataIt(s.pagata_il)} · {s.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>}
          {!loading && !lista.length && (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              Nessun pagamento da gestire. Premi «Verifica tutti i pagamenti» o carica il CSV del conto SumUp.
            </div>
          )}
          {lista.map((inc) => (
            <div key={inc.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{NOME_FONTE[inc.fonte]}</span>
                <span className="text-lg font-semibold tabular-nums">{eur(inc.importo)}</span>
                <span className="text-sm">{inc.ordinante}</span>
                <span className="ml-auto text-xs text-muted-foreground">{new Date(inc.data).toLocaleString("it-IT")}</span>
              </div>
              {inc.causale && inc.causale !== inc.ordinante && <div className="text-xs text-muted-foreground">{inc.causale}</div>}
              {inc.proposte?.length ? inc.proposte.map((p, i) => (
                <div key={i} className={`space-y-1 rounded-md p-2 ${i === 0 && p.punti >= 90 ? "bg-emerald-500/10" : "bg-muted/40"}`}>
                  <div className="text-sm">
                    <b>{p.tipo === "proforma" ? "Pro forma" : p.tipo === "sessione" ? "Sessione" : p.tipo === "fatture" ? "Fatture" : "Fattura"} {p.numero}</b>
                    {" · "}{p.nome} · {eur(p.importo)}
                    <span className="ml-2 text-xs text-muted-foreground">{p.perche}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{azioni(inc, p)}</div>
                </div>
              )) : (
                <div className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="size-4" /> Nessuna fattura, pro forma o sessione con questo importo o questo nome
                </div>
              )}
              <div className="flex justify-end">
                <Button size="xs" variant="ghost" disabled={busy === inc.id}
                  onClick={() => esegui(inc, { azione: "ignora" }, "Ignorare questo pagamento (non riguarda fatture o sessioni)?")}>Ignora</Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Il controllo automatico gira alle 9:00 e poi ogni ora fino alle 19 e avvisa su Telegram.
            {Object.entries(fonti).filter(([, v]) => !v.api).length > 0 && (
              <> Fonti senza collegamento diretto: {Object.entries(fonti).filter(([, v]) => !v.api).map(([k, v]) => `${NOME_FONTE[k]} (${v.nota})`).join(" · ")}.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
