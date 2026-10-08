"use client";

// Campo per lo scanner di codici a barre (la pistola USB «scrive» il codice e preme Invio)
// + scansione con la fotocamera dove il browser supporta BarcodeDetector.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, ScanBarcode, X } from "lucide-react";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

export type AnteprimaCodice = { titolo: string; dettaglio?: string } | null;

export function ScannerInput({ onCodice, anteprima, autoInvio = false, placeholder = "Spara il codice a barre o scrivilo e premi Invio" }: {
  onCodice: (c: string) => void; placeholder?: string;
  /** 08/10/2026: scanner che NON manda l'Invio. Se il codice arriva «sparato» (tasti a meno di 50 ms l'uno dall'altro)
   *  si invia da solo dopo 300 ms di pausa; scritto a mano resta com'è (serve Invio). */
  autoInvio?: boolean;
  /** 08/10/2026: mentre si spara/scrive il codice, mostra subito l'articolo trovato (null = non trovato); Invio conferma */
  anteprima?: (c: string) => Promise<AnteprimaCodice>;
}) {
  const [v, setV] = useState("");
  const tempi = useRef<number[]>([]);
  const [prev, setPrev] = useState<{ codice: string; esito: AnteprimaCodice | "cerco" } | null>(null);
  const [cam, setCam] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => { inp.current?.focus(); }, []);

  // invio automatico per gli scanner senza Invio: solo se i caratteri sono arrivati a raffica
  useEffect(() => {
    if (!autoInvio) return;
    const c = v.trim();
    if (c.length < 6) return;
    const t = tempi.current;
    const raffica = t.length >= 6 && t.slice(1).every((x, i) => x - t[i] < 50);
    if (!raffica) return;
    const timer = setTimeout(() => { onCodice(c); setV(""); tempi.current = []; }, 300);
    return () => clearTimeout(timer);
  }, [v, autoInvio, onCodice]);

  // anteprima automatica: 250 ms dopo l'ultimo carattere (lo scanner scrive tutto in pochi ms), senza premere Invio
  useEffect(() => {
    const c = v.trim();
    if (!anteprima || c.length < 4) { setPrev(null); return; }
    let annullato = false;
    const t = setTimeout(async () => {
      setPrev({ codice: c, esito: "cerco" });
      let esito: AnteprimaCodice = null;
      try { esito = await anteprima(c); } catch { esito = null; }
      if (!annullato) setPrev({ codice: c, esito });
    }, 250);
    return () => { annullato = true; clearTimeout(t); };
  }, [v, anteprima]);

  useEffect(() => {
    if (!cam) return;
    let stream: MediaStream | null = null;
    let fermo = false;
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
    if (!W.BarcodeDetector) return;
    const det = new W.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(async (s) => {
      stream = s;
      if (!video.current) return;
      video.current.srcObject = s;
      await video.current.play();
      const giro = async () => {
        if (fermo || !video.current) return;
        try {
          const r = await det.detect(video.current);
          if (r[0]?.rawValue) { onCodice(r[0].rawValue); setCam(false); return; }
        } catch { /* frame non leggibile */ }
        setTimeout(giro, 250);
      };
      giro();
    }).catch(() => { alert("Fotocamera non disponibile"); setCam(false); });
    return () => { fermo = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam, onCodice]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanBarcode className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <input ref={inp} value={v} onChange={(e) => { const ora = Date.now(); tempi.current = e.target.value.length <= 1 ? [ora] : [...tempi.current, ora]; setV(e.target.value); }} placeholder={placeholder}
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm"
            onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { onCodice(v.trim()); setV(""); setPrev(null); tempi.current = []; } }} />
        </div>
        <Button variant="outline" title="Leggi con la fotocamera" onClick={() => {
          if (!cam && !(window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector) {
            alert("Questo browser non legge i codici con la fotocamera: usa lo scanner o Chrome"); return;
          }
          setCam((c) => !c);
        }}>{cam ? <X /> : <Camera />}</Button>
      </div>
      {prev && (
        <div className={`rounded-md border px-3 py-2 text-sm ${prev.esito === "cerco" ? "text-muted-foreground"
          : prev.esito ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" : "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"}`}>
          {prev.esito === "cerco" ? "Cerco l'articolo…"
            : prev.esito ? <><span className="font-semibold">{prev.esito.titolo}</span>{prev.esito.dettaglio ? <span className="ml-2 text-muted-foreground">{prev.esito.dettaglio}</span> : null}
                <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">· premi Invio per aggiungere</span></>
            : <>Nessun articolo con il codice «{prev.codice}»: prova la ricerca per nome qui sotto</>}
        </div>
      )}
      {cam && <video ref={video} className="max-h-56 w-full rounded-md bg-black object-cover" muted playsInline />}
    </div>
  );
}
