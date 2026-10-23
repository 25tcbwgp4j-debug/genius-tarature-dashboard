"use client";

// Chi gestisce cassa (scontrini) e bonifici SumUp al negozio (23/10/2026): PC HP «server» o iMac di sinistra.
// Visibile e modificabile da TUTTI gli operatori: se il PC HP si guasta si passa all'iMac con un clic, senza chiamare nessuno.
// Stampe A4 ed etichette escono sempre dall'iMac di sinistra (decisione di Christian 23/10). Lo scanner Ricoh resta sul PC HP.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Monitor } from "lucide-react";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";

type Stato = {
  attiva: "server" | "imac";
  nomi: Record<string, string>;
  cambiata_da?: string | null;
  updated_at?: string | null;
  secondi_dall_ultimo_contatto: Record<string, Record<string, number>>;
};

// un computer è «acceso» se uno dei suoi agenti si è fatto sentire nell'ultimo minuto
function acceso(s: Stato | null, p: string): boolean | null {
  const c = s?.secondi_dall_ultimo_contatto?.[p];
  if (!c || Object.keys(c).length === 0) return null;
  return Math.min(...Object.values(c)) < 60;
}

export function PostazioneNegozio() {
  const [stato, setStato] = useState<Stato | null>(null);
  const [scelta, setScelta] = useState<"server" | "imac" | null>(null);
  const [salva, setSalva] = useState(false);

  const leggi = useCallback(() => {
    fetchAPI("/api/negozio/postazione", {}, false).then(setStato).catch(() => undefined);
  }, []);
  useEffect(() => { leggi(); const t = setInterval(leggi, 15000); return () => clearInterval(t); }, [leggi]);

  if (!stato) return null;
  const nome = (p: string) => stato.nomi?.[p] ?? p;
  const attivoAcceso = acceso(stato, stato.attiva);

  const conferma = async () => {
    if (!scelta) return;
    setSalva(true);
    try {
      const r = await fetchAPI("/api/negozio/postazione", { method: "POST", body: JSON.stringify({ attiva: scelta }) });
      setStato(r);
      toast.success(`Ora cassa e bonifici li gestisce: ${nome(scelta)}`);
      setScelta(null);
    } catch {
      toast.error("Cambio non riuscito: riprova");
    } finally {
      setSalva(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${attivoAcceso === false
      ? "border-red-300 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100"
      : "border-muted bg-muted/30"}`}>
      <Monitor className="size-4" />
      <span>Cassa e bonifici SumUp gestiti da: <b>{nome(stato.attiva)}</b></span>
      {attivoAcceso === false && <span className="font-medium">⚠️ non risponde da più di un minuto: passa all&apos;altro computer</span>}
      <div className="ml-auto flex gap-1">
        {(["server", "imac"] as const).map((p) => {
          const a = acceso(stato, p);
          return (
            <Button key={p} size="sm" variant={stato.attiva === p ? "default" : "outline"} disabled={stato.attiva === p}
              onClick={() => setScelta(p)} title={a === null ? "Nessun contatto recente" : a ? "Acceso" : "Non risponde"}>
              <span className={`mr-1 inline-block size-2 rounded-full ${a ? "bg-emerald-500" : a === false ? "bg-red-500" : "bg-gray-400"}`} />
              {nome(p)}
            </Button>
          );
        })}
      </div>
      <Dialog open={!!scelta} onOpenChange={(o) => !o && setScelta(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passare a «{scelta ? nome(scelta) : ""}»?</DialogTitle>
            <DialogDescription>
              Scontrini al registratore e controllo dei bonifici SumUp li farà {scelta ? nome(scelta) : ""}.
              Ricevute, rapporti A4 ed etichette escono sempre dall&apos;iMac di sinistra. Usalo quando l&apos;altro computer è spento o guasto.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setScelta(null)}>Annulla</Button>
            <Button onClick={conferma} disabled={salva}>Conferma</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
