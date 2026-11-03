"use client";

// 03/11/2026 (Christian): «Stampa rapporti» chiede quali stampare, così per rifarne uno non si ristampano tutti.
import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface RapportoDaStampare { rdt: string; descrizione: string }

export function StampaRapportiDialog({ rapporti, onChiudi, onStampa }: {
  rapporti: RapportoDaStampare[]; onChiudi: () => void; onStampa: (rdt: string[]) => void;
}) {
  const [scelti, setScelti] = useState<string[]>(rapporti.map((r) => r.rdt));
  const cambia = (rdt: string) => setScelti((x) => (x.includes(rdt) ? x.filter((y) => y !== rdt) : [...x, rdt]));
  return (
    <Dialog open onOpenChange={(aperto) => { if (!aperto) onChiudi(); }}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Quali rapporti vuoi stampare?</DialogTitle></DialogHeader>
        <div className="flex gap-3 text-sm">
          <button type="button" className="underline" onClick={() => setScelti(rapporti.map((r) => r.rdt))}>Tutti</button>
          <button type="button" className="underline" onClick={() => setScelti([])}>Nessuno</button>
        </div>
        <div className="space-y-1">
          {rapporti.map((r) => (
            <label key={r.rdt} className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted">
              <input type="checkbox" className="size-4" checked={scelti.includes(r.rdt)} onChange={() => cambia(r.rdt)} />
              <span className="font-mono font-semibold">{r.rdt}</span>
              <span className="min-w-0 flex-1 break-words">{r.descrizione}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button disabled={!scelti.length} onClick={() => onStampa(scelti.length === rapporti.length ? [] : scelti)}>
            <Printer className="size-4" /> Stampa {scelti.length === 1 ? "1 rapporto" : `${scelti.length} rapporti`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
