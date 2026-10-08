"use client";

// Editor di una fattura (nuova o bozza): società, cliente (anche dall'anagrafica), righe, pagamento previsto.
// 05/10/2026 — PRIMA il pagamento, POI lo SdI: qui si salva SEMPRE una bozza. «Salva e registra pagamento» apre la bozza
// sul pannello Pagamento; «Salva come da pagare» la apre sulla scelta «Da pagare» (scadenza e termini del cliente).
// L'invio allo SdI è l'ultimo passo, nella scheda della fattura.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarClock, Loader2, Plus, Search, Trash2, Truck, Wallet, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { CercaArticolo } from "@/components/CercaArticolo";
import { DecInput } from "@/components/DecInput";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { SceltaAttivita, useAttivita, type Attivita } from "@/components/attivita";
import { AnnullaEFattura } from "@/components/AnnullaEFattura";
import { EstraiDati } from "@/components/EstraiDati";
import { oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";
import {
  cassaScontriniDaFatturare,
  fattCatalogo,
  fattCrea,
  fattAnagrafiche,
  fattModifica,
  searchCustomers,
  type CampiEstratti,
  type EsistenteEstratto,
  type FattAnagrafica,
  type FattControparte,
  type FattVoceCatalogo,
  type FattModalita,
  type FattRiga,
  type FattSocieta,
  type Fattura,
  type Scontrino,
} from "@/lib/api";
import { MODALITA_LABEL, NATURE_IVA, SOCIETA_LABEL, TIPI_LABEL, eur, ivaMargine, stimaTotali } from "./util";

type TipoCliente = "azienda" | "privato" | "estero";
interface ClienteAnagrafica { id: string; company_name?: string; vat_number?: string; tax_id?: string; sdi_code?: string;
  pec?: string; address?: string; zip_code?: string; city?: string; province?: string; email?: string;
  _fonte?: "fatturazione" | "tarature"; _anag?: FattAnagrafica }
// Regime IVA della riga: aliquota, «margine» (beni usati, N5) o «0» = esente / non imponibile / fuori campo (natura)
const REGIMI: [string, string][] = [["22", "22%"], ["10", "10%"], ["5", "5%"], ["4", "4%"], ["margine", "Margine (usato)"], ["0", "Esente / non imp."]];
const regimeRiga = (r: FattRiga) => (r.regime === "margine" || r.natura === "N5" ? "margine" : String(Number(r.aliquota ?? 22)));

const rigaVuota = (aliquota = 22): FattRiga => ({ descrizione: "", quantita: 1, prezzo_ivato: null, prezzo_unitario: null, aliquota, sconto: 0 });

export function Editor({
  iniziale,
  anagrafica,
  societaDefault,
  onClose,
  onSaved,
}: {
  iniziale?: Fattura | null;
  anagrafica?: FattAnagrafica;
  societaDefault: FattSocieta;
  onClose: () => void;
  /** passo: dove aprire la bozza salvata («pagamento» o «da_pagare»); assente = solo salvata */
  onSaved: (id: string, passo?: "pagamento" | "da_pagare") => void;
}) {
  const [operatore, setOperatore] = useOperatore();
  const [societa, setSocieta] = useState<FattSocieta>(iniziale?.societa || anagrafica?.societa || societaDefault);
  // attività (Genius Lab): quella della bozza, o tarature se viene da una sessione, altrimenti il selettore in alto
  const { attivita: attSelettore } = useAttivita();
  const [attivita, setAttivita] = useState<Attivita>(iniziale?.attivita || (iniziale?.session_id ? "tarature" : attSelettore));
  const [tipoDoc, setTipoDoc] = useState(iniziale?.tipo_documento || "TD01");
  const [data, setData] = useState(iniziale?.data || oggiRoma());
  const c0: FattControparte = iniziale?.controparte || (anagrafica ? {
    denominazione: anagrafica.denominazione || "", piva: anagrafica.piva || "", cf: anagrafica.cf || "",
    sdi: anagrafica.sdi || "", pec: anagrafica.pec || "", indirizzo: anagrafica.indirizzo || "", cap: anagrafica.cap || "",
    comune: anagrafica.comune || "", provincia: anagrafica.provincia || "",
    paese: (anagrafica.paese || "IT").toUpperCase().slice(0, 2), email: anagrafica.email || "" } : {});
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>(
    (c0.paese && c0.paese !== "IT") ? "estero" : (c0.piva ? "azienda" : (c0.cf || c0.nome ? "privato" : "azienda")),
  );
  const [cliente, setCliente] = useState<FattControparte>({ paese: "IT", ...c0 });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [anagraficaId, setAnagraficaId] = useState<string | null>(iniziale?.anagrafica_id || anagrafica?.id || null);
  const [salvaAnag, setSalvaAnag] = useState(true);
  // Bozza nata a prezzi IVA inclusa (ordini, cassa, conversioni): si riapre a prezzi ivati ricostruiti dal «lordo»,
  // non con i netti a 8 decimali (e il totale resta al centesimo quello pagato dal cliente).
  const tuttiLordi = !!iniziale?.righe?.length && iniziale.righe.every((r) => r.lordo !== null && r.lordo !== undefined);
  const [righe, setRighe] = useState<FattRiga[]>(
    iniziale?.righe?.length
      ? iniziale.righe.map((r) => tuttiLordi
        ? { ...r, prezzo_unitario: null,
            prezzo_ivato: Math.round((Number(r.lordo) / (Number(r.quantita) || 1) / (1 - Number(r.sconto || 0) / 100 || 1)) * 100) / 100 }
        : { ...r, prezzo_ivato: null })
      : [rigaVuota(societaDefault === "gingy" ? 10 : 22)],
  );
  const [prezziIvati, setPrezziIvati] = useState(!iniziale?.righe?.length || tuttiLordi);
  const [idSalvato, setIdSalvato] = useState<string | null>(iniziale?.id || null);   // dopo il primo salvataggio si MODIFICA, non si ricrea
  const [sporco, setSporco] = useState(false);
  const chiudi = () => { if (sporco && !confirm("Chiudere senza salvare? Le modifiche andranno perse.")) return; onClose(); };
  const [modalita, setModalita] = useState<FattModalita>(iniziale?.pagamento_modalita || "bonifico");
  const [scadenza, setScadenza] = useState(iniziale?.scadenza || "");
  const [causale, setCausale] = useState(iniziale?.causale || "");
  const [note, setNote] = useState(iniziale?.note || "");
  const [salvando, setSalvando] = useState<"" | "bozza" | "pagamento" | "da_pagare">("");
  const [q, setQ] = useState("");
  const [trovati, setTrovati] = useState<ClienteAnagrafica[]>([]);
  const [catalogo, setCatalogo] = useState<FattVoceCatalogo[]>([]);
  // il cliente ha già lo scontrino (03/10/2026, O scontrino O fattura): si cerca e si fa «annulla scontrino e fai fattura»
  const [qSc, setQSc] = useState("");
  const [scTrovati, setScTrovati] = useState<Scontrino[]>([]);
  const [daAnnullare, setDaAnnullare] = useState<Scontrino | null>(null);
  const [clienteSnap, setClienteSnap] = useState<{ controparte: FattControparte; anagrafica_id: string | null; customer_id: string | null } | null>(null);
  useEffect(() => {
    if (qSc.trim().length < 2) { setScTrovati([]); return; }
    const t = setTimeout(() => {
      cassaScontriniDaFatturare(qSc.trim(), societa).then((r) => setScTrovati(r.scontrini || [])).catch(() => setScTrovati([]));
    }, 300);
    return () => clearTimeout(t);
  }, [qSc, societa]);

  useEffect(() => {
    fattCatalogo(societa).then((r) => setCatalogo(r.voci || [])).catch(() => setCatalogo([]));
  }, [societa]);

  /** Aggiunge una voce del listino (come i prodotti di SimplyFatt): riempie la prima riga vuota o ne crea una. */
  function aggiungiVoce(v: FattVoceCatalogo, quantita = 1) {
    const ivato = v.prezzo_ivato;
    const netto = ivato === null ? null : Math.round((ivato / (1 + v.aliquota / 100)) * 100) / 100;
    const riga: FattRiga = { descrizione: v.descrizione, quantita, aliquota: v.aliquota, sconto: 0,
      prezzo_ivato: prezziIvati ? ivato : null, prezzo_unitario: prezziIvati ? null : netto,
      ...(v.regime === "margine" ? { regime: "margine", natura: "N5", costo_acquisto: v.costo_acquisto ?? null } : {}) };
    setRighe((p) => {
      const vuota = p.findIndex((r) => !r.descrizione.trim() && !r.prezzo_ivato && !r.prezzo_unitario);
      return vuota >= 0 ? p.map((r, j) => (j === vuota ? riga : r)) : [...p, riga];
    });
    if (ivato === null) toast.info("Voce aggiunta: scrivi il prezzo");
  }
  const voce = (codice: string) => catalogo.find((v) => v.codice === codice);
  const gruppi = useMemo(() => {
    const g: Record<string, FattVoceCatalogo[]> = {};
    for (const v of catalogo) (g[v.gruppo] ||= []).push(v);
    return g;
  }, [catalogo]);

  useEffect(() => {
    if (q.trim().length < 2) { setTrovati([]); return; }
    const t = setTimeout(async () => {
      const [fa, ta] = await Promise.all([
        fattAnagrafiche(societa, "cliente", q.trim(), 8).catch(() => ({ anagrafiche: [] })),
        societa === "genius" ? searchCustomers(q.trim(), 6).catch(() => ({ customers: [] })) : Promise.resolve({ customers: [] }),
      ]);
      const daFatt: ClienteAnagrafica[] = (fa.anagrafiche || []).map((a: FattAnagrafica) => ({
        id: a.id, company_name: a.denominazione || "", vat_number: a.piva || "", tax_id: a.cf || "", sdi_code: a.sdi || "",
        pec: a.pec || "", address: a.indirizzo || "", zip_code: a.cap || "", city: a.comune || "", province: a.provincia || "",
        email: a.email || "", _fonte: "fatturazione", _anag: a }));
      const daTar: ClienteAnagrafica[] = (ta.customers || []).map((c: ClienteAnagrafica) => ({ ...c, _fonte: "tarature" }));
      setTrovati([...daFatt, ...daTar]);
    }, 300);
    return () => clearTimeout(t);
  }, [q, societa]);

  const righePerCalcolo = useMemo(
    () => righe.map((r) => prezziIvati
      ? { ...r, prezzo_ivato: r.prezzo_ivato ?? r.prezzo_unitario, prezzo_unitario: null }
      : { ...r, prezzo_unitario: r.prezzo_unitario ?? r.prezzo_ivato, prezzo_ivato: null }),
    [righe, prezziIvati],
  );
  const tot = stimaTotali(righePerCalcolo);

  function scegliCliente(x: ClienteAnagrafica) {
    if (x._fonte === "fatturazione") { setAnagraficaId(x.id); setCustomerId(null); }
    else { setCustomerId(x.id); setAnagraficaId(null); }
    const piva = (x.vat_number || "").replace(/\D/g, "");
    setTipoCliente(piva ? "azienda" : "privato");
    setCliente({
      denominazione: x.company_name || "",
      piva: piva || "",
      cf: x.tax_id || "",
      sdi: x.sdi_code || "",
      pec: x.pec || "",
      indirizzo: x.address || "",
      cap: x.zip_code || "",
      comune: x.city || "",
      provincia: x.province || "",
      paese: "IT",
      email: (x.email || "").split(/[;,]/)[0]?.trim() || "",
    });
    setQ("");
    setTrovati([]);
  }

  /** «Estrai dati» → «Compila»: campi del documento + collegamento alla riga di rubrica appena salvata */
  function daEstratti(c: CampiEstratti, a: FattAnagrafica | null) {
    setTipoCliente(c.tipo);
    setCliente({
      denominazione: c.denominazione, nome: c.nome, cognome: c.cognome, piva: c.piva, cf: c.cf,
      sdi: c.tipo === "estero" ? "" : c.sdi, pec: c.pec, indirizzo: c.indirizzo, cap: c.cap, comune: c.comune,
      provincia: c.provincia, paese: c.paese || "IT", email: c.email, telefono: c.telefono,
    });
    setAnagraficaId(a?.id || null); setCustomerId(null); setSporco(true);
    toast.success("Dati del cliente compilati: controllali prima di salvare");
  }
  function daEsistente(e: EsistenteEstratto) {
    const r = e.record;
    if (e.fonte === "fatturazione") {
      scegliCliente({ id: e.id, company_name: r.denominazione || "", vat_number: r.piva || "", tax_id: r.cf || "", sdi_code: r.sdi || "",
        pec: r.pec || "", address: r.indirizzo || "", zip_code: r.cap || "", city: r.comune || "", province: r.provincia || "",
        email: r.email || "", _fonte: "fatturazione" });
    } else {
      scegliCliente({ ...(r as unknown as ClienteAnagrafica), id: e.id, _fonte: "tarature" });
    }
    setSporco(true);
  }

  function setC(k: keyof FattControparte, v: string) { setCliente((p) => ({ ...p, [k]: v })); }
  function setR(i: number, k: keyof FattRiga, v: string | number | null) {
    setRighe((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  }
  /** Cambio di regime IVA della riga: aliquota, regime del margine o esente/non imponibile (con natura e riferimento). */
  function setRegime(i: number, v: string) {
    setRighe((p) => p.map((r, j) => {
      if (j !== i) return r;
      if (v === "margine") return { ...r, aliquota: 0, natura: "N5", regime: "margine", riferimento_normativo: null };
      if (v === "0") {
        const n = r.natura && r.natura !== "N5" ? r.natura : "N4";
        return { ...r, aliquota: 0, natura: n, regime: null, riferimento_normativo: NATURE_IVA[n]?.rif || null, costo_acquisto: null };
      }
      return { ...r, aliquota: Number(v), natura: null, regime: null, riferimento_normativo: null, costo_acquisto: null };
    }));
    setSporco(true);
  }
  const serveEstremi = righe.some((r) => Number(r.aliquota) === 0 && r.natura && r.natura !== "N5");
  const [estremi, setEstremi] = useState(iniziale?.estremi_esenzione || "");

  function corpo() {
    const cp: FattControparte = { ...cliente };
    if (tipoCliente === "azienda") { delete cp.nome; delete cp.cognome; cp.paese = "IT"; }
    if (tipoCliente === "privato") { cp.paese = "IT"; cp.piva = ""; if (cp.nome && cp.cognome) cp.denominazione = `${cp.nome} ${cp.cognome}`; }
    if (tipoCliente === "estero") { cp.sdi = ""; cp.pec = ""; if (!cp.denominazione && cp.nome) cp.denominazione = `${cp.nome} ${cp.cognome || ""}`.trim(); }
    return {
      societa, tipo_documento: tipoDoc, data, controparte: cp,
      righe: righePerCalcolo.filter((r) => r.descrizione.trim()).map((r) => ({
        ...r,
        quantita: Number(r.quantita || 1),
        aliquota: regimeRiga(r) === "margine" ? 0 : Number(r.aliquota ?? 22),
        sconto: Number(r.sconto || 0),
        prezzo_ivato: r.prezzo_ivato === null || r.prezzo_ivato === undefined ? null : Number(r.prezzo_ivato),
        prezzo_unitario: r.prezzo_unitario === null || r.prezzo_unitario === undefined ? null : Number(r.prezzo_unitario),
        ...(regimeRiga(r) === "margine"
          ? { natura: "N5", regime: "margine" as const,
              costo_acquisto: r.costo_acquisto === null || r.costo_acquisto === undefined ? null : Number(r.costo_acquisto) }
          : { natura: Number(r.aliquota) === 0 ? (r.natura || "N2.2") : null, regime: null, costo_acquisto: null }),
      })),
      estremi_esenzione: estremi.trim() || null,
      pagamento_modalita: modalita, scadenza: scadenza || null, causale, note,
      customer_id: customerId || undefined,
      anagrafica_id: anagraficaId || undefined,
      salva_anagrafica: !anagraficaId && salvaAnag,
      operatore,
      ...(societa === "genius" ? { attivita } : {}),
    };
  }

  /** Salva SEMPRE come bozza (mai allo SdI da qui). `passo` = cosa si apre dopo: pannello Pagamento o «Da pagare». */
  async function salva(passo?: "pagamento" | "da_pagare") {
    if (salvando) return;
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    const b = corpo();
    if (!b.righe.length) { toast.error("Aggiungi almeno una riga"); return; }
    setSalvando(passo || "bozza");
    try {
      const f = idSalvato ? await fattModifica(idSalvato, b) : await fattCrea(b);
      setIdSalvato(f.id); setSporco(false);
      toast.success(passo === "pagamento" ? "Bozza salvata: registra il pagamento, poi invia allo SdI"
        : passo === "da_pagare" ? "Bozza salvata: controlla scadenza e termini, poi invia allo SdI come da pagare" : "Bozza salvata");
      onSaved(f.id, passo);
    } catch (e) {
      toastErrore(e);
    } finally {
      setSalvando("");
    }
  }

  const campo = "h-8 rounded-md border border-input bg-background px-2 text-sm w-full";
  const lab = "text-xs text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-6" onClick={chiudi}>
      <div className="w-full max-w-4xl rounded-xl bg-background shadow-xl" onClick={(e) => e.stopPropagation()} onChangeCapture={() => setSporco(true)}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">{idSalvato ? "Modifica bozza" : "Nuova fattura"}</h2>
          <Button variant="ghost" size="icon-sm" onClick={chiudi} aria-label="Chiudi"><X /></Button>
        </div>

        <div className="space-y-5 p-4">
          {/* Documento */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="space-y-1"><div className={lab}>Società</div>
              <select className={campo} value={societa} onChange={(e) => setSocieta(e.target.value as FattSocieta)}>
                {Object.entries(SOCIETA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="space-y-1"><div className={lab}>Documento</div>
              <select className={campo} value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                {["TD01", "TD24", "TD06"].map((k) => <option key={k} value={k}>{TIPI_LABEL[k]}</option>)}
                {tipoDoc === "TD04" && <option value="TD04">Nota di credito</option>}
              </select></label>
            <label className="space-y-1"><div className={lab}>Data</div>
              <input type="date" className={campo} value={data} onChange={(e) => setData(e.target.value)} /></label>
            <div className="space-y-1"><div className={lab}>Numero</div>
              <div className="flex h-8 items-center text-sm text-muted-foreground">{iniziale?.numero || "assegnato all'invio"}</div></div>
          </div>

          {/* Il cliente ha già lo scontrino: niente fattura «in più», si annulla lo scontrino e la fattura nasce già pagata */}
          {!idSalvato && societa === "genius" && (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <div className="text-sm font-medium">Il cliente ha già lo scontrino?</div>
              <p className="text-xs text-muted-foreground">O scontrino O fattura: cerca lo scontrino (numero 2312-0004, importo o articolo), si annulla sul registratore e al suo posto nasce la fattura, già pagata con gli stessi pagamenti. I dati del cliente scritti qui sotto vengono ripresi.</p>
              <div className="relative">
                <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
                <Input className="h-8 pl-8" placeholder="Cerca scontrino degli ultimi 30 giorni…" value={qSc} onChange={(e) => setQSc(e.target.value)} />
              </div>
              {scTrovati.length > 0 && (
                <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
                  {scTrovati.map((s) => (
                    <button key={s.id} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setClienteSnap({ controparte: corpo().controparte, anagrafica_id: anagraficaId, customer_id: customerId }); setDaAnnullare(s); }}>
                      <span><b>{s.numero_rt || "(senza numero)"}</b> · {new Date(s.data_rt || s.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        <span className="block text-xs text-muted-foreground">{(s.righe || []).map((r) => r.descrizione).join(", ").slice(0, 90)}</span></span>
                      <span className="shrink-0 tabular-nums">{eur(Number(s.totale))}</span>
                    </button>
                  ))}
                </div>
              )}
              {qSc.trim().length >= 2 && !scTrovati.length && <div className="text-xs text-muted-foreground">Nessuno scontrino emesso e senza fattura con questa ricerca.</div>}
            </div>
          )}

          {/* Cliente */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Cliente</span>
              {(["azienda", "privato", "estero"] as TipoCliente[]).map((t) => (
                <Button key={t} size="xs" variant={tipoCliente === t ? "default" : "outline"} onClick={() => setTipoCliente(t)}>
                  {t === "azienda" ? "Azienda" : t === "privato" ? "Privato" : "Estero"}
                </Button>
              ))}
              <div className="relative ml-auto w-full sm:w-96">
                <Search className="pointer-events-none absolute left-2 top-3 size-5 text-primary" />
                {/* campo principale della fattura: in evidenza e col cursore già dentro sulla fattura nuova */}
                <Input className="h-11 border-2 border-primary pl-9 text-base font-medium shadow-sm ring-2 ring-primary/20 placeholder:text-foreground/60"
                  placeholder="Cerca in anagrafica clienti…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!iniziale && !anagrafica} />
                {trovati.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
                    {trovati.map((x) => (
                      <button key={x.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => scegliCliente(x)}>
                        <div className="font-medium">{x.company_name} <span className="text-[10px] font-normal text-muted-foreground">{x._fonte === "tarature" ? "Tarature" : "anagrafica"}</span></div>
                        <div className="text-xs text-muted-foreground">{x.vat_number || x.tax_id || "senza P.IVA"} · {x.city || ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* «Estrai dati»: incolli firma/visura/WhatsApp o una foto/PDF e i campi si compilano da soli */}
              <EstraiDati societa={societa} onCompila={daEstratti} onUsaEsistente={daEsistente} className="w-full sm:w-auto" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              {tipoCliente === "privato" ? (
                <>
                  <label className="col-span-1 space-y-1 sm:col-span-2"><div className={lab}>Nome</div><input className={campo} value={cliente.nome || ""} onChange={(e) => setC("nome", e.target.value)} /></label>
                  <label className="col-span-1 space-y-1 sm:col-span-2"><div className={lab}>Cognome</div><input className={campo} value={cliente.cognome || ""} onChange={(e) => setC("cognome", e.target.value)} /></label>
                  <label className="col-span-2 space-y-1"><div className={lab}>Codice fiscale</div><input className={campo} value={cliente.cf || ""} onChange={(e) => setC("cf", e.target.value.toUpperCase())} /></label>
                </>
              ) : (
                <>
                  <label className="col-span-2 space-y-1 sm:col-span-3"><div className={lab}>Ragione sociale / nome</div><input className={campo} value={cliente.denominazione || ""} onChange={(e) => setC("denominazione", e.target.value)} /></label>
                  <label className="space-y-1 sm:col-span-2"><div className={lab}>{tipoCliente === "estero" ? "Partita IVA estera (se c'è)" : "Partita IVA"}</div><input className={campo} value={cliente.piva || ""} onChange={(e) => setC("piva", e.target.value)} /></label>
                  {tipoCliente === "azienda"
                    ? <label className="space-y-1"><div className={lab}>Codice fiscale</div><input className={campo} value={cliente.cf || ""} onChange={(e) => setC("cf", e.target.value.toUpperCase())} /></label>
                    : <label className="space-y-1"><div className={lab}>Paese (IT, DE, US…)</div><input className={campo} maxLength={2} value={cliente.paese || ""} onChange={(e) => setC("paese", e.target.value.toUpperCase())} /></label>}
                </>
              )}
              <label className="col-span-2 space-y-1 sm:col-span-3"><div className={lab}>Indirizzo</div><input className={campo} value={cliente.indirizzo || ""} onChange={(e) => setC("indirizzo", e.target.value)} /></label>
              <label className="space-y-1"><div className={lab}>CAP</div><input className={campo} value={cliente.cap || ""} onChange={(e) => setC("cap", e.target.value)} /></label>
              <label className="space-y-1"><div className={lab}>Comune</div><input className={campo} value={cliente.comune || ""} onChange={(e) => setC("comune", e.target.value)} /></label>
              <label className="space-y-1"><div className={lab}>Prov.</div><input className={campo} maxLength={2} value={cliente.provincia || ""} onChange={(e) => setC("provincia", e.target.value.toUpperCase())} /></label>
              {tipoCliente === "azienda" && (
                <>
                  <label className="space-y-1 sm:col-span-2"><div className={lab}>Codice destinatario SDI</div><input className={campo} maxLength={7} placeholder="0000000" value={cliente.sdi || ""} onChange={(e) => setC("sdi", e.target.value.toUpperCase())} /></label>
                  <label className="col-span-2 space-y-1 sm:col-span-2"><div className={lab}>PEC (se manca il codice)</div><input className={campo} value={cliente.pec || ""} onChange={(e) => setC("pec", e.target.value)} /></label>
                </>
              )}
              <label className="col-span-2 space-y-1"><div className={lab}>Email per la copia di cortesia</div><input className={campo} value={cliente.email || ""} onChange={(e) => setC("email", e.target.value)} /></label>
            </div>
            {!anagraficaId && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={salvaAnag} onChange={(e) => setSalvaAnag(e.target.checked)} /> salva questo cliente in anagrafica
              </label>
            )}
            {tipoCliente === "privato" && <p className="text-xs text-muted-foreground">Ai privati la fattura arriva nel loro cassetto fiscale (codice 0000000): consegna loro anche la copia di cortesia.</p>}
            {tipoCliente === "estero" && <p className="text-xs text-muted-foreground">Clienti esteri: codice destinatario XXXXXXX, lo SdI la accetta e la copia va mandata al cliente.</p>}
          </div>

          {/* Righe */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Righe</span>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={prezziIvati} onChange={(e) => setPrezziIvati(e.target.checked)} />
                prezzi IVA inclusa
              </label>
              <Button size="xs" variant="outline" className="ml-auto" onClick={() => setRighe((p) => [...p, rigaVuota(societa === "gingy" ? 10 : 22)])}><Plus /> Riga</Button>
            </div>
            <CercaArticolo listino={catalogo} className="w-full" attivita={attivita} evidenziato
              onScelto={(a) => aggiungiVoce({ gruppo: "", codice: a.codice || null, descrizione: a.descrizione, prezzo_ivato: a.prezzo_ivato, aliquota: a.aliquota })} />
            {catalogo.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
                <select className={`${campo} sm:w-96`} value="" onChange={(e) => {
                  const v = catalogo[Number(e.target.value)];
                  if (v) aggiungiVoce(v);
                }}>
                  <option value="">+ Aggiungi dal listino ({catalogo.length} voci)…</option>
                  {Object.entries(gruppi).map(([g, voci]) => (
                    <optgroup key={g} label={g}>
                      {voci.map((v) => (
                        <option key={`${g}-${v.codice}-${v.descrizione}`} value={catalogo.indexOf(v)}>
                          {v.descrizione.replace(/^Rapporto di Taratura per /, "").replace(/ n\. RDT \d+-$/, "")}
                          {v.prezzo_ivato !== null ? ` — ${eur(v.prezzo_ivato)}` : " — prezzo libero"}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {voce("0020") && <Button size="xs" variant="outline" onClick={() => aggiungiVoce(voce("0020")!)}><Truck /> Spedizione A/R {eur(voce("0020")!.prezzo_ivato)}</Button>}
                {voce("0029") && <Button size="xs" variant="outline" onClick={() => aggiungiVoce(voce("0029")!)}><Wrench /> Manutenzione ordinaria</Button>}
                {voce("0028") && <Button size="xs" variant="outline" onClick={() => aggiungiVoce(voce("0028")!)}><Wrench /> Manutenzione straordinaria</Button>}
                <span className="text-xs text-muted-foreground">Dopo «RDT {String(new Date().getFullYear()).slice(2)}-» scrivi il numero del rapporto.</span>
              </div>
            )}
            <div className="space-y-2">
              {righe.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 rounded-md border p-2">
                  <input className={`${campo} col-span-12 sm:col-span-5`} placeholder="Descrizione" value={r.descrizione} onChange={(e) => setR(i, "descrizione", e.target.value)} />
                  <DecInput className={`${campo} col-span-3 sm:col-span-1`} title="Quantità" value={Number(r.quantita)} onValue={(v) => { setR(i, "quantita", v ?? 1); setSporco(true); }} />
                  <DecInput className={`${campo} col-span-4 sm:col-span-2`} placeholder={prezziIvati ? "Prezzo IVA incl." : "Prezzo netto"}
                    value={(prezziIvati ? r.prezzo_ivato : r.prezzo_unitario) ?? null}
                    onValue={(v) => { setR(i, prezziIvati ? "prezzo_ivato" : "prezzo_unitario", v); setSporco(true); }} />
                  <select className={`${campo} col-span-3 sm:col-span-1 px-1`} title="IVA / regime" value={regimeRiga(r)} onChange={(e) => setRegime(i, e.target.value)}>
                    {REGIMI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <DecInput className={`${campo} col-span-2 sm:col-span-1`} title="Sconto %" placeholder="sc.%" vuotoSeZero value={Number(r.sconto || 0)} onValue={(v) => { setR(i, "sconto", Math.min(100, Math.max(0, v ?? 0))); setSporco(true); }} />
                  <div className="col-span-10 flex items-center justify-end text-sm tabular-nums sm:col-span-1">
                    {eur(stimaTotali([righePerCalcolo[i]]).totale)}
                  </div>
                  <Button variant="ghost" size="icon-sm" className="col-span-2 sm:col-span-1" onClick={() => setRighe((p) => p.filter((_, j) => j !== i))} aria-label="Togli riga"><Trash2 /></Button>
                  {regimeRiga(r) === "margine" && (() => {
                    const prezzoRiga = stimaTotali([righePerCalcolo[i]]).totale;
                    const costoRiga = r.costo_acquisto === null || r.costo_acquisto === undefined ? null : Number(r.costo_acquisto) * Number(r.quantita || 1);
                    const m = ivaMargine(prezzoRiga, costoRiga);
                    return (
                      <div className="col-span-12 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                        <span className="font-medium">Regime del margine</span>
                        <label className="flex items-center gap-1">prezzo di acquisto / da girare al cliente (per pezzo)
                          <DecInput className={`${campo} h-7 w-24`} placeholder="es. 300" value={r.costo_acquisto ?? null}
                            onValue={(v) => { setR(i, "costo_acquisto", v); setSporco(true); }} /></label>
                        {costoRiga === null
                          ? <span className="text-red-700 dark:text-red-300">serve il prezzo di acquisto</span>
                          : <span className="tabular-nums">margine {eur(m.margine)} · IVA sul margine {eur(m.iva)} (22/122, non esposta)</span>}
                        <span className="w-full text-[11px] opacity-80">In fattura: IVA 0 + natura N5, totale = prezzo intero, dicitura «Regime del margine – beni usati». Il costo non va in fattura.</span>
                      </div>
                    );
                  })()}
                  {Number(r.aliquota) === 0 && regimeRiga(r) !== "margine" && (
                    <div className="col-span-12 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select className={campo} value={r.natura || "N2.2"} onChange={(e) => {
                        const n = e.target.value;
                        const preset = Object.values(NATURE_IVA).some((x) => x.rif === (r.riferimento_normativo || ""));
                        setRighe((p) => p.map((x, j) => (j === i ? { ...x, natura: n,
                          riferimento_normativo: (!x.riferimento_normativo || preset) ? (NATURE_IVA[n]?.rif || null) : x.riferimento_normativo } : x)));
                        setSporco(true);
                      }}>
                        {Object.entries(NATURE_IVA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <input className={campo} placeholder="Riferimento normativo (obbligatorio, es. Art. 10 DPR 633/72)" value={r.riferimento_normativo || ""} onChange={(e) => setR(i, "riferimento_normativo", e.target.value)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {serveEstremi && (
              <label className="block space-y-1 rounded-md border border-sky-200 bg-sky-50/50 p-2 dark:bg-sky-950/20">
                <div className={lab}>Estremi della dichiarazione / attestazione del cliente (vanno nel testo della fattura)
                  {righe.some((r) => r.natura === "N3.4") && <b className="text-red-700 dark:text-red-300"> — obbligatori per l&apos;art. 72</b>}</div>
                <input className={campo} value={estremi} onChange={(e) => setEstremi(e.target.value)}
                  placeholder="es. Ambasciata di … — modulo di esenzione n. 123/2026 del 28/09/2026, vidimato dal MAECI" />
              </label>
            )}
            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span>Imponibile</span><span className="tabular-nums">{eur(tot.imponibile)}</span></div>
              <div className="flex justify-between"><span>IVA</span><span className="tabular-nums">{eur(tot.iva)}</span></div>
              <div className="flex justify-between font-semibold"><span>Totale</span><span className="tabular-nums">{eur(tot.totale)}</span></div>
            </div>
          </div>

          {/* Pagamento */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-4">
            <label className="space-y-1"><div className={lab}>Pagamento previsto</div>
              <select className={campo} value={modalita} onChange={(e) => setModalita(e.target.value as FattModalita)}>
                {Object.entries(MODALITA_LABEL).filter(([k]) => k !== "non_pagato").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <div className="flex items-end pb-1.5 text-xs text-muted-foreground sm:col-span-1">Incasso vero e invio allo SdI: dopo il salvataggio, nella bozza.</div>
            <label className="space-y-1"><div className={lab}>Scadenza</div>
              <input type="date" className={campo} value={scadenza} onChange={(e) => setScadenza(e.target.value)} /></label>
            <div className="col-span-2 space-y-1 sm:col-span-4"><div className={lab}>Causale (compare in fattura)</div>
              <input className={campo} value={causale} onChange={(e) => setCausale(e.target.value)} placeholder="es. Tarature sessione n. 165 — vs. ordine n. …" /></div>
            <div className="col-span-2 space-y-1 sm:col-span-4"><div className={lab}>Note interne (non vanno in fattura)</div>
              <input className={campo} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t px-4 pt-3">
          {societa === "genius" && (
            <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Attività</span>
              <SceltaAttivita value={attivita} onChange={(a) => { setAttivita(a); setSporco(true); }} /></div>
          )}
          <SceltaOperatore className="ml-auto max-w-md" value={operatore} onChange={setOperatore} compatto />
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-4 py-3">
          <Button variant="ghost" onClick={chiudi}>Annulla</Button>
          {/* 05/10/2026: niente «Invia allo SdI» da qui — prima il pagamento (o la scelta «da pagare»), poi lo SdI */}
          <Button variant="ghost" disabled={!!salvando || !operatore} onClick={() => salva()}>
            {salvando === "bozza" && <Loader2 className="animate-spin" />} Salva bozza
          </Button>
          <Button variant="outline" className="min-h-11" disabled={!!salvando || !operatore} onClick={() => salva("da_pagare")}>
            {salvando === "da_pagare" ? <Loader2 className="animate-spin" /> : <CalendarClock />} Salva come da pagare
          </Button>
          <Button className="min-h-11" disabled={!!salvando || !operatore} onClick={() => salva("pagamento")}>
            {salvando === "pagamento" ? <Loader2 className="animate-spin" /> : <Wallet />} Salva e registra pagamento
          </Button>
        </div>
        {/* dentro il pannello: i clic nel dialogo non devono arrivare allo sfondo (che chiude l'editor) */}
        <AnnullaEFattura scontrino={daAnnullare} onClose={() => setDaAnnullare(null)} cliente={clienteSnap}
          onFatta={(fid) => { setDaAnnullare(null); setSporco(false); onSaved(fid); }} />
      </div>
    </div>
  );
}
