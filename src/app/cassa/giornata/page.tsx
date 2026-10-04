"use client";

// CASSA DEL GIORNO (GENIUS LAB) — il vecchio Excel «BASE CASSA» che si compila da solo.
// In alto le REGISTRAZIONI del giorno (quadratura, righe, totali, chiusure POS/registratore/fatture, prelievi):
// fatture e scontrini della dashboard entrano da soli, gli scontrini battuti alla cassa si aggiungono a mano.
// In fondo i CONTEGGI (apertura del mattino, contanti della sera, reintegro serale): ogni blocco si conferma e
// resta bloccato (01/10/2026), lo sblocca solo l'amministratore (autorizzazione «sblocca_conteggio»).
// Se i conti tornano si chiude la giornata (l'Excel resta scaricabile dal pulsante, non serve firmarlo).

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, CalendarOff, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2, Lock, Plus, Trash2, Undo2, Unlock, XCircle } from "lucide-react";
import { StornoDialog, type OggettoStorno } from "@/components/StornoDialog";
import { AnnullaEFattura } from "@/components/AnnullaEFattura";
import { usePermessi } from "@/components/permessi";
import { PagaPos } from "@/components/PagaPos";
import { BadgeOperatore, SceltaOperatore, useOperatore } from "@/components/Operatore";
import { BadgeAttivita, FiltroAttivita } from "@/components/attivita";
import { toast } from "sonner";
import { CercaArticolo } from "@/components/CercaArticolo";
import { ChiusuraFiscale } from "./ChiusuraFiscale";
import { ReportCommercialista } from "./ReportCommercialista";
import { GiorniChiusura } from "./GiorniChiusura";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DecInput, parseDec } from "@/components/DecInput";
import { oggiRoma, spostaGiorno } from "@/lib/date";
import type { ApiError } from "@/lib/api";
import { toastErrore } from "@/lib/errori";
import {
  cassaAnnulla, cassaScontrini, type RigaGiornata, type Scontrino,
  cassaGiornata, cassaGiornataChiudi, cassaGiornataConferma, cassaGiornataConfermaApertura, cassaGiornataSblocca, type BloccoCassa, cassaGiornataElimina, cassaGiornataRiapri, cassaGiornataRiga, cassaGiornataSalva, cassaGiornataUrlExcel,
  type FoglioCassa, type Tagli, calendarioApri, calendarioChiudi, cassaDaChiudere, type DaChiudere,
} from "@/lib/api";

// formattatori creati UNA volta: prima se ne creava uno per ogni cifra della tabella (lento sugli iMac vecchi, 04/10/2026)
const FMT_EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const eur = (v: number | null | undefined) => FMT_EUR.format(v || 0);
const COL = [["contanti", "Contanti"], ["pos", "POS"], ["stripe", "Stripe"], ["bonifico", "Bonifico"], ["paypal", "PayPal"]] as const;
const FONTE: Record<string, string> = { fattura: "auto", fattura_prec: "auto", scontrino: "dashboard", manuale: "a mano" };
const TIPI_RIGA: [string, string][] = [
  ["scontrino", "Scontrino (battuto in cassa)"], ["storno", "Storno scontrino (reso)"], ["annullo", "Annullo scontrino"], ["acconto", "Acconto (solo se NON registrato in Ordini)"],
  ["reso", "Rimborso in contanti"], ["fattura", "Fattura fuori dashboard"], ["altro", "Altro"],
];
const TIPI_PRELIEVO: Record<string, string> = { eccesso: "Troppi contanti in cassa", spesa: "Spesa", altro: "Altro" };
const tondo = (v: number) => Math.round(v * 100) / 100;
const FMT_DATE = new Map<string, Intl.DateTimeFormat>();
const dataIt = (g: string, o?: Intl.DateTimeFormatOptions) => {
  const k = JSON.stringify(o || {});
  let fmt = FMT_DATE.get(k);
  if (!fmt) { fmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", ...o }); FMT_DATE.set(k, fmt); }
  return fmt.format(new Date(`${g}T12:00:00Z`));
};
/** Giorno passato nell'indirizzo (?giorno=AAAA-MM-GG): si legge una volta sola all'apertura, mai riscritto (niente rimbalzi). */
function giornoDaUrl(): string | null {
  if (typeof window === "undefined") return null;
  const g = new URLSearchParams(window.location.search).get("giorno") || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(g) ? g : null;
}
const RIGA_VUOTA = { tipo: "scontrino", numero: "", importo: "", modalita: "contanti", descrizione: "", modello: "", prodotto_id: "" };
type Timer = ReturnType<typeof setTimeout>;

// Conteggio contanti: colonna BANCONOTE e colonna MONETE affiancate
function Contanti({ titolo, sotto, tagli, valori, onChange, disabled, colore }: {
  titolo: string; sotto: string; tagli: string[]; valori: Tagli; onChange: (t: Tagli) => void; disabled: boolean; colore: string;
}) {
  const visibili = Array.from(new Set([...tagli, ...Object.keys(valori).filter((t) => valori[t])])).sort((a, b) => Number(b) - Number(a));
  const tot = visibili.reduce((s, t) => s + Number(t) * (valori[t] || 0), 0);
  const colonna = (lista: string[], nome: string) => (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{nome}</div>
      {lista.map((t) => (
        <label key={t} className="flex items-center gap-2">
          <span className="w-12 text-right text-sm font-medium tabular-nums">€ {t.replace(".", ",")}</span>
          <span className="text-xs text-muted-foreground">×</span>
          <Input type="number" min={0} inputMode="numeric" disabled={disabled}
            className="h-9 w-16 border-2 bg-background px-1 text-right text-base font-semibold"
            value={valori[t] || ""} placeholder="0"
            onChange={(e) => onChange({ ...valori, [t]: Math.max(0, parseInt(e.target.value || "0", 10) || 0) })} />
          <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{valori[t] ? eur(Number(t) * valori[t]) : ""}</span>
        </label>
      ))}
    </div>
  );
  return (
    <div className={`space-y-2 rounded-lg border-2 p-3 ${colore}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{titolo}</span>
        <span className="text-xl font-bold tabular-nums">{eur(tot)}</span>
      </div>
      <div className="text-xs text-muted-foreground">{sotto}</div>
      <div className="grid grid-cols-2 gap-3">
        {colonna(visibili.filter((t) => Number(t) >= 5), "Banconote")}
        {colonna(visibili.filter((t) => Number(t) < 5), "Monete")}
      </div>
    </div>
  );
}

function Riquadro({ titolo, valore, sotto, stato, children }: {
  titolo: string; valore?: string; sotto?: React.ReactNode; stato?: "ok" | "ko" | "manca" | "info"; children?: React.ReactNode;
}) {
  const cls = stato === "ok" ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : stato === "ko" ? "border-red-400 bg-red-50 dark:bg-red-950/30"
    : stato === "manca" ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-sky-300 bg-sky-50 dark:bg-sky-950/30";
  return (
    <div className={`space-y-1 rounded-lg border-2 p-3 ${cls}`}>
      <div className="text-xs font-semibold uppercase text-muted-foreground">{titolo}</div>
      {valore !== undefined && <div className="text-xl font-bold tabular-nums">{valore}</div>}
      {sotto && <div className="text-xs text-muted-foreground">{sotto}</div>}
      {children}
    </div>
  );
}

/** Blocco confermato: chi e quando, più lo sblocco (all'operatore chiede l'autorizzazione dell'amministratore). */
function Bloccato({ da, il, extra, onSblocca, busy }: { da?: string | null; il?: string | null; extra?: string; onSblocca?: () => void; busy?: boolean }) {
  const ora = il ? new Date(il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }) : "";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-400 bg-emerald-50 px-2 py-1.5 text-sm dark:bg-emerald-950/30">
      <Lock className="size-4 text-emerald-700" />
      <span className="flex-1 font-medium text-emerald-800 dark:text-emerald-200">Confermato da {da || "—"} il {ora}{extra || ""}</span>
      {onSblocca && <Button size="xs" variant="ghost" disabled={busy} onClick={onSblocca} title="Riapre il blocco alla modifica (serve l'amministratore)">
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Unlock className="size-3" />} Sblocca</Button>}
    </div>
  );
}

export default function CassaGiornataPage() {
  const { admin } = usePermessi();
  // giorno mostrato: quello dell'indirizzo o, finché il server non risponde, l'«oggi» dell'orologio del Mac;
  // alla prima risposta si allinea UNA volta all'«oggi» del server (oggi_roma), poi decide solo l'utente.
  const [giorno, setGiorno] = useState(() => giornoDaUrl() || oggiRoma());
  const giornoRef = useRef(giorno);
  const sceltoDaUtente = useRef(giornoDaUrl() !== null);
  const allineato = useRef(false);
  const [oggiServer, setOggiServer] = useState<string | null>(null);
  const oggi = oggiServer || oggiRoma();
  const oggiRef = useRef(oggi);
  oggiRef.current = oggi;
  const [tentativo, setTentativo] = useState(0);
  const [f, setF] = useState<FoglioCassa | null>(null);
  const [bozza, setBozza] = useState<FoglioCassa["giornata"] | null>(null);
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState("");
  const [nuova, setNuova] = useState(RIGA_VUOTA);
  const [prel, setPrel] = useState({ importo: "", tipo: "eccesso", nota: "" });
  const chiusa = f?.giornata.stato === "chiusa";
  // giorni di chiusura (04/10/2026): sabato/domenica bloccati, festivi, chiusure → niente cassa quel giorno
  const nonLav = !!f?.giornata.non_lavorata;
  const cal = f?.calendario;
  const [giorniAperto, setGiorniAperto] = useState(false);
  const [daChiudere, setDaChiudere] = useState<DaChiudere | null>(null);
  const [storno, setStorno] = useState<OggettoStorno | null>(null);
  // il cliente chiede la fattura dopo lo scontrino: annullo sul registratore + fattura (O scontrino O fattura, 03/10/2026)
  const [daFatturare, setDaFatturare] = useState<Scontrino | null>(null);
  const [operatore, setOperatore] = useOperatore();
  const [filtroAtt, setFiltroAtt] = useState("");   // Genius Lab Gestionale: righe Tarature / Apple
  const [convalida, setConvalida] = useState<{ aperta: boolean; motivo: string }>({ aperta: false, motivo: "" });

  // Salvataggi con attesa di 700 ms: prima di ogni azione (chiusura, conferma, righe, prelievi, cambio giorno)
  // si «svuotano» con flush(), così il backend lavora sempre sugli ultimi numeri scritti.
  const salvaT = useRef<Timer | null>(null);
  const reintT = useRef<Timer | null>(null);
  const inSospeso = useRef<{ base?: () => Promise<void>; reint?: () => Promise<void> }>({});
  const inVolo = useRef(new Set<Promise<void>>());
  const lock = useRef(false);   // niente doppio Invio / doppio click

  /** La risposta riguarda il giorno che sto guardando? (le risposte lente di un altro giorno si scartano) */
  const perQuestoGiorno = useCallback((r: FoglioCassa) => !r.giornata?.giorno || r.giornata.giorno.slice(0, 10) === giornoRef.current, []);
  const applica = useCallback((r: FoglioCassa) => {
    if (!perQuestoGiorno(r)) return;
    setF(r); setBozza(r.giornata); setErrore("");
  }, [perQuestoGiorno]);
  const traccia = useCallback((p: Promise<void>) => {
    inVolo.current.add(p);
    return p.finally(() => { inVolo.current.delete(p); });
  }, []);
  const flush = useCallback(async () => {
    if (salvaT.current) { clearTimeout(salvaT.current); salvaT.current = null; }
    if (reintT.current) { clearTimeout(reintT.current); reintT.current = null; }
    const { base, reint } = inSospeso.current;
    inSospeso.current = {};
    await Promise.all([base?.(), reint?.(), ...inVolo.current]);
  }, []);

  /** Rilettura del giorno guardato (dopo un'azione o dal controllo periodico di oggi). */
  const ricarica = useCallback(() => {
    const g = giornoRef.current;
    return cassaGiornata(g).then((r) => {
      if (r.oggi_roma) setOggiServer(r.oggi_roma);
      applica(r);
    }).catch((e: Error) => { if (g === giornoRef.current) setErrore(e.message); });
  }, [applica]);

  // UN caricamento per cambio giorno (04/10/2026): la richiesta del giorno precedente si annulla (AbortController),
  // dopo 20 s senza risposta si riprova una volta da sola (Safari dopo lo stop del Mac lascia connessioni morte),
  // poi compare l'errore con «Riprova» invece della rotellina infinita.
  useEffect(() => {
    giornoRef.current = giorno;
    const ctl = new AbortController();
    let vivo = true;
    const carica = async (prova: number): Promise<void> => {
      try {
        const r = await cassaGiornata(giorno, ctl.signal);
        if (!vivo) return;
        if (r.oggi_roma) setOggiServer(r.oggi_roma);
        // prima apertura senza giorno scelto: se l'orologio del Mac non è quello del server, si va all'oggi del server (una volta)
        if (!allineato.current) {
          allineato.current = true;
          if (!sceltoDaUtente.current && r.oggi_roma && r.oggi_roma !== giorno) { setGiorno(r.oggi_roma); return; }
        }
        applica(r);
      } catch (e) {
        if (!vivo || ctl.signal.aborted) return;
        const err = e as ApiError;
        if (prova === 0 && (err.timeout || e instanceof TypeError)) return carica(1);
        setErrore(err.timeout ? `${err.message}. Controlla la connessione e premi «Riprova».` : err.message);
      }
    };
    carica(0);
    return () => { vivo = false; ctl.abort(); };
  }, [giorno, tentativo, applica]);

  // «da chiudere» non dipende dal giorno guardato: si legge all'apertura, quando la finestra torna in primo piano
  // e dopo le azioni che cambiano lo stato di una giornata (prima: due volte a ogni cambio giorno)
  const caricaDaChiudere = useCallback(() => {
    return cassaDaChiudere().then((d) => { setDaChiudere(d); if (d.oggi?.giorno) setOggiServer(d.oggi.giorno); return d; }).catch(() => null);
  }, []);
  useEffect(() => {
    caricaDaChiudere();
    const vis = () => { if (document.visibilityState === "visible") caricaDaChiudere(); };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [caricaDaChiudere]);

  /** Cambio giorno: prima salvo quello che è in sospeso sul giorno vecchio. */
  const vaiA = useCallback(async (g: string) => {
    sceltoDaUtente.current = true;
    await flush();
    setF(null); setBozza(null); setErrore(""); setNuova(RIGA_VUOTA);
    setGiorno(g);
  }, [flush]);

  // fatture, scontrini e POS entrano da soli: aggiorno ogni minuto SOLO la cassa di OGGI aperta (non i giorni
  // passati, futuri o chiusi), MAI mentre si scrive o c'è un salvataggio in corso, mai a finestra nascosta
  const aggiornaOgni = !!f && giorno === oggi && !chiusa && !nonLav && !f.giornata.futura;
  useEffect(() => {
    if (!aggiornaOgni) return;
    const t = setInterval(() => {
      const el = document.activeElement;
      const scrive = el instanceof HTMLElement && el.matches("input,textarea,select");
      if (!salvaT.current && !reintT.current && !inVolo.current.size && !scrive && !document.hidden) ricarica();
    }, 60000);
    return () => clearInterval(t);
  }, [aggiornaOgni, ricarica]);

  // la pagina resta aperta sul banco: a mezzanotte si passa da sola al giorno nuovo. L'orologio del Mac fa solo da
  // sveglia: il giorno nuovo è quello che dice il server (un Mac avanti o indietro non fa saltare la cassa)
  useEffect(() => {
    let ultimo = oggiRoma();
    const controlla = () => {
      const o = oggiRoma();
      if (o === ultimo) return;
      ultimo = o;
      const prima = oggiRef.current;
      caricaDaChiudere().then((d) => {
        const nuovo = d?.oggi?.giorno;
        if (nuovo && nuovo !== prima && giornoRef.current === prima) { vaiA(nuovo); toast.info("È cominciato un nuovo giorno: ti porto alla cassa di oggi"); }
      });
    };
    window.addEventListener("focus", controlla);
    document.addEventListener("visibilitychange", controlla);
    const t = setInterval(controlla, 60000);
    return () => { window.removeEventListener("focus", controlla); document.removeEventListener("visibilitychange", controlla); clearInterval(t); };
  }, [vaiA, caricaDaChiudere]);

  function modifica(p: Partial<FoglioCassa["giornata"]>) {
    if (!bozza || chiusa) return;
    const b = { ...bozza, ...p };
    setBozza(b);
    const g = giorno;
    // i blocchi confermati non si rimandano (il server rifiuterebbe ogni modifica con 409)
    inSospeso.current.base = () => traccia(cassaGiornataSalva(g, {
      ...(b.apertura_confermata_il ? {} : { apertura_tagli: b.apertura_tagli }),
      ...(b.chiusura_confermata_il ? {} : { chiusura_tagli: b.chiusura_tagli }),
      pos_terminale: b.pos_terminale, rt_scontrini: b.rt_scontrini, note: b.note,
    }).then((r) => { if (perQuestoGiorno(r)) setF(r); }).catch(toastErrore));
    if (salvaT.current) clearTimeout(salvaT.current);
    salvaT.current = setTimeout(() => {
      salvaT.current = null;
      const run = inSospeso.current.base; inSospeso.current.base = undefined; run?.();
    }, 700);
  }

  function modificaReintegro(p: { reintegro_tagli?: Tagli; reintegro_nota?: string }) {
    if (!bozza) return;
    const b = { ...bozza, ...p };
    setBozza(b);
    const g = giorno;
    inSospeso.current.reint = () => traccia(cassaGiornataSalva(g, { reintegro_tagli: b.reintegro_tagli || {}, reintegro_nota: b.reintegro_nota || "" })
      .then((r) => { if (perQuestoGiorno(r)) setF(r); }).catch(toastErrore));
    if (reintT.current) clearTimeout(reintT.current);
    reintT.current = setTimeout(() => {
      reintT.current = null;
      const run = inSospeso.current.reint; inSospeso.current.reint = undefined; run?.();
    }, 700);
  }

  /** Esegue un'azione una sola volta alla volta, dopo aver salvato quello che è in sospeso. */
  async function azione(nome: string, fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(nome);
    try { await flush(); await fn(); }
    catch (e) { toastErrore(e); }
    finally { lock.current = false; setBusy(""); }
  }

  function confermaApertura() {
    return azione("apertura", async () => {
      const fresco = await cassaGiornata(giorno);   // i numeri appena salvati, non quelli a schermo
      applica(fresco);
      const rpf = fresco.riepilogo;
      const diff = rpf.apertura_attesa === null ? 0 : tondo(rpf.apertura - rpf.apertura_attesa);
      if (Math.abs(diff) >= 0.05 && !confirm(`I soldi contati (${eur(rpf.apertura)}) non corrispondono a quelli attesi (${eur(rpf.apertura_attesa)}). Confermare con differenza ${eur(diff)}?`)) return;
      applica(await cassaGiornataConfermaApertura(giorno));
      toast.success("Apertura confermata");
    });
  }

  function confermaBlocco(blocco: "chiusura" | "reintegro") {
    const nome = blocco === "chiusura" ? "il conteggio dei contanti della sera" : "il reintegro serale";
    if (!confirm(`Confermare ${nome}? Dopo la conferma non si modifica più (salvo sblocco dell'amministratore).`)) return;
    return azione(`conferma-${blocco}`, async () => {
      applica(await cassaGiornataConferma(giorno, blocco));
      toast.success(blocco === "chiusura" ? "Conteggio della sera confermato" : "Reintegro confermato");
    });
  }
  function sblocca(blocco: BloccoCassa) {
    const nome = blocco === "apertura" ? "l'apertura del mattino" : blocco === "chiusura" ? "il conteggio della sera" : "il reintegro serale";
    if (!confirm(`Sbloccare ${nome} per correggerlo? Serve l'autorizzazione dell'amministratore.`)) return;
    return azione(`sblocca-${blocco}`, async () => { applica(await cassaGiornataSblocca(giorno, blocco)); toast.success("Sbloccato: ora si può correggere"); });
  }

  function salvaPrelievi(lista: FoglioCassa["giornata"]["prelievi"]) {
    return azione("prelievo", async () => { applica(await cassaGiornataSalva(giorno, { prelievi: lista })); });
  }
  function aggiungiPrelievo() {
    const imp = parseDec(prel.importo);
    if (imp === null || Number.isNaN(imp) || imp <= 0) { toast.error("Scrivi l'importo del prelievo (es. 50 o 12,50)"); return; }
    return azione("prelievo", async () => {
      applica(await cassaGiornataSalva(giorno, { prelievi: [...(bozza?.prelievi || []), { importo: imp, nota: prel.nota.trim(), tipo: prel.tipo }] }));
      setPrel((x) => ({ importo: "", tipo: x.tipo, nota: "" }));
    });
  }
  function eliminaPrelievo(i: number) {
    const p = bozza?.prelievi[i];
    if (!p || !confirm(`Eliminare il prelievo di ${eur(p.importo)}${p.nota ? ` (${p.nota})` : ""}?`)) return;
    return salvaPrelievi(bozza.prelievi.filter((_, j) => j !== i));
  }

  /** modForzata = «pos» quando il cliente ha appena pagato sul POS SumUp. */
  function aggiungi(modForzata?: string) {
    if (!operatore) { toast.error("Scegli prima l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    const imp = parseDec(nuova.importo);
    if (imp === null || Number.isNaN(imp) || imp === 0) { toast.error("Inserisci l'importo (es. 25 o 12,50)"); return; }
    const mod = modForzata || nuova.modalita;
    // oggi un incasso POS/PayPal si registra solo dopo la verifica automatica (pulsanti sotto); i giorni passati restano liberi
    if (!modForzata && (mod === "pos" || mod === "paypal") && giorno === oggi && imp > 0) {
      if (!admin) { toast.error("POS e PayPal di oggi: usa i pulsanti di pagamento sotto, la riga si aggiunge quando SumUp/PayPal confermano"); return; }
      if (!confirm("Registrare la riga POS/PayPal SENZA verifica del pagamento (solo amministratore)?")) return;
    }
    return azione("riga", async () => {
      applica(await cassaGiornataRiga({ giorno, tipo: nuova.tipo, numero: nuova.numero, descrizione: nuova.descrizione, modello: nuova.modello,
        prodotto_id: nuova.prodotto_id, [mod]: imp, operatore }));
      const n = Number(nuova.numero);
      setNuova({ ...RIGA_VUOTA, tipo: nuova.tipo, modalita: nuova.modalita, numero: nuova.tipo === "scontrino" && n ? String(n + 1) : "" });
    });
  }
  function eliminaRiga(id: string) {
    if (!confirm("Eliminare questa riga?")) return;
    return azione("elimina", async () => { applica(await cassaGiornataElimina(id)); });
  }

  /** Storno/reso o annullo di una riga SCONTRINO: a mano → movimenti/{id}/storno; della dashboard → scontrini/{id}/storno. */
  function apriStorno(r: RigaGiornata) {
    if (r.fonte === "manuale") { setStorno({ fonte: "manuale", riga: r }); return; }
    return azione("storno", async () => {
      const l: { scontrini: Scontrino[] } = await cassaScontrini(giorno);
      const s = l.scontrini.find((x) => x.id === r.id);
      if (!s) { toast.error("Scontrino non trovato"); return; }
      if (["da_stampare", "errore"].includes(s.stato)) {   // mai arrivato al registratore: si toglie dalla coda, niente documento
        if (!confirm("Lo scontrino non è ancora stato emesso dal registratore: annullarlo e rimettere in giacenza gli articoli?")) return;
        await cassaAnnulla(s.id);
        toast.success("Scontrino annullato");
        await ricarica();
        return;
      }
      setStorno({ fonte: "scontrino", scontrino: s });
    });
  }

  function apriFattura(r: RigaGiornata) {
    return azione("fattura", async () => {
      const l: { scontrini: Scontrino[] } = await cassaScontrini(giorno);
      const s = l.scontrini.find((x) => x.id === r.id);
      if (!s) { toast.error("Scontrino non trovato"); return; }
      if (!["emesso", "simulato"].includes(s.stato)) { toast.error("Lo scontrino non risulta emesso dal registratore"); return; }
      if (s.fattura_id) { toast.info("Per questo scontrino c'è già la fattura"); return; }
      setDaFatturare(s);
    });
  }

  function chiudi() {
    if (!f) return;
    return azione("chiudi", async () => {
      const fresco = await cassaGiornata(giorno);   // quadratura sui numeri appena salvati
      applica(fresco);
      if (!fresco.conti_tornano) { setConvalida({ aperta: true, motivo: "" }); return; }   // differenze: si convalida col motivo
      if (!confirm(`Chiudere la cassa del ${dataIt(giorno)}?`)) return;
      applica(await cassaGiornataChiudi(giorno, false, ""));
      caricaDaChiudere();
      toast.success("Giornata chiusa");
    });
  }

  /** Conti che non tornano (centesimi delle fatture, resto sbagliato…): si convalida la differenza e si chiude. */
  function convalidaEChiudi() {
    const m = convalida.motivo.trim();
    if (m.length < 5) { toast.error("Scegli o scrivi il motivo della differenza"); return; }
    return azione("chiudi", async () => {
      applica(await cassaGiornataChiudi(giorno, true, m));
      caricaDaChiudere();
      setConvalida({ aperta: false, motivo: "" });
      toast.success("Differenza convalidata, giornata chiusa");
    });
  }

  /** «Salta questa chiusura»: oggi (o il giorno guardato) siamo rimasti chiusi → non lavorato, la cassa passa al successivo. */
  function saltaChiusura() {
    if (!confirm(`Segnare ${dataIt(giorno, { weekday: "long", day: "numeric", month: "long" })} come giorno NON lavorato? La cassa salta questo giorno e i contanti si riportano al giorno lavorativo successivo.`)) return;
    return azione("salta", async () => {
      const r = await calendarioChiudi(giorno, "non_lavorato", "Salta questa chiusura");
      toast.success(`Giorno non lavorato: la cassa passa a ${dataIt(r.successivo_lavorativo, { weekday: "long", day: "numeric", month: "numeric" })}`);
      await ricarica(); caricaDaChiudere();
    });
  }
  /** Il giorno chiuso in realtà è stato lavorato (anomalie o apertura straordinaria). */
  function lavorato() {
    if (!confirm(`Segnare ${dataIt(giorno, { weekday: "long", day: "numeric", month: "long" })} come giorno LAVORATO? Si apre la sua cassa.`)) return;
    return azione("lavorato", async () => { await calendarioApri(giorno, "aperto dalla cassa del giorno"); toast.success("Giorno lavorato: cassa aperta"); await ricarica(); caricaDaChiudere(); });
  }

  function riapri() {
    if (!confirm("Riaprire la giornata per correggerla? Alla nuova chiusura l'Excel verrà rigenerato.")) return;
    return azione("riapri", async () => { applica(await cassaGiornataRiapri(giorno)); caricaDaChiudere(); });
  }

  const g = bozza;
  const ctl = (k: string) => f?.controlli.find((c) => c.chiave === k);
  const statoCtl = (k: string): "ok" | "ko" | "manca" => { const c = ctl(k); return !c ? "manca" : c.ok ? "ok" : c.mancante ? "manca" : "ko"; };
  const rp = f?.riepilogo;
  const diffContanti = rp ? tondo(rp.chiusura_contata - rp.chiusura_teorica) : 0;
  const seraVuota = !Object.values(g?.chiusura_tagli || {}).some(Boolean);
  const apBloccata = !!g?.apertura_confermata_il;
  const chBloccata = !!g?.chiusura_confermata_il;
  const reBloccato = !!g?.reintegro_confermata_il;

  return (
    <div className="space-y-4 p-1 md:p-2">
      <Dialog open={convalida.aperta} onOpenChange={(o) => !o && setConvalida({ aperta: false, motivo: "" })}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Convalida le differenze e chiudi</DialogTitle>
            <DialogDescription>I conti non tornano al centesimo. Controlla le differenze: se sono giuste, scegli il motivo e chiudi la giornata. Il motivo resta scritto nelle note.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {(f?.controlli || []).filter((c) => !c.ok).map((c) => (
              <div key={c.chiave} className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/30">
                <span className="font-medium">{c.nome}</span>
                <span className="tabular-nums">{c.mancante ? "dato mancante" : <>differenza <b>{(c.differenza ?? 0) > 0 ? "+" : ""}{eur(c.differenza)}</b></>}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Arrotondamento centesimi (fatture/POS)", "Resto dato sbagliato", "Errore di conteggio dei contanti", "Dato del terminale non disponibile"].map((m) => (
              <Button key={m} size="sm" variant={convalida.motivo === m ? "default" : "outline"} onClick={() => setConvalida({ aperta: true, motivo: m })}>{m}</Button>
            ))}
          </div>
          <Input placeholder="oppure scrivi il motivo…" value={convalida.motivo} onChange={(e) => setConvalida({ aperta: true, motivo: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); convalidaEChiudi(); } }} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConvalida({ aperta: false, motivo: "" })}>Annulla</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" disabled={!!busy || convalida.motivo.trim().length < 5} onClick={convalidaEChiudi}>
              {busy === "chiudi" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CheckCircle2 className="mr-1 size-4" />}Convalida e chiudi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-semibold">Cassa del giorno</h1>
        <Button size="icon" variant="outline" className="size-10 md:size-8" title="Giorno lavorativo precedente (salta i giorni di chiusura)"
          onClick={() => vaiA(cal?.precedente_lavorativo || spostaGiorno(giorno, -1))}><ChevronLeft className="size-4" /></Button>
        <label className="flex items-center gap-1"><CalendarDays className="size-4" />
          <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={giorno} onChange={(e) => e.target.value && vaiA(e.target.value)} />
        </label>
        <Button size="icon" variant="outline" className="size-10 md:size-8" title="Giorno lavorativo successivo (salta i giorni di chiusura)"
          onClick={() => vaiA(cal?.successivo_lavorativo || spostaGiorno(giorno, 1))}><ChevronRight className="size-4" /></Button>
        {giorno !== oggi && <Button size="sm" variant="ghost" onClick={() => vaiA(oggi)}>Oggi</Button>}
        {f && nonLav && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-100">NON LAVORATO</span>}
        {f && !f.giornata.futura && !nonLav && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chiusa ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"}`}>
            {chiusa ? `CHIUSA${f.giornata.chiusa_da ? ` da ${f.giornata.chiusa_da}` : ""}` : "APERTA"}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setGiorniAperto(true)} title="Sabati, domeniche, festivi e chiusure">
            <CalendarOff className="mr-1 size-4" />Giorni di chiusura</Button>
          {f && !f.giornata.futura && !nonLav && !chiusa && cal?.lavorativo && f.righe.length === 0 && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={saltaChiusura} title="Siamo rimasti chiusi: giorno non lavorato">
              {busy === "salta" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CalendarOff className="mr-1 size-4" />}Salta questa chiusura</Button>
          )}
          {admin && <ReportCommercialista giorno={giorno} />}
          {!f?.giornata.futura && !nonLav && <Button size="sm" variant="outline" onClick={() => { window.location.href = cassaGiornataUrlExcel(giorno); }}><FileSpreadsheet className="mr-1 size-4" />Excel</Button>}
          {f?.giornata.futura || nonLav ? null : chiusa
            ? <Button size="sm" variant="outline" onClick={riapri} disabled={!!busy}>{busy === "riapri" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Unlock className="mr-1 size-4" />}Riapri</Button>
            : <Button size="sm" onClick={chiudi} disabled={!f || !!busy} className={f?.conti_tornano ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}>
                {busy === "chiudi" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Lock className="mr-1 size-4" />}{f?.conti_tornano ? "Chiudi giornata" : "Convalida e chiudi"}
              </Button>}
        </div>
      </div>

      <GiorniChiusura aperto={giorniAperto} onChiudi={() => setGiorniAperto(false)} giornoIniziale={giorno}
        onCambiato={() => { ricarica(); caricaDaChiudere(); }} />

      {(daChiudere?.giornate || []).filter((x) => x.giorno !== giorno).length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/30">
          {(daChiudere?.giornate || []).filter((x) => x.giorno !== giorno).map((x) => (
            <div key={x.giorno} className="flex flex-wrap items-center gap-2">
              <span className="flex-1">{x.tipo === "anomalia" ? "⚠️" : "🔓"} {x.testo}</span>
              <Button size="sm" variant="outline" className="h-9" onClick={() => vaiA(x.giorno)}>Apri {x.nome}</Button>
            </div>
          ))}
        </div>
      )}

      {f && cal && !cal.lavorativo && !nonLav && cal.anomalie.length > 0 && (
        <div className="space-y-1 rounded-md border-2 border-red-400 bg-red-50 px-3 py-2 text-sm dark:bg-red-950/30">
          <div className="font-semibold">⚠️ {cal.nome} è un giorno di chiusura ({cal.etichetta}) ma ci sono movimenti:</div>
          <ul className="list-disc pl-5">{cal.anomalie.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <div>Se avete lavorato, segnalo come giorno lavorato e chiudi la sua cassa come gli altri giorni.</div>
          <Button size="sm" className="h-10" disabled={!!busy} onClick={lavorato}>È un giorno lavorato</Button>
        </div>
      )}
      {f && cal && cal.lavorativo && cal.assorbiti.length > 0 && !f.giornata.futura && (
        <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950/30">
          📅 Negozio chiuso {cal.assorbiti.map((a) => a.nome).join(", ")}: il riporto dei contanti arriva da{" "}
          <b>{f.riepilogo.apertura_attesa_da ? dataIt(f.riepilogo.apertura_attesa_da, { weekday: "long", day: "2-digit", month: "2-digit" }) : "l'ultimo giorno lavorato"}</b>
          {" "}e gli eventuali incassi elettronici (Stripe, PayPal, POS) di quei giorni sono in questa cassa.
        </div>
      )}

      {f && nonLav ? (
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-lg font-semibold"><CalendarOff className="size-6 text-slate-600" />
            {dataIt(giorno, { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (x) => x.toUpperCase())}: negozio chiuso</div>
          <div className="text-sm text-muted-foreground">
            {cal?.fonte === "settimana" ? "Fine settimana" : (f.giornata.motivo_chiusura || cal?.etichetta)}. Nessuno scontrino, nessuna fattura: la cassa salta questo giorno e i contanti
            si riportano {cal?.precedente_lavorativo ? <>da <b>{dataIt(cal.precedente_lavorativo, { weekday: "long", day: "2-digit", month: "2-digit" })}</b></> : "dall'ultimo giorno lavorato"}
            {cal ? <> a <b>{dataIt(cal.successivo_lavorativo, { weekday: "long", day: "2-digit", month: "2-digit" })}</b></> : null}.
          </div>
          {cal && cal.elettronici.length > 0 && (
            <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950/30">
              Incassi elettronici arrivati oggi: {cal.elettronici.map((e) => e.testo).join(", ")}. Entrano nella cassa di{" "}
              <b>{dataIt(cal.passano_al || cal.successivo_lavorativo, { weekday: "long", day: "2-digit", month: "2-digit" })}</b>: non passano dal cassetto né dal registratore.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {cal && <Button className="h-11" onClick={() => vaiA(cal.successivo_lavorativo)}>Vai a {dataIt(cal.successivo_lavorativo, { weekday: "long", day: "numeric", month: "numeric" })}</Button>}
            {cal?.precedente_lavorativo && <Button variant="outline" className="h-11" onClick={() => vaiA(cal.precedente_lavorativo!)}>Torna a {dataIt(cal.precedente_lavorativo, { weekday: "long", day: "numeric", month: "numeric" })}</Button>}
            <Button variant="outline" className="h-11" disabled={!!busy || f.giornata.futura} onClick={lavorato}>
              {busy === "lavorato" ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}È un giorno lavorato</Button>
          </div>
        </Card>
      ) : f?.giornata.futura ? (
        <Card className="space-y-2 p-6 text-center text-muted-foreground">
          {cal && !cal.lavorativo ? (
            <div>🚪 {dataIt(giorno, { weekday: "long", day: "numeric", month: "long" })}: negozio chiuso ({cal.etichetta}). La cassa salta questo giorno.</div>
          ) : (
            <div>📅 Il {dataIt(giorno, { weekday: "long", day: "numeric", month: "long" })} deve ancora arrivare: la cassa si apre quel giorno.</div>
          )}
          {cal?.lavorativo && f.giornata.apertura_da && (
            <div className="text-foreground">Si aprirà con <b>{eur(Object.entries(f.giornata.apertura_tagli || {}).reduce((t, [k, n]) => t + Number(k) * Number(n || 0), 0))}</b> in contanti,
              riportati da <b>{dataIt(f.giornata.apertura_da, { weekday: "long", day: "2-digit", month: "2-digit" })}</b>.</div>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {cal?.precedente_lavorativo && cal.precedente_lavorativo !== oggi && <Button size="sm" variant="outline" className="h-10" onClick={() => vaiA(cal.precedente_lavorativo!)}>
              Vai a {dataIt(cal.precedente_lavorativo, { weekday: "long", day: "numeric", month: "numeric" })}</Button>}
            <Button size="sm" variant="outline" className="h-10" onClick={() => vaiA(oggi)}>Vai alla cassa di oggi</Button>
          </div>
        </Card>
      ) : !f || !g || !rp ? (errore
        ? <Card className="space-y-2 p-4 text-sm"><div className="font-medium text-red-700">Non riesco a caricare la cassa del {dataIt(giorno)}</div>
            <div className="text-muted-foreground">{errore}</div>
            <Button size="sm" onClick={() => { setErrore(""); setTentativo((n) => n + 1); }}>Riprova</Button></Card>
        : <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carico…</div>) : (<>
        {g.origine === "excel" && (
          <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950/30">
            📄 Giornata importata dal file Excel <b>{g.file_excel}</b>: le righe sono quelle dell&apos;Excel firmato.{g.note ? ` ${g.note.split("\n").slice(-1)[0]}` : ""}
          </div>
        )}
        {/* QUADRATURA */}
        <Card className={`flex flex-wrap items-center gap-3 p-3 ${f.conti_tornano ? "border-2 border-emerald-500" : "border-2 border-red-300"}`}>
          {f.conti_tornano ? <CheckCircle2 className="size-6 text-emerald-600" /> : <XCircle className="size-6 text-red-600" />}
          <span className="text-lg font-semibold">{f.conti_tornano ? "I conti tornano" : "I conti non tornano (ancora)"}</span>
          <div className="flex flex-wrap gap-2">
            {f.controlli.map((c) => (
              <span key={c.chiave} className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.ok ? "bg-emerald-100 text-emerald-800" : c.mancante ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                {c.nome}: {c.ok ? "✓" : c.mancante ? "manca il dato" : `diff. ${eur(c.differenza)}`}
              </span>
            ))}
          </div>
          <span className="ml-auto text-sm text-muted-foreground">Incassi del giorno <b className="text-foreground">{eur(f.totale_giorno)}</b></span>
        </Card>

        {/* RIGHE DEL GIORNO */}
        <Card className="overflow-x-auto p-0">
          {!chiusa && (
            <div className="space-y-2 border-b bg-muted/30 p-3">
              <div className="text-sm font-semibold">Aggiungi una riga</div>
              <SceltaOperatore className="max-w-md" value={operatore} onChange={setOperatore} compatto />
              <div className="flex flex-wrap items-end gap-2">
                <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={nuova.tipo} onChange={(e) => setNuova({ ...nuova, tipo: e.target.value })}>
                  {TIPI_RIGA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <Input className="h-9 w-20" placeholder="N. scontr." value={nuova.numero} onChange={(e) => setNuova({ ...nuova, numero: e.target.value })} />
                <CercaArticolo className="min-w-[260px] flex-1"
                  onScelto={(a) => setNuova({ ...nuova, descrizione: a.descrizione, prodotto_id: a.prodotto_id || "",
                    importo: a.prezzo_ivato !== null ? String(a.prezzo_ivato).replace(".", ",") : nuova.importo })} />
                <Input className="h-9 w-28 border-2 text-right font-semibold" placeholder="€ importo" inputMode="decimal" value={nuova.importo}
                  onChange={(e) => setNuova({ ...nuova, importo: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }} />
                <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={nuova.modalita} onChange={(e) => setNuova({ ...nuova, modalita: e.target.value })}>
                  {COL.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Input className="h-9 min-w-[240px] flex-1" placeholder="Cosa paga? (es. SCHEDA 63020, cavo Apple USB-C…)" value={nuova.descrizione}
                  onChange={(e) => setNuova({ ...nuova, descrizione: e.target.value, prodotto_id: "" })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }} />
                <Input className="h-9 w-40" placeholder="Modello" value={nuova.modello} onChange={(e) => setNuova({ ...nuova, modello: e.target.value })} />
                <Button onClick={() => aggiungi()} disabled={!!busy || !operatore}>{busy === "riga" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}Aggiungi riga</Button>
              </div>
              {giorno === oggi && ["scontrino", "acconto", "fattura", "altro"].includes(nuova.tipo) && (() => {
                const imp = parseDec(nuova.importo);
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">oppure incassa con POS / PayPal (la riga si aggiunge da sola a pagamento verificato):</span>
                    <PagaPos importo={imp && imp > 0 ? imp : 0} descrizione={(nuova.descrizione || "GENIUS LAB").slice(0, 100)} rifTipo="cassa_riga"
                      disabled={!!busy || !operatore} generico paypal onPagato={(p) => aggiungi(p.metodo === "paypal" ? "paypal" : "pos")} />
                  </div>
                );
              })()}
              <div className="text-xs text-muted-foreground">Finché la cassa non è collegata alla dashboard, gli scontrini battuti sul registratore si registrano qui con il loro numero.</div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <FiltroAttivita className="h-8 text-xs" value={filtroAtt} onChange={setFiltroAtt} />
            {filtroAtt && <span>Mostro solo le righe {filtroAtt === "apple" ? "Apple" : "Tarature"}: totali e quadratura restano quelli della giornata intera.</span>}
          </div>
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-2 py-2 text-left">Orario</th><th className="px-2 text-left">Documento</th><th className="px-2 text-left">Num.</th>
                <th className="px-2 text-left" title="Operatore">Op.</th>
                {COL.map(([k, l]) => <th key={k} className="px-2 text-right">{l}</th>)}
                <th className="px-2 text-left">Cosa paga?</th><th className="px-2 text-left">Modello</th><th className="px-2" /></tr>
            </thead>
            <tbody>
              <tr className="border-t bg-muted/20"><td /><td className="px-2 py-1 font-medium">APERTURA</td><td>cassa</td><td /><td className="px-2 text-right tabular-nums">{eur(rp.apertura)}</td><td colSpan={7} /></tr>
              {f.righe.filter((r) => !filtroAtt || r.attivita === filtroAtt).map((r) => {
                const negativo = ["STORNO", "ANNULLO"].includes(r.tipo);
                const stornabile = r.tipo === "SCONTRINO" && (r.fonte === "manuale" || r.fonte === "scontrino") && r.totale > 0;
                return (
                <tr key={`${r.fonte}-${r.id}`} className={`border-t ${negativo ? "bg-red-50/70 dark:bg-red-950/20" : ""}`}>
                  <td className="px-2 py-1 tabular-nums text-muted-foreground" title={r.orario ? undefined : "senza orario: in coda alla giornata"}>{r.orario || "—"}</td>
                  <td className="px-2 py-1">{negativo
                    ? <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">{r.tipo}</span>
                    : r.tipo}<span className="ml-1 text-[10px] text-muted-foreground">{FONTE[r.fonte]}</span> <BadgeAttivita a={r.attivita} /></td>
                  <td className="px-2">{r.numero}</td>
                  <td className="px-2"><BadgeOperatore op={r.operatore} /></td>
                  {COL.map(([k]) => <td key={k} className={`px-2 text-right tabular-nums ${r[k] ? (r[k] < 0 ? "text-red-600" : "") : "text-muted-foreground/40"}`}>{r[k] ? eur(r[k]) : "0"}</td>)}
                  <td className="max-w-[280px] truncate px-2" title={r.descrizione}>{r.descrizione}</td>
                  <td className="px-2">{r.modello}</td>
                  <td className="whitespace-nowrap px-2 text-right">
                    {stornabile && (
                      <button className="mr-2 text-muted-foreground hover:text-red-600" title="Storno / reso o annullo (va nella cassa di oggi)" disabled={!!busy}
                        onClick={() => apriStorno(r)}>{busy === "storno" ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}</button>)}
                    {stornabile && r.fonte === "scontrino" && !chiusa && (
                      <button className="mr-2 text-muted-foreground hover:text-sky-700" title="Il cliente vuole la fattura: annulla lo scontrino e fai la fattura (già pagata)" disabled={!!busy}
                        onClick={() => apriFattura(r)}>{busy === "fattura" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}</button>)}
                    {r.fonte === "manuale" && !chiusa && (
                      <button className="text-muted-foreground hover:text-red-600" title="Elimina riga" disabled={!!busy} onClick={() => eliminaRiga(r.id)}><Trash2 className="size-4" /></button>)}</td>
                </tr>
                );
              })}
              {!f.righe.length && <tr><td colSpan={12} className="px-2 py-4 text-center text-muted-foreground">Nessun movimento</td></tr>}
              <tr className="border-t-2 font-semibold"><td className="px-2 py-1" colSpan={4}>TOTALI</td>
                {COL.map(([k]) => <td key={k} className="px-2 text-right tabular-nums">{eur(f.totali[k] + (k === "contanti" ? rp.apertura : 0))}</td>)}<td colSpan={3} /></tr>
            </tbody>
          </table>
        </Card>

        {/* CHIUSURE DEL GIORNO */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Riquadro titolo="POS — terminale SumUp" stato={statoCtl("pos")}
            valore={rp.pos_terminale === null ? "—" : eur(rp.pos_terminale)}
            sotto={<>righe POS del foglio {eur(f.totali.pos)}{rp.pos_da_sumup !== null ? " · letto da SumUp (pagamenti − rimborsi)" : ""}</>}>
            <DecInput className="mt-1 h-8 bg-background" disabled={chiusa} placeholder={rp.pos_da_sumup !== null ? "correggi a mano (se serve)" : "scrivi il totale del POS"}
              value={g.pos_terminale} onValue={(v) => modifica({ pos_terminale: v })} />
          </Riquadro>
          <Riquadro titolo="Registratore — chiusura scontrini" stato={statoCtl("scontrini")}
            valore={g.rt_scontrini === null || g.rt_scontrini === undefined ? "—" : eur(g.rt_scontrini)}
            sotto={<>{rp.scontrini_n} scontrini nel foglio {eur(rp.scontrini_totale)}{rp.storni_totale ? ` (storni ${eur(rp.storni_totale)})` : ""}</>}>
            <DecInput className="mt-1 h-8 bg-background" disabled={chiusa} placeholder="totale dalla chiusura fiscale" value={g.rt_scontrini}
              onValue={(v) => modifica({ rt_scontrini: v })} />
            <ChiusuraFiscale giorno={giorno} oggi={giorno === oggi && !chiusa} operatore={operatore} onFatta={ricarica} />
          </Riquadro>
          <Riquadro titolo="Fatture del giorno" stato="info" valore={eur(rp.fatture_totale)}
            sotto={<>{rp.fatture_n} fatture{rp.fatture_prec_totale ? ` · + fatture precedenti incassate oggi ${eur(rp.fatture_prec_totale)}` : ""}</>} />
          <Riquadro titolo="Note di credito" stato="info" valore={eur(rp.note_credito_totale)} sotto={`${rp.note_credito_n} note di credito`} />
          <Riquadro titolo="Ordini cliente — acconti" stato="info" valore={eur(rp.acconti_totale)} sotto={`${rp.acconti_n} acconti incassati oggi`} />
          <Riquadro titolo="Rimborsi" stato="info" valore={eur(rp.rimborsi_contanti + rp.storni_totale + rp.note_credito_totale)}
            sotto={<>contanti {eur(rp.rimborsi_contanti)} · storni scontrino {eur(rp.storni_totale)} · note di credito {eur(rp.note_credito_totale)}</>} />
        </div>

        {/* PRELIEVI */}
        <Card className="space-y-2 p-3">
          <div className="flex items-baseline justify-between"><span className="font-semibold">Prelievi di cassa</span><span className="font-semibold tabular-nums">{eur(rp.prelievi)}</span></div>
          {(g.prelievi || []).map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-24 text-right font-medium tabular-nums">{eur(p.importo)}</span>
              <span className="rounded bg-muted px-1.5 text-xs">{TIPI_PRELIEVO[p.tipo || "altro"] || p.tipo}</span>
              <span className="flex-1 text-muted-foreground">{p.nota}</span>
              {!chiusa && <button className="text-muted-foreground hover:text-red-600" title="Elimina prelievo"
                onClick={() => eliminaPrelievo(i)}><Trash2 className="size-4" /></button>}
            </div>
          ))}
          {!chiusa && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
              <Input className="h-9 w-28 border-2 text-right font-semibold" inputMode="decimal" placeholder="€ importo" value={prel.importo}
                onChange={(e) => setPrel({ ...prel, importo: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungiPrelievo(); } }} />
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={prel.tipo} onChange={(e) => setPrel({ ...prel, tipo: e.target.value })}>
                {Object.entries(TIPI_PRELIEVO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <Input className="h-9 min-w-[180px] flex-1" placeholder="motivo (es. versati in banca, spesa cinesi…)" value={prel.nota}
                onChange={(e) => setPrel({ ...prel, nota: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungiPrelievo(); } }} />
              <Button size="sm" onClick={aggiungiPrelievo} disabled={!!busy}>
                {busy === "prelievo" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}Aggiungi prelievo
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Note della giornata</span>
            <textarea className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm" disabled={chiusa} value={g.note ?? ""}
              onChange={(e) => modifica({ note: e.target.value })} />
          </label>
        </Card>
        {/* CONTEGGI DI CASSA (in fondo): apertura del mattino · conteggio della sera · reintegro serale.
            Ogni blocco si CONFERMA e da lì non si modifica più (lo sblocca solo l'amministratore). */}
        <div className="flex items-center gap-2 pt-2">
          <h2 className="text-lg font-semibold">Conteggi di cassa</h2>
          <span className="text-xs text-muted-foreground">ogni blocco confermato resta bloccato: per correggerlo serve lo sblocco dell&apos;amministratore</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_280px]">
          {/* ☀️ APERTURA DEL MATTINO */}
          <div className="space-y-2">
            <Contanti titolo="☀️ Mattina — apertura cassa" colore="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20"
              sotto={apBloccata ? "Apertura confermata: bloccata" : g.nuova && g.apertura_da ? `Precompilata con la sera del ${dataIt(g.apertura_da)}: correggi se serve` : "Conta i soldi in cassa quando apri"}
              tagli={f.tagli_apertura} valori={g.apertura_tagli || {}} disabled={chiusa || apBloccata} onChange={(t) => modifica({ apertura_tagli: t })} />
            {g.origine !== "excel" && (() => {
              const attesa = rp.apertura_attesa;
              const diff = attesa === null ? 0 : tondo(rp.apertura - attesa);
              const ok = Math.abs(diff) < 0.05;
              return (
                <Riquadro titolo="Conferma apertura" stato={apBloccata ? "ok" : "manca"}
                  sotto={attesa === null ? "Nessuna chiusura precedente registrata" :
                    <>la sera del {rp.apertura_attesa_da ? dataIt(rp.apertura_attesa_da) : "giorno prima"} (chiusura + reintegro) doveva lasciare <b>{eur(attesa)}</b>{!ok && <> · <b className="text-red-700">differenza {eur(diff)}</b></>}</>}>
                  {apBloccata ? (
                    <Bloccato da={g.apertura_confermata_da} il={g.apertura_confermata_il} extra={g.apertura_differenza ? ` · differenza ${eur(g.apertura_differenza)}` : " · corrisponde"}
                      onSblocca={chiusa ? undefined : () => sblocca("apertura")} busy={busy === "sblocca-apertura"} />
                  ) : !chiusa && (
                    <>
                      <Button className={`mt-1 w-full ${ok ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`} disabled={!!busy} onClick={confermaApertura}>
                        {busy === "apertura" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Lock className="mr-1 size-4" />}
                        {ok ? "Conferma: la cassa corrisponde" : "Conferma apertura con differenza"}
                      </Button>
                      <div className="text-xs text-muted-foreground">Conta i soldi: se tornano premi Conferma, se no correggi i tagli qui sopra e conferma. Dopo la conferma l&apos;apertura non si modifica più.</div>
                    </>
                  )}
                </Riquadro>
              );
            })()}
          </div>

          {/* 🌙 CONTEGGIO CONTANTI DELLA SERA (chiusura) */}
          <div className="space-y-2">
            <Contanti titolo="🌙 Sera — conteggio contanti (chiusura)" colore="border-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/20"
              sotto={chBloccata ? "Conteggio confermato: bloccato" : "Conta i soldi rimasti in cassa a fine giornata (dopo i prelievi)"}
              tagli={f.tagli_chiusura} valori={g.chiusura_tagli || {}} disabled={chiusa || chBloccata} onChange={(t) => modifica({ chiusura_tagli: t })} />
            {chBloccata ? (
              <Bloccato da={g.chiusura_confermata_da} il={g.chiusura_confermata_il} onSblocca={chiusa ? undefined : () => sblocca("chiusura")} busy={busy === "sblocca-chiusura"} />
            ) : !chiusa && (
              <Button className="w-full" disabled={!!busy || seraVuota} onClick={() => confermaBlocco("chiusura")}
                title={seraVuota ? "Conta prima i contanti" : "Blocca il conteggio della sera"}>
                {busy === "conferma-chiusura" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Lock className="mr-1 size-4" />}Conferma conteggio della sera
              </Button>
            )}
          </div>

          <Riquadro titolo="Conto dei contanti" stato={seraVuota ? "manca" : Math.abs(diffContanti) < 0.05 ? "ok" : "ko"}>
            <div className="space-y-1 text-sm tabular-nums">
              <div className="flex justify-between"><span>Mattina</span><span>{eur(rp.apertura)}</span></div>
              <div className="flex justify-between"><span>+ incassi in contanti</span><span>{eur(f.totali.contanti)}</span></div>
              <div className="flex justify-between"><span>− prelievi</span><span>{eur(rp.prelievi)}</span></div>
              <div className="flex justify-between border-t pt-1 font-semibold"><span>= devono esserci</span><span>{eur(rp.chiusura_teorica)}</span></div>
              <div className="flex justify-between"><span>contati la sera</span><span>{eur(rp.chiusura_contata)}</span></div>
              <div className={`flex justify-between border-t pt-1 text-lg font-bold ${seraVuota ? "text-muted-foreground" : Math.abs(diffContanti) < 0.05 ? "text-emerald-700" : "text-red-700"}`}>
                <span>Differenza</span><span>{seraVuota ? "conta la cassa" : Math.abs(diffContanti) < 0.05 ? "✓ torna" : eur(diffContanti)}</span>
              </div>
            </div>
          </Riquadro>
        </div>

        {/* ➕ REINTEGRO SERALE */}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <Contanti titolo="➕ Reintegro serale (per domani)" colore="border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20"
              sotto={reBloccato ? "Reintegro confermato: bloccato" : "Banconote e monete aggiunte la sera dopo la chiusura (es. da 6 a 10 banconote da 20): si segna anche a cassa chiusa"}
              tagli={f.tagli_apertura} valori={g.reintegro_tagli || {}} disabled={reBloccato} onChange={(t) => modificaReintegro({ reintegro_tagli: t })} />
            <div className="flex flex-wrap items-center gap-2">
              <Input className="h-8 flex-1" placeholder="da dove arrivano (es. cassaforte, cambio in banca…)" value={g.reintegro_nota ?? ""} disabled={reBloccato}
                onChange={(e) => modificaReintegro({ reintegro_nota: e.target.value })} />
              <span className="rounded-md border-2 border-emerald-400 bg-background px-3 py-1 text-sm font-semibold">Cassa per domani: {eur(rp.cassa_per_domani)}</span>
            </div>
            {reBloccato ? (
              <Bloccato da={g.reintegro_confermata_da} il={g.reintegro_confermata_il} onSblocca={() => sblocca("reintegro")} busy={busy === "sblocca-reintegro"} />
            ) : (
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={!!busy} onClick={() => confermaBlocco("reintegro")}>
                {busy === "conferma-reintegro" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Lock className="mr-1 size-4" />}Conferma reintegro serale
              </Button>
            )}
          </div>
        </div>
      </>)}
      <AnnullaEFattura scontrino={daFatturare} onClose={() => setDaFatturare(null)} onCambiato={() => { void ricarica(); }} />
      <StornoDialog oggetto={storno} onClose={() => setStorno(null)} onFatto={() => {
        ricarica();
        if (giorno !== oggi) toast.info("Lo storno è nella cassa di oggi", { action: { label: "Vai a oggi", onClick: () => vaiA(oggi) } });
      }} />
    </div>
  );
}
