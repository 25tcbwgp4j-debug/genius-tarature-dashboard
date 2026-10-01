"use client";

// ORDINI CLIENTE e PREVENTIVI (GENIUS LAB) — serie proprie ORD n/AAAA e PREV n/AAAA.
// Ordine (01/10/2026): dopo il salvataggio acconto / pagamento totale / più tardi → SCONTRINO (si va alla Cassa col carrello
// pronto) o FATTURA (bozza da pagare in Fatturazione). Fasi: da ordinare → ordinato (da quale FORNITORE) → arrivato
// (subito l'avviso al cliente via email/WhatsApp) → ritirato. Resta aperto finché non è tutto pagato E ritirato.
// Preventivo: si converte in ordine, in fattura o in scontrino.

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRightLeft, Ban, CheckCircle2, FileText, Loader2, Mail, MessageCircle, PackageCheck, Pencil, Plus, Receipt, Save, Search, Trash2, Truck, Undo2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { CercaArticolo } from "@/components/CercaArticolo";
import { PagaPos } from "@/components/PagaPos";
import { BadgeOperatore, SceltaOperatore, useOperatore } from "@/components/Operatore";
import { DecInput, parseDec } from "@/components/DecInput";
import { oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";
import {
  cassaGiornata, getDocumentoPdfUrl, docAcconto, docAnnulla, docAvvisa, docConverti, docCrea, docDettaglio, docElenco, docFase, docModifica, docRitira,
  fattAnagrafiche, fattCatalogo,
  type DocumentoCliente, type EsitoIncassoOrdine, type FaseOrdine, type FattAnagrafica, type FattVoceCatalogo, type RigaDoc,
  type TipoDocumento, type VistaOrdini,
} from "@/lib/api";
import { IncassoOrdine } from "./IncassoOrdine";

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const MOD: [string, string][] = [["contanti", "Contanti"], ["pos_sumup", "POS SumUp"], ["bonifico", "Bonifico"], ["paypal", "PayPal"], ["carta_stripe", "Carta online (Stripe)"]];
const MOD_L = Object.fromEntries(MOD);
const STATO: Record<string, string> = {
  aperto: "bg-amber-100 text-amber-800", in_lavorazione: "bg-sky-100 text-sky-800", saldato: "bg-emerald-100 text-emerald-800", convertito: "bg-sky-100 text-sky-800", annullato: "bg-muted text-muted-foreground",
};
// ordini cliente: fasi del percorso (da ordinare → ordinato → arrivato → ritirato)
const FASI: { k: FaseOrdine; l: string; quando: "created_at" | "ordinato_il" | "arrivato_il" | "ritirato_il" }[] = [
  { k: "da_ordinare", l: "Da ordinare", quando: "created_at" }, { k: "ordinato", l: "Ordinato", quando: "ordinato_il" },
  { k: "arrivato", l: "Arrivato", quando: "arrivato_il" }, { k: "ritirato", l: "Ritirato", quando: "ritirato_il" },
];
const FASE_STILE: Record<string, string> = {
  da_ordinare: "bg-amber-100 text-amber-800", ordinato: "bg-sky-100 text-sky-800", arrivato: "bg-violet-100 text-violet-800 ring-1 ring-violet-400",
  ritirato: "bg-emerald-100 text-emerald-800",
};
/** etichetta dell'ordine nell'elenco: completato / annullato / fase */
function statoOrdine(d: DocumentoCliente): { l: string; c: string } {
  if (d.stato === "annullato") return { l: "annullato", c: STATO.annullato };
  if (d.stato === "saldato" || d.stato === "convertito") return { l: "completato", c: "bg-emerald-100 text-emerald-800" };
  const f = FASI.find((x) => x.k === (d.fase || "da_ordinare"));
  return { l: (f?.l || "da ordinare").toLowerCase(), c: FASE_STILE[d.fase || "da_ordinare"] };
}
function statoPagamento(d: DocumentoCliente): { l: string; c: string } {
  if (d.residuo <= 0.005) return { l: "pagato", c: "bg-emerald-100 text-emerald-800" };
  if ((d.in_attesa || 0) > 0 && (d.da_certificare ?? d.residuo) <= 0.005) return { l: "fattura da incassare", c: "bg-amber-100 text-amber-800" };
  if (d.pagato > 0 || (d.in_attesa || 0) > 0) return { l: "acconto", c: "bg-sky-100 text-sky-800" };
  return { l: "da pagare", c: "bg-red-100 text-red-800" };
}
/** quanto resta da certificare con scontrino o fattura (residuo meno fatture già fatte e in attesa di pagamento) */
const daCert = (d: DocumentoCliente) => d.da_certificare ?? d.residuo;
const oraIt = (s?: string | null) => s ? new Date(s).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const dataIt = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
// chiave stabile per ogni riga dell'editor (con l'indice, togliendo una riga i campi «slittavano»)
let seqRiga = 0;
const chiaveRiga = () => `r${++seqRiga}`;
type RigaUI = RigaDoc & { _k: string };
const campo = "h-9 rounded-md border border-input bg-background px-2 text-sm";

const NOME: Record<TipoDocumento, string> = { ordine: "ordine cliente", preventivo: "preventivo", proforma: "fattura pro forma", ddt: "documento di trasporto" };
const TITOLO: Record<TipoDocumento, string> = { ordine: "Ordine cliente", preventivo: "Preventivo", proforma: "Fattura pro forma", ddt: "Documento di trasporto" };
type Bozza = { id?: string; tipo: TipoDocumento; cliente_nome: string; telefono: string; email: string; anagrafica_id: string | null;
  controparte: DocumentoCliente["controparte"]; rif: string; note: string; righe: (RigaDoc & { _k?: string })[] };
const bozzaVuota = (tipo: TipoDocumento): Bozza => ({ tipo, cliente_nome: "", telefono: "", email: "", anagrafica_id: null, controparte: {}, rif: "", note: "", righe: [] });

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
  const [operatore, setOperatore] = useOperatore();
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => fattAnagrafiche("genius", "cliente", q.trim(), 8).then((r) => setTrovati(r.anagrafiche || [])).catch(() => setTrovati([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const tot = b.righe.reduce((s, r) => s + r.quantita * r.prezzo_ivato * (1 - (r.sconto || 0) / 100), 0);
  const riga = (i: number, p: Partial<RigaDoc>) => setB({ ...b, righe: b.righe.map((r, j) => (j === i ? { ...r, ...p } : r)) });

  async function salva() {
    if (busy) return;
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    if (!b.cliente_nome.trim()) { toast.error("Scrivi il nome del cliente"); return; }
    const righe = b.righe.filter((r) => r.descrizione.trim()).map(({ _k, ...r }) => { void _k; return r; });
    if (!righe.length) { toast.error("Aggiungi almeno una riga"); return; }
    if (righe.some((r) => !(r.quantita > 0))) { toast.error("Ogni riga deve avere una quantità maggiore di zero"); return; }
    setBusy(true);
    try {
      const corpo = { tipo: b.tipo, cliente_nome: b.cliente_nome.trim(), telefono: b.telefono, email: b.email, anagrafica_id: b.anagrafica_id,
        controparte: b.controparte, rif: b.rif, note: b.note, righe, operatore };
      onSalvato(b.id ? await docModifica(b.id, corpo) : await docCrea(corpo));
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={chiudi}>
      <div className="h-full w-full max-w-3xl space-y-3 overflow-y-auto bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{b.id ? "Modifica" : "Nuovo"} {NOME[b.tipo]}</h2>
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
          {b.anagrafica_id ? <div className="text-xs text-emerald-700">✓ collegato all&apos;anagrafica (dati pronti per la fattura)</div>
            : (b.tipo === "ordine" || b.tipo === "preventivo") && <div className="text-xs text-muted-foreground">Al salvataggio il cliente va in rubrica: se c&apos;è già (stesso telefono, email o nome) si collega la sua scheda, senza doppioni.</div>}
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
        <SceltaOperatore value={operatore} onChange={setOperatore} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={chiudi}>Annulla</Button>
          <Button onClick={salva} disabled={busy || !operatore}>{busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}{!b.id && b.tipo === "ordine" ? "Salva e vai al pagamento" : "Salva"}</Button>
        </div>
      </div>
    </div>
  );
}

/** «Ordinato al fornitore»: DA CHI? Ricerca nella rubrica fornitori oppure testo libero. */
function SceltaFornitore({ iniziale, titolo, busy, onConferma, onChiudi }: {
  iniziale?: string | null; titolo: string; busy: boolean;
  onConferma: (f: { fornitore_id?: string | null; fornitore_nome: string }) => void; onChiudi: () => void;
}) {
  const [q, setQ] = useState(iniziale || "");
  const [trovati, setTrovati] = useState<FattAnagrafica[]>([]);
  const [scelto, setScelto] = useState<FattAnagrafica | null>(null);
  useEffect(() => {
    if (scelto || q.trim().length < 2) return;
    const t = setTimeout(() => fattAnagrafiche("genius", "fornitore", q.trim(), 8).then((r) => setTrovati(r.anagrafiche || [])).catch(() => setTrovati([])), 250);
    return () => clearTimeout(t);
  }, [q, scelto]);
  const nome = (scelto?.denominazione || q).trim();
  return (
    <Card className="space-y-2 border-2 border-sky-400 bg-sky-50/50 p-3 dark:bg-sky-950/20">
      <div className="flex items-center justify-between"><div className="font-semibold"><Truck className="mr-1 inline size-4" />{titolo}</div>
        <Button size="icon" variant="ghost" onClick={onChiudi}><X className="size-4" /></Button></div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
        <Input autoFocus className="pl-8" placeholder="Cerca il fornitore in rubrica… oppure scrivi il nome" value={q}
          onChange={(e) => { setQ(e.target.value); setScelto(null); }} />
        {trovati.length > 0 && !scelto && q.trim().length >= 2 && (
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-sm shadow">
            {trovati.map((a) => (
              <button key={a.id} type="button" className="block w-full px-2 py-1.5 text-left hover:bg-muted" onClick={() => { setScelto(a); setQ(a.denominazione || ""); setTrovati([]); }}>
                {a.denominazione} <span className="text-xs text-muted-foreground">{a.piva ? `P.IVA ${a.piva}` : a.cf || ""} {a.comune || ""}</span></button>
            ))}
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{scelto ? `✓ dalla rubrica fornitori${scelto.piva ? ` (P.IVA ${scelto.piva})` : ""}` : nome ? "Non scelto dalla rubrica: si salva il nome scritto" : "Scegli dalla rubrica o scrivi il nome"}</div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onChiudi}>Annulla</Button>
        <Button disabled={busy || !nome} onClick={() => onConferma(scelto ? { fornitore_id: scelto.id, fornitore_nome: nome } : { fornitore_id: null, fornitore_nome: nome })}>
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Truck className="mr-1 size-4" />}Conferma</Button>
      </div>
    </Card>
  );
}

/** Avviso «ordine arrivato» al cliente: email (parte dal gestionale) o WhatsApp (si apre col messaggio già scritto). */
async function avvisaCliente(d: DocumentoCliente, canale: "email" | "whatsapp", operatore: string | null): Promise<DocumentoCliente | null> {
  if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return null; }
  if (canale === "email") {
    if (!d.email) { toast.error("Manca l'email del cliente: aggiungila con «Modifica»"); return null; }
    if (!confirm(`Inviare l'email di avviso a ${d.email}?`)) return null;
  } else {
    if (!d.whatsapp_link) { toast.error("Manca un cellulare valido del cliente: aggiungilo con «Modifica»"); return null; }
    window.open(d.whatsapp_link, "_blank", "noopener");
  }
  try {
    const r = await docAvvisa(d.id, canale, operatore);
    toast.success(canale === "email" ? `Email inviata a ${d.email}` : "Avviso WhatsApp registrato (premi Invia in WhatsApp)");
    return r;
  } catch (e) { toastErrore(e); return null; }
}

function Dettaglio({ id, proponiIncasso = false, onChiudi, onCambiato, onModifica }: {
  id: string; proponiIncasso?: boolean; onChiudi: () => void; onCambiato: () => void; onModifica: (d: DocumentoCliente) => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<DocumentoCliente | null>(null);
  const [errore, setErrore] = useState("");
  const [azione, setAzione] = useState<"" | "acconto" | "scontrino" | "fattura">("");
  const [f, setF] = useState({ importo: "", modalita: "contanti", certificato: "scontrino" as "scontrino" | "fattura", numero: "", pagata: false });
  const [busy, setBusy] = useState(false);
  const [operatore, setOperatore] = useOperatore();
  const [cassaOggiChiusa, setCassaOggiChiusa] = useState(false);
  // ordine cliente: pannello di incasso (acconto / intero / saldo al ritiro) e proposta subito dopo il salvataggio
  const [incasso, setIncasso] = useState<{ modo: "acconto" | "intero"; titolo?: string; poiRitira?: boolean } | null>(null);
  const [proposta, setProposta] = useState(proponiIncasso);
  const [fornitore, setFornitore] = useState<"" | "ordinato" | "cambia">("");
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

  /** azione semplice sull'ordine (fase, avviso, ritiro) con operatore obbligatorio */
  async function sullOrdine(fn: (op: string) => Promise<DocumentoCliente>, ok: string) {
    if (busy) return;
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    setBusy(true);
    try { setD(await fn(operatore)); toast.success(ok); onCambiato(); } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  /** dopo la bozza di fattura (acconto o saldo): al ritiro l'ordine risulta ritirato, poi si apre la fattura da pagare */
  async function dopoIncasso(r: EsitoIncassoOrdine, poiRitira?: boolean) {
    setIncasso(null); setProposta(false); onCambiato();
    if (poiRitira && daCert(r) <= 0.005 && operatore) {
      try { setD(await docRitira(r.id, operatore)); toast.success("Ordine ritirato: si chiude quando la fattura risulta pagata"); onCambiato(); } catch (e) { toastErrore(e); carica(); }
    } else carica();
    if (r.fattura?.id) { toast.info("Apro la fattura: registra il pagamento, controlla il cliente ed emettila"); router.push(`/fatturazione?id=${r.fattura.id}`); }
  }

  function ritiro() {
    if (!d) return;
    if (daCert(d) > 0.005) {
      setProposta(false);
      setIncasso({ modo: "intero", titolo: `Ritiro: prima il saldo di ${eur(daCert(d))}`, poiRitira: true });
      return;
    }
    const attesa = d.residuo > 0.005;
    if (confirm(attesa
      ? `Il cliente ritira ${d.sigla}? Gli articoli escono dalla giacenza; l'ordine resta aperto finché la fattura (${eur(d.residuo)}) non risulta pagata.`
      : `Il cliente ritira ${d.sigla}? L'ordine va tra i COMPLETATI e gli articoli di magazzino escono dalla giacenza.`))
      sullOrdine((op) => docRitira(d.id, op), attesa ? "Ordine ritirato: resta da incassare la fattura" : "Ordine ritirato e COMPLETATO");
  }

  async function avvisa(canale: "email" | "whatsapp") {
    if (!d || busy) return;
    setBusy(true);
    try { const r = await avvisaCliente(d, canale, operatore); if (r) { setD(r); onCambiato(); } } finally { setBusy(false); }
  }

  /** modForzata = «pos_sumup» quando il cliente ha appena pagato sul POS SumUp (la fattura nasce già pagata). */
  function conferma(modForzata?: string) {
    if (!d) return;
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    const mod = modForzata || f.modalita;
    // POS e PayPal passano SOLO dalla verifica automatica (pulsanti qui sotto): niente conferma «sulla parola»
    if (!modForzata && (mod === "pos_sumup" || mod === "paypal") && azione !== "fattura") {
      toast.error("Con POS o PayPal usa i pulsanti di pagamento qui sotto: l'incasso si registra quando SumUp/PayPal lo confermano");
      return;
    }
    if (!modForzata && (mod === "pos_sumup" || mod === "paypal") && azione === "fattura" && f.pagata) {
      toast.error("Fattura «già pagata» con POS/PayPal: usa i pulsanti di pagamento qui sotto (verifica automatica)");
      return;
    }
    if (azione === "acconto") {
      const imp = parseDec(f.importo);
      if (imp === null || Number.isNaN(imp) || imp <= 0) { toast.error("Scrivi l'importo dell'acconto (es. 50 o 12,50)"); return; }
      if (imp > d.residuo + 0.001) { toast.error(`L'acconto supera quanto resta da pagare (${eur(d.residuo)})`); return; }
      if (f.certificato === "scontrino" && !f.numero.trim()) { toast.error("Scrivi il numero dello scontrino battuto in cassa"); return; }
      esegui(() => docAcconto(d.id, { importo: imp, modalita: mod, certificato: f.certificato, scontrino_numero: f.numero.trim(), operatore }), "Acconto registrato: è nella cassa di oggi");
    } else if (azione === "scontrino") {
      if (!f.numero.trim()) { toast.error("Scrivi il numero dello scontrino battuto in cassa"); return; }
      esegui(() => docConverti(d.id, { a: "scontrino", modalita: mod, scontrino_numero: f.numero.trim(), operatore }), "Scontrino registrato nella cassa di oggi");
    } else {
      esegui(() => docConverti(d.id, { a: "fattura", modalita: mod, pagata: modForzata ? true : f.pagata, operatore }), "Fattura creata in bozza");
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
            <h2 className="text-lg font-semibold">{TITOLO[d.tipo]} {d.sigla}</h2>
            <div className="text-sm text-muted-foreground">{dataIt(d.data)}{d.operatore ? <> · fatto da <BadgeOperatore op={d.operatore} /></> : ""} · {d.cliente_nome || d.controparte?.denominazione}{d.telefono ? ` · ${d.telefono}` : ""}{d.rif ? ` · ${d.rif}` : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            {d.tipo === "ordine"
              ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statoOrdine(d).c}`}>{statoOrdine(d).l.toUpperCase()}</span>
              : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATO[d.stato]}`}>{d.stato.toUpperCase()}</span>}
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
              {(d.in_attesa || 0) > 0 && <div className="flex justify-between text-amber-700 dark:text-amber-300"><span>Fatture fatte, da incassare</span><span>{eur(d.in_attesa)}</span></div>}
              <div className="flex justify-between text-base font-bold"><span>Resta da pagare</span><span>{eur(d.residuo)}</span></div>
            </>}
          </div>
        </Card>
        {!!d.pagamenti?.length && (
          <Card className="space-y-1 p-3 text-sm">
            <div className="font-medium">Pagamenti</div>
            {d.pagamenti.map((p) => (
              <div key={p.id} className="flex flex-wrap justify-between gap-2">
                <span>{dataIt(p.data)} · {p.tipo === "acconto" ? "Acconto" : "Saldo"}{p.in_attesa ? "" : ` · ${MOD_L[p.modalita] || p.modalita}`}</span>
                <span>{p.certificato === "scontrino"
                  ? (p.scontrino_numero ? `scontrino n. ${p.scontrino_numero}` : <span className={p.scontrino_stato === "errore" ? "text-red-600" : "text-muted-foreground"}>
                    scontrino al registratore{p.scontrino_stato ? ` (${p.scontrino_stato.replace("_", " ")})` : ""}{p.scontrino_errore ? `: ${p.scontrino_errore}` : ""}</span>)
                  : <a className={p.in_attesa ? "font-medium text-amber-700 underline dark:text-amber-300" : "text-primary underline"} href={`/fatturazione?id=${p.fattura_id}`}>
                    {p.fattura_tipo === "TD02" ? "fattura d'acconto" : "fattura"}{p.fattura_numero ? ` n. ${p.fattura_numero}` : " (bozza)"}{p.in_attesa ? " — da incassare: apri e registra il pagamento" : ""}</a>}{p.operatore ? <BadgeOperatore op={p.operatore} className="ml-1" /> : null} · <b>{eur(p.importo)}</b></span>
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
        {d.tipo === "proforma" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button size="sm" variant="outline" onClick={() => window.open(getDocumentoPdfUrl(d.id), "_blank")}><FileText className="mr-1 size-4" />PDF del pro forma</Button>
            {d.session_id && <a className="text-primary underline" href={`/sessioni/${d.session_id}`}>apri la sessione di taratura</a>}
          </div>
        )}
        {d.tipo === "proforma" && (
          // il pro forma si vede com'è: lo stesso PDF che riceve il cliente (layout della fattura)
          <iframe key={`${d.id}-${d.totale}`} src={`${getDocumentoPdfUrl(d.id).split("?")[0]}?v=${d.totale}`} title={`Pro forma ${d.sigla || ""}`} className="h-[70vh] w-full rounded border bg-white" />
        )}

        {d.tipo === "ordine" && (() => {
          const fase = d.fase || (d.stato === "saldato" ? "ritirato" : "da_ordinare");
          const iFase = FASI.findIndex((x) => x.k === fase);
          const sp = statoPagamento(d);
          return (
            <Card className="space-y-3 p-3">
              {/* fasi dell'ordine con data e ora */}
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {FASI.map((x, i) => (
                  <div key={x.k} className="flex items-center gap-1">
                    {i > 0 && <span className={i <= iFase ? "text-primary" : "text-muted-foreground"}>→</span>}
                    <span className={`rounded-full px-2 py-1 ${i <= iFase && d.stato !== "annullato" ? FASE_STILE[x.k] + " font-semibold" : "bg-muted text-muted-foreground"}`}>
                      {x.l}{i <= iFase && d[x.quando] ? ` · ${oraIt(d[x.quando] as string)}` : ""}</span>
                  </div>
                ))}
                {d.stato === "annullato" && <span className="ml-2 rounded-full bg-muted px-2 py-1 font-semibold">ANNULLATO</span>}
              </div>
              {(d.fornitore_nome || fase !== "da_ordinare") && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Truck className="size-4 text-muted-foreground" />Fornitore: <b>{d.fornitore_nome || "non indicato"}</b>
                  {aperto && fase !== "ritirato" && <Button size="xs" variant="ghost" onClick={() => setFornitore("cambia")}><Pencil className="mr-1 size-3" />{d.fornitore_nome ? "Cambia" : "Indica"}</Button>}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${sp.c}`}>{sp.l}</span>
                <span>Totale <b>{eur(d.totale)}</b></span><span>Pagato <b>{eur(d.pagato)}</b></span>
                <span className={d.residuo > 0.005 ? "text-red-700 dark:text-red-300" : ""}>Resta <b>{eur(d.residuo)}</b></span>
              </div>
              {!!d.avvisi?.length && (
                <div className="text-xs text-muted-foreground">
                  {d.avvisi.map((a, i) => <div key={i}>📣 Cliente avvisato via {a.canale === "email" ? "email" : "WhatsApp"} il {oraIt(a.il)} ({a.destinatario}){a.operatore ? ` · ${a.operatore}` : ""}</div>)}
                </div>
              )}
            </Card>
          );
        })()}

        {aperto && <SceltaOperatore value={operatore} onChange={setOperatore} compatto />}

        {aperto && d.tipo === "ordine" && proposta && !incasso && daCert(d) > 0.005 && (
          <Card className="space-y-2 border-2 border-emerald-400 bg-emerald-50/60 p-3 dark:bg-emerald-950/20">
            <div className="font-semibold">✅ {d.sigla} salvato. Il cliente paga adesso?</div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { setProposta(false); setIncasso({ modo: "acconto" }); }}><Wallet className="mr-1 size-4" />Acconto</Button>
              <Button onClick={() => { setProposta(false); setIncasso({ modo: "intero" }); }}><Wallet className="mr-1 size-4" />Pagamento totale {eur(daCert(d))}</Button>
              <Button variant="outline" onClick={() => setProposta(false)}>Più tardi (resta da pagare)</Button>
            </div>
          </Card>
        )}

        {aperto && d.tipo === "ordine" && incasso && (
          <IncassoOrdine key={`${incasso.modo}-${incasso.poiRitira ? 1 : 0}`} d={d} operatore={operatore} modo={incasso.modo} titolo={incasso.titolo} poiRitira={incasso.poiRitira}
            onChiudi={() => setIncasso(null)} onFatto={(r) => dopoIncasso(r, incasso.poiRitira)} />
        )}

        {aperto && d.tipo === "ordine" && fornitore && (
          <SceltaFornitore titolo={fornitore === "ordinato" ? "Ordinato al fornitore: da chi?" : "Fornitore dell'ordine"} iniziale={d.fornitore_nome} busy={busy}
            onChiudi={() => setFornitore("")}
            onConferma={(fo) => { const cosa = fornitore; setFornitore("");
              sullOrdine((op) => cosa === "ordinato" ? docFase(d.id, "ordinato", op, fo) : docModifica(d.id, { ...fo, operatore: op }),
                cosa === "ordinato" ? `Ordinato a ${fo.fornitore_nome}` : `Fornitore: ${fo.fornitore_nome}`); }} />
        )}

        {aperto && d.tipo === "ordine" && !incasso && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {daCert(d) > 0.005 && <Button variant="outline" onClick={() => { setProposta(false); setIncasso({ modo: d.pagato ? "intero" : "acconto" }); }}>
                <Wallet className="mr-1 size-4" />Registra pagamento</Button>}
              {(d.fase || "da_ordinare") === "da_ordinare" && <Button variant="outline" disabled={busy} onClick={() => setFornitore("ordinato")}>
                <Truck className="mr-1 size-4" />Ordinato al fornitore</Button>}
              {d.fase !== "arrivato" && d.fase !== "ritirato" && <Button className="bg-violet-600 text-white hover:bg-violet-700" disabled={busy}
                onClick={() => sullOrdine((op) => docFase(d.id, "arrivato", op), "Prodotto arrivato: ora avvisa il cliente")}><PackageCheck className="mr-1 size-4" />Prodotto arrivato</Button>}
              {d.fase === "arrivato" && <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy} onClick={ritiro}>
                <CheckCircle2 className="mr-1 size-4" />Ritirato{daCert(d) > 0.005 ? ` (saldo ${eur(daCert(d))})` : ""}</Button>}
            </div>
            {d.fase === "ritirato" && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                Ritirato il {oraIt(d.ritirato_il)}: l&apos;ordine si chiude da solo quando la fattura risulta pagata in Fatturazione.
              </div>
            )}
            {d.fase === "arrivato" && (() => {
              const daAvvisare = !d.avvisi?.length;
              return (
                <div className={`space-y-2 rounded-md p-3 ${daAvvisare ? "border-2 border-violet-500 bg-violet-50 shadow dark:bg-violet-950/30" : "border border-violet-300 bg-violet-50/60 dark:bg-violet-950/20"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={daAvvisare ? "text-base font-semibold" : "text-sm font-medium"}>{daAvvisare ? "📣 Prodotto arrivato: avvisa subito il cliente" : "Avvisa di nuovo il cliente:"}</span>
                    <Button size="xs" variant="ghost" className="ml-auto" disabled={busy} title="Era un errore: torna a «ordinato»"
                      onClick={() => sullOrdine((op) => docFase(d.id, "ordinato", op), "Tornato a «ordinato»")}><Undo2 className="mr-1 size-3" />Non è arrivato</Button>
                  </div>
                  {d.messaggio_arrivo && <div className="rounded border bg-background p-2 text-sm">«{d.messaggio_arrivo}»</div>}
                  <div className="flex flex-wrap gap-2">
                    <Button size={daAvvisare ? "default" : "sm"} variant="outline" disabled={busy || !d.email} title={d.email ? `Invia a ${d.email}` : "Manca l'email del cliente"}
                      onClick={() => avvisa("email")}><Mail className="mr-1 size-4" />Email{d.email ? ` a ${d.email}` : " (manca l'email)"}</Button>
                    <Button size={daAvvisare ? "default" : "sm"} variant="outline" className="border-green-500 text-green-800 dark:text-green-300" disabled={busy || !d.whatsapp_link}
                      title={d.whatsapp_link ? "Apre WhatsApp col messaggio già scritto" : "Manca un cellulare valido"} onClick={() => avvisa("whatsapp")}>
                      <MessageCircle className="mr-1 size-4" />WhatsApp{d.whatsapp_link ? "" : " (manca il cellulare)"}</Button>
                  </div>
                </div>
              );
            })()}
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => onModifica(d)}><Pencil className="mr-1 size-4" />Modifica</Button>
              {!d.pagato && <Button variant="ghost" className="text-red-600" disabled={busy} onClick={() => confirm(`Annullare ${d.sigla}?`) && esegui(() => docAnnulla(d.id), "Annullato")}><Ban className="mr-1 size-4" />Annulla ordine</Button>}
            </div>
          </div>
        )}

        {aperto && d.tipo !== "ordine" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => apri("scontrino")}><Receipt className="mr-1 size-4" />Converti in scontrino</Button>
            <Button variant="outline" onClick={() => apri("fattura")}><FileText className="mr-1 size-4" />Converti in fattura</Button>
            {(d.tipo === "preventivo" || d.tipo === "proforma") && <Button variant="outline" disabled={busy || !operatore} onClick={() => esegui(async () => {
              const r = await docConverti(d.id, { a: "ordine", operatore }); if (r.ordine) toast.success(`Creato ${r.ordine.sigla}`); return r;
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
              <Button disabled={busy || !operatore} onClick={() => conferma()}>{busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}Conferma</Button>
              <Button variant="ghost" onClick={() => setAzione("")}>Chiudi</Button>
            </div>
            {(() => {
              // incasso col POS SumUp: l'importo va sul terminale scelto, a pagamento riuscito si registra con «POS SumUp»
              const imp = azione === "acconto" ? (parseDec(f.importo) ?? 0) : d.residuo;
              const serveNumero = (azione === "acconto" && f.certificato === "scontrino") || azione === "scontrino";
              const ok = imp > 0 && !Number.isNaN(imp) && imp <= d.residuo + 0.001 && (!serveNumero || !!f.numero.trim());
              return (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50/50 p-2 dark:bg-sky-950/20">
                  <span className="text-xs text-muted-foreground">oppure incassa con POS / PayPal (si registra da solo a pagamento verificato){serveNumero && !f.numero.trim() ? " — prima scrivi il n. scontrino" : ""}:</span>
                  <PagaPos importo={ok ? imp : 0} descrizione={`${azione === "acconto" ? "Acconto" : "Saldo"} ${d.sigla || ""}`.trim()}
                    rifTipo={`documento_${azione}`} rifId={d.id} disabled={busy || !ok || !operatore} generico paypal
                    onPagato={(p) => conferma(p.metodo === "paypal" ? "paypal" : "pos_sumup")} />
                </div>
              );
            })()}
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

// soloTipo: pagina dedicata a un solo tipo (es. /proforma), senza le schede degli altri documenti
export function PaginaDocumenti({ soloTipo }: { soloTipo?: TipoDocumento } = {}) {
  const router = useRouter();
  const sp = useSearchParams();
  const base = soloTipo === "proforma" ? "/proforma" : "/ordini";
  const [tipo, setTipo] = useState<TipoDocumento>(soloTipo || "ordine");
  const [stato, setStato] = useState("aperto");
  // ordini cliente: schede Aperti · Arrivati da ritirare · Completati · Annullati · Tutti
  const [vista, setVista] = useState<VistaOrdini>("aperti");
  const [nArrivati, setNArrivati] = useState<number | null>(null);
  const [nuovoId, setNuovoId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<DocumentoCliente[] | null>(null);
  const [errore, setErrore] = useState("");
  const [listino, setListino] = useState<FattVoceCatalogo[]>([]);
  const [editor, setEditor] = useState<Bozza | null>(null);
  const [operatore] = useOperatore();
  const [avvisando, setAvvisando] = useState("");
  async function avvisaDaElenco(d: DocumentoCliente, canale: "email" | "whatsapp") {
    if (avvisando) return;
    setAvvisando(d.id);
    try { if (await avvisaCliente(d, canale, operatore)) carica(); } finally { setAvvisando(""); }
  }
  // si apre da link: /ordini?id=<documento> (letto con useSearchParams: niente differenze server/client)
  const [apertoLocale, setAperto] = useState<string | null>(null);
  const idLink = sp.get("id");
  const aperto = apertoLocale ?? idLink;
  const chiudiDettaglio = () => { setAperto(null); if (idLink) router.replace(base); };

  const carica = useCallback(() => {
    const ordini = tipo === "ordine";
    docElenco(tipo, ordini ? "" : stato, q, ordini && vista !== "tutti" ? vista : "").then((r) => { setLista(r); setErrore(""); })
      .catch((e: Error) => { setErrore(e.message); setLista([]); });
    if (ordini) docElenco("ordine", "", "", "arrivati").then((r) => setNArrivati(r.length)).catch(() => undefined);
  }, [tipo, stato, q, vista]);
  useEffect(() => { const t = setTimeout(carica, 200); return () => clearTimeout(t); }, [carica]);
  useEffect(() => { fattCatalogo("genius").then((r) => setListino(r.voci || [])).catch(() => undefined); }, []);

  return (
    <div className="space-y-4 p-1 md:p-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-semibold">{soloTipo === "proforma" ? "Pro forma" : "Ordini e preventivi"}</h1>
        <Button className="ml-auto" onClick={() => setEditor(bozzaVuota(tipo))}><Plus className="mr-1 size-4" />Nuovo {NOME[tipo]}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b">
        {(soloTipo ? [] : [["ordine", "Ordini cliente"], ["preventivo", "Preventivi"], ["proforma", "Pro forma"], ["ddt", "DDT"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setTipo(k); setLista(null); }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tipo === k ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>{l}</button>
        ))}
        {tipo !== "ordine" && <select className={`${campo} ml-auto h-8`} value={stato} onChange={(e) => setStato(e.target.value)}>
          <option value="aperto">Aperti</option><option value="saldato">Saldati</option><option value="convertito">Convertiti</option><option value="annullato">Annullati</option><option value="">Tutti</option>
        </select>}
        {tipo === "ordine" && <span className="ml-auto" />}
        <Input className="h-8 w-56" placeholder="Cerca cliente, scheda, telefono…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {tipo === "ordine" && (
        <div className="flex flex-wrap gap-2">
          {([["aperti", "Aperti (da ordinare / ordinati)"], ["arrivati", "Arrivati da ritirare"], ["completati", "Completati"], ["annullati", "Annullati"], ["tutti", "Tutti"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setVista(k); setLista(null); }}
              className={`rounded-full border px-3 py-1 text-sm ${vista === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {l}{k === "arrivati" && nArrivati ? <span className="ml-1 rounded-full bg-violet-600 px-1.5 text-xs text-white">{nArrivati}</span> : null}</button>
          ))}
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Numero</th><th className="text-left">Data</th><th className="text-left">Cliente</th><th className="text-left">Rif.</th>{tipo === "ordine" && <th className="text-left">Fornitore</th>}
              <th className="text-right">Totale</th>{tipo === "ordine" && <><th className="text-right">Pagato</th><th className="px-3 text-right">Resta</th></>}<th className="px-3 text-left">Stato</th><th className="px-3 text-left" title="Operatore">Op.</th></tr>
          </thead>
          <tbody>
            {lista === null && <tr><td colSpan={10} className="p-4 text-center"><Loader2 className="inline size-4 animate-spin" /></td></tr>}
            {errore && <tr><td colSpan={10} className="p-4 text-center text-red-700">Non riesco a caricare l&apos;elenco: {errore}{" "}
              <Button size="xs" variant="outline" onClick={() => { setErrore(""); setLista(null); carica(); }}>Riprova</Button></td></tr>}
            {!errore && lista?.length === 0 && <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">Nessun documento: {NOME[tipo]}</td></tr>}
            {lista?.map((d) => (
              <tr key={d.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setAperto(d.id)}>
                <td className="px-3 py-2 font-medium">{d.sigla}</td><td>{dataIt(d.data)}</td><td>{d.cliente}</td><td className="text-muted-foreground">{d.rif}</td>
                {tipo === "ordine" && <td className="text-muted-foreground">{d.fornitore_nome || ""}</td>}
                <td className="text-right tabular-nums">{eur(d.totale)}</td>
                {tipo === "ordine" && <><td className="text-right tabular-nums">{d.pagato ? eur(d.pagato) : "—"}</td><td className="px-3 text-right font-semibold tabular-nums">{eur(d.residuo)}</td></>}
                <td className="px-3">{tipo === "ordine" ? <span className="flex flex-wrap gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statoOrdine(d).c}`}>{statoOrdine(d).l}</span>
                  {d.stato !== "annullato" && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statoPagamento(d).c}`}>{statoPagamento(d).l}</span>}
                  {d.stato === "aperto" && d.fase === "arrivato" && !d.avvisi?.length && (
                    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white">da avvisare</span>
                      <Button size="xs" variant="outline" disabled={!!avvisando || !d.email} title={d.email ? `Email a ${d.email}` : "Manca l'email"}
                        onClick={() => avvisaDaElenco(d, "email")}><Mail className="size-3" />Email</Button>
                      <Button size="xs" variant="outline" className="border-green-500 text-green-800 dark:text-green-300" disabled={!!avvisando || !d.whatsapp_link}
                        title={d.whatsapp_link ? (d.messaggio_arrivo || "WhatsApp") : "Manca un cellulare valido"} onClick={() => avvisaDaElenco(d, "whatsapp")}>
                        <MessageCircle className="size-3" />WhatsApp</Button>
                    </span>
                  )}</span>
                  : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATO[d.stato]}`}>{d.stato}</span>}</td>
                <td className="px-3"><BadgeOperatore op={d.operatore} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {editor && <Editor iniziale={editor} listino={listino} onChiudi={() => setEditor(null)}
        onSalvato={(d) => {
          // ordine nuovo: appena salvato si propone subito il pagamento (acconto / intero / più tardi)
          const nuovo = !editor.id && d.tipo === "ordine";
          setEditor(null); carica(); setNuovoId(nuovo ? d.id : null); setAperto(d.id); toast.success(`${d.sigla} salvato`);
          if (d.anagrafica_id && !editor.anagrafica_id) toast.info("Cliente collegato alla rubrica");
        }} />}
      {aperto && <Dettaglio key={aperto} id={aperto} proponiIncasso={aperto === nuovoId} onChiudi={() => { setNuovoId(null); chiudiDettaglio(); }} onCambiato={carica}
        onModifica={(d) => { chiudiDettaglio(); setEditor({ id: d.id, tipo: d.tipo, cliente_nome: d.cliente_nome || "", telefono: d.telefono || "", email: d.email || "",
          anagrafica_id: d.anagrafica_id, controparte: d.controparte || {}, rif: d.rif || "", note: d.note || "", righe: d.righe }); }} />}
    </div>
  );
}
