"use client";

// STORNO / RESO e ANNULLO di uno scontrino (01/10/2026).
//  - scontrino della dashboard già emesso → POST /api/cassa/scontrini/{id}/storno (reso anche parziale, per righe)
//  - riga «scontrino» battuta a mano nella Cassa del giorno → POST /api/cassa/giornata/movimenti/{id}/storno
//    (storno anche parziale, per importo)
// Il documento negativo finisce nella cassa di OGGI. Per l'operatore serve l'autorizzazione dell'amministratore:
// la gestisce il dialog globale (fetchAPI).

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDec } from "@/components/DecInput";
import { eInAttesa, toastErrore } from "@/lib/errori";
import { cassaGiornataStorno, cassaStornoScontrino, type RigaGiornata, type Scontrino } from "@/lib/api";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
// modalità di rimborso: scontrini della dashboard (come la cassa) e colonne della cassa del giorno
const MOD_SCONTRINO: [string, string][] = [["contanti", "Contanti"], ["pos_sumup", "POS SumUp"], ["bonifico", "Bonifico"], ["paypal", "PayPal"]];
const COLONNE: [string, string][] = [["contanti", "Contanti"], ["pos", "POS"], ["stripe", "Stripe"], ["bonifico", "Bonifico"], ["paypal", "PayPal"]];
const tondo = (v: number) => Math.round(v * 100) / 100;

export type OggettoStorno =
  | { fonte: "scontrino"; scontrino: Scontrino }
  | { fonte: "manuale"; riga: RigaGiornata };

export function StornoDialog({ oggetto, onClose, onFatto }: {
  oggetto: OggettoStorno | null; onClose: () => void; onFatto: () => void;
}) {
  return (
    <Dialog open={!!oggetto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {oggetto && <Corpo key={oggetto.fonte === "scontrino" ? oggetto.scontrino.id : oggetto.riga.id} oggetto={oggetto} onClose={onClose} onFatto={onFatto} />}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({ oggetto, onClose, onFatto }: { oggetto: OggettoStorno; onClose: () => void; onFatto: () => void }) {
  const sc = oggetto.fonte === "scontrino" ? oggetto.scontrino : null;
  const rg = oggetto.fonte === "manuale" ? oggetto.riga : null;
  const [tipo, setTipo] = useState<"parziale" | "totale" | "annullo">("totale");
  const [motivo, setMotivo] = useState("");
  const [numero, setNumero] = useState("");
  const [originale, setOriginale] = useState("");
  const [busy, setBusy] = useState(false);
  // scontrino dashboard: quantità da rendere per riga (default: tutto)
  const [qta, setQta] = useState<number[]>(() => (sc?.righe || []).map((r) => Number(r.quantita)));
  // riga manuale: importo parziale e colonna del rimborso (default: quella dello scontrino)
  const colOrig = rg ? (COLONNE.map(([k]) => k).sort((a, b) => Number(rg[b as keyof RigaGiornata]) - Number(rg[a as keyof RigaGiornata]))[0]) : "contanti";
  const [importo, setImporto] = useState("");
  const [modalita, setModalita] = useState<string>(sc ? (sc.pagamenti?.[0]?.modalita || "contanti") : colOrig);

  const totOrig = sc ? Number(sc.totale) : tondo(COLONNE.reduce((s, [k]) => s + Number(rg?.[k as keyof RigaGiornata] || 0), 0));
  const totRighe = sc ? tondo(sc.righe.reduce((s, r, i) => s + (qta[i] || 0) * Number(r.prezzo) * (1 - (Number(r.sconto) || 0) / 100), 0)) : 0;
  const impParziale = parseDec(importo);
  const daRendere = tipo === "parziale" ? (sc ? totRighe : (impParziale && !Number.isNaN(impParziale) ? Math.abs(impParziale) : 0)) : totOrig;

  async function conferma() {
    if (busy) return;
    if (motivo.trim().length < 3) { toast.error("Scrivi il motivo"); return; }
    if (tipo === "parziale" && !(daRendere > 0)) { toast.error(sc ? "Scegli cosa rende il cliente" : "Scrivi l'importo da stornare (es. 25 o 12,50)"); return; }
    if (daRendere > totOrig + 0.01) { toast.error(`Non si può stornare più dello scontrino (${eur(totOrig)})`); return; }
    if (rg && !numero.trim()) { toast.error("Scrivi il numero del documento di reso/annullo battuto sul registratore"); return; }
    setBusy(true);
    try {
      if (sc) {
        const righe = tipo === "parziale" ? sc.righe.map((_, i) => ({ indice: i, quantita: qta[i] || 0 })).filter((r) => r.quantita > 0) : undefined;
        if (!sc.numero_rt && !numero.trim() && !/^\d{4}-\d{4}$/.test(originale.trim())) {
          toast.error("Scrivi il numero dello scontrino originale come sullo scontrino (es. 2312-0004)"); return;
        }
        await cassaStornoScontrino(sc.id, { tipo: tipo === "annullo" ? "annullo" : "reso", righe, modalita, motivo: motivo.trim(),
          numero_rt: numero.trim() || undefined, numero_originale: originale.trim() || undefined });
      } else if (rg) {
        await cassaGiornataStorno(rg.id, { tipo: tipo === "annullo" ? "annullo" : "storno", numero: numero.trim(), motivo: motivo.trim(),
          importo: tipo === "parziale" ? daRendere : undefined, modalita: tipo === "parziale" ? modalita : undefined });
      }
      toast.success(`${tipo === "annullo" ? "Annullo" : "Storno"} di ${eur(daRendere)} registrato nella cassa di oggi`);
      onFatto();
      onClose();
    } catch (e) {
      toastErrore(e);
      if (eInAttesa(e)) onClose();   // mandato all'amministratore: lo esegue il server quando approva
    } finally { setBusy(false); }
  }

  const campo = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const scelta = (k: typeof tipo, l: string, sotto: string) => (
    <label className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 ${tipo === k ? "border-primary bg-primary/5" : ""}`}>
      <input type="radio" className="mt-1" checked={tipo === k} onChange={() => setTipo(k)} />
      <span><span className="font-medium">{l}</span><span className="block text-xs text-muted-foreground">{sotto}</span></span>
    </label>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Undo2 className="size-5" /> Storno / reso o annullo</DialogTitle>
        <DialogDescription>
          Scontrino {sc ? (sc.numero_rt ? `n. ${sc.numero_rt}` : "") : (rg?.numero ? `n. ${rg.numero}` : "")} da <b>{eur(totOrig)}</b>
          {sc ? ` del ${new Date(sc.created_at).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}` : ""}
          {rg?.descrizione ? ` — ${rg.descrizione}` : ""}. Il documento negativo va nella cassa di <b>oggi</b>.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          {scelta("totale", "Reso totale", "il cliente rende tutto")}
          {scelta("parziale", "Reso parziale", sc ? "solo alcuni articoli" : "solo una parte dell'importo")}
          {scelta("annullo", "Annullo", "scontrino sbagliato: si annulla per intero")}
        </div>

        {tipo === "parziale" && sc && (
          <div className="divide-y rounded-md border">
            {sc.righe.map((r, i) => (
              <div key={i} className="flex items-center gap-2 p-2">
                <span className="flex-1">{r.descrizione} <span className="text-xs text-muted-foreground">({Number(r.quantita)} × {eur(Number(r.prezzo))})</span></span>
                <span className="text-xs text-muted-foreground">rende</span>
                <input type="number" min={0} max={Number(r.quantita)} step="any" className={`${campo} h-8 w-16 text-right`} value={qta[i] ?? 0}
                  onChange={(e) => { const v = Math.min(Number(r.quantita), Math.max(0, Number(e.target.value) || 0)); setQta((q) => q.map((x, j) => (j === i ? v : x))); }} />
              </div>
            ))}
          </div>
        )}
        {tipo === "parziale" && rg && (
          <label className="flex items-center gap-2"><span className="w-40 text-muted-foreground">Importo da stornare</span>
            <Input className="h-9 w-32 text-right font-semibold" inputMode="decimal" placeholder="€ importo" value={importo} onChange={(e) => setImporto(e.target.value)} /></label>
        )}

        {(sc || tipo === "parziale") && (
          <label className="flex items-center gap-2"><span className="w-40 text-muted-foreground">Rimborso in</span>
            <select className={campo} value={modalita} onChange={(e) => setModalita(e.target.value)}>
              {(sc ? MOD_SCONTRINO : COLONNE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
        )}
        {sc && !sc.numero_rt && (
          <label className="flex items-center gap-2"><span className="w-40 text-muted-foreground">N. scontrino originale *</span>
            <Input className="h-9 w-40" value={originale} onChange={(e) => setOriginale(e.target.value)} placeholder="es. 2312-0004" /></label>
        )}
        <label className="flex items-center gap-2"><span className="w-40 text-muted-foreground">N. documento {tipo === "annullo" ? "di annullo" : "di reso"}{rg ? " *" : ""}</span>
          <Input className="h-9 w-40" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="dal registratore" /></label>
        {sc && <div className="-mt-2 pl-[10.5rem] text-xs text-muted-foreground">Lascialo vuoto: il documento lo batte da solo il registratore. Scrivilo solo se l&apos;hai già fatto a mano.</div>}
        <label className="block space-y-1"><span className="text-muted-foreground">Motivo *</span>
          <Input value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="es. prodotto difettoso restituito" /></label>

        <div className="flex items-baseline justify-between rounded-md bg-red-50 px-3 py-2 dark:bg-red-950/30">
          <span>Esce dalla cassa</span><span className="text-lg font-bold tabular-nums text-red-700 dark:text-red-300">− {eur(daRendere)}</span>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>Chiudi</Button>
        <Button className="bg-red-600 hover:bg-red-700" onClick={conferma} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Undo2 />} {tipo === "annullo" ? "Annulla scontrino" : "Registra storno"}
        </Button>
      </DialogFooter>
    </>
  );
}
