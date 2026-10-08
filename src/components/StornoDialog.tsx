"use client";

// STORNO / RESO e ANNULLO di uno scontrino (01/10/2026).
//  - scontrino della dashboard già emesso → POST /api/cassa/scontrini/{id}/storno (reso anche parziale, per righe)
//  - riga «scontrino» battuta a mano nella Cassa del giorno → POST /api/cassa/giornata/movimenti/{id}/storno
//    (storno anche parziale, per importo)
// Il documento negativo finisce nella cassa di OGGI. Per l'operatore serve l'autorizzazione dell'amministratore:
// la gestisce il dialog globale (fetchAPI).
// RESO rivisto il 08/10/2026 (caso 2318-0005, si rendeva solo il cavo): le quantità partono da 0 (si sceglie cosa rende
// il cliente, «Rendi tutto» e +/− per riga), il RIMBORSO si sceglie sempre (default Contanti) e lo scontrino della
// GIORNATA IN CORSO non si rende sul registratore: si propone «Annulla tutto e riemetti» (annullo + carrello pronto con
// gli articoli che restano) oppure il reso domani, dopo la chiusura.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Minus, Plus, RotateCcw, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDec } from "@/components/DecInput";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { eInAttesa, toastErrore } from "@/lib/errori";
import { oggiRoma } from "@/lib/date";
import { cassaGiornataStorno, cassaStornoScontrino, type RigaCassa, type RigaGiornata, type Scontrino } from "@/lib/api";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
// modalità di rimborso: scontrini della dashboard (come la cassa) e colonne della cassa del giorno
const MOD_SCONTRINO: [string, string][] = [["contanti", "Contanti"], ["pos_sumup", "POS (carta)"], ["bonifico", "Bonifico"], ["paypal", "PayPal"]];
const COLONNE: [string, string][] = [["contanti", "Contanti"], ["pos", "POS"], ["stripe", "Stripe"], ["bonifico", "Bonifico"], ["paypal", "PayPal"]];
const tondo = (v: number) => Math.round(v * 100) / 100;

export type OggettoStorno =
  | { fonte: "scontrino"; scontrino: Scontrino }
  | { fonte: "manuale"; riga: RigaGiornata };

/** righe da rimettere nel carrello dopo «Annulla tutto e riemetti» (anche passando da un'altra pagina alla Cassa) */
export const CHIAVE_RIEMISSIONE = "cassa-riemissione";
export type Riemissione = { annullo_id: string; numero: string | null; righe: RigaCassa[] };

/** scontrino della giornata fiscale ancora aperta: il RESO sul registratore non si può fare (08/10/2026) */
export function giornataAperta(s: Scontrino): boolean {
  if (typeof s.giornata_aperta === "boolean") return s.giornata_aperta;
  const d = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date(s.data_rt || s.created_at));
  return d === oggiRoma();
}

export function StornoDialog({ oggetto, onClose, onFatto, onRiemetti }: {
  oggetto: OggettoStorno | null; onClose: () => void; onFatto: () => void;
  /** «Annulla tutto e riemetti»: righe che restano al cliente (senza, si apre la Cassa con il carrello pronto) */
  onRiemetti?: (r: Riemissione) => void;
}) {
  return (
    <Dialog open={!!oggetto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {oggetto && <Corpo key={oggetto.fonte === "scontrino" ? oggetto.scontrino.id : oggetto.riga.id} oggetto={oggetto} onClose={onClose} onFatto={onFatto} onRiemetti={onRiemetti} />}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({ oggetto, onClose, onFatto, onRiemetti }: { oggetto: OggettoStorno; onClose: () => void; onFatto: () => void; onRiemetti?: (r: Riemissione) => void }) {
  return oggetto.fonte === "scontrino"
    ? <CorpoScontrino sc={oggetto.scontrino} onClose={onClose} onFatto={onFatto} onRiemetti={onRiemetti} />
    : <CorpoManuale rg={oggetto.riga} onClose={onClose} onFatto={onFatto} />;
}

const campo = "h-9 rounded-md border border-input bg-background px-2 text-sm";
function Scelta<T extends string>({ k, v, set, l, sotto, off }: { k: T; v: T; set: (k: T) => void; l: string; sotto: string; off?: boolean }) {
  return (
    <label className={`flex items-start gap-2 rounded-md border p-2 ${off ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${v === k ? "border-primary bg-primary/5" : ""}`}>
      <input type="radio" className="mt-1" checked={v === k} disabled={off} onChange={() => set(k)} />
      <span><span className="font-medium">{l}</span><span className="block text-xs text-muted-foreground">{sotto}</span></span>
    </label>
  );
}

/** Scontrino della dashboard già emesso: RESO (articoli scelti) · ANNULLA TUTTO E RIEMETTI · ANNULLO. */
function CorpoScontrino({ sc, onClose, onFatto, onRiemetti }: { sc: Scontrino; onClose: () => void; onFatto: () => void; onRiemetti?: (r: Riemissione) => void }) {
  const router = useRouter();
  const aperta = giornataAperta(sc);
  const [tipo, setTipo] = useState<"reso" | "riemetti" | "annullo">(aperta ? "riemetti" : "reso");
  const [motivo, setMotivo] = useState("");
  const [numero, setNumero] = useState("");
  const [originale, setOriginale] = useState("");
  const [busy, setBusy] = useState(false);
  const [operatore, setOperatore] = useOperatore();
  // quantità che il cliente RENDE: partono da 0, le sceglie l'operatore
  const [qta, setQta] = useState<number[]>(() => sc.righe.map(() => 0));
  const [modalita, setModalita] = useState("contanti");
  const max = (i: number) => Number(sc.righe[i].quantita);
  const metti = (i: number, v: number) => setQta((q) => q.map((x, j) => (j === i ? Math.min(max(i), Math.max(0, Math.round(v * 1000) / 1000)) : x)));
  const prezzoRiga = (r: RigaCassa, q: number) => q * Number(r.prezzo) * (1 - (Number(r.sconto) || 0) / 100);
  const totOrig = Number(sc.totale);
  const totReso = tondo(sc.righe.reduce((s, r, i) => s + prezzoRiga(r, qta[i] || 0), 0));
  const qualcosa = qta.some((q) => q > 0);
  const restano: RigaCassa[] = sc.righe.map((r, i) => ({ ...r, quantita: tondo(Number(r.quantita) - (qta[i] || 0)) })).filter((r) => r.quantita > 0);
  const totRestano = tondo(restano.reduce((s, r) => s + prezzoRiga(r, Number(r.quantita)), 0));
  const esce = tipo === "reso" ? totReso : totOrig;
  const pronto = !!operatore && motivo.trim().length >= 3 && (tipo === "annullo" || qualcosa) && !(tipo === "reso" && aperta);

  async function conferma() {
    if (busy) return;
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    if (motivo.trim().length < 3) { toast.error("Scrivi il motivo"); return; }
    if (tipo !== "annullo" && !qualcosa) { toast.error("Scegli cosa rende il cliente (quantità maggiore di 0)"); return; }
    if (!sc.numero_rt && !numero.trim() && !/^\d{4}-\d{4}$/.test(originale.trim())) {
      toast.error("Scrivi il numero dello scontrino originale come sullo scontrino (es. 2312-0004)"); return;
    }
    setBusy(true);
    try {
      if (tipo === "reso") {
        const righe = sc.righe.map((_, i) => ({ indice: i, quantita: qta[i] || 0 })).filter((r) => r.quantita > 0);
        await cassaStornoScontrino(sc.id, { tipo: "reso", righe, modalita, motivo: motivo.trim(),
          numero_rt: numero.trim() || undefined, numero_originale: originale.trim() || undefined, operatore });
        toast.success(`Reso di ${eur(totReso)} registrato: rimborso in ${MOD_SCONTRINO.find(([k]) => k === modalita)?.[1] || modalita}`);
      } else {
        const a = await cassaStornoScontrino(sc.id, { tipo: "annullo", motivo: motivo.trim(),
          numero_rt: numero.trim() || undefined, numero_originale: originale.trim() || undefined, operatore });
        if (tipo === "riemetti") {
          const r: Riemissione = { annullo_id: a.id, numero: sc.numero_rt, righe: restano.map((x) => ({ ...x })) };
          toast.success(`Annullo di ${eur(totOrig)} in coda. Carrello pronto con ${restano.length ? `gli articoli che restano (${eur(totRestano)})` : "nessun articolo"}: aggiungi l'eventuale merce nuova e incassa.`, { duration: 9000 });
          if (onRiemetti) onRiemetti(r);
          else {
            try { sessionStorage.setItem(CHIAVE_RIEMISSIONE, JSON.stringify(r)); } catch { /* noop */ }
            router.push("/cassa?riemetti=1");
          }
        } else toast.success(`Annullo di ${eur(totOrig)} registrato nella cassa di oggi`);
      }
      onFatto();
      onClose();
    } catch (e) {
      toastErrore(e);
      if (eInAttesa(e)) onClose();   // mandato all'amministratore: lo esegue il server quando approva
    } finally { setBusy(false); }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Undo2 className="size-5" /> Reso o annullo</DialogTitle>
        <DialogDescription>
          Scontrino {sc.numero_rt ? `n. ${sc.numero_rt}` : ""} da <b>{eur(totOrig)}</b> del {new Date(sc.created_at).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}.
          Il documento negativo va nella cassa di <b>oggi</b>.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <Scelta k="reso" v={tipo} set={setTipo} l="Reso" sotto={aperta ? "non oggi: dopo la chiusura" : "il cliente rende alcuni articoli"} off={aperta} />
          <Scelta k="riemetti" v={tipo} set={setTipo} l="Annulla tutto e riemetti" sotto="annullo + nuovo scontrino con quello che resta" />
          <Scelta k="annullo" v={tipo} set={setTipo} l="Solo annullo" sotto="scontrino sbagliato: si annulla per intero" />
        </div>

        {aperta && (
          <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <b>Scontrino della giornata in corso</b> (chiusura fiscale non ancora fatta): il registratore <b>non fa il reso</b> di un documento
            della stessa giornata. Scegli <b>«Annulla tutto e riemetti»</b>: si annulla lo scontrino intero (il cliente riprende quanto pagato)
            e la Cassa si apre con gli articoli che tiene; per un <b>cambio merce</b> aggiungi l&apos;articolo nuovo e incassa.
            Oppure fai il reso <b>domani</b>, dopo la chiusura.
          </div>
        )}

        {tipo !== "annullo" && (
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b px-2 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">Cosa rende il cliente</span>
              <span className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7" onClick={() => setQta(sc.righe.map((r) => Number(r.quantita)))}>Rendi tutto</Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setQta(sc.righe.map(() => 0))}><RotateCcw className="size-3.5" /> Azzera</Button>
              </span>
            </div>
            <div className="divide-y">
              {sc.righe.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 ${qta[i] > 0 ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}>
                  <span className="flex-1">{r.descrizione} <span className="text-xs text-muted-foreground">({Number(r.quantita)} × {eur(Number(r.prezzo))})</span></span>
                  <Button size="icon" variant="outline" className="size-7" disabled={!(qta[i] > 0)} onClick={() => metti(i, (qta[i] || 0) - 1)} aria-label="Meno"><Minus className="size-3.5" /></Button>
                  <input type="number" min={0} max={max(i)} step="any" className={`${campo} h-8 w-14 text-center`} value={qta[i] ?? 0}
                    onChange={(e) => metti(i, Number(e.target.value) || 0)} aria-label="Quantità resa" />
                  <Button size="icon" variant="outline" className="size-7" disabled={(qta[i] || 0) >= max(i)} onClick={() => metti(i, (qta[i] || 0) + 1)} aria-label="Più"><Plus className="size-3.5" /></Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tipo === "reso" && !aperta && (
          <div className="space-y-1">
            <div className="text-muted-foreground">Rimborso al cliente *</div>
            <div className="flex flex-wrap gap-2">
              {MOD_SCONTRINO.map(([k, l]) => (
                <label key={k} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 ${modalita === k ? "border-primary bg-primary/5 font-medium" : ""}`}>
                  <input type="radio" checked={modalita === k} onChange={() => setModalita(k)} /> {l}
                </label>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">Cambio merce → <b>Contanti</b>: poi usa quei contanti come pagamento del nuovo scontrino.
              {sc.pagamenti?.[0]?.modalita && sc.pagamenti[0].modalita !== "contanti" ? ` (lo scontrino era stato pagato con ${MOD_SCONTRINO.find(([k]) => k === sc.pagamenti[0].modalita)?.[1] || sc.pagamenti[0].modalita})` : ""}</div>
          </div>
        )}
        {tipo === "riemetti" && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
            Nuovo scontrino: {restano.length ? restano.map((r) => `${r.quantita} × ${r.descrizione}`).join(", ") : <i>nessun articolo (il cliente rende tutto)</i>}
            {restano.length ? <> — <b>{eur(totRestano)}</b></> : null}. L&apos;annullo restituisce al cliente il pagamento originale.
          </div>
        )}

        {!sc.numero_rt && (
          <label className="flex items-center gap-2"><span className="w-40 text-muted-foreground">N. scontrino originale *</span>
            <Input className="h-9 w-40" value={originale} onChange={(e) => setOriginale(e.target.value)} placeholder="es. 2312-0004" /></label>
        )}
        <label className="flex items-center gap-2"><span className="w-40 text-muted-foreground">N. documento {tipo === "reso" ? "di reso" : "di annullo"}</span>
          <Input className="h-9 w-40" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="dal registratore" /></label>
        <div className="-mt-2 pl-[10.5rem] text-xs text-muted-foreground">Lascialo vuoto: il documento lo batte da solo il registratore. Scrivilo solo se l&apos;hai già fatto a mano.</div>
        <label className="block space-y-1"><span className="text-muted-foreground">Motivo *</span>
          <Input value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === "annullo" ? "es. scontrino sbagliato" : "es. cambio merce: cavo da 2 m"} /></label>

        <SceltaOperatore value={operatore} onChange={setOperatore} compatto />
        <div className="flex items-baseline justify-between rounded-md bg-red-50 px-3 py-2 dark:bg-red-950/30">
          <span>Esce dalla cassa{tipo === "riemetti" ? " (annullo)" : ""}</span><span className="text-lg font-bold tabular-nums text-red-700 dark:text-red-300">− {eur(esce)}</span>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>Chiudi</Button>
        <Button className="bg-red-600 hover:bg-red-700" onClick={conferma} disabled={busy || !pronto}>
          {busy ? <Loader2 className="animate-spin" /> : <Undo2 />} {tipo === "reso" ? "Registra lo storno" : tipo === "riemetti" ? "Annulla e riemetti" : "Annulla scontrino"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Riga «scontrino» battuta a mano nella Cassa del giorno: storno per importo (documento già fatto sul registratore). */
function CorpoManuale({ rg, onClose, onFatto }: { rg: RigaGiornata; onClose: () => void; onFatto: () => void }) {
  const [tipo, setTipo] = useState<"parziale" | "totale" | "annullo">("totale");
  const [motivo, setMotivo] = useState("");
  const [numero, setNumero] = useState("");
  const [busy, setBusy] = useState(false);
  const [operatore, setOperatore] = useOperatore();
  const colOrig = COLONNE.map(([k]) => k).sort((a, b) => Number(rg[b as keyof RigaGiornata]) - Number(rg[a as keyof RigaGiornata]))[0];
  const [importo, setImporto] = useState("");
  const [modalita, setModalita] = useState<string>(colOrig);
  const totOrig = tondo(COLONNE.reduce((s, [k]) => s + Number(rg[k as keyof RigaGiornata] || 0), 0));
  const impParziale = parseDec(importo);
  const daRendere = tipo === "parziale" ? (impParziale && !Number.isNaN(impParziale) ? Math.abs(impParziale) : 0) : totOrig;

  async function conferma() {
    if (busy) return;
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    if (motivo.trim().length < 3) { toast.error("Scrivi il motivo"); return; }
    if (tipo === "parziale" && !(daRendere > 0)) { toast.error("Scrivi l'importo da stornare (es. 25 o 12,50)"); return; }
    if (daRendere > totOrig + 0.01) { toast.error(`Non si può stornare più dello scontrino (${eur(totOrig)})`); return; }
    if (!numero.trim()) { toast.error("Scrivi il numero del documento di reso/annullo battuto sul registratore"); return; }
    setBusy(true);
    try {
      await cassaGiornataStorno(rg.id, { tipo: tipo === "annullo" ? "annullo" : "storno", numero: numero.trim(), motivo: motivo.trim(),
        importo: tipo === "parziale" ? daRendere : undefined, modalita: tipo === "parziale" ? modalita : undefined, operatore });
      toast.success(`${tipo === "annullo" ? "Annullo" : "Storno"} di ${eur(daRendere)} registrato nella cassa di oggi`);
      onFatto();
      onClose();
    } catch (e) {
      toastErrore(e);
      if (eInAttesa(e)) onClose();
    } finally { setBusy(false); }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Undo2 className="size-5" /> Storno / reso o annullo</DialogTitle>
        <DialogDescription>
          Scontrino {rg.numero ? `n. ${rg.numero}` : ""} da <b>{eur(totOrig)}</b>{rg.descrizione ? ` — ${rg.descrizione}` : ""}. Il documento negativo va nella cassa di <b>oggi</b>.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <Scelta k="totale" v={tipo} set={setTipo} l="Reso totale" sotto="il cliente rende tutto" />
          <Scelta k="parziale" v={tipo} set={setTipo} l="Reso parziale" sotto="solo una parte dell'importo" />
          <Scelta k="annullo" v={tipo} set={setTipo} l="Annullo" sotto="scontrino sbagliato: si annulla per intero" />
        </div>
        {tipo === "parziale" && (
          <>
            <label className="flex items-center gap-2"><span className="w-40 text-muted-foreground">Importo da stornare</span>
              <Input className="h-9 w-32 text-right font-semibold" inputMode="decimal" placeholder="€ importo" value={importo} onChange={(e) => setImporto(e.target.value)} /></label>
            <label className="flex items-center gap-2"><span className="w-40 text-muted-foreground">Rimborso in</span>
              <select className={campo} value={modalita} onChange={(e) => setModalita(e.target.value)}>
                {COLONNE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
          </>
        )}
        <label className="flex items-center gap-2"><span className="w-40 text-muted-foreground">N. documento {tipo === "annullo" ? "di annullo" : "di reso"} *</span>
          <Input className="h-9 w-40" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="dal registratore" /></label>
        <label className="block space-y-1"><span className="text-muted-foreground">Motivo *</span>
          <Input value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="es. prodotto difettoso restituito" /></label>
        <SceltaOperatore value={operatore} onChange={setOperatore} compatto />
        <div className="flex items-baseline justify-between rounded-md bg-red-50 px-3 py-2 dark:bg-red-950/30">
          <span>Esce dalla cassa</span><span className="text-lg font-bold tabular-nums text-red-700 dark:text-red-300">− {eur(daRendere)}</span>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>Chiudi</Button>
        <Button className="bg-red-600 hover:bg-red-700" onClick={conferma} disabled={busy || !operatore}>
          {busy ? <Loader2 className="animate-spin" /> : <Undo2 />} {tipo === "annullo" ? "Annulla scontrino" : "Registra storno"}
        </Button>
      </DialogFooter>
    </>
  );
}
