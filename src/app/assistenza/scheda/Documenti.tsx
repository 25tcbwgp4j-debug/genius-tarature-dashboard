"use client";

// DOCUMENTI E SPEDIZIONI della scheda (05/10/2026, specifica §6b e §8.10-8.11): scontrino, acconto, fattura (bozza),
// pro forma (per la spedizione con bonifico) — come Tarature e la cassa. L'«ordine al cliente» non serve più qui.
// Corriere: «Spedisco io» (etichetta UPS o DHL) · etichetta per farci arrivare il dispositivo · corriere del cliente.
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, FileText, Receipt, Send, ShoppingCart, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { assAzione, eur, type FatturaCollegata, type Scheda } from "@/lib/assistenza";
import { Pill, Sezione } from "./ui";

export function Documenti({ s, ro, busy, onScontrino, onAcconto, onRichiediAcconto, onVendi, onPagato, onCorriere }: {
  s: Scheda; ro: boolean; busy: boolean; onScontrino: () => void; onAcconto: () => void; onRichiediAcconto: () => void;
  onVendi: (t: "fattura" | "proforma") => void; onPagato: () => void; onCorriere: () => void;
}) {
  // 14/10/2026: ultima richiesta d'acconto mandata al cliente (mail + WhatsApp)
  const rich = (s.fasi as Record<string, { il?: string; importo?: number } | undefined> | undefined)?.richiesta_acconto;
  const c = s.collegamenti || {};
  return (
    <Sezione titolo="Documenti, pagamento e spedizioni" icona={<Wallet />}
      sottotitolo={s.pagata ? <Pill tono="verde"><CheckCircle2 className="size-3" />pagata</Pill> : s.saldo > 0 ? <Pill tono="ambra">saldo {eur(s.saldo)}</Pill> : null}>
      <div className="space-y-3">
        {!ro && (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            <Button variant="outline" onClick={onScontrino} title="Apre la cassa con le righe della scheda"><ShoppingCart />Scontrino</Button>
            <Button variant="outline" onClick={onAcconto} title="Scontrino d'acconto: al saldo si scala da solo"><Receipt />Acconto</Button>
            <Button variant="outline" disabled={busy} onClick={onRichiediAcconto} title="Chiede al cliente un acconto (importo a scelta) per mail e WhatsApp, con IBAN, causale e preventivo allegato"><Send />Richiedi acconto</Button>
            <Button variant="outline" disabled={!!s.fattura_id || busy} onClick={() => onVendi("fattura")} title="Fattura in bozza con le righe della scheda (nulla va allo SdI finché non la emetti)"><FileText />Fattura</Button>
            <Button variant="outline" disabled={!!s.documento_id || busy} onClick={() => onVendi("proforma")} title="Pro forma per il pagamento con bonifico (poi «Converti in fattura»)"><FileText />Pro forma</Button>
            <Button variant={s.stato === "pronto" && !s.pagata ? "default" : "outline"} disabled={busy || s.pagata} onClick={onPagato} title="Pagamento arrivato (bonifico, PayPal, contanti, POS)"><CheckCircle2 />Pagato</Button>
            <Button variant="outline" onClick={onCorriere}><Truck />Corriere</Button>
          </div>
        )}
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
          {c.fattura && <RigaFattura f={c.fattura} />}
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

function RigaFattura({ f, altra }: { f: FatturaCollegata; altra?: boolean }) {
  const nc = f.tipo_documento === "TD04";
  return (
    <div className="flex flex-wrap items-center gap-2"><FileText className="size-4 text-muted-foreground" />
      {nc ? "Nota di credito" : altra ? "Altra fattura" : "Fattura"} <Link className="underline" href={`/fatturazione?id=${f.id}`}>{f.numero || "bozza"}</Link> {eur(f.totale)}
      {f.data ? <span className="text-muted-foreground">del {dataIt(f.data)}</span> : null}
      {f.pagamento_stato === "pagata" ? <Pill tono="verde">pagata{f.pagato_il ? ` il ${dataIt(f.pagato_il)}` : ""}{f.pagamento_modalita ? ` · ${f.pagamento_modalita}` : ""}</Pill>
        : f.pagamento_stato ? <Pill tono="ambra">{f.pagamento_stato}</Pill> : null}
      <Pill>{f.stato}</Pill>
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
      {" · "}<a className="underline" href={`/api/backend/api/shipments/${x.id}/label-pdf`} target="_blank" rel="noreferrer">etichetta</a>
      {!annullata && !ro && <>{" · "}<button className="text-red-700 underline disabled:opacity-50" disabled={busy} onClick={annulla}>annulla</button></>}
    </div>
  );
}
