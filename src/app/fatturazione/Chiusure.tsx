"use client";

// Chiusura di giornata, riepilogo mensile e pacchetto per il commercialista.

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Archive, CalendarDays, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { fattChiusura, fattUrlChiusura, fattUrlPacchetto } from "@/lib/api";
import { eur } from "./util";

interface Dati {
  etichetta: string; n_emesse: number; n_ricevute: number; n_incassi: number;
  tot_emesse: { imponibile: number; iva: number; totale: number };
  tot_ricevute: { imponibile: number; iva: number; totale: number };
  tot_incassi: number; incassi_per_modalita: Record<string, number>; imponibile_per_aliquota: Record<string, number>;
}

export function Chiusure({ societa }: { societa: string }) {
  const [giorno, setGiorno] = useState(new Date().toISOString().slice(0, 10));
  const [periodo, setPeriodo] = useState<"giorno" | "mese">("giorno");
  const [d, setD] = useState<Dati | null>(null);
  const [loading, setLoading] = useState(false);
  const soc = societa || "genius";

  useEffect(() => {
    setLoading(true);
    fattChiusura(soc, periodo, giorno).then(setD).catch((e: Error) => toast.error(e.message)).finally(() => setLoading(false));
  }, [soc, periodo, giorno]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="size-4" />
        <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={giorno} onChange={(e) => setGiorno(e.target.value)} />
        <Button size="sm" variant={periodo === "giorno" ? "default" : "outline"} onClick={() => setPeriodo("giorno")}>Giornata</Button>
        <Button size="sm" variant={periodo === "mese" ? "default" : "outline"} onClick={() => setPeriodo("mese")}>Mese</Button>
        <a href={fattUrlChiusura(soc, periodo, giorno)} target="_blank" rel="noreferrer" className="ml-auto">
          <Button size="sm" variant="outline"><Printer /> Stampa / PDF</Button>
        </a>
        <a href={fattUrlPacchetto(soc, giorno)}><Button size="sm"><Archive /> Pacchetto commercialista (ZIP del mese)</Button></a>
      </div>
      {loading || !d ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : (
        <>
          <div className="text-sm text-muted-foreground">{periodo === "giorno" ? "Chiusura di giornata" : "Riepilogo mensile"} {d.etichetta}</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="p-3"><div className="text-xs text-muted-foreground">Fatture emesse</div><div className="text-lg font-semibold">{d.n_emesse}</div><div className="text-xs">{eur(d.tot_emesse.totale)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Imponibile vendite</div><div className="text-lg font-semibold">{eur(d.tot_emesse.imponibile)}</div><div className="text-xs">IVA {eur(d.tot_emesse.iva)}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Incassato</div><div className="text-lg font-semibold">{eur(d.tot_incassi)}</div><div className="text-xs">{d.n_incassi} incassi</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Fatture ricevute</div><div className="text-lg font-semibold">{d.n_ricevute}</div><div className="text-xs">{eur(d.tot_ricevute.totale)} · IVA {eur(d.tot_ricevute.iva)}</div></Card>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-3">
              <div className="mb-2 text-sm font-medium">Incassi per modalità</div>
              {Object.entries(d.incassi_per_modalita).map(([k, v]) => <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="tabular-nums">{eur(v)}</span></div>)}
              {!Object.keys(d.incassi_per_modalita).length && <div className="text-sm text-muted-foreground">Nessun incasso</div>}
            </Card>
            <Card className="p-3">
              <div className="mb-2 text-sm font-medium">Imponibile vendite per aliquota</div>
              {Object.entries(d.imponibile_per_aliquota).map(([k, v]) => <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="tabular-nums">{eur(v)}</span></div>)}
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">Gli scontrini del registratore di cassa non sono ancora compresi: si aggiungono con il collegamento alla cassa.</p>
        </>
      )}
    </div>
  );
}
