"use client";

// OPENCORE NELLA SCHEDA (15/11/2026, piano Genius 6.1 / OpenCore 4.3).
// · Accettazione: «Password provata davanti al cliente» (spunta che deve essere attiva) e «Dati da conservare: Sì / No»
//   (scelta obbligatoria) sui Mac con il lavoro OpenCore: il 13-14/11 password assenti o non da amministratore e dati
//   da salvare sono stati scoperti a lavoro iniziato. Il server risponde 400 «opencore_accettazione» se mancano.
// · Lavorazione: modello tecnico (hw.model) confermato o PROPOSTO dal Mac con «Conferma modello» (409 «proposta_cambiata»:
//   il Mac ha mandato un modello diverso → si ricarica e si mostra la proposta nuova), versioni ufficiale/consigliata,
//   avviso se il preventivo promette una versione oltre la consigliata, ultimo annuncio del Mac (IP, macOS, quando),
//   stato della lavorazione (fase, «Prossima cosa per Christian», chiavetta).
// · Panoramica Apple: riquadro «Mac in lavorazione» (GET /api/assistenza/mac-in-lavorazione).
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Cpu, Loader2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { chiediTesto } from "@/components/Conferma";
import { codiceErrore, toastErrore } from "@/lib/errori";
import {
  assConfermaModello, assMacInLavorazione, assModifica, COLORE_CHIAVETTA, dataOra, type MacInLavorazione, type Scheda,
} from "@/lib/assistenza";

// ---------------------------------------------------------------------------
// Stessa regola del server (assistenza_opencore.ha_opencore), per la NUOVA scheda che il server non ha ancora visto:
// OpenCore / OCLP / Legacy Patcher scritto nel lavoro, oppure «aggiornamento … Sonoma/Sequoia» su un Mac Intel fino al 2017.
const RE_OPENCORE = /OPEN\s*CORE|OCLP|LEGACY\s+PATCHER/i;
const RE_VERSIONE = /AGGIORN[\s\S]*\b(SONOMA|SEQUOIA)\b|\b(SONOMA|SEQUOIA)\b[\s\S]*AGGIORN/i;
const RE_MAC = /\b(MAC\s?BOOK|IMAC|MAC\s?MINI|MAC\s?PRO)\b/i;
const RE_NON_AGGIORNABILE = /\bM[1-9]\b|IMAC\s?PRO/i;
const RE_ANNO = /\b(19[89]\d|20[0-4]\d)\b/;

export function pareOpencore(modello: string, testo: string): boolean {
  const m = modello || "";
  if (!RE_MAC.test(m) || RE_NON_AGGIORNABILE.test(m)) return false;
  const a = RE_ANNO.exec(m);
  if (a) return Number(a[1]) <= 2017 && (RE_OPENCORE.test(testo) || RE_VERSIONE.test(testo));
  return RE_OPENCORE.test(testo);
}

/** I campi mancanti dell'accettazione OpenCore (vuoto = tutto a posto). */
export function mancaAccettazioneOpencore(provata: boolean | null | undefined, dati: boolean | null | undefined): string[] {
  const out: string[] = [];
  if (provata !== true) out.push("password provata davanti al cliente");
  if (dati !== true && dati !== false) out.push("dati da conservare sì/no");
  return out;
}

/** I due campi obbligatori dell'accettazione OpenCore, con la spiegazione breve. `evidenzia` = bordo rosso sui mancanti. */
export function CampiAccettazioneOpencore({ provata, dati, onProvata, onDati, evidenzia, disabled }: {
  provata: boolean | null | undefined; dati: boolean | null | undefined; onProvata: (v: boolean) => void; onDati: (v: boolean) => void;
  evidenzia?: boolean; disabled?: boolean;
}) {
  const manca = mancaAccettazioneOpencore(provata, dati);
  const rosso = "border-red-500 bg-red-50 dark:bg-red-950/30";
  return (
    <div className={`space-y-2 rounded-lg border-2 p-3 text-sm ${evidenzia && manca.length ? "border-red-500" : "border-amber-400"} bg-amber-50/60 dark:bg-amber-950/20`}
      role="group" aria-label="Accettazione OpenCore">
      <div className="font-semibold">🍏 Mac con aggiornamento OpenCore: due controlli obbligatori prima di accettarlo</div>
      <p className="text-xs text-muted-foreground">Senza la password da amministratore il lavoro si ferma a metà, e i dati vanno decisi adesso (installazione pulita o conservazione con backup).</p>
      <label className={`flex min-h-10 items-center gap-2 rounded-md border px-2.5 py-2 font-medium ${evidenzia && provata !== true ? rosso : "border-transparent"}`}>
        <input type="checkbox" className="size-5" disabled={disabled} checked={provata === true} onChange={(e) => onProvata(e.target.checked)} />
        Password provata davanti al cliente (funziona ed è da amministratore) *
      </label>
      <div className={`flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-2 ${evidenzia && dati !== true && dati !== false ? rosso : "border-transparent"}`}>
        <span className="font-medium">Dati da conservare *</span>
        {([[true, "Sì, conservare"], [false, "No, installazione pulita"]] as [boolean, string][]).map(([k, l]) => (
          <button key={String(k)} type="button" disabled={disabled} aria-pressed={dati === k} onClick={() => onDati(k)}
            className={`min-h-10 rounded-md border px-3 text-sm font-semibold disabled:opacity-60 ${dati === k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{l}</button>
        ))}
      </div>
      {evidenzia && manca.length > 0 && <p className="text-xs font-semibold text-red-700 dark:text-red-300">Manca: {manca.join(" e ")}</p>}
    </div>
  );
}

/** Etichetta colorata della chiavetta (codice dell'etichetta fisica). */
export function EtichettaChiavetta({ c }: { c?: string | null }) {
  if (!c) return null;
  return <span title="Chiavetta in uso" className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold ${COLORE_CHIAVETTA[c] || "bg-muted text-foreground"}`}>🔑 {c}</span>;
}

// ---------------------------------------------------------------------------
/** Riquadro OpenCore della linguetta Lavorazione. */
export function RiquadroOpencore({ s, ro, operatore, onRicarica }: { s: Scheda; ro: boolean; operatore: string; onRicarica: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  // 409 «proposta_cambiata»: dopo la ricarica si mostra la proposta nuova con l'avviso (per questa scheda)
  const [cambiata, setCambiata] = useState<string | null>(null);
  const v = s.opencore_versioni;
  const a = s.mac_annuncio;
  const ls = s.lavorazione_stato;
  const proposta = s.hw_model_annunciato && s.hw_model_annunciato !== s.hw_model ? s.hw_model_annunciato : null;
  const quando = a?.quando || a?.creato_il;

  async function conferma() {
    if (!proposta || !s.hw_model_annunciato_il) return;
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    setBusy(true);
    try {
      const r = await assConfermaModello(s.id, { operatore, hw_model: proposta, hw_model_annunciato_il: s.hw_model_annunciato_il });
      toast.success(`Modello confermato: ${r.hw_model}`);
      setCambiata(null);
      await onRicarica();
    } catch (e) {
      if (codiceErrore(e) === "proposta_cambiata") {
        setCambiata(s.id);
        toast.warning("Il Mac ha mandato un modello diverso, controlla la proposta nuova prima di confermare", { duration: 9000 });
        await onRicarica();
      } else toastErrore(e);
    } finally { setBusy(false); }
  }
  async function aMano() {
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    const t = await chiediTesto({ titolo: "Modello tecnico scritto a mano", etichetta: "hw.model (Informazioni di sistema → Identificativo modello), es. MacBookPro5,4",
      iniziale: s.hw_model || "", obbligatorio: true, ok: "Salva il modello" });
    if (t === null) return;
    setBusy(true);
    try { await assModifica(s.id, { hw_model: t.replace(/\s/g, ""), operatore }); toast.success("Modello tecnico salvato"); await onRicarica(); }
    catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <section className="space-y-3 rounded-xl border-2 border-violet-300 bg-card p-3 shadow-sm dark:border-violet-800 md:p-4" aria-label="OpenCore">
      <div className="flex flex-wrap items-center gap-2">
        <Cpu className="size-4 text-violet-600" />
        <h3 className="text-sm font-semibold">OpenCore · modello, versioni e lavorazione</h3>
        {ls?.chiavetta && <EtichettaChiavetta c={ls.chiavetta} />}
      </div>

      {/* modello tecnico: confermato o proposto dal Mac */}
      <div className="space-y-1.5 text-sm">
        {s.hw_model
          ? <div>Modello confermato: <b className="font-mono">{s.hw_model}</b>{v?.nome ? <span className="text-muted-foreground"> · {v.nome}</span> : null}</div>
          : <div className="text-amber-900 dark:text-amber-200">Modello tecnico <b>non confermato</b>: il preventivo OpenCore usa solo il modello confermato.</div>}
        {cambiata === s.id && <div className="rounded-md border-2 border-amber-500 bg-amber-50 px-2.5 py-1.5 font-semibold text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          ⚠️ Il Mac ha mandato un modello diverso da quello che stavi confermando: controlla la proposta qui sotto.</div>}
        {proposta && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-violet-300 bg-violet-50/70 px-2.5 py-2 dark:border-violet-800 dark:bg-violet-950/30">
            <span>Il Mac si annuncia come <b className="font-mono">{proposta}</b>{s.hw_model_annunciato_il ? ` (${dataOra(s.hw_model_annunciato_il)})` : ""}{s.hw_model ? <span className="font-semibold text-red-700 dark:text-red-300"> · diverso da quello confermato</span> : null}</span>
            {!ro && <Button size="sm" className="ml-auto" disabled={busy} onClick={conferma}>{busy && <Loader2 className="animate-spin" />}Conferma modello</Button>}
          </div>)}
        {!ro && <button type="button" className="inline-flex min-h-9 items-center gap-1 text-xs text-primary underline" disabled={busy} onClick={aMano}><PencilLine className="size-3.5" />Scrivi il modello a mano</button>}
      </div>

      {/* versioni di macOS */}
      {v && (v.ufficiale || v.consigliata) && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-md border bg-muted/30 px-2.5 py-1.5"><span className="block text-xs text-muted-foreground">Ultima ufficiale Apple</span><b>macOS {v.ufficiale || "—"}</b></div>
          <div className="rounded-md border border-emerald-300 bg-emerald-50/60 px-2.5 py-1.5 dark:border-emerald-800 dark:bg-emerald-950/20"><span className="block text-xs text-muted-foreground">Consigliata con OpenCore</span><b>macOS {v.consigliata || "—"}</b></div>
          {(v.grafica || v.note) && <div className="text-xs text-muted-foreground sm:col-span-2">{[v.grafica && `Grafica: ${v.grafica}`, v.note].filter(Boolean).join(" · ")}</div>}
          {v.fonte && v.fonte !== "hw.model" && <div className="text-xs text-amber-800 dark:text-amber-300 sm:col-span-2">Versioni dal nome commerciale: da verificare con il modello tecnico confermato.</div>}
        </div>)}
      {v?.oltre_consigliata && (
        <div className="rounded-md border-2 border-red-500 bg-red-50 px-2.5 py-2 text-sm font-semibold text-red-800 dark:bg-red-950/30 dark:text-red-200">
          ⛔ Il preventivo promette macOS {v.oltre_consigliata}, oltre la versione consigliata ({v.consigliata}) per questo modello: correggi la voce prima di inviare o del PRONTO.
        </div>)}

      {/* ultimo annuncio del Mac */}
      {a && (
        <div className="rounded-md border px-2.5 py-2 text-sm">
          <div className="mb-1 text-xs font-semibold text-muted-foreground">Ultimo annuncio del Mac{quando ? ` · ${dataOra(quando)}` : ""}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {a.ip && <span>IP <b className="font-mono">{a.ip}</b></span>}
            {a.ip_diverso && <span className="rounded bg-red-100 px-1.5 font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-200">⚠️ IP visto dal server diverso: <span className="font-mono">{a.ip_mittente || "—"}</span></span>}
            {a.macos && <span>macOS <b>{a.macos}</b></span>}
            {a.utente && <span>utente <b>{a.utente}</b></span>}
            {a.nome_mac && <span className="text-muted-foreground">{a.nome_mac}</span>}
          </div>
        </div>)}

      {/* a che punto è la lavorazione */}
      {ls && (ls.fase || ls.testo || ls.azione_christian) && (
        <div className="space-y-1.5 rounded-md border px-2.5 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {ls.fase && <b>{ls.fase}</b>}
            {ls.aggiornato_il && <span className="text-xs text-muted-foreground">aggiornato {dataOra(ls.aggiornato_il)}</span>}
          </div>
          {ls.testo && <p className="whitespace-pre-wrap">{ls.testo}</p>}
          {ls.azione_christian && <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="block text-xs font-semibold">Prossima cosa per Christian</span>{ls.azione_christian}</div>}
        </div>)}
    </section>
  );
}

// ---------------------------------------------------------------------------
/** Panoramica Apple: i Mac OpenCore in lavorazione, cliccabili verso la scheda. */
export function MacInLavorazioneRiquadro() {
  const [lista, setLista] = useState<MacInLavorazione[] | null>(null);
  useEffect(() => {
    let vivo = true;
    const carica = () => assMacInLavorazione().then((r) => { if (vivo) setLista(r.schede || []); }).catch(() => { if (vivo) setLista([]); });
    carica();
    const t = setInterval(carica, 5 * 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  if (!lista?.length) return null;
  return (
    <Card className="border-2 border-violet-300 p-3 dark:border-violet-800">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Cpu className="size-4" /> Mac in lavorazione · OpenCore <span className="rounded-full bg-violet-600 px-2 text-xs text-white">{lista.length}</span></h3>
      <ul className="divide-y text-sm">
        {lista.map((m) => (
          <li key={m.id}>
            <Link href={`/assistenza?id=${m.id}`} className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 hover:underline">
              <b className="tabular-nums">{m.sigla}</b><span>{m.azienda || m.nominativo}</span>
              <span className="text-xs text-muted-foreground">{m.modello || m.prodotto}{m.versioni?.consigliata ? ` → macOS ${m.versioni.consigliata}` : ""}</span>
              <EtichettaChiavetta c={m.lavorazione_stato?.chiavetta} />
              {m.lavorazione_stato?.fase && <span className="w-full text-xs font-medium text-violet-800 dark:text-violet-300">{m.lavorazione_stato.fase}{m.lavorazione_stato.testo ? ` · ${m.lavorazione_stato.testo}` : ""}</span>}
              {m.lavorazione_stato?.azione_christian && <span className="w-full text-xs font-semibold text-amber-800 dark:text-amber-300">Prossima cosa per Christian: {m.lavorazione_stato.azione_christian}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
