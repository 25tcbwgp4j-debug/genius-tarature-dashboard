"use client";

// «Aggiungi foto» sulla riga dello strumento (15/10/2026, sessione 216): un'altra foto dello STESSO strumento
// (es. l'etichetta con la matricola dopo la foto da fuori). Il server rilegge insieme tutte le foto della riga e
// corregge tipo, prezzo da listino, marca, modello, matricola, sonda. Solo per righe senza rapporto (409 altrimenti).
// La foto si riduce a 2000 px JPEG (riduci di EstraiDati): le foto intere del telefono superano i ~4,5 MB del proxy.

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { riduci } from "@/components/EstraiDati";
import { aggiungiFotoStrumento } from "@/lib/api";

const NOMI: Record<string, string> = {
  instrument_name: "tipo", price: "prezzo", manufacturer: "marca", model: "modello", serial_number: "matricola",
  probe_model: "sonda", probe_serial_number: "matricola sonda", measurement_range: "portata",
};

export function AggiungiFotoStrumento({ instrumentId, nFoto, onAggiornato }: {
  instrumentId: string;
  nFoto?: number;
  onAggiornato: () => void | Promise<void>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [lavoro, setLavoro] = useState(false);

  const scelto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    e.target.value = "";   // la stessa foto rifatta deve ripartire
    if (!files.length) return;
    setLavoro(true);
    try {
      const foto = await Promise.all(files.map((f) => riduci(f)));
      const r = await aggiungiFotoStrumento(instrumentId, foto);
      if (r.esito === "illeggibile") toast.warning("Foto aggiunta ma non leggibile: avvicinati all'etichetta con la matricola");
      else if (r.esito === "doppione") toast.warning(`Matricola già su un altro strumento della sessione: ${r.doppione_di?.descrizione || ""}`);
      else {
        const c = (r.cambiati || []).map((k) => NOMI[k]).filter(Boolean);
        toast.success(`${r.descrizione || "Strumento aggiornato"}${c.length ? ` — corretto: ${c.join(", ")}` : " — dati confermati"} (${r.n_foto} foto)`);
      }
      await onAggiornato();
    } catch (err) {
      toast.error("Foto non aggiunta: " + (err as Error).message);
    } finally {
      setLavoro(false);
    }
  };

  return (
    <div>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={scelto} />
      <Button variant="outline" onClick={() => ref.current?.click()} disabled={lavoro}
        className="h-11 gap-1 border-blue-300 bg-blue-50 px-2.5 text-blue-800 hover:bg-blue-100"
        title="Altra foto di QUESTO strumento (es. l'etichetta con la matricola): i dati vengono riletti e corretti">
        {lavoro ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        <span className="hidden sm:inline">Aggiungi foto</span>
        <span className="sm:hidden">Foto</span>
        {!!nFoto && <span className="rounded bg-blue-200 px-1 text-xs">{nFoto}</span>}
      </Button>
    </div>
  );
}
