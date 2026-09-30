"use client";

// Campo per lo scanner di codici a barre (la pistola USB «scrive» il codice e preme Invio)
// + scansione con la fotocamera dove il browser supporta BarcodeDetector.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, ScanBarcode, X } from "lucide-react";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

export function ScannerInput({ onCodice, placeholder = "Spara il codice a barre o scrivilo e premi Invio" }: {
  onCodice: (c: string) => void; placeholder?: string;
}) {
  const [v, setV] = useState("");
  const [cam, setCam] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => { inp.current?.focus(); }, []);

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
          <input ref={inp} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm"
            onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { onCodice(v.trim()); setV(""); } }} />
        </div>
        <Button variant="outline" title="Leggi con la fotocamera" onClick={() => {
          if (!cam && !(window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector) {
            alert("Questo browser non legge i codici con la fotocamera: usa lo scanner o Chrome"); return;
          }
          setCam((c) => !c);
        }}>{cam ? <X /> : <Camera />}</Button>
      </div>
      {cam && <video ref={video} className="max-h-56 w-full rounded-md bg-black object-cover" muted playsInline />}
    </div>
  );
}
