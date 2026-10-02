"use client";

// SPEDIZIONI (Genius Lab Gestionale, 02/10/2026). GENIUS LAB è UNA società con due divisioni (Tarature e Apple):
// UPS (conto 085H5J) e DHL valgono per entrambe. Il selettore della divisione decide solo mittente e firma.
// Da qui: ritiro / spedizione di ritorno di una sessione tarature o di una scheda di assistenza (stesse API delle
// loro pagine), spedizione LIBERA verso/da chiunque (rubrica clienti o indirizzo scritto a mano) e l'elenco di tutte
// le spedizioni con tracking, PDF, stampa e annullamento. Gli operatori del banco possono spedire; le schede Apple
// compaiono solo a chi già le vede.

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Loader2, Printer, Search, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeAttivita, FiltroAttivita, SceltaAttivita, useAttivita, type Attivita } from "@/components/attivita";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { toastErrore } from "@/lib/errori";
import {
  spedAnteprimaLibera, spedCreaLibera, spedElenco, spedPratiche, spedRubrica, spedStampaBanco, spedStato,
  previewShipment, createShipment, cancelShipment, getShipmentLabelUrl,
  type SpedIndirizzo, type SpedPratica, type SpedRiga, type SpedRubrica, type SpedStato, type SpedTipo,
} from "@/lib/api";
import { assAzione } from "@/lib/assistenza";

const TIPI: { k: SpedTipo; l: string; d: string }[] = [
  { k: "ritiro_prenotato", l: "Ritiro con prenotazione", d: "dal cliente verso di noi, il corriere passa da lui nel giorno scelto" },
  { k: "ritiro_senza", l: "Ritiro senza prenotazione", d: "il cliente porta il pacco a un punto del corriere" },
  { k: "spedizione", l: "Spedizione", d: "da noi al destinatario (UPS passa comunque ogni pomeriggio alle 16:30)" },
  { k: "spedizione_ritiro", l: "Spedizione + ritiro da noi", d: "da noi al destinatario, corriere prenotato in Viale Somalia" },
];
const ETICHETTA_TIPO: Record<string, string> = {
  ritiro_prenotato: "Ritiro prenotato", ritiro_senza: "Ritiro senza pren.", spedizione: "Spedizione", spedizione_ritiro: "Spedizione + ritiro da noi",
};
const CAMPI: { k: keyof SpedIndirizzo; l: string; span?: string }[] = [
  { k: "name", l: "Nome / ragione sociale", span: "md:col-span-2" },
  { k: "attention", l: "Referente" },
  { k: "street", l: "Indirizzo", span: "md:col-span-2" },
  { k: "zip", l: "CAP" },
  { k: "city", l: "Città" },
  { k: "province", l: "Prov." },
  { k: "phone", l: "Telefono" },
];

type Modo = "libera" | "sessione" | "scheda";

function prossimoFeriale(): string {
  const d = new Date();
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}
const dataIt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("it-IT") : "");
const dataOra = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

// Stampa dal browser: il PDF in un riquadro nascosto e la finestra di stampa (come nelle sessioni)
async function stampaBrowser(id: string) {
  try {
    const res = await fetch(getShipmentLabelUrl(id));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    const f = document.createElement("iframe");
    Object.assign(f.style, { position: "fixed", width: "0", height: "0", border: "0" });
    f.src = url;
    f.onload = () => {
      try { f.contentWindow?.focus(); f.contentWindow?.print(); } catch { window.open(url, "_blank"); }
      setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60000);
    };
    document.body.appendChild(f);
  } catch (e) { toastErrore(e); }
}

export default function SpedizioniPage() {
  return <Suspense fallback={<div className="p-6"><Loader2 className="animate-spin" /></div>}><Spedizioni /></Suspense>;
}

function Spedizioni() {
  const [stato, setStato] = useState<SpedStato | null>(null);
  const [versione, setVersione] = useState(0);
  useEffect(() => { spedStato().then(setStato).catch(toastErrore); }, []);
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div className="flex items-center gap-2">
        <Truck className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Spedizioni</h1>
        <span className="text-sm text-muted-foreground">UPS e DHL · Tarature e Apple · una società</span>
      </div>
      {stato && <NuovaSpedizione stato={stato} onFatta={() => setVersione((v) => v + 1)} />}
      <Elenco versione={versione} vedeSchede={!!stato?.vede_assistenza} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function NuovaSpedizione({ stato, onFatta }: { stato: SpedStato; onFatta: () => void }) {
  const { attivita: attivitaSelettore } = useAttivita();
  const [attivitaScelta, setAttivitaScelta] = useState<Attivita | null>(null);
  const attivita = attivitaScelta ?? attivitaSelettore;
  const [operatore, setOperatore] = useOperatore();
  const [modo, setModo] = useState<Modo>("libera");
  const [pratica, setPratica] = useState<SpedPratica | null>(null);
  const [tipo, setTipo] = useState<SpedTipo>("spedizione");
  const [corriere, setCorriere] = useState<"UPS" | "DHL">("UPS");
  const [giorno, setGiorno] = useState(prossimoFeriale());
  const [colli, setColli] = useState(1);
  const [peso, setPeso] = useState(1);
  const [ind, setInd] = useState<Partial<SpedIndirizzo>>({});
  const [email, setEmail] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [riferimento, setRiferimento] = useState("");
  const [contenuto, setContenuto] = useState("");
  const [note, setNote] = useState("");
  const [prova, setProva] = useState(true);
  const [mail, setMail] = useState(true);
  const [wa, setWa] = useState(false);
  const [banco, setBanco] = useState(false);
  const [ante, setAnte] = useState<{ indirizzo: SpedIndirizzo; mancanti: string[]; oggetto?: string; corpo?: string; email?: string | null; nota?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const prenota = tipo === "ritiro_prenotato" || tipo === "spedizione_ritiro";
  const direzione = tipo.startsWith("ritiro") ? "ritiro" : "riconsegna";
  const dhlBloccato = corriere === "DHL" && (!stato.dhl_configurato || (!prova && !stato.dhl_produzione));
  const serveOperatore = modo === "scheda";

  const corpoLibera = useCallback(() => ({
    attivita, corriere, tipo, giorno: prenota ? giorno : undefined, colli, peso_kg: peso, controparte: ind,
    email: email ?? "", customer_id: customerId, riferimento, contenuto, note, test: prova,
  }), [attivita, corriere, tipo, prenota, giorno, colli, peso, ind, email, customerId, riferimento, contenuto, note, prova]);
  const corpoSessione = useCallback(() => ({
    direction: direzione as "ritiro" | "riconsegna", carrier: corriere, book_pickup: prenota, pickup_date: prenota ? giorno : null,
    packages: colli, weight_kg: peso, address: ind, email: email ?? undefined, send_email: mail, send_whatsapp: wa, test: prova,
  }), [direzione, corriere, prenota, giorno, colli, peso, ind, email, mail, wa, prova]);
  const corpoScheda = useCallback(() => ({
    operatore, corriere, direzione, indirizzo: ind, giorno_ritiro: prenota ? giorno : undefined,
    prenota: direzione === "riconsegna" ? prenota : undefined, test: prova, invia_mail: mail, stampa: !prova && banco,
  }), [operatore, corriere, direzione, ind, prenota, giorno, prova, mail, banco]);

  // anteprima (indirizzo, campi mancanti, testo della mail) — dall'API giusta per il tipo di pratica
  const chiave = JSON.stringify({ modo, id: pratica?.id, tipo, corriere, giorno, ind, email, attivita, riferimento, prova });
  useEffect(() => {
    if (modo !== "libera" && !pratica) return;
    const t = setTimeout(async () => {
      try {
        if (modo === "libera") {
          const a = await spedAnteprimaLibera(corpoLibera());
          setAnte({ indirizzo: a.indirizzo, mancanti: a.mancanti, oggetto: a.oggetto, corpo: a.corpo, email: a.email,
            nota: `Mittente/destinatario lato nostro: ${a.mittente_lab.name} — ${a.mittente_lab.attention}, ${a.mittente_lab.street}` });
        } else if (modo === "sessione" && pratica) {
          const a = await previewShipment(pratica.id, corpoSessione());
          setAnte({ indirizzo: a.address, mancanti: a.missing, oggetto: a.texts?.oggetto, corpo: a.texts?.mail, email: a.email });
          setEmail((e) => e ?? a.email ?? "");
        } else if (modo === "scheda" && pratica) {
          const a = await assAzione(pratica.id, "spedizione/anteprima", corpoScheda());
          setAnte({ indirizzo: a.indirizzo, mancanti: a.mancanti, oggetto: a.oggetto, corpo: a.corpo, email: a.email,
            nota: a.prova ? "SCHEDA IN PROVA: corriere sempre in ambiente di prova, mail solo all'indirizzo di prova" : a.indirizzo_libero ? `Indicazioni sulla scheda: ${a.indirizzo_libero}` : undefined });
        }
      } catch (e) { toastErrore(e); }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave]);

  function azzera(m: Modo) {
    setModo(m); setPratica(null); setInd({}); setEmail(null); setCustomerId(null); setAnte(null);
    if (m === "sessione" || m === "scheda") setTipo("ritiro_prenotato");
  }
  function sceltaRubrica(r: SpedRubrica) {
    setInd(r.indirizzo); setEmail(r.email || ""); setCustomerId(r.customer_id || null);
  }

  async function crea() {
    if (serveOperatore && !operatore) { toast.error("Scegli l'operatore"); return; }
    const cosa = `${TIPI.find((t) => t.k === tipo)?.l} ${corriere}${prenota ? ` il ${giorno.split("-").reverse().join("/")}` : ""}`;
    if (!prova && !confirm(`Creare l'etichetta ${corriere} VERA (a pagamento sul conto ${corriere})?\n\n${cosa}${mail ? `\nMail a ${email || ante?.email || "(nessuna)"}` : ""}`)) return;
    setBusy(true);
    try {
      let id = "", tracking = "", extra = "";
      if (modo === "libera") {
        const r = await spedCreaLibera({ ...corpoLibera(), operatore: operatore || undefined, invia_mail: mail, stampa: !prova && banco });
        id = r.id; tracking = r.tracking;
        extra = `${r.prn ? ` · ritiro ${r.prn}` : ""}${r.pickup_error ? ` · ERRORE ritiro: ${r.pickup_error}` : ""} · mail: ${r.mail}`;
      } else if (modo === "sessione" && pratica) {
        const r = await createShipment(pratica.id, { ...corpoSessione(), operator: operatore || undefined });
        id = r.id; tracking = r.tracking;
        extra = `${r.pickup_prn ? ` · ritiro ${r.pickup_prn}` : ""}${r.pickup_error ? ` · ERRORE ritiro: ${r.pickup_error}` : ""} · mail: ${r.email} · WhatsApp: ${r.whatsapp}`;
        if (!prova && banco) await spedStampaBanco(r.id).catch(toastErrore);
      } else if (modo === "scheda" && pratica) {
        const r = await assAzione(pratica.id, "spedizione", corpoScheda());
        id = r.id; tracking = r.tracking;
        extra = `${r.prn ? ` · ritiro ${r.prn}` : ""}${r.pickup_error ? ` · ERRORE ritiro: ${r.pickup_error}` : ""}${r.esito?.mail ? ` · mail ${r.esito.mail}` : ""}`;
      }
      toast.success(`${corriere} ${prova ? "(PROVA) " : ""}${tracking}${extra}`, { duration: 12000 });
      if (id && (prova || !banco)) window.open(getShipmentLabelUrl(id), "_blank");
      onFatta();
      setAnte(null);
      if (modo === "libera") { setInd({}); setEmail(null); setCustomerId(null); setRiferimento(""); setContenuto(""); setNote(""); }
      else setPratica(null);
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  const a = ante?.indirizzo;
  const val = (k: keyof SpedIndirizzo) => (ind[k] ?? a?.[k] ?? "") as string;
  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-lg">Nuova spedizione</h2>
        <div className="flex flex-wrap gap-1">
          {([["libera", "Libera (rubrica o a mano)"], ["sessione", "Sessione tarature"], ...(stato.vede_assistenza ? [["scheda", "Scheda assistenza"]] : [])] as [Modo, string][]).map(([m, l]) => (
            <Button key={m} size="sm" variant={modo === m ? "default" : "outline"} onClick={() => azzera(m)}>{l}</Button>
          ))}
        </div>
        {modo === "libera" && (
          <div className="flex items-center gap-2 text-sm ml-auto">
            <span className="text-muted-foreground">Divisione (mittente e firma):</span>
            <SceltaAttivita value={attivita} onChange={(v) => setAttivitaScelta(v)} />
          </div>
        )}
      </div>

      {modo !== "libera" && (
        pratica ? (
          <div className="flex items-center gap-2 rounded border bg-muted/30 px-3 py-2 text-sm">
            <b>{pratica.titolo}</b> · {pratica.cliente} <span className="text-muted-foreground">{pratica.dettaglio}</span>
            <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => { setPratica(null); setAnte(null); setInd({}); setEmail(null); }}><X className="w-4 h-4" /> cambia</Button>
          </div>
        ) : <CercaPratica tipo={modo} onScelta={(p) => { setPratica(p); setInd({}); setEmail(null); }} />
      )}

      {(modo === "libera" || pratica) && (
        <>
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TIPI.map((t) => (
                <button key={t.k} type="button" onClick={() => setTipo(t.k)}
                  className={`rounded-md border p-2 text-left text-sm ${tipo === t.k ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "hover:bg-muted"}`}>
                  <div className="font-semibold">{t.l}</div><div className="text-xs text-muted-foreground">{t.d}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <div className="flex gap-1">{(["UPS", "DHL"] as const).map((c) => <Button key={c} size="sm" variant={corriere === c ? "default" : "outline"} onClick={() => setCorriere(c)}>{c}</Button>)}</div>
              {prenota && <label className="flex flex-col"><span className="text-xs text-muted-foreground">Giorno del ritiro (lun-ven)</span>
                <Input type="date" className="h-8 w-40" value={giorno} onChange={(e) => setGiorno(e.target.value)} /></label>}
              <label className="flex flex-col"><span className="text-xs text-muted-foreground">Colli</span>
                <Input type="number" min={1} className="h-8 w-20" value={colli} onChange={(e) => setColli(Math.max(1, Number(e.target.value) || 1))} /></label>
              <label className="flex flex-col"><span className="text-xs text-muted-foreground">Peso totale kg</span>
                <Input type="number" min={0.5} step={0.5} className="h-8 w-24" value={peso} onChange={(e) => setPeso(Number(e.target.value) || 1)} /></label>
            </div>
          </div>

          {modo === "libera" && <CercaRubrica onScelta={sceltaRubrica} />}

          <div>
            <div className="text-xs font-medium mb-1">{direzione === "ritiro" ? "Mittente (da dove parte il pacco)" : "Destinatario"}{modo !== "libera" ? " — dall'anagrafica, correggibile" : ""}</div>
            <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
              {CAMPI.map(({ k, l, span }) => (
                <label key={k} className={`flex flex-col ${span || ""}`}><span className="text-xs text-muted-foreground">{l}</span>
                  <Input className="h-8" value={val(k)} onChange={(e) => setInd({ ...ind, [k]: e.target.value })} /></label>
              ))}
              {modo !== "scheda" && <label className="flex flex-col"><span className="text-xs text-muted-foreground">Email</span>
                <Input className="h-8" value={email ?? ""} onChange={(e) => setEmail(e.target.value)} /></label>}
            </div>
            {modo === "libera" && (
              <div className="grid gap-2 grid-cols-1 md:grid-cols-3 mt-2">
                <label className="flex flex-col"><span className="text-xs text-muted-foreground">Riferimento (sull&apos;etichetta)</span>
                  <Input className="h-8" maxLength={35} value={riferimento} onChange={(e) => setRiferimento(e.target.value)} /></label>
                <label className="flex flex-col"><span className="text-xs text-muted-foreground">Contenuto</span>
                  <Input className="h-8" maxLength={35} placeholder={attivita === "apple" ? "Dispositivo elettronico" : "Strumenti di misura"} value={contenuto} onChange={(e) => setContenuto(e.target.value)} /></label>
                <label className="flex flex-col"><span className="text-xs text-muted-foreground">Note interne</span>
                  <Input className="h-8" value={note} onChange={(e) => setNote(e.target.value)} /></label>
              </div>
            )}
            {ante?.mancanti?.length ? <p className="text-sm text-red-700 mt-1">Mancano: {ante.mancanti.join(", ")}</p> : null}
          </div>

          {ante && (ante.oggetto || ante.nota) && (
            <details className="rounded border bg-muted/30 p-2 text-xs">
              <summary className="cursor-pointer">{ante.nota || "Testo della mail"}{ante.email ? ` · mail a ${ante.email}` : ""}</summary>
              {ante.oggetto && <><b className="block mt-1">{ante.oggetto}</b><pre className="whitespace-pre-wrap font-sans">{ante.corpo}</pre></>}
            </details>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" checked={prova} onChange={(e) => setProva(e.target.checked)} />
              PROVA (ambiente di test {corriere}: gratis, nessun corriere{modo === "sessione" ? ", niente mail né WhatsApp" : `, mail solo a ${stato.email_test}`})</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} /> Mail con l&apos;etichetta / il tracking</label>
            {modo === "sessione" && <label className="flex items-center gap-1"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} /> WhatsApp dalla linea staff</label>}
            {!prova && <label className="flex items-center gap-1"><input type="checkbox" checked={banco} onChange={(e) => setBanco(e.target.checked)} /> Stampa al banco (agente di stampa)</label>}
          </div>
          {corriere === "DHL" && !stato.dhl_configurato && <p className="text-sm text-red-700">DHL non configurato sul server.</p>}
          {corriere === "DHL" && stato.dhl_configurato && !prova && !stato.dhl_produzione && <p className="text-sm text-amber-800">DHL produzione non ancora attiva sul server: per ora solo in prova (sandpit).</p>}
          {serveOperatore && <SceltaOperatore value={operatore} onChange={setOperatore} compatto className="max-w-md" />}
          <div className="flex justify-end">
            <Button disabled={busy || !ante || !!ante.mancanti?.length || dhlBloccato || (serveOperatore && !operatore)} onClick={crea}>
              {busy ? <Loader2 className="mr-1 w-4 h-4 animate-spin" /> : <Truck className="mr-1 w-4 h-4" />}Crea etichetta {corriere}{prova ? " (prova)" : ""}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function CercaPratica({ tipo, onScelta }: { tipo: "sessione" | "scheda"; onScelta: (p: SpedPratica) => void }) {
  const [q, setQ] = useState("");
  const [ris, setRis] = useState<SpedPratica[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { spedPratiche(tipo, q).then((r) => setRis(r.risultati)).catch(toastErrore); }, 300);
    return () => clearTimeout(t);
  }, [q, tipo]);
  return (
    <div className="space-y-1">
      <div className="relative max-w-md"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input className="pl-8" autoFocus placeholder={tipo === "sessione" ? "Numero di sessione o cliente" : "Sigla, nome, telefono, modello"} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="max-h-64 overflow-y-auto divide-y rounded border">
        {ris === null ? <div className="p-2"><Loader2 className="w-4 h-4 animate-spin" /></div>
          : ris.length === 0 ? <div className="p-2 text-sm text-muted-foreground">Nessun risultato</div>
          : ris.map((p) => (
            <button key={p.id} type="button" onClick={() => onScelta(p)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted">
              <b>{p.titolo}</b> · {p.cliente} <span className="text-muted-foreground">{p.dettaglio} · {dataIt(p.data)}</span>
            </button>
          ))}
      </div>
    </div>
  );
}

function CercaRubrica({ onScelta }: { onScelta: (r: SpedRubrica) => void }) {
  const [q, setQ] = useState("");
  const [ris, setRis] = useState<SpedRubrica[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => { spedRubrica(q).then((r) => setRis(r.risultati)).catch(toastErrore); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const visibili = q.trim().length < 2 ? [] : ris;
  return (
    <div className="space-y-1">
      <div className="relative max-w-md"><Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Cerca nella rubrica clienti (nome, città, email) — oppure scrivi a mano qui sotto" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {visibili.length > 0 && (
        <div className="max-h-56 overflow-y-auto divide-y rounded border">
          {visibili.map((r, i) => (
            <button key={(r.customer_id || r.anagrafica_id || "") + i} type="button" onClick={() => { onScelta(r); setQ(""); setRis([]); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted">
              <b>{r.indirizzo.name}</b>{r.indirizzo.attention && r.indirizzo.attention !== r.indirizzo.name ? ` (${r.indirizzo.attention})` : ""}
              <span className="text-muted-foreground"> · {[r.indirizzo.street, r.indirizzo.zip, r.indirizzo.city].filter(Boolean).join(" ")} · {r.fonte === "clienti" ? "clienti" : "anagrafiche fatture"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Elenco({ versione, vedeSchede }: { versione: number; vedeSchede: boolean }) {
  const [attivita, setAttivita] = useState("");
  const [pratica, setPratica] = useState("");
  const [corriere, setCorriere] = useState("");
  const [prove, setProve] = useState(true);
  const [q, setQ] = useState("");
  const [righe, setRighe] = useState<SpedRiga[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ricarica, setRicarica] = useState(0);
  const filtri = useMemo(() => ({ attivita, pratica, corriere, prove, q }), [attivita, pratica, corriere, prove, q]);
  useEffect(() => {
    const t = setTimeout(() => { spedElenco(filtri).then((r) => setRighe(r.spedizioni)).catch(toastErrore); }, 250);
    return () => clearTimeout(t);
  }, [filtri, versione, ricarica]);

  async function annulla(r: SpedRiga) {
    if (!confirm(`Annullare con ${r.carrier} la spedizione ${r.tracking}${r.pickup_prn ? ` e il ritiro ${r.pickup_prn}` : ""}${r.test_mode ? " (prova)" : ""}?\n\nMail e WhatsApp già inviati non si possono ritirare.`)) return;
    setBusy(r.id);
    try {
      const e = await cancelShipment(r.id);
      toast.success(`${r.carrier}: ritiro ${e.pickup ?? "—"} · etichetta ${e.void ?? "—"}`);
      setRicarica((v) => v + 1);
    } catch (e) { toastErrore(e); } finally { setBusy(null); }
  }
  async function banco(r: SpedRiga) {
    setBusy(r.id);
    try {
      const s = await spedStampaBanco(r.id);
      if (s.agente_attivo) toast.success(`Etichetta in stampa al banco (${s.copie} copie)`);
      else { toast.warning("Agente di stampa non attivo: uso la stampa del browser"); await stampaBrowser(r.id); }
    } catch (e) { toastErrore(e); } finally { setBusy(null); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-lg mr-2">Spedizioni fatte</h2>
        <FiltroAttivita value={attivita} onChange={setAttivita} />
        <select className="h-9 rounded-md border px-2 text-sm bg-background" value={pratica} onChange={(e) => setPratica(e.target.value)} aria-label="Pratica">
          <option value="">Tutte le pratiche</option><option value="sessione">Sessioni tarature</option>
          {vedeSchede && <option value="scheda">Schede assistenza</option>}<option value="libera">Spedizioni libere</option>
        </select>
        <select className="h-9 rounded-md border px-2 text-sm bg-background" value={corriere} onChange={(e) => setCorriere(e.target.value)} aria-label="Corriere">
          <option value="">UPS e DHL</option><option value="UPS">Solo UPS</option><option value="DHL">Solo DHL</option>
        </select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={prove} onChange={(e) => setProve(e.target.checked)} /> mostra le prove</label>
        <Input className="h-9 w-56" placeholder="Tracking, PRN, nome, riferimento" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {righe === null ? <Loader2 className="animate-spin" /> : righe.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna spedizione.</p> : (
        <div className="divide-y">
          {righe.map((r) => {
            const annullata = r.status === "annullata";
            return (
              <div key={r.id} className={`py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1 ${annullata ? "opacity-60" : ""}`}>
                <span className="text-xs text-muted-foreground w-28">{dataOra(r.created_at)}</span>
                <BadgeAttivita a={r.attivita} />
                <b>{r.carrier}</b>
                <span className={`rounded px-1.5 py-0.5 text-xs ${r.direction === "ritiro" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}`}>{ETICHETTA_TIPO[r.tipo || ""] || (r.direction === "ritiro" ? "Ritiro" : "Spedizione")}</span>
                {r.test_mode && <span className="rounded px-1.5 py-0.5 text-xs bg-gray-200 text-gray-700">PROVA</span>}
                {annullata && <span className="rounded px-1.5 py-0.5 text-xs bg-red-100 text-red-700">ANNULLATA</span>}
                {r.pratica.tipo === "sessione" ? <Link className="underline" href={`/sessioni/${r.pratica.id}`}>{r.pratica.titolo}</Link>
                  : r.pratica.tipo === "scheda" ? <Link className="underline" href={`/assistenza?id=${r.pratica.id}`}>{r.pratica.titolo}</Link>
                  : <span className="text-muted-foreground">{r.riferimento || "Libera"}</span>}
                <span>{r.controparte}{r.address?.city ? ` (${r.address.city})` : ""}</span>
                {r.tracking_url ? <a href={r.tracking_url} target="_blank" rel="noreferrer" className="font-mono text-blue-700 inline-flex items-center gap-1">{r.tracking}<ExternalLink className="w-3 h-3" /></a> : <span className="font-mono">{r.tracking}</span>}
                {r.pickup_prn && <span>ritiro {r.pickup_prn}{r.pickup_date ? ` il ${dataIt(r.pickup_date)}` : ""}{r.pickup_location === "lab" ? " da noi" : ""}</span>}
                {r.pickup_error && <span className="text-red-700">ritiro NON prenotato: {r.pickup_error}</span>}
                {r.packages > 1 && <span>{r.packages} colli</span>}
                <span className={r.email_error ? "text-red-700" : "text-muted-foreground"}>mail: {r.email_sent_at ? `inviata${r.email_to ? ` a ${r.email_to}` : ""}` : r.email_error ? "errore" : "—"}</span>
                <span className="ml-auto flex gap-1">
                  <a href={getShipmentLabelUrl(r.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 px-1"><FileText className="w-3 h-3" />PDF</a>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => stampaBrowser(r.id)}><Printer className="w-3 h-3 mr-1" />Stampa</Button>
                  {!annullata && !r.test_mode && <Button size="sm" variant="outline" className="h-7" disabled={busy === r.id} onClick={() => banco(r)}>Al banco</Button>}
                  {!annullata && <Button size="sm" variant="ghost" className="h-7 text-red-700" disabled={busy === r.id} onClick={() => annulla(r)}><X className="w-3 h-3 mr-1" />Annulla</Button>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
