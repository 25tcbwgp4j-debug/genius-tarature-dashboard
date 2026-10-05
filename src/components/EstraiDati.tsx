"use client";

// «ESTRAI DATI» della controparte (Christian, 05/10/2026): «se non ho il cliente mi serve un campo dove incollo tutti
// i dati e il programma compila i relativi campi». Si incolla il testo (firma mail, visura, WhatsApp…) e/o si aggiunge
// una foto o un PDF (biglietto da visita, visura, fattura precedente) → «Estrai» → ANTEPRIMA dei campi (gli incerti in
// giallo, i mancanti in rosso, P.IVA/CF già in rubrica → «Usa il cliente esistente») → «Compila» riempie il documento
// e salva la controparte in rubrica. Usato nell'editor delle fatture (fattura, nota di credito) e in quello di
// ordini / preventivi / pro forma. Pensato per iPhone e iPad: pulsanti alti, campi a 16 px (niente zoom di Safari).

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileText, ImagePlus, Loader2, Sparkles, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { toastErrore } from "@/lib/errori";
import {
  fattEstraiControparte, fattEstraiSalva,
  type CampiEstratti, type EsistenteEstratto, type EsitoEstrai, type FattAnagrafica, type TipoControparte,
} from "@/lib/api";

const LATO_MAX = 2000;
const PDF_MAX = 3 * 1024 * 1024;   // il proxy accetta ~4,5 MB di corpo: il PDF in base64 cresce di un terzo

/** Foto ridotta (telefoni 12 MP → 2000 px, JPEG 0.85) come data URL: più leggera e più veloce da leggere. */
async function riduci(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Immagine non leggibile"));
      i.src = url;
    });
    const scala = Math.min(1, LATO_MAX / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scala); c.height = Math.round(img.height * scala);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Canvas non disponibile");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function leggiDataUrl(file: Blob): Promise<string> {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ko(new Error("File non leggibile"));
    r.readAsDataURL(file);
  });
}

type Allegato = { nome: string; dataUrl: string; tipo: "image" | "pdf" };

const ETICHETTE: [keyof CampiEstratti, string, string][] = [
  // campo, etichetta, larghezza (colonne su 6)
  ["denominazione", "Ragione sociale / nome", "sm:col-span-6"],
  ["nome", "Nome", "sm:col-span-3"],
  ["cognome", "Cognome", "sm:col-span-3"],
  ["piva", "Partita IVA", "sm:col-span-3"],
  ["cf", "Codice fiscale", "sm:col-span-3"],
  ["sdi", "Codice SDI", "sm:col-span-2"],
  ["pec", "PEC", "sm:col-span-4"],
  ["indirizzo", "Indirizzo", "sm:col-span-6"],
  ["cap", "CAP", "sm:col-span-1"],
  ["comune", "Comune", "sm:col-span-3"],
  ["provincia", "Prov.", "sm:col-span-1"],
  ["paese", "Nazione", "sm:col-span-1"],
  ["email", "Email", "sm:col-span-3"],
  ["telefono", "Telefono", "sm:col-span-3"],
];
const FONTE: Record<string, string> = { ai: "letto dall'AI", vies: "dal VIES", regola: "regola" };

/** Riga di rubrica (fatturazione o clienti Tarature) → campi della controparte. */
export function esistenteInCampi(e: EsistenteEstratto): Partial<CampiEstratti> {
  const r = e.record;
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  if (e.fonte === "fatturazione") {
    return { denominazione: s(r.denominazione), piva: s(r.piva), cf: s(r.cf), sdi: s(r.sdi), pec: s(r.pec), indirizzo: s(r.indirizzo),
      cap: s(r.cap), comune: s(r.comune), provincia: s(r.provincia), paese: s(r.paese) || "IT", email: s(r.email).split(/[;,]/)[0].trim(), telefono: s(r.telefono) };
  }
  return { denominazione: s(r.company_name), piva: s(r.vat_number), cf: s(r.tax_id), sdi: s(r.sdi_code), pec: s(r.pec), indirizzo: s(r.address),
    cap: s(r.zip_code), comune: s(r.city), provincia: s(r.province), paese: "IT", email: s(r.email).split(/[;,]/)[0].trim(),
    telefono: s(r.mobile || r.phone1 || r.whatsapp_phone) };
}

export function EstraiDati({
  societa,
  onCompila,
  onUsaEsistente,
  className = "",
}: {
  societa: string;
  /** campi da mettere nel documento + la riga di rubrica salvata (null se non salvata) */
  onCompila: (c: CampiEstratti, anagrafica: FattAnagrafica | null) => void;
  /** «Usa il cliente esistente»: la P.IVA/CF c'è già in rubrica o tra i clienti */
  onUsaEsistente: (e: EsistenteEstratto) => void;
  className?: string;
}) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const [allegato, setAllegato] = useState<Allegato | null>(null);
  const [busy, setBusy] = useState<"" | "estrai" | "compila">("");
  const [esito, setEsito] = useState<EsitoEstrai | null>(null);
  const [campi, setCampi] = useState<CampiEstratti | null>(null);
  const [salva, setSalva] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  function azzera() { setTesto(""); setAllegato(null); setEsito(null); setCampi(null); }
  function chiudi() { azzera(); setAperto(false); }

  async function aggiungiFile(f: File | Blob, nome = "foto") {
    try {
      if (f.type === "application/pdf") {
        if (f.size > PDF_MAX) { toast.error("PDF troppo grande (max 3 MB): fai una foto della pagina coi dati"); return; }
        setAllegato({ nome, dataUrl: await leggiDataUrl(f), tipo: "pdf" });
      } else if (f.type.startsWith("image/")) {
        setAllegato({ nome, dataUrl: await riduci(f), tipo: "image" });
      } else {
        toast.error("Si possono leggere foto (JPG, PNG, HEIC) o PDF"); return;
      }
      setEsito(null); setCampi(null);
    } catch (e) { toastErrore(e); }
  }

  /** «Incolla»: dagli appunti prende l'immagine (screenshot, foto copiata) o il testo. */
  async function incolla() {
    try {
      const nav = navigator.clipboard as Clipboard & { read?: () => Promise<ClipboardItem[]> };
      if (nav.read) {
        const items = await nav.read();
        for (const it of items) {
          const tipo = it.types.find((t) => t.startsWith("image/") || t === "application/pdf");
          if (tipo) { await aggiungiFile(await it.getType(tipo), "immagine incollata"); return; }
        }
        for (const it of items) {
          if (it.types.includes("text/plain")) {
            const t = await (await it.getType("text/plain")).text();
            if (t.trim()) { setTesto((p) => (p ? `${p}\n${t}` : t)); setEsito(null); return; }
          }
        }
      }
      const t = await navigator.clipboard.readText();
      if (t.trim()) { setTesto((p) => (p ? `${p}\n${t}` : t)); setEsito(null); return; }
      toast.info("Negli appunti non c'è niente da incollare");
    } catch {
      toast.info("Tieni premuto nel riquadro e scegli «Incolla» (il browser non permette di leggere gli appunti)");
    }
  }

  async function estrai() {
    if (busy) return;
    if (!testo.trim() && !allegato) { toast.error("Incolla i dati oppure aggiungi una foto o un PDF"); return; }
    setBusy("estrai");
    try {
      const r = await fattEstraiControparte({ testo, societa, ...(allegato ? { file_base64: allegato.dataUrl } : {}) });
      if (r.vuoto) { toast.error("Non ho trovato dati di un cliente: controlla il testo o la foto"); setEsito(null); setCampi(null); return; }
      setEsito(r); setCampi(r.campi);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  async function compila() {
    if (!campi || busy) return;
    const nome = campi.denominazione || [campi.nome, campi.cognome].filter(Boolean).join(" ");
    if (!nome.trim()) { toast.error("Serve almeno la ragione sociale o nome e cognome"); return; }
    setBusy("compila");
    let anag: FattAnagrafica | null = null;
    try {
      if (salva) {
        const a = await fattEstraiSalva(societa, { ...campi, denominazione: nome });
        anag = a;
        toast.success(a._nuova ? "Cliente salvato in rubrica" : "Cliente già in rubrica: completati i campi vuoti");
      }
    } catch (e) {
      // la rubrica non deve bloccare la fattura: si compila lo stesso
      toastErrore(e);
    }
    onCompila({ ...campi, denominazione: nome }, anag);
    setBusy("");
    chiudi();
  }

  const set = (k: keyof CampiEstratti, v: string) => setCampi((p) => (p ? { ...p, [k]: v } : p));
  const incerto = (k: keyof CampiEstratti) => !!esito?.incerti.includes(k);

  if (!aperto) {
    return (
      <Button type="button" variant="outline" className={`h-10 border-violet-400 text-violet-800 dark:text-violet-200 ${className}`} onClick={() => setAperto(true)}>
        <Sparkles className="size-4" /> Estrai dati
      </Button>
    );
  }

  const tipo = campi?.tipo || "azienda";
  const visibili = ETICHETTE.filter(([k]) => {
    if (tipo === "privato") return k !== "denominazione" && k !== "piva" && k !== "pec";
    if (tipo === "estero") return k !== "nome" && k !== "cognome" && k !== "sdi" && k !== "pec";
    return k !== "nome" && k !== "cognome";
  });

  return (
    <div className="w-full space-y-3 rounded-lg border-2 border-violet-300 bg-violet-50/50 p-3 dark:border-violet-800 dark:bg-violet-950/20">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-violet-700" />
        <span className="font-medium">Estrai dati del cliente</span>
        <Button type="button" variant="ghost" size="icon" className="ml-auto size-10" onClick={chiudi} aria-label="Chiudi"><X /></Button>
      </div>

      {!esito && (
        <>
          <textarea
            className="min-h-32 w-full rounded-md border border-input bg-background p-2 text-base sm:text-sm"
            placeholder={"Incolla qui i dati: firma della mail, visura, messaggio WhatsApp…\nes. «Rossi Impianti Srl – P.IVA 01234567890 – SDI M5UXCR1 – Via Roma 1, 00100 Roma (RM)»"}
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            onPaste={(e) => {
              // screenshot / foto incollati direttamente nel riquadro
              const it = Array.from(e.clipboardData?.items || []).find((x) => x.type.startsWith("image/"));
              const f = it?.getAsFile();
              if (f) { e.preventDefault(); aggiungiFile(f, "immagine incollata"); }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={incolla}><ClipboardPaste className="size-4" /> Incolla</Button>
            <Button type="button" variant="outline" className="h-11" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> Foto o PDF</Button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) aggiungiFile(f, f.name); e.target.value = ""; }} />
            {allegato && (
              <span className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- anteprima locale (data URL) */}
                {allegato.tipo === "pdf" ? <FileText className="size-4" /> : <img src={allegato.dataUrl} alt="" className="size-8 rounded object-cover" />}
                <span className="max-w-40 truncate">{allegato.nome}</span>
                <button type="button" className="p-1 text-muted-foreground" onClick={() => setAllegato(null)} aria-label="Togli il file"><X className="size-4" /></button>
              </span>
            )}
            <Button type="button" className="ml-auto h-11 bg-violet-600 px-5 text-white hover:bg-violet-700" disabled={!!busy || (!testo.trim() && !allegato)} onClick={estrai}>
              {busy === "estrai" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Estrai
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Codici e recapiti si leggono dal testo e si controllano (P.IVA, codice fiscale, SDI, CAP, provincia); l&apos;AI interviene solo per foto, PDF e testi confusi. Niente viene salvato finché non premi «Compila».</p>
        </>
      )}

      {esito && campi && (
        <div className="space-y-3">
          {esito.esistenti.length > 0 && (
            <div className="space-y-2 rounded-md border-2 border-emerald-400 bg-emerald-50 p-2 dark:bg-emerald-950/30">
              <div className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Questo cliente c&apos;è già:</div>
              {esito.esistenti.map((e) => (
                <div key={`${e.fonte}-${e.id}`} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">
                    <b>{e.record.denominazione || e.record.company_name}</b>{" "}
                    <span className="text-xs text-muted-foreground">{e.fonte === "fatturazione" ? "rubrica fatturazione" : "clienti Tarature"} · {e.record.piva || e.record.vat_number || e.record.cf || e.record.tax_id} · {e.record.comune || e.record.city || ""}</span>
                  </span>
                  <Button type="button" className="ml-auto h-11 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { onUsaEsistente(e); chiudi(); }}>
                    <UserCheck className="size-4" /> Usa il cliente esistente
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Tipo</span>
            {(["azienda", "privato", "estero"] as TipoControparte[]).map((t) => (
              <Button key={t} type="button" size="sm" className="h-9" variant={tipo === t ? "default" : "outline"} onClick={() => set("tipo", t)}>
                {t === "azienda" ? "Azienda" : t === "privato" ? "Privato" : "Estero"}
              </Button>
            ))}
            {esito.vies?.disponibile && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${esito.vies.valida ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {esito.vies.valida ? <><CheckCircle2 className="mr-1 inline size-3" />VIES: P.IVA attiva</> : "VIES: non presente"}
              </span>
            )}
            {esito.ai.usata && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">letto anche con l&apos;AI</span>}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            {visibili.map(([k, l, w]) => {
              const inc = incerto(k);
              const fonte = esito.fonti[k];
              const vuoto = !campi[k];
              return (
                <label key={k} className={`col-span-2 space-y-0.5 ${w}`}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {l}
                    {inc && <span className="font-semibold text-amber-700 dark:text-amber-300">· da controllare</span>}
                    {!inc && fonte && FONTE[fonte] && <span className="text-[10px] text-violet-700 dark:text-violet-300">· {FONTE[fonte]}</span>}
                  </div>
                  <input
                    className={`h-11 w-full rounded-md border px-2 text-base sm:text-sm ${inc ? "border-amber-500 bg-amber-50 ring-1 ring-amber-400 dark:bg-amber-950/40" : vuoto ? "border-dashed border-input bg-background" : "border-input bg-background"}`}
                    value={campi[k] || ""}
                    maxLength={k === "provincia" || k === "paese" ? 2 : k === "sdi" ? 7 : k === "cap" ? 5 : undefined}
                    onChange={(e) => set(k, ["cf", "sdi", "provincia", "paese"].includes(k) ? e.target.value.toUpperCase() : e.target.value)}
                  />
                </label>
              );
            })}
          </div>

          {esito.mancanti.length > 0 && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
              <AlertTriangle className="mr-1 inline size-4" />Mancano: <b>{esito.mancanti.join(", ")}</b> — scrivili qui sopra o dopo nel documento.
            </div>
          )}
          {esito.avvisi.length > 0 && (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {esito.avvisi.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={salva} onChange={(e) => setSalva(e.target.checked)} /> salva in rubrica per le prossime volte
            </label>
            <Button type="button" variant="ghost" className="ml-auto h-11" onClick={() => { setEsito(null); setCampi(null); }}>Rifai</Button>
            <Button type="button" className="h-11 bg-violet-600 px-6 text-white hover:bg-violet-700" disabled={!!busy} onClick={compila}>
              {busy === "compila" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Compila
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
