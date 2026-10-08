"use client";

// CASSA del negozio (GENIUS LAB): scanner → carrello → scontrino al registratore oppure fattura.
// La giacenza scende da sola. Lo scontrino lo emette la cassa tramite l'agente del negozio.
// /cassa?sessione=<id>: «Converti in scontrino» dalla sessione di taratura (il cliente non vuole la fattura):
// carrello precompilato con le righe del pro forma (o della sessione), stessi importi IVA inclusa.
// /cassa?ordine=<id>&importo=<x>&tipo=acconto|saldo[&ritiro=1]: incasso di un ORDINE cliente. Carrello pronto (pagamento
// totale al primo incasso: gli articoli dell'ordine; altrimenti una riga «Acconto/Saldo ordine n. X/AAAA: articoli»).
// L'operatore incassa come sempre; lo scontrino si collega all'ordine e si torna all'ordine (con ritiro=1 lo segna ritirato).
// /cassa?scheda=<id>: «Vendi / incassa» da una SCHEDA DI ASSISTENZA Apple: carrello con le righe della scheda; lo scontrino
// (o la fattura) si collega alla scheda e si torna alla scheda (02/10/2026).
// /cassa?riemetti=1 (o dal pulsante Storno): «Annulla tutto e riemetti» (08/10/2026) — lo scontrino sbagliato si annulla e il
// carrello riparte con gli articoli che restano al cliente; il nuovo scontrino parte SOLO quando l'annullo risulta emesso.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Landmark, Loader2, Minus, Plus, Receipt, RotateCcw, ScanBarcode, Search, ShoppingCart, Trash2, Undo2, Wallet, X } from "lucide-react";
import { CHIAVE_RIEMISSIONE, StornoDialog, type Riemissione } from "@/components/StornoDialog";
import { AnnullaEFattura } from "@/components/AnnullaEFattura";
import { Incassa, NOMI_MODALITA } from "@/components/Incassa";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BadgeOperatore, SceltaOperatore, useOperatore } from "@/components/Operatore";
import { SpedisciDocumento } from "@/components/SpedisciDocumento";
import { BadgeAttivita, FiltroAttivita, SceltaAttivita, useAttivita, type Attivita } from "@/components/attivita";
import { SceltaPezzo, rigaDaPezzo } from "@/components/SceltaPezzo";
import { toast } from "sonner";
import { ScannerInput } from "@/components/ScannerInput";
import { AggiornaPrezzoMagazzino, prezzoDiversoDaMagazzino } from "@/components/AggiornaPrezzoMagazzino";
import { DecInput, parseDec } from "@/components/DecInput";
import { oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";
import Link from "next/link";
import { ivaMargine } from "@/app/fatturazione/util";
import {
  fetchAPI, cassaAnnulla, cassaGiornata, cassaRecupero, docDettaglio, docRitira, cassaFattura, cassaRiprova, cassaScontrini, cassaScontrino, magPerCodice, magProdotti, proformaSessioneStato,
  type PagamentoScontrino, type Prodotto, type RigaCassa, type Scontrino, PLU_RT_NOMI,
} from "@/lib/api";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const MOD: Record<string, string> = { ...NOMI_MODALITA, pos_sumup: "POS SumUp" };
const STATO: Record<string, string> = {
  da_stampare: "in coda", in_stampa: "in stampa", emesso: "emesso", errore: "ERRORE", simulato: "simulato (non fiscale)", annullato: "annullato",
};

export default function CassaPage() {
  const router = useRouter();
  // prezzo_magazzino: prezzo dell'articolo quando è entrato nel carrello (per «Aggiorna anche il prezzo in magazzino», 08/10/2026)
  const [carrello, setCarrello] = useState<(RigaCassa & { giacenza?: number; prezzo_magazzino?: number })[]>([]);
  const [q, setQ] = useState("");
  const [trovati, setTrovati] = useState<Prodotto[]>([]);
  const [operatore, setOperatore] = useOperatore();
  // attività dello scontrino: quella del selettore in alto, cambiabile qui (sessione = tarature, ordine = quella dell'ordine)
  const { attivita: attSelettore } = useAttivita();
  const [attScelta, setAttScelta] = useState<Attivita | null>(null);
  const att: Attivita = attScelta || attSelettore;
  const [filtroAtt, setFiltroAtt] = useState("");
  const [busy, setBusy] = useState("");
  const [oggi, setOggi] = useState<{ scontrini: Scontrino[]; totale: number; per_modalita: Record<string, number> } | null>(null);
  const [libera, setLibera] = useState({ descrizione: "", prezzo: "" });
  const [cassaChiusa, setCassaChiusa] = useState(false);
  // elenco scontrini: di oggi (default) o di un giorno passato, per fare reso/annullo di quelli già emessi
  const [giornoLista, setGiornoLista] = useState(oggiRoma);
  const [storno, setStorno] = useState<Scontrino | null>(null);
  const [recupero, setRecupero] = useState<Scontrino | null>(null);
  // «Annulla tutto e riemetti»: annullo in coda + carrello con quello che resta; si emette solo ad annullo fatto
  const [riemissione, setRiemissione] = useState<Riemissione | null>(null);
  const [statoAnnullo, setStatoAnnullo] = useState<{ stato: string; errore: string | null } | null>(null);
  const avviaRiemissione = useCallback((r: Riemissione) => {
    setCarrello(r.righe.map((x) => ({ prodotto_id: x.prodotto_id ?? null, pezzo_id: x.pezzo_id ?? null, descrizione: x.descrizione, quantita: Number(x.quantita),
      prezzo: Number(x.prezzo), aliquota: Number(x.aliquota ?? 22), sconto: Number(x.sconto || 0), regime: x.regime ?? null, natura: x.natura ?? null,
      costo_acquisto: x.costo_acquisto ?? null, plu_rt: x.plu_rt ?? null })));
    setRiemissione(r); setStatoAnnullo(null);
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("riemetti") !== "1") return;
    try {
      const r = sessionStorage.getItem(CHIAVE_RIEMISSIONE);
      sessionStorage.removeItem(CHIAVE_RIEMISSIONE);
      if (r) avviaRiemissione(JSON.parse(r) as Riemissione);
    } catch { /* noop */ }
  }, [avviaRiemissione]);
  useEffect(() => {
    if (!riemissione) return;
    let vivo = true;
    const leggi = () => cassaScontrini(oggiRoma()).then((r: { scontrini: Scontrino[] }) => {
      const a = r.scontrini.find((x) => x.id === riemissione.annullo_id);
      if (vivo && a) setStatoAnnullo({ stato: a.stato, errore: a.errore });
    }).catch(() => undefined);
    leggi();
    const t = setInterval(leggi, 4000);
    return () => { vivo = false; clearInterval(t); };
  }, [riemissione]);
  // pagamento misto attivo solo con l'agente di cassa v2 sul server (03/10/2026)
  const [agenteV2, setAgenteV2] = useState(false);
  useEffect(() => { fetchAPI("/api/cassa/agente/stato").then((r: { v2_attivo: boolean }) => setAgenteV2(!!r.v2_attivo)).catch(() => undefined); }, []);
  /** il cliente chiede la fattura dopo lo scontrino: O scontrino O fattura → annullo sul registratore + fattura (03/10/2026) */
  const [daFatturare, setDaFatturare] = useState<Scontrino | null>(null);
  // scontrino di una sessione di taratura (arrivo da «Converti in scontrino»)
  const [sessione, setSessione] = useState<{ id: string; etichetta: string } | null>(null);
  // incasso di un ordine cliente (arrivo dal pulsante «Scontrino» dell'ordine)
  const [ordine, setOrdine] = useState<{ id: string; sigla: string; cliente: string; tipo: "acconto" | "saldo"; max: number; ritiro: boolean } | null>(null);
  // scontrino per uno o più bonifici già arrivati sul conto SumUp (dal pulsante rosso «Bonifici», 02/10/2026)
  const [daBonifici, setDaBonifici] = useState<{ ids: string[]; totale: number; ordinante: string; data: string; causale: string } | null>(null);
  // vendita da una scheda di assistenza (/cassa?scheda=<id>)
  const [scheda, setScheda] = useState<{ id: string; sigla: string; cliente: string; acconto?: number } | null>(null);
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const id = qs.get("scheda");
    if (!id) return;
    const acc = Math.round(Number(qs.get("acconto") || 0) * 100) / 100;
    fetchAPI(`/api/assistenza/schede/${id}/righe-vendita`).then((r: { sigla: string; cliente: string; righe: RigaCassa[] }) => {
      if (acc > 0) {   // scontrino d'ACCONTO sulla scheda (03/10/2026): al saldo la scheda lo scala (righe-vendita)
        setCarrello([{ descrizione: `Acconto scheda assistenza N. ${r.sigla}${r.cliente ? ` - ${r.cliente}` : ""}`.slice(0, 200), quantita: 1, prezzo: acc, aliquota: 22 }]);
        setScheda({ id, sigla: r.sigla, cliente: r.cliente, acconto: acc });
        setAttScelta("apple");
        return;
      }
      if (!r.righe?.length) { toast.error("La scheda non ha importi da incassare"); return; }
      setCarrello(r.righe.map((x) => ({ descrizione: x.descrizione, quantita: Number(x.quantita) || 1, prezzo: Number((x as unknown as { prezzo_ivato: number }).prezzo_ivato) || 0, aliquota: Number(x.aliquota ?? 22) })));
      setScheda({ id, sigla: r.sigla, cliente: r.cliente });
      setAttScelta("apple");
    }).catch((e: Error) => toast.error("Scheda non caricata: " + e.message));
  }, []);
  const collegaScheda = async (campi: Record<string, string>) => {
    if (!scheda) return;
    try { await fetchAPI(`/api/assistenza/schede/${scheda.id}/collega`, { method: "POST", body: JSON.stringify({ ...campi, operatore }) }); }
    catch (e) { toast.error(`Documento emesso ma non collegato alla scheda ${scheda.sigla}: ${(e as Error).message}`); }
  };

  useEffect(() => {
    const ids = (new URLSearchParams(window.location.search).get("bonifici") || "").split(",").filter(Boolean);
    if (!ids.length) return;
    fetchAPI(`/api/bonifici/prepara?ids=${ids.join(",")}`).then((r) => {
      setCarrello([{ descrizione: r.descrizione || `Incasso bonifico ${r.ordinante}`, quantita: 1, prezzo: Number(r.totale), aliquota: 22 }]);
      setDaBonifici({ ids, totale: Number(r.totale), ordinante: r.ordinante, data: r.data_valuta, causale: r.causale });
    }).catch((e: Error) => toast.error("Bonifico non caricato: " + e.message));
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const oid = qs.get("ordine");
    if (!oid) return;
    const importo = Math.round(Number(qs.get("importo") || 0) * 100) / 100;
    const tipo = qs.get("tipo") === "acconto" ? "acconto" : "saldo";
    docDettaglio(oid).then((d) => {
      const max = d.da_certificare ?? d.residuo;
      if (d.stato !== "aperto") { toast.error(`L'ordine ${d.sigla} non è più aperto`); return; }
      if (max <= 0.005) { toast.error(`L'ordine ${d.sigla} non ha più nulla da incassare`); return; }
      const imp = importo > 0 && importo <= max + 0.001 ? importo : max;
      if (importo > max + 0.001) toast.warning(`Importo ridotto a ${eur(max)}: è quanto resta da pagare`);
      const articoli = d.righe.filter((r) => Number(r.quantita) > 0);
      const totArticoli = Math.round(articoli.reduce((s, r) => s + r.quantita * r.prezzo_ivato * (1 - (r.sconto || 0) / 100), 0) * 100) / 100;
      const voci = articoli.map((r) => r.descrizione).join("; ");
      // tutto in una volta e nessun pagamento prima: sullo scontrino gli articoli dell'ordine (senza scarico: escono al ritiro)
      if (!d.pagamenti?.length && Math.abs(totArticoli - imp) < 0.01) {
        setCarrello(articoli.map((r) => ({ descrizione: r.descrizione, quantita: Number(r.quantita) || 1, prezzo: Number(r.prezzo_ivato) || 0,
          aliquota: Number(r.aliquota ?? 22), sconto: Number(r.sconto || 0) })));
      } else {
        setCarrello([{ descrizione: `${tipo === "acconto" && imp < max - 0.001 ? "Acconto" : "Saldo"} ordine n. ${d.numero}/${d.anno}: ${voci}`.slice(0, 200),
          quantita: 1, prezzo: imp, aliquota: Number(d.righe[0]?.aliquota ?? 22) }]);
      }
      setOrdine({ id: d.id, sigla: d.sigla, cliente: d.cliente_nome || d.controparte?.denominazione || "", tipo: imp < max - 0.001 ? "acconto" : "saldo",
        max, ritiro: qs.get("ritiro") === "1" });
    }).catch((e: Error) => toast.error("Ordine non caricato: " + e.message));
  }, []);

  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get("sessione");
    if (!sid) return;
    proformaSessioneStato(sid).then(async (r) => {
      // pro forma con acconti già incassati (03/10/2026): lo scontrino del SALDO è solo quanto resta → incasso del pro forma
      if (r.documento && r.documento.stato === "aperto") {
        const d = await docDettaglio(r.documento.id).catch(() => null);
        if (d && d.pagato > 0.005) {
          toast.info(`Sul pro forma ${d.sigla} c'è già un acconto di ${eur(d.pagato)}: lo scontrino è il saldo di ${eur(d.residuo)}`);
          window.location.replace(`/cassa?${new URLSearchParams({ ordine: d.id, tipo: "saldo", importo: String(d.residuo) })}`);
          return;
        }
      }
      const righe = r.documento?.righe || r.anteprima?.righe || [];
      if (!righe.length) { toast.error("La sessione non ha righe da mettere nello scontrino"); return; }
      if (r.documento && r.documento.stato !== "aperto") toast.warning(`Il pro forma ${r.documento.sigla} è già ${r.documento.stato}: controlla di non fare un doppione`);
      setCarrello(righe.filter((x) => Number(x.quantita) > 0).map((x) => ({
        descrizione: x.descrizione, quantita: Number(x.quantita) || 1, prezzo: Number(x.prezzo_ivato) || 0,
        aliquota: Number(x.aliquota ?? 22), sconto: Number(x.sconto || 0),
      })));
      const n = r.anteprima?.session_number;
      setSessione({ id: sid, etichetta: r.documento ? `${r.documento.rif || "sessione di taratura"} · pro forma ${r.documento.sigla}` : `Sessione di taratura${n ? ` n. ${n}` : ""}` });
    }).catch((e: Error) => toast.error("Sessione non caricata: " + e.message));
  }, []);

  const ricarica = useCallback(() => {
    cassaScontrini(giornoLista, filtroAtt).then(setOggi).catch(() => undefined);
    // gli scontrini finiscono nella cassa del giorno: se è già chiusa lo dico subito
    cassaGiornata(oggiRoma()).then((r) => setCassaChiusa(r.giornata.stato === "chiusa")).catch(() => undefined);
  }, [giornoLista, filtroAtt]);
  useEffect(() => { ricarica(); const t = setInterval(ricarica, 10000); return () => clearInterval(t); }, [ricarica]);
  useEffect(() => {
    if (q.trim().length < 2) { setTrovati([]); return; }
    const t = setTimeout(() => magProdotti(q.trim(), false, 12).then((r) => setTrovati(r.prodotti || [])).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [q]);

  // articolo serializzato (iPhone, Mac…): si sceglie il pezzo; letto il suo IMEI/seriale con lo scanner, è già scelto
  const [sceltaPezzo, setSceltaPezzo] = useState<Prodotto | null>(null);
  const aggiungi = useCallback((p: Prodotto) => {
    if (p.serializzato) {
      if (p.pezzo) {
        const pz = p.pezzo;
        setCarrello((c) => (c.some((r) => r.pezzo_id === pz.id) ? c : [...c, rigaDaPezzo(p, pz)]));
      } else setSceltaPezzo(p);
      setQ(""); setTrovati([]);
      return;
    }
    setCarrello((c) => {
      const i = c.findIndex((r) => r.prodotto_id === p.id);
      if (i >= 0) return c.map((r, j) => (j === i ? { ...r, quantita: r.quantita + 1 } : r));
      // articolo usato / in conto vendita: la riga nasce in regime del margine (costo = prezzo di acquisto o da girare al cliente)
      const reg = p.regime_iva === "margine" ? { regime: "margine" as const, natura: "N5", aliquota: 0, costo_acquisto: Number(p.costo) || null }
        : p.regime_iva === "esente" ? { regime: "esente" as const, natura: "N4", aliquota: 0 } : {};
      return [...c, { prodotto_id: p.id, descrizione: p.descrizione, quantita: 1, prezzo: Number(p.prezzo), aliquota: Number(p.aliquota), giacenza: Number(p.giacenza),
                      plu_rt: p.plu_rt ?? null, prezzo_magazzino: Number(p.prezzo), ...reg }];
    });
    setQ(""); setTrovati([]);
  }, []);
  const scansiona = useCallback(async (codice: string) => {
    try { aggiungi(await magPerCodice(codice)); } catch (e) { toast.error((e as Error).message); }
  }, [aggiungi]);

  // anteprima mentre si spara il codice (prima di Invio): nome, prezzo e giacenza dell'articolo, o «non trovato»
  const anteprimaCodice = useCallback(async (c: string) => {
    try {
      const p = await magPerCodice(c);
      const giac = p.gestisce_giacenza ? ` · giacenza ${Number(p.giacenza)}` : "";
      return { titolo: p.descrizione, dettaglio: `${eur(Number(p.prezzo ?? 0))}${giac}` };
    } catch { return null; }
  }, []);

  const tot = Math.round(carrello.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto || 0) / 100), 0) * 100) / 100;
  // incasso di un ordine: il carrello non può superare quanto resta da pagare (prima che il cliente paghi col POS)
  const oltreOrdine = !!ordine && tot > ordine.max + 0.001;

  /** Emette lo scontrino con uno o più pagamenti (pagamento misto, 03/10/2026). Restituisce lo scontrino emesso (null se
   *  non è partito): il componente Incassa lo usa per abbinare il bonifico. */
  async function scontrino(pagamenti: PagamentoScontrino[]): Promise<{ id: string; descrizione: string } | null> {
    if (!carrello.length || busy) return null;
    if (!operatore) { toast.error("Scegli prima l'operatore (CHR · VALE · DUMY · ALTRO)"); return null; }
    if (carrello.some((r) => !(r.prezzo >= 0) || Number.isNaN(r.prezzo))) { toast.error("C'è un prezzo non valido nel carrello"); return null; }
    if (ordine && tot > ordine.max + 0.001) { toast.error(`Lo scontrino supera quanto resta da pagare sull'ordine (${eur(ordine.max)})`); return null; }
    if (riemissione && statoAnnullo?.stato !== "emesso") {
      toast.error("Aspetta che l'annullo dello scontrino sbagliato risulti EMESSO dal registratore, poi emetti il nuovo scontrino"); return null;
    }
    const nr = pagamenti.filter((p) => p.modalita === "non_riscosso").reduce((x, p) => x + p.importo, 0);
    if (nr > 0 && nr >= tot - 0.005 && !confirm(`Emettere lo scontrino da ${eur(tot)} come NON RISCOSSO (il cliente non paga adesso)?`)) return null;
    const come = pagamenti.map((p) => `${MOD[p.modalita] || p.modalita} ${eur(p.importo)}`).join(" + ");
    setBusy("scontrino");
    let esito: { id: string; descrizione: string } | null = null;
    try {
      const sc = await cassaScontrino({ righe: carrello, pagamenti, operatore,
                             ...(sessione ? { session_id: sessione.id } : {}), ...(ordine ? { documento_id: ordine.id } : {}),
                             ...(scheda ? { scheda_id: scheda.id } : {}),
                             ...(!sessione && !ordine ? { attivita: att } : {}) });
      esito = { id: sc.id, descrizione: `Scontrino ${eur(tot)}${ordine ? ` (ordine ${ordine.sigla})` : ""} — ${carrello.map((r) => r.descrizione).join(", ")}`.slice(0, 280) };
      toast.success(`Scontrino da ${eur(tot)} inviato alla cassa (${come} · ${operatore})${sc.resto ? ` — RESTO ${eur(sc.resto)}` : ""}`, { duration: sc.resto ? 15000 : 5000 });
      setCarrello([]); ricarica(); setRiemissione(null);
      if (scheda) {
        await collegaScheda({ scontrino_id: sc.id, ...(scheda.acconto ? { acconto: String(scheda.acconto) } : {}) });
        router.push(`/assistenza?id=${scheda.id}`); setScheda(null);
      }
      if (sessione) { router.push(`/sessioni/${sessione.id}`); setSessione(null); }
      if (ordine) {
        toast.success(`${ordine.tipo === "acconto" ? "Acconto" : "Saldo"} registrato sull'ordine ${ordine.sigla}`);
        if (ordine.ritiro) {
          try { await docRitira(ordine.id, operatore); toast.success(`Ordine ${ordine.sigla} ritirato`); } catch (e) { toastErrore(e); }
        }
        router.push(`/ordini?id=${ordine.id}`); setOrdine(null);
      }
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
    return esito;
  }
  async function fattura() {
    if (!carrello.length || busy) return;
    if (!operatore) { toast.error("Scegli prima l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    setBusy("fattura");
    try {
      const f = await cassaFattura({ righe: carrello, operatore, attivita: att });
      toast.success("Bozza di fattura creata: completa il cliente e inviala allo SdI");
      setCarrello([]);
      if (scheda) await collegaScheda({ fattura_id: f.id });
      router.push(`/fatturazione?id=${f.id}`);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  function setR(i: number, k: keyof RigaCassa, v: number | string | null) { setCarrello((c) => c.map((r, j) => (j === i ? { ...r, [k]: v } : r))); }
  // regime IVA della riga → tasto reparto del registratore: 22% (reparto 1), margine (usato), esente/non imponibile
  const regimeCassa = (r: RigaCassa) => (r.regime === "margine" || r.natura === "N5" ? "margine" : r.regime === "esente" || (r.natura && Number(r.aliquota) === 0) ? "esente" : String(r.aliquota));
  function setRegimeCassa(i: number, v: string) {
    setCarrello((c) => c.map((r, j) => (j !== i ? r
      : v === "margine" ? { ...r, regime: "margine", natura: "N5", aliquota: 0 }
      : v === "esente" ? { ...r, regime: "esente", natura: "N4", aliquota: 0, costo_acquisto: null }
      : { ...r, regime: null, natura: null, aliquota: Number(v), costo_acquisto: null })));
  }

  return (
    <div className="grid gap-4 p-1 md:p-2 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex items-center gap-3"><ShoppingCart className="size-6" /><h1 className="text-2xl font-semibold">Cassa</h1>
          <span className="text-sm text-muted-foreground">GENIUS LAB · registratore CUSTOM</span></div>
        {cassaChiusa && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
            ⚠️ La cassa del giorno di oggi è CHIUSA: gli scontrini emessi adesso cambierebbero una giornata già chiusa.{" "}
            <Link className="font-medium underline" href="/cassa/giornata">Apri cassa del giorno</Link>
          </div>
        )}
        {sessione && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
            Scontrino al posto della fattura per: <b>{sessione.etichetta}</b>. Scegli operatore e pagamento come al solito.
            <Link className="ml-auto underline" href={`/sessioni/${sessione.id}`}>Torna alla sessione</Link>
          </div>
        )}
        {daBonifici && (
          <div className="space-y-1 rounded-md border-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">
            <div>Scontrino per {daBonifici.ids.length > 1 ? `${daBonifici.ids.length} bonifici` : "il bonifico"} di <b>{eur(daBonifici.totale)}</b> da <b>{daBonifici.ordinante || "—"}</b>
              {" "}del {daBonifici.data.split("-").reverse().join("/")}. Causale: «{daBonifici.causale || "—"}».</div>
            <div className="text-xs">Completa o cambia la descrizione della riga (es. «Scheda assistenza n. …»), poi «Emetti scontrino col bonifico»: pagamento bonifico, e il bonifico risulta abbinato.</div>
            {Math.abs(tot - daBonifici.totale) > 0.005 && <div className="font-semibold text-red-700">Il carrello ({eur(tot)}) è diverso dal bonifico ({eur(daBonifici.totale)}).</div>}
            <Button size="sm" disabled={!carrello.length || !!busy || !operatore} onClick={async () => {
              if (Math.abs(tot - daBonifici.totale) > 0.005 && !confirm(`Il carrello (${eur(tot)}) non è uguale al bonifico (${eur(daBonifici.totale)}). Emettere comunque?`)) return;
              const sc = await scontrino([{ modalita: "bonifico", importo: tot, ...(daBonifici.ids.length === 1 ? { bonifico_id: daBonifici.ids[0] } : {}) }]);
              if (!sc) return;
              try {
                await fetchAPI("/api/bonifici/al-banco/usa", { method: "POST", body: JSON.stringify({ bonifico_ids: daBonifici.ids, documento_tipo: "scontrino",
                  documento_id: sc.id, descrizione: sc.descrizione, importo: tot, operatore }) });
                toast.success("Bonifico abbinato allo scontrino");
                window.dispatchEvent(new Event("bonifici:aggiorna"));
              } catch (e) { toast.warning(`Scontrino emesso, ma il bonifico non è stato abbinato: ${(e as Error).message}`); }
              setDaBonifici(null); router.replace("/cassa");
            }}><Landmark /> Emetti scontrino col bonifico</Button>
          </div>
        )}
        {scheda && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            {scheda.acconto ? "Acconto" : "Vendita"} dalla scheda di assistenza <b>N. {scheda.sigla}</b>{scheda.cliente ? <> — <b>{scheda.cliente}</b></> : ""}: lo scontrino si collega alla scheda{scheda.acconto ? " e l'acconto si scala dal saldo" : ""}.
            <Link className="ml-auto underline" href={`/assistenza?id=${scheda.id}`}>Torna alla scheda</Link>
          </div>
        )}
        {ordine && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border-2 border-violet-400 bg-violet-50 px-3 py-2 text-sm text-violet-950 dark:bg-violet-950/30 dark:text-violet-100">
            <span>{ordine.tipo === "acconto" ? "Acconto" : "Saldo"} per l&apos;ordine <b>{ordine.sigla}</b>{ordine.cliente ? <> — <b>{ordine.cliente}</b></> : ""}.
              Scegli operatore e pagamento come per ogni scontrino: si collega da solo all&apos;ordine{ordine.ritiro ? " e l'ordine risulta ritirato" : ""}.</span>
            {oltreOrdine && <span className="w-full font-semibold text-red-700">Il carrello ({eur(tot)}) supera quanto resta da pagare ({eur(ordine.max)}): correggi l&apos;importo.</span>}
            <Link className="ml-auto underline" href={`/ordini?id=${ordine.id}`}>Torna all&apos;ordine</Link>
          </div>
        )}
        {riemissione && (
          <div className={`space-y-1 rounded-md border-2 px-3 py-2 text-sm ${statoAnnullo?.stato === "errore" ? "border-red-500 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100" : "border-sky-400 bg-sky-50 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100"}`}>
            <div><b>Riemissione</b> dopo l&apos;annullo dello scontrino {riemissione.numero ? `n. ${riemissione.numero}` : ""}: nel carrello gli articoli che restano al cliente.
              Per un cambio merce aggiungi l&apos;articolo nuovo, poi incassa.</div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              Annullo: {statoAnnullo?.stato === "emesso" ? <b className="text-emerald-700 dark:text-emerald-300">EMESSO — puoi emettere il nuovo scontrino</b>
                : statoAnnullo?.stato === "errore" ? <b>NON RIUSCITO{statoAnnullo.errore ? ` (${statoAnnullo.errore})` : ""}: non emettere il nuovo scontrino, ricontrolla dall&apos;elenco</b>
                : <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> in corso sul registratore ({statoAnnullo ? (STATO[statoAnnullo.stato] || statoAnnullo.stato) : "in coda"})…</span>}
              <Button size="xs" variant="ghost" className="ml-auto" onClick={() => { if (confirm("Lasciare la riemissione? Il carrello resta com'è.")) setRiemissione(null); }}><X /> Chiudi</Button>
            </div>
          </div>
        )}
        {/* 08/10/2026: due campi ben distinti — 1) scanner (verde), 2) ricerca per nome (azzurro) */}
        <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50/70 p-2 dark:bg-emerald-950/20">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            <ScanBarcode className="size-4" /> 1 · Spara qui il codice a barre
            <span className="font-normal normal-case tracking-normal text-emerald-700 dark:text-emerald-400">compare l&apos;articolo col prezzo, Invio lo mette nel carrello</span>
          </div>
          <ScannerInput onCodice={scansiona} anteprima={anteprimaCodice} placeholder="Clicca qui e spara il codice a barre" />
        </div>
        <div className="relative rounded-lg border-2 border-sky-400 bg-sky-50/70 p-2 dark:bg-sky-950/20">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300">
            <Search className="size-4" /> 2 · Oppure cerca per nome
            <span className="font-normal normal-case tracking-normal text-sky-700 dark:text-sky-400">scrivi (es. «cavo lightning») e clicca l&apos;articolo</span>
          </div>
          <Input className="h-9 bg-background" placeholder="Scrivi il nome dell'articolo…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const c = q.trim();
              if (!c) return;
              // codice a barre finito qui per sbaglio: lo tratto come una lettura dello scanner
              if (/^[0-9A-Za-z/()-]{6,}$/.test(c) && /\d/.test(c)) { setQ(""); setTrovati([]); scansiona(c); return; }
              if (trovati.length === 1) aggiungi(trovati[0]);
            }} />
          {trovati.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
              {trovati.map((p) => (
                <button key={p.id} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => aggiungi(p)}>
                  <span>{p.descrizione} <span className="text-xs text-muted-foreground">{p.barcode || p.codice}</span></span>
                  <span className="tabular-nums">{eur(Number(p.prezzo))} · {Number(p.giacenza)} pz</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Articolo</th><th className="p-2 text-center">Q.tà</th><th className="p-2 text-right">Prezzo</th>
              <th className="p-2 text-right">IVA</th><th className="p-2 text-right">Totale</th><th /></tr></thead>
            <tbody>
              {carrello.map((r, i) => (
                <tr key={`${r.prodotto_id || "libera"}-${i}`} className="border-b last:border-0">
                  <td className="p-2">
                    {/* descrizione modificabile: es. «SCHEDA ASSISTENZA N.» + numero della scheda */}
                    <Input className="h-8 min-w-[12rem]" maxLength={200} value={r.descrizione} onChange={(e) => setR(i, "descrizione", e.target.value)}
                      onBlur={(e) => { if (!e.target.value.trim()) setR(i, "descrizione", "Articolo"); }} />
                    {r.giacenza !== undefined && r.quantita > r.giacenza && <div className="text-xs text-amber-600">giacenza {r.giacenza}</div>}
                    {/* PLU del registratore: sullo scontrino il nome dell'articolo invece di «REPARTO 01» (solo 22%) */}
                    {r.plu_rt && PLU_RT_NOMI[r.plu_rt] && regimeCassa(r) === "22" && <div className="text-xs text-muted-foreground">sullo scontrino: {PLU_RT_NOMI[r.plu_rt]}</div>}
                    {regimeCassa(r) === "margine" && (() => {
                      const m = ivaMargine(r.quantita * r.prezzo * (1 - (r.sconto || 0) / 100), r.costo_acquisto == null ? null : r.costo_acquisto * r.quantita);
                      return (
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
                          prezzo di acquisto / da girare al cliente
                          <DecInput className="h-6 w-20 px-1 text-right" placeholder="costo" value={r.costo_acquisto ?? null} onValue={(v) => setR(i, "costo_acquisto", v)} />
                          {r.costo_acquisto == null ? <span className="text-red-600">manca</span> : <span className="tabular-nums">margine {eur(m.margine)} · IVA {eur(m.iva)}</span>}
                        </div>
                      );
                    })()}</td>
                  <td className="p-2"><div className="flex items-center justify-center gap-1">
                    <Button size="icon-xs" variant="outline" onClick={() => setR(i, "quantita", Math.max(1, r.quantita - 1))}><Minus /></Button>
                    <span className="w-6 text-center">{r.quantita}</span>
                    <Button size="icon-xs" variant="outline" disabled={!!r.pezzo_id} title={r.pezzo_id ? "Un pezzo per riga: aggiungi l'altro pezzo dall'articolo" : undefined}
                      onClick={() => setR(i, "quantita", r.quantita + 1)}><Plus /></Button></div></td>
                  <td className="p-2 text-right"><DecInput className="ml-auto h-7 w-24 px-1 text-right" value={r.prezzo}
                    onValue={(v) => setR(i, "prezzo", v ?? 0)} />
                    {/* prezzo cambiato a mano su un articolo di magazzino: si può aggiornare anche il magazzino (solo titolare) */}
                    {r.prodotto_id && !r.pezzo_id && r.prezzo_magazzino !== undefined && regimeCassa(r) !== "margine"
                      && prezzoDiversoDaMagazzino(r.prezzo, r.prezzo_magazzino) && (
                      <AggiornaPrezzoMagazzino className="mt-1 justify-end text-left" prodottoId={r.prodotto_id} prezzoMagazzino={r.prezzo_magazzino}
                        prezzoNuovo={r.prezzo} origine="cassa"
                        onAggiornato={(nuovo) => setCarrello((c) => c.map((x) => (x.prodotto_id === r.prodotto_id ? { ...x, prezzo_magazzino: nuovo } : x)))} />
                    )}</td>
                  <td className="p-2 text-right"><select className="h-7 rounded-md border border-input bg-background px-1 text-xs" title="IVA della riga (decide il reparto del registratore)"
                    value={regimeCassa(r)} onChange={(e) => setRegimeCassa(i, e.target.value)}>
                    {!["22", "margine", "esente"].includes(regimeCassa(r)) && <option value={regimeCassa(r)}>{regimeCassa(r)}%</option>}
                    <option value="22">IVA 22%</option><option value="margine">Margine (usato)</option><option value="esente">Esente</option>
                  </select></td>
                  <td className="p-2 text-right tabular-nums">{eur(r.quantita * r.prezzo)}</td>
                  <td className="p-2"><Button size="icon-xs" variant="ghost" onClick={() => setCarrello((c) => c.filter((_, j) => j !== i))}><Trash2 /></Button></td>
                </tr>
              ))}
              {!carrello.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Spara un codice a barre per iniziare</td></tr>}
            </tbody>
          </table>
          <div className="flex flex-wrap items-end gap-2 border-t p-2">
            <Input className="h-8 flex-1" placeholder="Voce libera (es. Manodopera)" value={libera.descrizione} onChange={(e) => setLibera({ ...libera, descrizione: e.target.value })} />
            <Input className="h-8 w-28" inputMode="decimal" placeholder="Prezzo IVA incl." value={libera.prezzo} onChange={(e) => setLibera({ ...libera, prezzo: e.target.value })} />
            <Button size="sm" variant="outline" disabled={!libera.descrizione || !libera.prezzo}
              onClick={() => {
                const pz = parseDec(libera.prezzo);
                if (pz === null || Number.isNaN(pz) || pz < 0) { toast.error("Prezzo non valido (es. 25 o 12,50)"); return; }
                setCarrello((c) => [...c, { descrizione: libera.descrizione, quantita: 1, prezzo: pz, aliquota: 22 }]); setLibera({ descrizione: "", prezzo: "" });
              }}>
              <Plus /> Aggiungi</Button>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Totale</span><span className="text-3xl font-bold tabular-nums">{eur(tot)}</span></div>
          {!sessione && !ordine && (
            <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Attività</span>
              <SceltaAttivita value={att} onChange={setAttScelta} /></div>
          )}
          <SceltaOperatore value={operatore} onChange={setOperatore} />
          {/* INCASSA (03/10/2026): uno o più metodi sullo stesso scontrino (es. 50 contanti + 100 carta), resto sui contanti,
              quota non riscossa. POS e PayPal: verifica SumUp/PayPal; se il POS chiude il totale lo scontrino parte da solo. */}
          {!agenteV2 && <div className="text-[11px] text-muted-foreground">Pagamento misto (es. contanti + carta) attivo quando sul server c&apos;è l&apos;agente di cassa aggiornato: per ora un metodo per scontrino.</div>}
          <Incassa key={`${tot}-${carrello.length}-${agenteV2}`} modo="scontrino" unMetodo={!agenteV2} totale={carrello.length ? tot : 0} documentoTipo={ordine ? "ordine" : "scontrino"}
            descrizione={`GENIUS LAB scontrino ${eur(tot)}`} nonRiscosso={!ordine /* un ordine si incassa davvero */}
            disabled={!carrello.length || !operatore || oltreOrdine} motivo={!operatore ? "scegli l'operatore" : !carrello.length ? "aggiungi gli articoli" : ""}
            onEmetti={async (pag) => scontrino(pag)} />
          {/* dalla sessione la fattura si prepara con «Prepara bozza da controllare» (niente doppioni non collegati) */}
          {!sessione && !ordine && <Button variant="secondary" className="w-full" disabled={!carrello.length || !!busy || !operatore || oltreOrdine} onClick={fattura}>
            {busy === "fattura" ? <Loader2 className="animate-spin" /> : <Receipt />} Fai fattura invece dello scontrino</Button>}
          {carrello.length > 0 && <Button variant="ghost" size="sm" className="w-full" onClick={() => { if (confirm("Svuotare il carrello?")) setCarrello([]); }}><X /> Svuota carrello</Button>}
        </Card>

        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-sm font-medium">Scontrini {giornoLista === oggiRoma() ? "di oggi" : "del"}
              <input type="date" className="h-7 rounded-md border border-input bg-background px-1 text-xs" value={giornoLista} max={oggiRoma()}
                onChange={(e) => { if (e.target.value) { setOggi(null); setGiornoLista(e.target.value); } }} /></span>
            <FiltroAttivita className="h-7 text-xs" value={filtroAtt} onChange={(v) => { setOggi(null); setFiltroAtt(v); }} />
            <span className="font-semibold tabular-nums">{eur(oggi?.totale || 0)}</span></div>
          <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {Object.entries(oggi?.per_modalita || {}).map(([k, v]) => <span key={k}>{MOD[k] || k}: {eur(v)}</span>)}
          </div>
          <div className="max-h-96 divide-y overflow-y-auto">
            {(oggi?.scontrini || []).map((s) => {
              const doc = s.tipo_documento || "vendita";
              const negativo = doc === "reso" || doc === "annullo";   // reso / annullo: i soldi escono
              const stornabile = !negativo && ["emesso", "in_stampa"].includes(s.stato);
              return (
              <div key={s.id} className={`py-2 text-sm ${negativo ? "-mx-1 rounded bg-red-50/80 px-1 dark:bg-red-950/20" : ""}`}>
                <div className="flex justify-between">
                  <span className={s.stato === "annullato" ? "line-through opacity-60" : ""}>
                    {negativo && <span className="mr-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{doc === "annullo" ? "ANNULLO" : "RESO"}</span>}
                    {new Date(s.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {s.numero_rt ? `n. ${s.numero_rt}` : ""}
                    <BadgeOperatore op={s.operatore} className="ml-1" /> <BadgeAttivita a={s.attivita} /></span>
                  <span className={`tabular-nums ${negativo ? "font-semibold text-red-700 dark:text-red-300" : s.stato === "annullato" ? "line-through opacity-60" : ""}`}>{negativo ? "− " : ""}{eur(Number(s.totale))}</span>
                </div>
                {negativo && s.motivo && <div className="text-xs text-muted-foreground">Motivo: {s.motivo}</div>}
                <div className="flex items-center justify-between text-xs">
                  <span className={s.stato === "errore" ? "text-red-600" : s.stato === "simulato" ? "text-amber-600" : "text-muted-foreground"}>
                    {doc === "recupero_credito" ? "RECUPERO CREDITO · " : ""}{STATO[s.stato] || s.stato} · {s.pagamenti.map((p) => `${MOD[p.modalita] || p.modalita}${s.pagamenti.length > 1 ? ` ${eur(p.importo)}` : ""}`).join(" + ")}{s.errore ? ` · ${s.errore}` : ""}</span>
                  <span className="flex gap-1">
                    {(s.stato === "errore" || s.stato === "simulato") && <Button size="xs" variant="ghost" onClick={() => cassaRiprova(s.id).then(ricarica).catch(toastErrore)}><RotateCcw /> Riprova</Button>}
                    {["da_stampare", "errore", "simulato"].includes(s.stato) && <Button size="xs" variant="ghost" onClick={() => { if (confirm("Annullare lo scontrino e rimettere in giacenza gli articoli?")) cassaAnnulla(s.id).then(ricarica).catch(toastErrore); }}>Annulla</Button>}
                    {doc === "vendita" && ["emesso", "in_stampa"].includes(s.stato) && <SpedisciDocumento link={{ scontrino_id: s.id }} soloPulsante />}
                    {stornabile && <Button size="xs" variant="ghost" className="text-red-600" title={s.giornata_aperta ? "Scontrino di oggi: annulla e riemetti (il reso si fa dopo la chiusura)" : "Reso (anche parziale) o annullo di uno scontrino già emesso"}
                      onClick={() => setStorno(s)}><Undo2 /> Storno</Button>}
                    {!negativo && (s.credito_residuo || 0) > 0.005 && ["emesso", "in_stampa", "simulato"].includes(s.stato) &&
                      <Button size="xs" variant="ghost" className="text-amber-700" title="Il cliente paga ora la parte non riscossa (RECUPERO CREDITI sul registratore)"
                        onClick={() => setRecupero(s)}><Wallet /> Incassa credito {eur(s.credito_residuo || 0)}</Button>}
                    {doc === "vendita" && ["emesso", "simulato"].includes(s.stato) && !s.fattura_id &&
                      <Button size="xs" variant="ghost" title="Il cliente chiede la fattura: lo scontrino si annulla sul registratore e al suo posto nasce la fattura, già pagata"
                        onClick={() => setDaFatturare(s)}>
                        {s.annulla_e_fattura?.stato === "in_attesa" ? <Loader2 className="animate-spin" /> : <FileText />}
                        {s.annulla_e_fattura?.stato === "in_attesa" ? "Annullo in corso…" : s.annulla_e_fattura?.stato === "fallita" ? "Annullo non riuscito" : "Annulla e fai fattura"}</Button>}
                    {s.fattura_id && <Link className="text-xs underline" href={`/fatturazione?id=${s.fattura_id}`}>fattura{s.stato === "annullato" ? " (al posto dello scontrino)" : ""}</Link>}
                  </span>
                </div>
              </div>
              );
            })}
            {!oggi?.scontrini.length && <div className="py-4 text-center text-sm text-muted-foreground">Nessuno scontrino {giornoLista === oggiRoma() ? "oggi" : "in questo giorno"}</div>}
          </div>
        </Card>
      </div>
      <StornoDialog oggetto={storno ? { fonte: "scontrino", scontrino: storno } : null} onClose={() => setStorno(null)} onFatto={ricarica}
        onRiemetti={avviaRiemissione} />
      <AnnullaEFattura scontrino={daFatturare} onClose={() => setDaFatturare(null)} onCambiato={ricarica} />
      {/* recupero del credito di uno scontrino «non riscosso»: un metodo per volta (RECUPERO CREDITI sul registratore) */}
      <Dialog open={!!recupero} onOpenChange={(o) => { if (!o) setRecupero(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Incassa il credito {recupero?.numero_rt ? `dello scontrino ${recupero.numero_rt}` : ""}</DialogTitle>
            <DialogDescription>Il cliente paga ora la parte non riscossa. Il registratore lo registra con RECUPERO CREDITI (non è un nuovo scontrino).</DialogDescription>
          </DialogHeader>
          <SceltaOperatore value={operatore} onChange={setOperatore} />
          {recupero && <Incassa modo="documento" totale={recupero.credito_residuo || 0} documentoTipo="scontrino"
            descrizione={`Recupero credito scontrino ${recupero.numero_rt || ""}`} disabled={!operatore} motivo={!operatore ? "scegli l'operatore" : ""}
            onPagamento={async (p) => {
              const r = await cassaRecupero(recupero.id, { pagamenti: [{ modalita: p.modalita, importo: p.importo, pos_incasso_id: p.pos_incasso_id }], operatore: operatore! });
              ricarica();
              if (r.a_mano) toast.warning("Registrato in dashboard. Sul registratore battilo A MANO: RECUPERO CREDITI → importo → tasto del pagamento → RECUPERO CREDITI", { duration: 20000 });
              if (r.resta <= 0.005) setRecupero(null); else setRecupero({ ...recupero, credito_residuo: r.resta });
              return { id: r.id, descrizione: `Recupero credito scontrino ${recupero.numero_rt || ""}` };
            }} />}
        </DialogContent>
      </Dialog>
      {sceltaPezzo && <SceltaPezzo prodotto={sceltaPezzo} esclusi={carrello.map((r) => r.pezzo_id || "").filter(Boolean)} onClose={() => setSceltaPezzo(null)}
        onScelto={(pz) => { const p = sceltaPezzo; setSceltaPezzo(null); setCarrello((c) => [...c, rigaDaPezzo(p, pz)]); }} />}
    </div>
  );
}
