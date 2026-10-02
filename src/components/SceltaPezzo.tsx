"use client";

// CASSA → articolo serializzato (iPhone, Mac, iPad…): si sceglie il PEZZO preciso (IMEI / seriale) da vendere.
// Per l'usato a margine il costo del pezzo diventa il costo d'acquisto della riga (regime N5). Genius Lab, 02/10/2026.

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { magPezzi, type Pezzo, type Prodotto, type RigaCassa } from "@/lib/api";

const eur = (v: number | null | undefined) => (v === null || v === undefined ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v));

/** Riga di carrello per un pezzo: una riga per pezzo (quantità 1), mai accorpata. */
export function rigaDaPezzo(p: Prodotto, pz: Pezzo): RigaCassa & { giacenza?: number } {
  const margine = p.regime_iva === "margine" || p.categoria_merce === "usato_margine";
  const cod = pz.imei ? `IMEI ${pz.imei}` : pz.seriale ? `S/N ${pz.seriale}` : "";
  return {
    prodotto_id: p.id, pezzo_id: pz.id, descrizione: `${p.descrizione}${cod ? ` ${cod}` : ""}`.slice(0, 200), quantita: 1,
    prezzo: Number(p.prezzo), aliquota: margine ? 0 : Number(p.aliquota), giacenza: Number(p.giacenza),
    ...(margine ? { regime: "margine" as const, natura: "N5", costo_acquisto: pz.costo ?? (Number(p.costo) || null) }
      : p.regime_iva === "esente" ? { regime: "esente" as const, natura: "N4", aliquota: 0 } : {}),
  };
}

export function SceltaPezzo({ prodotto, esclusi, onScelto, onClose }: {
  prodotto: Prodotto; esclusi: string[]; onScelto: (pz: Pezzo) => void; onClose: () => void;
}) {
  const [pezzi, setPezzi] = useState<Pezzo[] | null>(null);
  const chiaveEsclusi = esclusi.join(",");   // stabile tra i render del carrello
  useEffect(() => {
    const via = chiaveEsclusi.split(",");
    magPezzi({ prodotto_id: prodotto.id, disponibili: true }).then((r) => setPezzi(r.pezzi.filter((x) => !via.includes(x.id))))
      .catch((e) => { toastErrore(e); setPezzi([]); });
  }, [prodotto.id, chiaveEsclusi]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="w-full max-w-lg space-y-3 rounded-lg bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div><div className="text-xs text-muted-foreground">Quale pezzo vendi?</div><h2 className="font-semibold">{prodotto.descrizione}</h2></div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Chiudi"><X /></Button>
        </div>
        {pezzi === null ? <Loader2 className="animate-spin" /> : pezzi.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nessun pezzo disponibile: caricalo prima in Magazzino (scheda dell&apos;articolo → Pezzi).</div>
        ) : (
          <div className="max-h-80 divide-y overflow-y-auto rounded border">
            {pezzi.map((pz) => (
              <button key={pz.id} type="button" className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-muted" onClick={() => onScelto(pz)}>
                <span><span className="font-mono text-xs">{pz.imei ? `IMEI ${pz.imei}` : ""}{pz.imei && pz.seriale ? " · " : ""}{pz.seriale ? `S/N ${pz.seriale}` : ""}</span>
                  <span className="block text-xs text-muted-foreground">{[pz.condizione, pz.stato === "in_conto_vendita" ? "in conto vendita" : null, pz.fornitore_nome].filter(Boolean).join(" · ")}</span></span>
                <span className="text-xs text-muted-foreground">costo {eur(pz.costo)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
