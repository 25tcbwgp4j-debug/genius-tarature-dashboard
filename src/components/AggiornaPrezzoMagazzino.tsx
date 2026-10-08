"use client";

// 08/10/2026 — Prezzo cambiato a mano sulla riga di una fattura o della cassa, per un articolo di MAGAZZINO:
// il cavo USB-C/Lightning usciva a 19 € (listino apple.com) e Christian lo correggeva a 25 € in fattura, ma il
// magazzino restava a 19 € e la volta dopo usciva di nuovo 19. Qui, accanto alla riga, si propone
// «Aggiorna anche il prezzo in magazzino (da X € a Y €)». Default: NON aggiorna da solo.
// Solo il titolare (admin) lo può fare (il backend risponde 403 all'operatore): l'operatore vede «chiedi al titolare».

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePermessi } from "@/components/permessi";
import { fetchAPI } from "@/lib/api";
import { toastErrore } from "@/lib/errori";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);

/** true se il prezzo della riga (IVA inclusa) è diverso da quello di magazzino, al centesimo */
export function prezzoDiversoDaMagazzino(prezzoRiga: number | null | undefined, prezzoMagazzino: number | null | undefined) {
  if (prezzoRiga === null || prezzoRiga === undefined || prezzoMagazzino === null || prezzoMagazzino === undefined) return false;
  if (!(prezzoRiga > 0) || Number.isNaN(prezzoMagazzino)) return false;
  return Math.abs(Math.round(prezzoRiga * 100) - Math.round(prezzoMagazzino * 100)) >= 1;
}

export function AggiornaPrezzoMagazzino({ prodottoId, prezzoMagazzino, prezzoNuovo, origine, onAggiornato, className = "" }: {
  prodottoId: string;
  /** prezzo IVA inclusa oggi in magazzino */
  prezzoMagazzino: number;
  /** prezzo IVA inclusa scritto sulla riga */
  prezzoNuovo: number;
  origine: "fattura" | "cassa";
  onAggiornato: (nuovo: number) => void;
  className?: string;
}) {
  const { admin, caricato } = usePermessi();
  const [salvando, setSalvando] = useState(false);
  const nuovo = Math.round(prezzoNuovo * 100) / 100;

  if (!caricato) return null;
  if (!admin) {
    return (
      <div className={`text-xs text-amber-700 dark:text-amber-300 ${className}`}>
        Prezzo diverso dal magazzino ({eur(prezzoMagazzino)}): se è il prezzo giusto, chiedi al titolare di aggiornarlo.
      </div>
    );
  }

  async function aggiorna() {
    if (salvando) return;
    setSalvando(true);
    try {
      await fetchAPI(`/api/magazzino/prodotti/${prodottoId}`, {
        method: "PATCH",
        body: JSON.stringify({ prezzo: nuovo, aggiorna_prezzo_da: { origine, prezzo_precedente: prezzoMagazzino } }),
      });
      toast.success(`Prezzo in magazzino aggiornato: da ${eur(prezzoMagazzino)} a ${eur(nuovo)}`);
      onAggiornato(nuovo);
    } catch (e) {
      toastErrore(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`}>
      <Button type="button" size="xs" variant="outline" disabled={salvando} onClick={aggiorna}
        title="Il prezzo della riga è diverso da quello di magazzino: se è quello giusto, aggiorna anche il magazzino">
        {salvando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Aggiorna anche il prezzo in magazzino (da {eur(prezzoMagazzino)} a {eur(nuovo)})
      </Button>
    </div>
  );
}
