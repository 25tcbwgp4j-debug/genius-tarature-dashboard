"use client";

// STAMPA ETICHETTE DI MAGAZZINO (08/10/2026): codice a barre + descrizione + prezzo, 50x22 mm sulla Brother QL-700
// del banco — lo STESSO sistema delle etichette dei rapporti di taratura (coda di stampa → agente sull'iMac del banco).
// Articolo senza codice a barre: il backend gli assegna prima un EAN-13 interno «20…» e lo salva (poi lo scanner lo
// trova in carico, scarico e cassa). Agente di stampa spento → si apre il PDF da stampare a mano (come per le tarature).

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Loader2, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { toastErrore } from "@/lib/errori";
import { magStampaEtichette, magUrlEtichettePdf, type Prodotto } from "@/lib/api";

export type VoceEtichetta = { p: Pick<Prodotto, "id" | "descrizione" | "barcode" | "prezzo">; copie: number };

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const MAX = 500;

export function StampaEtichette({ voci, titolo, onClose, onStampato }: {
  voci: VoceEtichetta[]; titolo?: string; onClose: () => void; onStampato?: (soloAnteprima: boolean) => void;
}) {
  const [copie, setCopie] = useState<Record<string, string>>(() =>
    Object.fromEntries(voci.map((v) => [v.p.id, String(Math.max(1, Math.round(v.copie || 1)))])));
  const [busy, setBusy] = useState<"" | "stampa" | "anteprima">("");
  const n = (id: string) => Math.max(0, Math.round(Number((copie[id] || "0").replace(",", "."))) || 0);
  const totale = voci.reduce((s, v) => s + n(v.p.id), 0);
  const senzaCodice = voci.filter((v) => !v.p.barcode).length;

  async function esegui(soloPdf: boolean) {
    if (busy) return;
    if (!totale) { toast.error("Scrivi quante etichette stampare"); return; }
    if (totale > MAX) { toast.error(`Massimo ${MAX} etichette per volta`); return; }
    setBusy(soloPdf ? "anteprima" : "stampa");
    try {
      const r = await magStampaEtichette(voci.map((v) => ({ id: v.p.id, copie: n(v.p.id) })).filter((x) => x.copie > 0), soloPdf);
      if (r.barcode_assegnati.length) {
        toast.info(r.barcode_assegnati.length === 1 ? `Codice a barre interno assegnato: ${r.barcode_assegnati[0].barcode}`
          : `${r.barcode_assegnati.length} articoli senza codice hanno ora un codice a barre interno`);
      }
      if (soloPdf) {
        r.pdf.forEach((u) => window.open(magUrlEtichettePdf(u), "_blank"));
      } else if (r.agente_attivo) {
        toast.success(`${r.etichette} ${r.etichette === 1 ? "etichetta mandata" : "etichette mandate"} alla stampante Brother`);
      } else {
        toast.warning("Agente di stampa del banco spento: apro il PDF da stampare a mano (formato 50x22 mm). Il lavoro resta in coda 15 minuti.", { duration: 8000 });
        r.pdf.forEach((u) => window.open(magUrlEtichettePdf(u), "_blank"));
      }
      onStampato?.(soloPdf);
      if (!soloPdf) onClose();
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 print:hidden" onClick={() => !busy && onClose()}>
      <Card className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 p-4" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape" && !busy) onClose(); }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium"><Printer className="size-4" />{titolo || (voci.length === 1 ? "Stampa etichetta" : `Stampa etichette di ${voci.length} articoli`)}</div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={!!busy}><X /></Button>
        </div>
        <div className="text-xs text-muted-foreground">Etichetta 50x22 mm sulla Brother del banco (come le etichette di taratura): codice a barre, descrizione e prezzo.
          {senzaCodice > 0 && <b className="text-amber-700 dark:text-amber-400"> {senzaCodice === 1 ? "L'articolo non ha" : `${senzaCodice} articoli non hanno`} il codice a barre: ne viene creato uno interno (EAN «20…») e salvato.</b>}</div>
        {voci.length > 1 && (
          <div className="flex items-center gap-2 text-sm">Copie per tutti
            <Input className="h-8 w-20" inputMode="numeric" placeholder="n."
              onChange={(e) => { const v = e.target.value; if (v) setCopie(Object.fromEntries(voci.map((x) => [x.p.id, v]))); }} /></div>
        )}
        <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded border text-sm">
          {voci.map((v) => (
            <div key={v.p.id} className="flex items-center gap-2 p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{v.p.descrizione}</div>
                <div className="text-xs text-muted-foreground">{v.p.barcode || <span className="text-amber-700 dark:text-amber-400">nuovo codice interno</span>} · {eur(Number(v.p.prezzo))}</div>
              </div>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">copie
                <Input autoFocus={voci.length === 1} className="h-9 w-16 text-right text-base" inputMode="numeric" value={copie[v.p.id] ?? ""}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setCopie((c) => ({ ...c, [v.p.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); esegui(false); } }} /></label>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-sm text-muted-foreground">{totale} {totale === 1 ? "etichetta" : "etichette"}</span>
          <Button variant="outline" disabled={!!busy} onClick={() => esegui(true)} title="Apre il PDF delle etichette senza stamparle">
            {busy === "anteprima" ? <Loader2 className="animate-spin" /> : <Eye />} Anteprima</Button>
          <Button disabled={!!busy || !totale} onClick={() => esegui(false)}>
            {busy === "stampa" ? <Loader2 className="animate-spin" /> : <Printer />} Stampa {totale > 0 ? totale : ""}</Button>
        </div>
      </Card>
    </div>
  );
}
