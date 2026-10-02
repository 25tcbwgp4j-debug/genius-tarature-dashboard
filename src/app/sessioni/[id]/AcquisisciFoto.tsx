"use client";

// «Acquisisci» (Christian, 02/10/2026): al banco, dall'iPad mini o dall'iPhone, si inquadra lo strumento con la
// fotocamera e la riga nasce da sola nella sessione; poi «Acquisisci il 2° strumento», e così via, in sequenza.
// Dal Mac si incolla l'immagine dagli appunti (Cmd+V) o la si trascina qui. Il riconoscimento è lo stesso delle
// foto WhatsApp (strumenti_foto.py): fronte e retro dello stesso strumento diventano UNA riga, la stessa matricola
// non fa doppioni. La foto viene ridotta a 1600 px prima dell'invio (Wi-Fi del banco, vision più veloce).

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, ClipboardPaste, GitMerge, Images, Loader2, X, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { acquisisciStrumentoDaFoto, type EsitoAcquisizione } from "@/lib/api";

interface Props {
  sessionId: string;
  /** strumenti già in sessione (per il numero d'ordine del prossimo) */
  nStrumenti: number;
  /** la sessione è in ATTESA STRUMENTI: la prima foto la porta in registrazione */
  attesaStrumenti?: boolean;
  onAggiornato: () => void | Promise<void>;
}

const LATO_MAX = 1600;

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
    const scala = Math.min(1, LATO_MAX / Math.max(img.width, img.height));
    const w = Math.round(img.width * scala), h = Math.round(img.height * scala);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Canvas non disponibile");
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const ESITI: Record<EsitoAcquisizione["esito"], { titolo: string; nota: string; cls: string; Icona: typeof CheckCircle2 }> = {
  nuovo: { titolo: "Strumento registrato", nota: "Controlla marca, modello e matricola nella riga qui sotto.", cls: "border-emerald-300 bg-emerald-50 text-emerald-900", Icona: CheckCircle2 },
  unito: { titolo: "Unito allo strumento precedente", nota: "Fronte e retro dello stesso strumento: i dati sono stati completati sulla stessa riga.", cls: "border-blue-300 bg-blue-50 text-blue-900", Icona: GitMerge },
  doppione: { titolo: "Già in sessione", nota: "Stessa matricola di uno strumento già registrato: nessuna riga aggiunta.", cls: "border-amber-300 bg-amber-50 text-amber-900", Icona: Copy },
  illeggibile: { titolo: "Foto non leggibile", nota: "Inquadra l'etichetta con marca, modello e matricola (S/N), più da vicino e senza riflessi.", cls: "border-red-300 bg-red-50 text-red-900", Icona: AlertTriangle },
};

const ordinale = (n: number) => (n === 1 ? "1°" : n === 2 ? "2°" : n === 3 ? "3°" : `${n}°`);

export function AcquisisciFoto({ sessionId, nStrumenti, attesaStrumenti, onAggiornato }: Props) {
  const [attivo, setAttivo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ultimo, setUltimo] = useState<EsitoAcquisizione | null>(null);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [acquisiti, setAcquisiti] = useState(0);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  // Mac: niente fotocamera, si incolla. Si decide dal touch (iPad e iPhone hanno maxTouchPoints > 0).
  const [touch, setTouch] = useState(true);
  useEffect(() => { setTouch(typeof navigator !== "undefined" && navigator.maxTouchPoints > 0); }, []);

  const invia = useCallback(async (file: File | Blob) => {
    setBusy(true);
    setUltimo(null);
    try {
      const dataUrl = await riduci(file);
      setAnteprima(dataUrl);
      const r = await acquisisciStrumentoDaFoto(sessionId, dataUrl);
      setUltimo(r);
      if (r.esito === "illeggibile") {
        toast.warning("Foto non leggibile: inquadra l'etichetta con la matricola");
      } else {
        if (r.esito !== "doppione") setAcquisiti((n) => n + 1);
        toast.success(`${ESITI[r.esito].titolo}: ${r.descrizione || ""}`);
        await onAggiornato();
      }
    } catch (e) {
      toast.error("Acquisizione non riuscita: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [sessionId, onAggiornato]);

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
    const f = e.target.files?.[0];
    e.target.value = "";   // la stessa foto rifatta deve ripartire
    if (f) invia(f);
  };

  // Il clic sul pulsante apre SUBITO la fotocamera (gesto dell'utente: Safari lo pretende)
  const inquadra = () => { setAttivo(true); camRef.current?.click(); };

  const prossimo = nStrumenti + 1;
  const etichetta = nStrumenti === 0 && acquisiti === 0 ? "Acquisisci (foto)" : `Acquisisci il ${ordinale(prossimo)} strumento`;

  return (
    <div className="w-full">
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={daInput} />
      <input ref={galRef} type="file" accept="image/*" hidden onChange={daInput} />

      {!attivo ? (
        <Button onClick={inquadra} className="h-11 w-full bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-auto"
          title="Fotografa lo strumento: marca, modello e matricola vengono letti dalla foto">
          <Camera className="size-5" /> {etichetta}
        </Button>
      ) : (
        <div
          className="space-y-3 rounded-lg border-2 border-blue-300 bg-blue-50/60 p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith("image/")) invia(f); }}
        >
          <div className="flex items-center gap-2">
            <Camera className="size-5 text-blue-700" />
            <p className="text-sm font-semibold text-blue-900">
              Acquisizione dalla foto
              {acquisiti > 0 && <span className="ml-2 rounded bg-blue-600 px-1.5 py-0.5 text-xs text-white">{acquisiti} in questo giro</span>}
            </p>
            <button type="button" className="ml-auto flex size-11 items-center justify-center rounded-md text-blue-700 hover:bg-blue-100" onClick={() => setAttivo(false)} title="Chiudi">
              <X className="size-5" />
            </button>
          </div>
          {attesaStrumenti && (
            <p className="text-xs text-orange-800">La sessione è in ATTESA STRUMENTI: con la prima foto passa da sola in registrazione.</p>
          )}

          {busy && (
            <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-white p-3 text-sm text-blue-900">
              {anteprima && <img src={anteprima} alt="" className="size-14 rounded object-cover" />}
              <Loader2 className="size-5 animate-spin" /> Leggo marca, modello e matricola…
            </div>
          )}

          {!busy && ultimo && (() => {
            const e = ESITI[ultimo.esito];
            return (
              <div className={`flex items-start gap-3 rounded-md border p-3 text-sm ${e.cls}`}>
                {anteprima && <img src={anteprima} alt="" className="size-14 shrink-0 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold"><e.Icona className="size-4" /> {e.titolo}</p>
                  {ultimo.descrizione && <p className="truncate font-mono text-xs">{ultimo.descrizione}</p>}
                  <p className="text-xs opacity-80">{e.nota}</p>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Button onClick={() => camRef.current?.click()} disabled={busy}
              className="h-14 bg-blue-600 text-base font-semibold text-white hover:bg-blue-700">
              <Camera className="size-5" />
              {ultimo?.esito === "illeggibile" ? "Rifai la foto" : `Acquisisci il ${ordinale(prossimo)} strumento`}
            </Button>
            <Button variant="outline" onClick={() => galRef.current?.click()} disabled={busy} className="h-11 bg-white sm:h-14"
              title={touch ? "Scegli una foto già scattata" : "Scegli un file immagine"}>
              {touch ? <Images className="size-4" /> : <ClipboardPaste className="size-4" />}
              {touch ? "Dalla galleria" : "Scegli file"}
            </Button>
            <Button variant="ghost" onClick={() => setAttivo(false)} disabled={busy} className="h-11 sm:h-14">Fine</Button>
          </div>
          {!touch && <p className="text-xs text-blue-800">Dal Mac: copia l&apos;immagine e premi <kbd className="rounded bg-white px-1">⌘V</kbd> qui, oppure trascinala in questo riquadro.</p>}
        </div>
      )}
    </div>
  );
}
