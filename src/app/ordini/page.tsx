"use client";

// ORDINI CLIENTE e PREVENTIVI (GENIUS LAB) — serie proprie ORD n/AAAA e PREV n/AAAA.
// Ordine: l'acconto si certifica subito (scontrino battuto in cassa o fattura d'acconto) ed entra nella cassa del giorno;
// al saldo «Converti in scontrino» o «Converti in fattura» per la parte che resta.
// Preventivo: si converte in ordine, in fattura o in scontrino.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRightLeft, Ban, FileText, Loader2, Pencil, Plus, Receipt, Save, Search, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { CercaArticolo } from "@/components/CercaArticolo";
import { DecInput, parseDec } from "@/components/DecInput";
import { oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";
import {
  cassaGiornata, docAcconto, docAnnulla, docConverti, docCrea, docDettaglio, docElenco, docModifica, fattAnagrafiche, fattCatalogo,
  type DocumentoCliente, type FattAnagrafica, type FattVoceCatalogo, type RigaDoc,
} from "@/lib/api";

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const MOD: [string, string][] = [["contanti", "Contanti"], ["pos_sumup", "POS SumUp"], ["bonifico", "Bonifico"], ["paypal", "PayPal"], ["carta_stripe", "Carta online (Stripe)"]];
const MOD_L = Object.fromEntries(MOD);
const STATO: Record<string, string> = {
  aperto: "bg-amber-100 text-amber-800", saldato: "bg-emerald-100 text-emerald-800", convertito: "bg-sky-100 text-sky-800", annullato: "bg-muted text-muted-foreground",
};
const dataIt = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
// chiave stabile per ogni riga dell'editor (con l'indice, togliendo una riga i campi «slittavano»)
let seqRiga = 0;
const chiaveRiga = () => `r${++seqRiga}`;
type RigaUI = RigaDoc & { _k: string };
const campo = "h-9 rounded-md border border-input bg-background px-2 text-sm";

type Bozza = { id?: string; tipo: "ordine" | "preventivo"; cliente_nome: string; telefono: string; email: string; anagrafica_id: string | null;
  controparte: DocumentoCliente["controparte"]; rif: string; note: string; righe: (RigaDoc & { _k?: string })[] };
const bozzaVuota = (tipo: "ordine" | "preventivo"): Bozza => ({ tipo, cliente_nome: "", telefono: "", email: "", anagrafica_id: null, controparte: {}, rif: "", note: "", righe: [] });

function Editor({ iniziale, listino, onChiudi, onSalvato }: {
  iniziale: Bozza; listino: FattVoceCatalogo[]; onChiudi: () => void; onSalvato: (d: DocumentoCliente) => void;
}) {
  const [b, setBozza] = useState<Omit<Bozza, "righe"> & { righe: RigaUI[] }>(() => ({ ...iniziale, righe: iniziale.righe.map((r) => ({ ...r, _k: r._k || chiaveRiga() })) }));
  const [sporco, setSporco] = useState(false);
  const setB = (nb: Omit<Bozza, "righe"> & { righe: RigaUI[] }) => { setBozza(nb); setSporco(true); };
  const chiudi = () => { if (sporco && !confirm("Chiudere senza salvare? Le modifiche andranno perse.")) return; onChiudi(); };
  const [q, setQ] = useState("");
  const [trovati, setTrovati] = useState<FattAnagrafica[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => fattAnagrafiche("genius", "cliente", q.trim(), 8).then((r) => setTrovati(r.anagrafiche || [])).catch(() => setTrovati([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const tot = b.righe.reduce((s, r) => s + r.quantita * r.prezzo_ivato * (1 - (r.sconto || 0) / 100), 0);
  const riga = (i: number, p: Partial<RigaDoc>) => setB({ ...b, righe: b.righe.map((r, j) => (j === i ? { ...r, ...p } : r)) });

  async function salva() {
    if (busy) return;
    if (!b.cliente_nome.trim()) { toast.error("Scrivi il nome del cliente"); return; }
    const righe = b.righe.filter((r) => r.descrizione.trim()).map(({ _k, ...r }) => { void _k; return r; });
    if (!righe.length) { toast.error("Aggiungi almeno una riga"); return; }
    if (righe.some((r) => !(r.quantita > 0))) { toast.error("Ogni riga deve avere una quantità maggiore di zero"); return; }
    setBusy(true);
    try {
      const corpo = { tipo: b.tipo, cliente_nome: b.cliente_nome.trim(), telefono: b.telefono, email: b.email, anagrafica_id: b.anagrafica_id,
        controparte: b.controparte, rif: b.rif, note: b.note, righe };
      onSalvato(b.id ? await docModifica(b.id, corpo) : await docCrea(corpo));
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={chiudi}>
      <div className="h-full w-full max-w-3xl space-y-3 overflow-y-auto bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{b.id ? "Modifica" : "Nuovo"} {b.tipo === "ordine" ? "ordine cliente" : "preventivo"}</h2>
          <Button size="icon" variant="ghost" onClick={chiudi}><X className="size-4" /></Button>
        </div>
        <Card className="space-y-2 p-3">
          <div className="text-sm font-medium">Cliente</div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cerca in anagrafica (nome, P.IVA)… oppure scrivi sotto" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setTrovati([]); }} />
            {trovati.length > 0 && q.trim().length >= 2 && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-sm shadow">
                {trovati.map((a) => (
                  <button key={a.id} type="button" className="block w-full px-2 py-1.5 text-left hover:bg-muted" onClick={() => {
                    setB({ ...b, anagrafica_id: a.id, cliente_nome: a.denominazione || "", telefono: a.telefono || b.telefono, email: a.email || b.email,
                      controparte: { denominazione: a.denominazione || "", piva: a.piva || "", cf: a.cf || "", sdi: a.sdi || "", pec: a.pec || "",
                        indirizzo: a.indirizzo || "", cap: a.cap || "", comune: a.comune || "", provincia: a.provincia || "", paese: (a.paese || "IT").slice(0, 2), email: a.email || "" } });
                    setQ(""); setTrovati([]);
                  }}>{a.denominazione} <span className="text-xs text-muted-foreground">{a.piva || a.cf || ""} {a.comune || ""}</span></button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input placeholder="Nome e cognome / ragione sociale *" value={b.cliente_nome} onChange={(e) => setB({ ...b, cliente_nome: e.target.value })} />
            <Input placeholder="Telefono" value={b.telefono} onChange={(e) => setB({ ...b, telefono: e.target.value })} />
            <Input placeholder="Email" value={b.email} onChange={(e) => setB({ ...b, email: e.target.value })} />
          </div>
          {b.anagrafica_id && <div className="text-xs text-emerald-700">✓ collegato all&apos;anagrafica (dati pronti per la fattura)</div>}
        </Card>
        <Card className="space-y-2 p-3">
          <div className="text-sm font-medium">Articoli</div>
          <CercaArticolo listino={listino} onScelto={(a) => setB({ ...b, righe: [...b.righe, { _k: chiaveRiga(), descrizione: a.descrizione, quantita: 1, prezzo_ivato: a.prezzo_ivato ?? 0, aliquota: a.aliquota, prodotto_id: a.prodotto_id || null }] })} />
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Descrizione</th><th className="w-16">Q.tà</th><th className="w-28">Prezzo IVA incl.</th><th className="w-16">IVA %</th><th className="w-24 text-right">Totale</th><th className="w-8" /></tr></thead>
            <tbody>
              {b.righe.map((r, i) => (
                <tr key={r._k}>
                  <td className="py-0.5 pr-1"><Input className="h-8" value={r.descrizione} onChange={(e) => riga(i, { descrizione: e.target.value })} /></td>
                  <td className="pr-1"><DecInput className="h-8 text-right" value={r.quantita} onValue={(v) => riga(i, { quantita: v ?? 0 })} /></td>
                  <td className="pr-1"><DecInput className="h-8 text-right" value={r.prezzo_ivato} onValue={(v) => riga(i, { prezzo_ivato: v ?? 0 })} /></td>
                  <td className="pr-1"><select className={`${campo} h-8 w-full`} value={r.aliquota} onChange={(e) => riga(i, { aliquota: Number(e.target.value) })}>
                    {[22, 10, 5, 4, 0].map((a) => <option key={a} value={a}>{a}</option>)}</select></td>
                  <td className="text-right tabular-nums">{eur(r.quantita * r.prezzo_ivato * (1 - (r.sconto || 0) / 100))}</td>
                  <td><button className="text-muted-foreground hover:text-red-600" title="Togli riga" onClick={() => setB({ ...b, righe: b.righe.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={() => setB({ ...b, righe: [...b.righe, { _k: chiaveRiga(), descrizione: "", quantita: 1, prezzo_ivato: 0, aliquota: 22 }] })}><Plus className="mr-1 size-4" />Riga libera</Button>
            <span className="text-lg font-semibold">Totale {eur(tot)}</span>
          </div>
        </Card>
        <Card className="grid gap-2 p-3 sm:grid-cols-2">
          <Input placeholder="Riferimento (es. SCHEDA 63020)" value={b.rif} onChange={(e) => setB({ ...b, rif: e.target.value })} />
          <Input placeholder="Note (tempi di consegna, fornitore…)" value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} />
        </Card>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={chiudi}>Annulla</Button>
          <Button onClick={salva} disabled={busy}>{busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}Salva</Button>
        </div>
      </div>
    </div>
  );
}

function Dettaglio({ id, onChiudi, onCambiato, onModifica }: { id: string; onChiudi: () => void; onCambiato: () => void; onModifica: (d: DocumentoCliente) => void }) {
  const router = useRouter();
  const [d, setD] = useState<DocumentoCliente | null>(null);
  const [errore, setErrore] = useState("");
  const [azione, setAzione] = useState<"" | "acconto" | "scontrino" | "fattura">("");
  const [f, setF] = useState({ importo: "", modalita: "contanti", certificato: "scontrino" as "scontrino" | "fattura", numero: "", pagata: false });
  const [busy, setBusy] = useState(false);
  const [cassaOggiChiusa, setCassaOggiChiusa] = useState(false);
  const carica = useCallback(() => {
    docDettaglio(id).then((r) => { setD(r); setErrore(""); }).catch((e: Error) => setErrore(e.message || "Errore"));
  }, [id]);
  useEffect(() => { carica(); }, [carica]);

  /** Apre il pannello dell'azione con i valori giusti (numero scontrino sempre vuoto: niente numeri riusati). */
  function apri(a: "acconto" | "scontrino" | "fattura") {
    setAzione(a);
    setF(a === "fattura"
      ? { importo: "", modalita: "bonifico", certificato: "fattura", numero: "", pagata: false }
      : { importo: "", modalita: "contanti", certificato: "scontrino", numero: "", pagata: false });
    setCassaOggiChiusa(false);
    // acconti e scontrini entrano nella cassa di OGGI: avviso subito se è già chiusa
    cassaGiornata(oggiRoma()).then((r) => setCassaOggiChiusa(r.giornata.stato === "chiusa")).catch(() => undefined);
  }

  async function esegui(fn: () => Promise<DocumentoCliente & { fattura?: { id: string }; ordine?: { id: string; sigla: string } }>, ok: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      toast.success(ok); setAzione(""); carica(); onCambiato();
      if (r.fattura?.id) { toast.info("Apro la fattura: controlla i dati del cliente e inviala allo SdI"); router.push(`/fatturazione?id=${r.fattura.id}`); }
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  function conferma() {
    if (!d) return;
    if (azione === "acconto") {
      const imp = parseDec(f.importo);
      if (imp === null || Number.isNaN(imp) || imp <= 0) { toast.error("Scrivi l'importo dell'acconto (es. 50 o 12,50)"); return; }
      if (imp > d.residuo + 0.001) { toast.error(`L'acconto supera quanto resta da pagare (${eur(d.residuo)})`); return; }
      if (f.certificato === "scontrino" && !f.numero.trim()) { toast.error("Scrivi il numero dello scontrino battuto in cassa"); return; }
      esegui(() => docAcconto(d.id, { importo: imp, modalita: f.modalita, certificato: f.certificato, scontrino_numero: f.numero.trim() }), "Acconto registrato: è nella cassa di oggi");
    } else if (azione === "scontrino") {
      if (!f.numero.trim()) { toast.error("Scrivi il numero dello scontrino battuto in cassa"); return; }
      esegui(() => docConverti(d.id, { a: "scontrino", modalita: f.modalita, scontrino_numero: f.numero.trim() }), "Scontrino registrato nella cassa di oggi");
    } else {
      esegui(() => docConverti(d.id, { a: "fattura", modalita: f.modalita, pagata: f.pagata }), "Fattura creata in bozza");
    }
  }

  if (!d) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onChiudi}>
      {errore ? (
        <div className="max-w-sm space-y-3 rounded-lg bg-background p-4 text-sm shadow-lg" onClick={(e) => e.stopPropagation()}>
          <div className="font-medium">Non riesco ad aprire il documento</div>
          <div className="text-muted-foreground">{errore}</div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onChiudi}>Chiudi</Button>
            <Button size="sm" onClick={() => { setErrore(""); carica(); }}>Riprova</Button>
          </div>
        </div>
      ) : <Loader2 className="size-6 animate-spin text-white" />}
    </div>
  );
  const aperto = d.stato === "aperto";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onChiudi}>
      <div className="h-full w-full max-w-2xl space-y-3 overflow-y-auto bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{d.tipo === "ordine" ? "Ordine cliente" : "Preventivo"} {d.sigla}</h2>
            <div className="text-sm text-muted-foreground">{dataIt(d.data)} · {d.cliente_nome || d.controparte?.denominazione}{d.telefono ? ` · ${d.telefono}` : ""}{d.rif ? ` · ${d.rif}` : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATO[d.stato]}`}>{d.stato.toUpperCase()}</span>
            <Button size="icon" variant="ghost" onClick={onChiudi}><X className="size-4" /></Button>
          </div>
        </div>
        <Card className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {d.righe.map((r, i) => (
                <tr key={i} className="border-b last:border-0"><td className="px-3 py-1.5">{r.quantita !== 1 ? `${r.quantita} × ` : ""}{r.descrizione}</td>
                  <td className="px-3 text-right tabular-nums">{eur(r.quantita * r.prezzo_ivato * (1 - (r.sconto || 0) / 100))}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-0.5 border-t bg-muted/30 px-3 py-2 text-sm">
            <div className="flex justify-between font-semibold"><span>Totale</span><span>{eur(d.totale)}</span></div>
            {d.tipo === "ordine" && <>
              <div className="flex justify-between"><span>Incassato (acconti/saldo)</span><span>{eur(d.pagato)}</span></div>
              <div className="flex justify-between text-base font-bold"><span>Resta da pagare</span><span>{eur(d.residuo)}</span></div>
            </>}
          </div>
        </Card>
        {!!d.pagamenti?.length && (
          <Card className="space-y-1 p-3 text-sm">
            <div className="font-medium">Pagamenti</div>
            {d.pagamenti.map((p) => (
              <div key={p.id} className="flex flex-wrap justify-between gap-2">
                <span>{dataIt(p.data)} · {p.tipo === "acconto" ? "Acconto" : "Saldo"} · {MOD_L[p.modalita] || p.modalita}</span>
                <span>{p.certificato === "scontrino" ? `scontrino n. ${p.scontrino_numero}` : <a className="text-primary underline" href={`/fatturazione?id=${p.fattura_id}`}>fattura</a>} · <b>{eur(p.importo)}</b></span>
              </div>
            ))}
          </Card>
        )}
        {d.convertito_in && (
          <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950/30">
            Convertito in {d.convertito_in.tipo}{d.convertito_in.sigla ? ` ${d.convertito_in.sigla}` : ""}{d.convertito_in.numero ? ` n. ${d.convertito_in.numero}` : ""}
            {d.convertito_in.tipo === "fattura" && d.convertito_in.id && <> · <a className="text-primary underline" href={`/fatturazione?id=${d.convertito_in.id}`}>apri la fattura</a></>}
          </div>
        )}
        {d.note && <div className="text-sm text-muted-foreground">📝 {d.note}</div>}

        {aperto && (
          <div className="flex flex-wrap gap-2">
            {d.tipo === "ordine" && <Button onClick={() => apri("acconto")}><Wallet className="mr-1 size-4" />Registra acconto</Button>}
            <Button variant="outline" onClick={() => apri("scontrino")}><Receipt className="mr-1 size-4" />{d.tipo === "ordine" && d.pagato ? "Saldo:" : ""} Converti in scontrino</Button>
            <Button variant="outline" onClick={() => apri("fattura")}><FileText className="mr-1 size-4" />{d.tipo === "ordine" && d.pagato ? "Saldo:" : ""} Converti in fattura</Button>
            {d.tipo === "preventivo" && <Button variant="outline" disabled={busy} onClick={() => esegui(async () => {
              const r = await docConverti(d.id, { a: "ordine" }); if (r.ordine) toast.success(`Creato ${r.ordine.sigla}`); return r;
            }, "Preventivo convertito in ordine cliente")}><ArrowRightLeft className="mr-1 size-4" />Converti in ordine</Button>}
            <Button variant="ghost" onClick={() => onModifica(d)}><Pencil className="mr-1 size-4" />Modifica</Button>
            {!d.pagato && <Button variant="ghost" className="text-red-600" disabled={busy} onClick={() => confirm(`Annullare ${d.sigla}?`) && esegui(() => docAnnulla(d.id), "Annullato")}><Ban className="mr-1 size-4" />Annulla</Button>}
          </div>
        )}

        {azione && (
          <Card className="space-y-2 border-2 border-primary/40 p-3">
            <div className="font-medium">
              {azione === "acconto" ? "Acconto sull'ordine" : azione === "scontrino" ? `Scontrino per ${eur(d.residuo)}` : `Fattura${d.pagato ? ` (scala gli acconti: resta ${eur(d.residuo)})` : ` per ${eur(d.residuo)}`}`}
            </div>
            {cassaOggiChiusa && azione !== "fattura" && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
                La cassa di oggi è CHIUSA: per registrare l&apos;incasso va prima riaperta.{" "}
                <a className="font-medium underline" href="/cassa/giornata">Apri cassa del giorno</a>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {azione === "acconto" && <Input className="h-9 w-32 border-2 text-right font-semibold" inputMode="decimal" placeholder={`€ max ${eur(d.residuo)}`} value={f.importo} onChange={(e) => setF({ ...f, importo: e.target.value })} />}
              <select className={campo} value={f.modalita} onChange={(e) => setF({ ...f, modalita: e.target.value })}>
                {MOD.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {azione === "acconto" && (
                <select className={campo} value={f.certificato} onChange={(e) => setF({ ...f, certificato: e.target.value as "scontrino" | "fattura" })}>
                  <option value="scontrino">con scontrino</option><option value="fattura">con fattura d&apos;acconto</option>
                </select>
              )}
              {((azione === "acconto" && f.certificato === "scontrino") || azione === "scontrino") &&
                <Input className="h-9 w-32" placeholder="N. scontrino *" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} />}
              {azione === "fattura" && <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.pagata} onChange={(e) => setF({ ...f, pagata: e.target.checked })} />già pagata (incasso di oggi)</label>}
              <Button disabled={busy} onClick={conferma}>{busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}Conferma</Button>
              <Button variant="ghost" onClick={() => setAzione("")}>Chiudi</Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {azione === "fattura" ? "Si apre la bozza in Fatturazione: controlla i dati del cliente e inviala allo SdI."
                : "Finché il registratore non è collegato, batti lo scontrino sulla cassa e scrivi qui il suo numero: la riga va da sola nella cassa del giorno."}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function OrdiniPage() {
  return <Suspense fallback={<div className="p-6"><Loader2 className="animate-spin" /></div>}><Pagina /></Suspense>;
}

function Pagina() {
  const router = useRouter();
  const sp = useSearchParams();
  const [tipo, setTipo] = useState<"ordine" | "preventivo">("ordine");
  const [stato, setStato] = useState("aperto");
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<DocumentoCliente[] | null>(null);
  const [errore, setErrore] = useState("");
  const [listino, setListino] = useState<FattVoceCatalogo[]>([]);
  const [editor, setEditor] = useState<Bozza | null>(null);
  // si apre da link: /ordini?id=<documento> (letto con useSearchParams: niente differenze server/client)
  const [apertoLocale, setAperto] = useState<string | null>(null);
  const idLink = sp.get("id");
  const aperto = apertoLocale ?? idLink;
  const chiudiDettaglio = () => { setAperto(null); if (idLink) router.replace("/ordini"); };

  const carica = useCallback(() => {
    docElenco(tipo, stato, q).then((r) => { setLista(r); setErrore(""); }).catch((e: Error) => { setErrore(e.message); setLista([]); });
  }, [tipo, stato, q]);
  useEffect(() => { const t = setTimeout(carica, 200); return () => clearTimeout(t); }, [carica]);
  useEffect(() => { fattCatalogo("genius").then((r) => setListino(r.voci || [])).catch(() => undefined); }, []);

  return (
    <div className="space-y-4 p-1 md:p-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-semibold">Ordini e preventivi</h1>
        <Button className="ml-auto" onClick={() => setEditor(bozzaVuota(tipo))}><Plus className="mr-1 size-4" />Nuovo {tipo === "ordine" ? "ordine cliente" : "preventivo"}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b">
        {([["ordine", "Ordini cliente"], ["preventivo", "Preventivi"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setTipo(k); setLista(null); }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tipo === k ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>{l}</button>
        ))}
        <select className={`${campo} ml-auto h-8`} value={stato} onChange={(e) => setStato(e.target.value)}>
          <option value="aperto">Aperti</option><option value="saldato">Saldati</option><option value="convertito">Convertiti</option><option value="annullato">Annullati</option><option value="">Tutti</option>
        </select>
        <Input className="h-8 w-56" placeholder="Cerca cliente, scheda, telefono…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Numero</th><th className="text-left">Data</th><th className="text-left">Cliente</th><th className="text-left">Rif.</th>
              <th className="text-right">Totale</th>{tipo === "ordine" && <><th className="text-right">Acconti</th><th className="px-3 text-right">Resta</th></>}<th className="px-3 text-left">Stato</th></tr>
          </thead>
          <tbody>
            {lista === null && <tr><td colSpan={8} className="p-4 text-center"><Loader2 className="inline size-4 animate-spin" /></td></tr>}
            {errore && <tr><td colSpan={8} className="p-4 text-center text-red-700">Non riesco a caricare l&apos;elenco: {errore}{" "}
              <Button size="xs" variant="outline" onClick={() => { setErrore(""); setLista(null); carica(); }}>Riprova</Button></td></tr>}
            {!errore && lista?.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nessun {tipo === "ordine" ? "ordine" : "preventivo"}</td></tr>}
            {lista?.map((d) => (
              <tr key={d.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setAperto(d.id)}>
                <td className="px-3 py-2 font-medium">{d.sigla}</td><td>{dataIt(d.data)}</td><td>{d.cliente}</td><td className="text-muted-foreground">{d.rif}</td>
                <td className="text-right tabular-nums">{eur(d.totale)}</td>
                {tipo === "ordine" && <><td className="text-right tabular-nums">{d.pagato ? eur(d.pagato) : "—"}</td><td className="px-3 text-right font-semibold tabular-nums">{eur(d.residuo)}</td></>}
                <td className="px-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATO[d.stato]}`}>{d.stato}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {editor && <Editor iniziale={editor} listino={listino} onChiudi={() => setEditor(null)}
        onSalvato={(d) => { setEditor(null); carica(); setAperto(d.id); toast.success(`${d.sigla} salvato`); }} />}
      {aperto && <Dettaglio key={aperto} id={aperto} onChiudi={chiudiDettaglio} onCambiato={carica}
        onModifica={(d) => { chiudiDettaglio(); setEditor({ id: d.id, tipo: d.tipo, cliente_nome: d.cliente_nome || "", telefono: d.telefono || "", email: d.email || "",
          anagrafica_id: d.anagrafica_id, controparte: d.controparte || {}, rif: d.rif || "", note: d.note || "", righe: d.righe }); }} />}
    </div>
  );
}
