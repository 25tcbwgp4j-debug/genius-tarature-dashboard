"use client";

// «Acquisisci» (Christian, 02/10/2026): al banco, dall'iPad mini o dall'iPhone, si inquadra lo strumento con la
// fotocamera e la riga nasce da sola nella sessione; poi «Acquisisci il 2° strumento», e così via, in sequenza.
// Dal Mac si incolla l'immagine dagli appunti (Cmd+V) o la si trascina qui. Il riconoscimento è lo stesso delle
// foto WhatsApp (strumenti_foto.py): fronte e retro dello stesso strumento diventano UNA riga, la stessa matricola
// non fa doppioni. La foto viene ridotta a 1600 px prima dell'invio (Wi-Fi del banco, vision più veloce).
//
// 15/10/2026 — RAFFICA: su iPhone/iPad la fotocamera resta aperta DENTRO la pagina (getUserMedia): si scatta, la foto
// parte in coda e intanto si inquadra già lo strumento dopo. Sotto, l'elenco di quelli registrati in questo giro
// (tipo, marca, modello, matricola, prezzo) con contatore e totale. Se la fotocamera nella pagina non è disponibile
// (permesso negato, http) si usa la fotocamera del telefono come prima, con il pulsante grande «Fotografa il prossimo».
// `apriSubito`: la scheda arriva da «Nuova da foto» (?acquisisci=1) e l'acquisizione è già pronta.
//
// 15/10/2026 (sessione 216) — PIÙ FOTO DELLO STESSO STRUMENTO: da fuori la vision diceva «gruppo manometrico», la foto
// dell'etichetta diceva «misuratore di rete trifase» ma creava un SECONDO strumento. Dopo ogni scatto ci sono due
// pulsanti: «Altra foto di QUESTO strumento» (va su /instruments/{id}/aggiungi-foto: la vision rilegge tutte le foto
// della riga insieme e corregge tipo, marca, modello, matricola, prezzo) e «Strumento SUCCESSIVO» (nuova riga).
// La coda resta UNA e ordinata: la foto «di questo strumento» aspetta che la riga del suo strumento esista.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, ClipboardPaste, GitMerge, Images, Loader2, X, AlertTriangle, Copy, Aperture, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { acquisisciStrumentoDaFoto, aggiungiFotoStrumento, type EsitoAcquisizione, type StrumentoLetto } from "@/lib/api";

interface Props {
  sessionId: string;
  /** strumenti già in sessione (per il numero d'ordine del prossimo) */
  nStrumenti: number;
  /** la sessione è in ATTESA STRUMENTI: la prima foto la porta in registrazione */
  attesaStrumenti?: boolean;
  /** apri subito l'acquisizione (arrivo da «Nuova da foto») */
  apriSubito?: boolean;
  onAggiornato: () => void | Promise<void>;
}

const LATO_MAX = 1600;

/** Riduce un'immagine/canvas a LATO_MAX e la ritorna come data URL JPEG. */
function daCanvas(src: CanvasImageSource, w0: number, h0: number): string {
  const scala = Math.min(1, LATO_MAX / Math.max(w0, h0));
  const w = Math.round(w0 * scala), h = Math.round(h0 * scala);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.drawImage(src, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.85);
}

/** Riduce la foto (telefoni: 12 MP → ~1600 px, JPEG 0.85) e la ritorna come data URL. */
async function riduci(file: File | Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Immagine non leggibile"));
      i.src = url;
    });
    return daCanvas(img, img.width, img.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Esito = EsitoAcquisizione["esito"] | "aggiornato";

const ESITI: Record<Esito, { titolo: string; nota: string; cls: string; Icona: typeof CheckCircle2 }> = {
  nuovo: { titolo: "Strumento registrato", nota: "Controlla marca, modello e matricola nella riga qui sotto.", cls: "border-emerald-300 bg-emerald-50 text-emerald-900", Icona: CheckCircle2 },
  unito: { titolo: "Unito allo strumento precedente", nota: "Fronte e retro dello stesso strumento: i dati sono stati completati sulla stessa riga.", cls: "border-blue-300 bg-blue-50 text-blue-900", Icona: GitMerge },
  doppione: { titolo: "Già in sessione", nota: "Stessa matricola di uno strumento già registrato: nessuna riga aggiunta.", cls: "border-amber-300 bg-amber-50 text-amber-900", Icona: Copy },
  aggiornato: { titolo: "Strumento aggiornato", nota: "Le foto sono state rilette insieme.", cls: "border-emerald-300 bg-emerald-50 text-emerald-900", Icona: CheckCircle2 },
  illeggibile: { titolo: "Foto non leggibile", nota: "Inquadra l'etichetta con marca, modello e matricola (S/N), più da vicino e senza riflessi.", cls: "border-red-300 bg-red-50 text-red-900", Icona: AlertTriangle },
};

const ordinale = (n: number) => `${n}°`;
const euro = (v?: number | null) => (v || v === 0 ? `€ ${Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");

/** Una scheda per STRUMENTO di questo giro (non per foto): `gruppo` lega le foto dello stesso strumento. */
type VoceGiro = {
  gruppo: number;
  esito: Esito;
  strumento: StrumentoLetto | null;
  foto: string;          // miniatura: la prima foto
  nFoto: number;         // foto di questo strumento
  n: number;             // numero d'ordine (solo strumenti nuovi)
  cambiati?: string[];   // campi corretti dall'ultima foto
  doppioneDi?: string | null;
};
type Modo = "nuovo" | "stesso";
const NOMI_CAMPI: Record<string, string> = {
  instrument_name: "tipo", price: "prezzo", manufacturer: "marca", model: "modello", serial_number: "matricola",
  probe_model: "sonda", probe_serial_number: "matricola sonda", measurement_range: "portata",
};
const MAX_FOTO = 4;

export function AcquisisciFoto({ sessionId, nStrumenti, attesaStrumenti, apriSubito, onAggiornato }: Props) {
  const [attivo, setAttivo] = useState(false);
  const [inCoda, setInCoda] = useState(0);           // foto scattate e non ancora lette
  const [giro, setGiro] = useState<VoceGiro[]>([]);  // risultati di questo giro, il più recente in alto
  const [totale, setTotale] = useState<number | null>(null);
  const [nSessione, setNSessione] = useState<number | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const radiceRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState<"off" | "avvio" | "on" | "no">("off");
  const [lampo, setLampo] = useState(false);
  // Mac: niente fotocamera, si incolla. Si decide dal touch (iPad e iPhone hanno maxTouchPoints > 0).
  const [touch, setTouch] = useState(true);
  useEffect(() => { setTouch(typeof navigator !== "undefined" && navigator.maxTouchPoints > 0); }, []);

  // Coda: le foto si leggono UNA alla volta e in ordine (fronte e retro dello stesso strumento si uniscono solo così).
  // Ogni foto porta il suo `gruppo` (= lo strumento): «nuovo» apre un gruppo, «stesso» si aggiunge all'ultimo.
  const coda = useRef<{ dataUrl: string; gruppo: number; modo: Modo }[]>([]);
  const lavora = useRef(false);
  const contatore = useRef(0);
  const pendenti = useRef(0);   // scattate e non ancora lette (compresa quella in lettura)
  const gruppoCorrente = useRef(0);   // 0 = nessuno strumento ancora in questo giro
  // gruppo -> riga creata (id) e foto non ancora agganciate a una riga (prima foto illeggibile)
  const gruppi = useRef<Map<number, { id?: string; orfane: string[]; nFoto: number }>>(new Map());
  const [nGruppo, setNGruppo] = useState(0);   // per il rendering dei pulsanti «questo / successivo»
  const modoInput = useRef<Modo>("nuovo");
  const aggiornaRef = useRef(onAggiornato);
  useEffect(() => { aggiornaRef.current = onAggiornato; }, [onAggiornato]);

  const scheda = useCallback((v: VoceGiro) => {
    setGiro((g) => {
      const i = g.findIndex((x) => x.gruppo === v.gruppo);
      if (i < 0) return [v, ...g].slice(0, 40);
      const copia = [...g];
      copia[i] = { ...copia[i], ...v, foto: copia[i].foto || v.foto, n: copia[i].n || v.n };
      return copia;
    });
  }, []);

  const leggi = useCallback(async ({ dataUrl, gruppo }: { dataUrl: string; gruppo: number; modo: Modo }) => {
    const gr = gruppi.current.get(gruppo) || { orfane: [], nFoto: 0 };
    gruppi.current.set(gruppo, gr);
    gr.nFoto += 1;
    if (gr.id) {
      // altra foto di uno strumento già registrato: la vision rilegge tutte le sue foto insieme
      const r = await aggiungiFotoStrumento(gr.id, dataUrl);
      if (typeof r.totale === "number") setTotale(r.totale);
      if (typeof r.n_strumenti === "number") setNSessione(r.n_strumenti);
      gr.nFoto = r.n_foto || gr.nFoto;
      scheda({ gruppo, esito: r.esito, strumento: r.strumento, foto: dataUrl, nFoto: gr.nFoto, n: 0,
        cambiati: r.cambiati, doppioneDi: r.doppione_di?.descrizione || null });
      if (r.esito === "illeggibile") toast.warning("Questa foto non aggiunge dati: prova più da vicino sull'etichetta");
      else if (r.esito === "doppione") toast.warning(`Matricola già su un altro strumento: ${r.doppione_di?.descrizione || ""}`);
      else {
        const c = (r.cambiati || []).map((k) => NOMI_CAMPI[k]).filter(Boolean);
        toast.success(c.length ? `Corretto: ${c.join(", ")}` : "Foto aggiunta: dati confermati");
        await aggiornaRef.current();
      }
      return;
    }
    // primo scatto dello strumento (o foto precedenti illeggibili): tutte insieme → una riga
    const foto = [...gr.orfane, dataUrl].slice(-MAX_FOTO);
    const r = await acquisisciStrumentoDaFoto(sessionId, foto);
    const id = r.esito === "illeggibile" ? undefined : (r.doppione_di?.id || r.strumento?.id);
    if (id) { gr.id = id; gr.orfane = []; } else gr.orfane = foto;
    const n = r.esito === "nuovo" ? ++contatore.current : 0;
    scheda({ gruppo, esito: r.esito, strumento: r.strumento, foto: foto[0], nFoto: gr.nFoto, n,
      doppioneDi: r.doppione_di?.descrizione || null });
    if (typeof r.totale === "number") setTotale(r.totale);
    if (typeof r.n_strumenti === "number") setNSessione(r.n_strumenti);
    if (r.esito === "illeggibile") toast.warning("Foto non leggibile: fai un'altra foto di questo strumento, sull'etichetta con la matricola");
    else await aggiornaRef.current();
  }, [sessionId, scheda]);

  const svuotaCoda = useCallback(async () => {
    if (lavora.current) return;
    lavora.current = true;
    try {
      while (coda.current.length) {
        const voce = coda.current.shift()!;
        try {
          await leggi(voce);
        } catch (e) {
          toast.error("Acquisizione non riuscita: " + (e as Error).message);
        } finally {
          pendenti.current = Math.max(0, pendenti.current - 1);
          setInCoda(pendenti.current);
        }
      }
    } finally {
      lavora.current = false;
    }
  }, [leggi]);

  const accoda = useCallback((dataUrl: string, modo: Modo = "nuovo") => {
    if (modo === "nuovo" || gruppoCorrente.current === 0) {
      gruppoCorrente.current += 1;
      setNGruppo(gruppoCorrente.current);
    }
    coda.current.push({ dataUrl, gruppo: gruppoCorrente.current, modo });
    pendenti.current += 1;
    setInCoda(pendenti.current);
    void svuotaCoda();
  }, [svuotaCoda]);

  const invia = useCallback(async (file: File | Blob, modo: Modo = "nuovo") => {
    try { accoda(await riduci(file), modo); } catch (e) { toast.error((e as Error).message); }
  }, [accoda]);

  // --- fotocamera dentro la pagina (raffica)
  const fermaLive = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive((s) => (s === "no" ? s : "off"));
  }, []);

  const avviaLive = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setLive("no"); return false; }
    setLive("avvio");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false,
      });
      streamRef.current = s;
      setLive("on");
      return true;
    } catch {
      setLive("no");
      return false;
    }
  }, []);

  // il <video> nasce dopo setLive("on"): lì gli si attacca lo stream
  useEffect(() => {
    if (live === "on" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => { /* iOS: riparte al primo tocco */ });
    }
  }, [live, attivo]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const scatta = (modo: Modo = "nuovo") => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { toast.warning("La fotocamera si sta ancora avviando"); return; }
    try {
      accoda(daCanvas(v, v.videoWidth, v.videoHeight), modo);
      setLampo(true); setTimeout(() => setLampo(false), 150);
    } catch (e) { toast.error((e as Error).message); }
  };

  // Incolla dagli appunti (Mac) finché il pannello è aperto
  useEffect(() => {
    if (!attivo) return;
    const onPaste = (e: ClipboardEvent) => {
      const it = Array.from(e.clipboardData?.items || []).find((x) => x.type.startsWith("image/"));
      const f = it?.getAsFile();
      if (f) { e.preventDefault(); invia(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [attivo, invia]);

  const daInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";   // la stessa foto rifatta deve ripartire
    const modo = modoInput.current;
    modoInput.current = "nuovo";
    // galleria con più foto: ognuna è uno strumento (come prima), salvo «altra foto di questo strumento»
    files.forEach((f) => invia(f, modo));
  };
  const fotografa = (modo: Modo) => { modoInput.current = modo; camRef.current?.click(); };
  const daGalleria = (modo: Modo) => { modoInput.current = modo; galRef.current?.click(); };

  // Apertura: su iPhone/iPad la fotocamera nella pagina; se non c'è, quella del telefono (serve il gesto: Safari)
  const apri = async () => {
    setAttivo(true);
    if (!touch) return;
    const ok = await avviaLive();
    // senza fotocamera nella pagina si apre quella del telefono (dopo l'await il gesto può essere scaduto:
    // in quel caso resta il pulsante grande «Fotografa»)
    if (!ok) camRef.current?.click();
  };
  const chiudi = () => { fermaLive(); setAttivo(false); };

  const avviato = useRef(false);
  useEffect(() => {
    if (!apriSubito || avviato.current) return;
    avviato.current = true;
    // il touch si legge qui direttamente: lo stato `touch` al primo giro vale ancora true anche sul Mac
    setAttivo(true);
    // il pannello sta in fondo alla scheda: lo si porta in vista
    setTimeout(() => radiceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    if (navigator.maxTouchPoints > 0) void avviaLive();
  }, [apriSubito, avviaLive]);

  const nGiro = giro.filter((g) => g.n > 0).length;
  const prossimo = (nSessione ?? nStrumenti) + 1;
  const etichetta = nStrumenti === 0 && nGiro === 0 ? "Fotografa strumento" : `Fotografa il ${ordinale(prossimo)} strumento`;
  const ultimo = giro[0];
  // strumento in corso: l'ultimo gruppo aperto (le sue foto possono essere ancora in coda)
  const fotoInCorso = (gruppi.current.get(nGruppo)?.nFoto || 0) + coda.current.filter((c) => c.gruppo === nGruppo).length;
  const haCorrente = nGruppo > 0;
  const prossimoNuovo = prossimo + coda.current.filter((c) => c.modo === "nuovo" && !gruppi.current.has(c.gruppo)).length;

  return (
    <div ref={radiceRef} className="w-full scroll-mt-2">
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={daInput} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={daInput} />

      {!attivo ? (
        <Button onClick={() => apri()} className="h-12 w-full bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 sm:w-auto"
          title="Fotografa lo strumento: marca, modello e matricola vengono letti dalla foto">
          <Camera className="size-5" /> {etichetta}
        </Button>
      ) : (
        <div
          className="space-y-3 rounded-lg border-2 border-blue-300 bg-blue-50/60 p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/")).forEach((f) => invia(f)); }}
        >
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-2.5">
              <Camera className="size-5 text-blue-700" />
              <p className="text-sm font-semibold text-blue-900">Acquisisci strumenti</p>
              <span className="rounded bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">{nGiro} in questo giro</span>
              {totale !== null && <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">Totale sessione {euro(totale)}</span>}
            </div>
            <button type="button" className="flex size-11 shrink-0 items-center justify-center rounded-md text-blue-700 hover:bg-blue-100" onClick={chiudi} title="Chiudi">
              <X className="size-5" />
            </button>
          </div>
          {attesaStrumenti && nGiro === 0 && (
            <p className="text-xs text-orange-800">La sessione è in ATTESA STRUMENTI: con la prima foto passa da sola in registrazione.</p>
          )}

          {/* Fotocamera nella pagina: si scatta in raffica, le foto si leggono in coda */}
          {live === "on" || live === "avvio" ? (
            <div className="space-y-2">
              <div className="relative overflow-hidden rounded-lg bg-black">
                <video ref={videoRef} playsInline muted autoPlay className="max-h-[55dvh] w-full object-contain landscape:max-h-[50dvh]" />
                {live === "avvio" && <div className="absolute inset-0 flex items-center justify-center text-sm text-white"><Loader2 className="mr-2 size-5 animate-spin" /> Avvio fotocamera…</div>}
                {lampo && <div className="pointer-events-none absolute inset-0 bg-white/70" />}
                {inCoda > 0 && (
                  <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                    <Loader2 className="size-3.5 animate-spin" /> Leggo {inCoda} foto…
                  </div>
                )}
              </div>
              {haCorrente ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Button onClick={() => scatta("stesso")} disabled={live !== "on"}
                    className="h-auto min-h-16 whitespace-normal bg-emerald-600 py-2 text-base font-bold text-white hover:bg-emerald-700 sm:text-lg">
                    <Camera className="size-6 shrink-0" /> Altra foto di QUESTO strumento
                    {fotoInCorso > 0 && <span className="rounded bg-white/25 px-1.5 text-sm">{fotoInCorso} foto</span>}
                  </Button>
                  <Button onClick={() => scatta("nuovo")} disabled={live !== "on"}
                    className="h-auto min-h-16 whitespace-normal bg-blue-600 py-2 text-base font-bold text-white hover:bg-blue-700 sm:text-lg">
                    <Aperture className="size-6 shrink-0" /> Strumento SUCCESSIVO · {ordinale(prossimoNuovo)}
                  </Button>
                  <Button variant="outline" onClick={() => daGalleria("nuovo")} className="h-14 bg-white sm:h-auto" title="Scegli foto già scattate">
                    <Images className="size-5" /><span className="sm:hidden">Dalla galleria</span>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Button onClick={() => scatta("nuovo")} disabled={live !== "on"} className="h-16 bg-blue-600 text-lg font-bold text-white hover:bg-blue-700">
                    <Aperture className="size-6" /> Scatta · {ordinale(prossimoNuovo)} strumento
                  </Button>
                  <Button variant="outline" onClick={() => daGalleria("nuovo")} className="h-16 bg-white" title="Scegli foto già scattate">
                    <Images className="size-5" />
                  </Button>
                </div>
              )}
              <p className="text-xs text-blue-800">Inquadra marca e modello, poi l&apos;etichetta con la matricola con «Altra foto di QUESTO strumento»: le foto vengono lette insieme e finiscono sulla stessa riga.</p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-2 ${haCorrente ? "sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]" : "sm:grid-cols-[1fr_auto_auto]"}`}>
              {haCorrente && (
                <Button onClick={() => fotografa("stesso")}
                  className="h-auto min-h-16 whitespace-normal bg-emerald-600 py-2 text-base font-bold text-white hover:bg-emerald-700 sm:text-lg">
                  <Camera className="size-6 shrink-0" />
                  {ultimo?.esito === "illeggibile" && ultimo.gruppo === nGruppo ? "Rifai la foto di QUESTO strumento" : "Altra foto di QUESTO strumento"}
                  {fotoInCorso > 0 && <span className="rounded bg-white/25 px-1.5 text-sm">{fotoInCorso} foto</span>}
                </Button>
              )}
              <Button onClick={() => fotografa("nuovo")}
                className="h-auto min-h-16 whitespace-normal bg-blue-600 py-2 text-base font-bold text-white hover:bg-blue-700 sm:text-lg">
                <Aperture className="size-6 shrink-0" />
                {haCorrente ? `Strumento SUCCESSIVO · ${ordinale(prossimoNuovo)}` : `Fotografa il ${ordinale(prossimoNuovo)} strumento`}
              </Button>
              <Button variant="outline" onClick={() => daGalleria("nuovo")} className="h-12 bg-white sm:h-16"
                title={touch ? "Scegli foto già scattate" : "Scegli file immagine"}>
                {touch ? <Images className="size-4" /> : <ClipboardPaste className="size-4" />}
                {touch ? "Dalla galleria" : "Scegli file"}
              </Button>
              {touch && live !== "no" && (
                <Button variant="outline" onClick={() => avviaLive()} className="h-12 bg-white sm:h-16" title="Fotocamera dentro la pagina: scatti in raffica">
                  <Smartphone className="size-4" /> Raffica
                </Button>
              )}
            </div>
          )}
          {live === "no" && touch && <p className="text-xs text-blue-800">Fotocamera nella pagina non disponibile: usa «Fotografa» (si apre la fotocamera del telefono) dopo ogni strumento.</p>}
          {!touch && <p className="text-xs text-blue-800">Dal Mac: copia l&apos;immagine e premi <kbd className="rounded bg-white px-1">⌘V</kbd> qui, oppure trascinala in questo riquadro.</p>}
          {live !== "on" && inCoda > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-white p-3 text-sm text-blue-900">
              <Loader2 className="size-5 animate-spin" /> Leggo marca, modello e matricola… {inCoda > 1 ? `(${inCoda} in coda)` : ""}
            </div>
          )}

          {/* Registrati in questo giro */}
          {giro.length > 0 && (
            <ul className="space-y-2">
              {giro.map((g) => {
                const e = ESITI[g.esito];
                const s = g.strumento;
                const conDati = s && g.esito !== "illeggibile";
                const corretti = (g.cambiati || []).map((k) => NOMI_CAMPI[k]).filter(Boolean);
                return (
                  <li key={g.gruppo} className={`flex items-start gap-3 rounded-md border p-2.5 text-sm ${e.cls} ${g.gruppo === nGruppo ? "ring-2 ring-blue-400" : ""}`}>
                    <div className="relative shrink-0">
                      <img src={g.foto} alt="" className="size-14 rounded object-cover" />
                      {g.nFoto > 1 && <span className="absolute -bottom-1 -right-1 rounded-full bg-gray-900 px-1.5 text-[11px] font-semibold text-white">{g.nFoto}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <e.Icona className="size-4 shrink-0" />
                        {conDati && g.esito !== "doppione" ? `${g.n ? `${g.n}. ` : ""}${s?.instrument_name || "Strumento"}` : e.titolo}
                        {conDati && s?.price !== undefined && s?.price !== null && <span className="ml-auto shrink-0 font-mono">{euro(s.price)}</span>}
                      </p>
                      {conDati ? (
                        <p className="break-words text-xs">
                          {[s?.manufacturer, s?.model].filter(Boolean).join(" ") || "Marca/modello da completare"}
                          {" · "}<span className="font-mono">S/N {s?.serial_number || "—"}</span>
                        </p>
                      ) : (
                        <p className="text-xs opacity-80">{e.nota}</p>
                      )}
                      <p className="mt-0.5 text-xs opacity-80">
                        {g.nFoto} foto{g.gruppo === nGruppo ? " · strumento in corso" : ""}
                        {corretti.length > 0 && <> · <b>corretto: {corretti.join(", ")}</b></>}
                        {g.doppioneDi && <> · già in sessione: {g.doppioneDi}</>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <Button variant="ghost" onClick={chiudi} className="h-11 w-full">Fine</Button>
        </div>
      )}
    </div>
  );
}
