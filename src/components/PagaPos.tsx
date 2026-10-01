"use client";

// PAGAMENTO CON VERIFICA AUTOMATICA (01/10/2026) — POS SumUp e PayPal.
// Nessun documento (scontrino, fattura pagata, acconto/saldo, riga cassa) parte prima che il pagamento risulti:
// - «POS piccolo (Solo)» / «POS grande (P8)»: se il lettore è abbinato (Impostazioni → POS SumUp) l'importo arriva
//   SOLO su quel terminale (Cloud API); se non è abbinato si batte l'importo a mano sul POS e la dashboard cerca da sola
//   la transazione nello storico SumUp (stesso importo, creata dopo l'apertura dell'attesa, non già abbinata).
// - «POS SumUp» (generico): sempre verifica sullo storico transazioni.
// - «PayPal»: la dashboard crea un ordine PayPal e mostra il QR/link; il cliente paga e la conferma arriva da sola.
// La dashboard controlla ogni 3 secondi. «Annulla» chiude l'attesa; «Conferma manuale» solo per l'amministratore.
// A pagamento verificato si chiama onPagato(p): p.metodo dice se è POS o PayPal, p.transaction_code è la prova.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Copy, CreditCard, Loader2, ShieldCheck, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermessi } from "@/components/permessi";
import { posAnnulla, posConfermaManuale, posIncassa, posLettori, posStato, type IncassoPos, type LettorePos } from "@/lib/api";
import { toastErrore } from "@/lib/errori";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
// 01/10/2026 (Christian): due soli pulsanti chiari.
// - «Paga con POS piccolo»: l'importo parte DIRETTO sul SumUp Solo abbinato via Cloud API (il cliente avvicina la carta);
// - «Incassato con POS P8»: il P8 non supporta la Cloud API → l'importo si batte a mano sul P8 e la dashboard
//   conferma da sola leggendo le transazioni SumUp.
const POS = [
  { chiave: "piccolo", etichetta: "Paga con POS piccolo", nomeLettore: "POS piccolo (Solo)", api: true },
  { chiave: "grande", etichetta: "Incassato con POS P8", nomeLettore: "POS P8", api: false },
] as const;
const OGNI_MS = 3000;

// elenco lettori in memoria per 60 s (la pagina non deve chiederlo a SumUp a ogni pulsante)
let cache: { t: number; p: Promise<LettorePos[]> } | null = null;
function lettori(): Promise<LettorePos[]> {
  if (!cache || Date.now() - cache.t > 60_000) {
    cache = { t: Date.now(), p: posLettori().then((r) => r.lettori || []).catch(() => { cache = null; return []; }) };
  }
  return cache.p;
}

function trova(lista: LettorePos[], chiave: string): LettorePos | undefined {
  return lista.find((l) => l.abbinamento === "paired" && (l.nome || "").toLowerCase().includes(chiave));
}

type Attesa = { inc: IncassoPos; nome: string; importo: number };

export function PagaPos({ importo, descrizione, rifTipo, rifId, disabled, onPagato, size = "sm", className = "",
  generico = false, paypal = false, soloLettori = true }: {
  importo: number; descrizione?: string; rifTipo?: string; rifId?: string; disabled?: boolean;
  onPagato: (p: IncassoPos) => void | Promise<void>; size?: "sm" | "default"; className?: string;
  /** mostra anche il pulsante «POS SumUp» (verifica sullo storico transazioni, qualunque terminale) */
  generico?: boolean;
  /** mostra anche il pulsante «PayPal» (ordine PayPal con QR, conferma automatica) */
  paypal?: boolean;
  /** mostra i due pulsanti POS piccolo / grande */
  soloLettori?: boolean;
}) {
  const { admin } = usePermessi();
  const [lista, setLista] = useState<LettorePos[] | null>(null);
  const [attesa, setAttesa] = useState<Attesa | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [codiceManuale, setCodiceManuale] = useState("");
  const fatto = useRef(false);
  // l'esito si consegna sempre all'ultima versione della callback (il controllo non riparte a ogni render)
  const cb = useRef(onPagato);
  useEffect(() => { cb.current = onPagato; }, [onPagato]);
  const consegna = async (s: IncassoPos) => { try { await cb.current(s); } catch (e) { toastErrore(e); } };

  useEffect(() => { let vivo = true; lettori().then((l) => { if (vivo) setLista(l); }); return () => { vivo = false; }; }, []);

  // QR del link PayPal
  useEffect(() => {
    const link = attesa?.inc.link_pagamento;
    if (!link) { setQr(""); return; }
    QRCode.toDataURL(link, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [attesa?.inc.link_pagamento]);

  // controllo dell'esito ogni 3 secondi
  useEffect(() => {
    if (!attesa) return;
    fatto.current = false;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    const giro = async () => {
      if (!vivo || fatto.current) return;
      try {
        const s = await posStato(attesa.inc.id);
        if (!vivo || fatto.current) return;
        if (s.stato === "pagato") {
          fatto.current = true;
          toast.success(`Pagamento di ${eur(attesa.importo)} verificato${s.transaction_code ? ` (transazione ${s.transaction_code})` : ""}`);
          setAttesa(null);
          await consegna(s);
          return;
        }
        if (s.stato !== "in_attesa") {
          fatto.current = true;
          toast.error(s.stato === "annullato" ? "Pagamento annullato" : "Pagamento NON riuscito");
          setAttesa(null);
          return;
        }
      } catch { /* rete: si riprova */ }
      timer = setTimeout(giro, OGNI_MS);
    };
    timer = setTimeout(giro, OGNI_MS);
    return () => { vivo = false; clearTimeout(timer); };
  }, [attesa]);

  async function apri(nome: string, opz: { lettore?: LettorePos; metodo?: "pos" | "paypal" }) {
    if (!(importo > 0)) { toast.error("Importo da incassare mancante"); return; }
    setBusy(true);
    try {
      const inc = await posIncassa({ lettore_id: opz.lettore?.id, lettore_nome: nome, importo: Math.round(importo * 100) / 100,
        descrizione: (descrizione || "GENIUS LAB").slice(0, 100), rif_tipo: rifTipo, rif_id: rifId, metodo: opz.metodo || "pos" });
      setCodiceManuale("");
      setAttesa({ inc, nome, importo });
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  async function annulla() {
    if (!attesa) return;
    try {
      const s = await posAnnulla(attesa.inc.id);
      if (s.stato === "pagato") { fatto.current = true; setAttesa(null); toast.success("Il cliente aveva già pagato"); await consegna(s); return; }
      fatto.current = true; setAttesa(null); toast.info("Pagamento annullato");
    } catch (e) { toastErrore(e); }
  }

  async function confermaManuale() {
    if (!attesa) return;
    if (!confirm(`Confermare A MANO il pagamento di ${eur(attesa.importo)} senza la verifica di ${attesa.inc.metodo === "paypal" ? "PayPal" : "SumUp"}?`)) return;
    try {
      const s = await posConfermaManuale(attesa.inc.id, { transaction_code: codiceManuale.trim() || undefined, nota: "confermato dall'amministratore" });
      fatto.current = true; setAttesa(null);
      toast.success("Pagamento confermato manualmente");
      await consegna(s);
    } catch (e) { toastErrore(e); }
  }

  const blocca = disabled || busy || !!attesa || !(importo > 0);
  const stile = `border-sky-400 text-sky-800 hover:bg-sky-50 dark:text-sky-200 dark:hover:bg-sky-950/40 ${className}`;
  const modo = attesa?.inc.modo;
  const pp = attesa?.inc.metodo === "paypal";

  return (
    <>
      {soloLettori && POS.map((p) => {
        const l = lista && p.api ? trova(lista, p.chiave) : undefined;
        const viaApi = !!l && l.online !== false;
        const titolo = !lista ? "Carico i POS…" : viaApi ? `Invia ${eur(importo)} direttamente al POS piccolo: il cliente avvicina la carta`
          : `Batti ${eur(importo)} sul ${p.nomeLettore}: la dashboard riconosce da sola il pagamento su SumUp`;
        return (
          <Button key={p.chiave} type="button" size={size} variant="outline" title={titolo} className={stile}
            disabled={blocca || !lista} onClick={() => apri(p.nomeLettore, { lettore: viaApi ? l : undefined })}>
            {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CreditCard className="mr-1 size-4" />}{p.etichetta}
          </Button>
        );
      })}
      {generico && !soloLettori && (
        <Button type="button" size={size} variant="outline" className={stile} disabled={blocca}
          title="Batti l'importo su un POS SumUp: la dashboard riconosce da sola il pagamento" onClick={() => apri("POS SumUp", {})}>
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CreditCard className="mr-1 size-4" />}POS SumUp
        </Button>
      )}
      {paypal && (
        <Button type="button" size={size} variant="outline" className={`border-indigo-400 text-indigo-800 hover:bg-indigo-50 dark:text-indigo-200 ${className}`}
          disabled={blocca} title="Crea il pagamento PayPal (QR da far inquadrare al cliente): conferma automatica" onClick={() => apri("PayPal", { metodo: "paypal" })}>
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Wallet className="mr-1 size-4" />}PayPal
        </Button>
      )}
      <Dialog open={!!attesa} onOpenChange={() => { /* si chiude solo con l'esito o con «Annulla» */ }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{pp ? "In attesa del pagamento PayPal…" : "In attesa del pagamento sul POS…"}</DialogTitle>
            <DialogDescription>
              {pp ? <>Il cliente inquadra il QR (o apre il link) e paga {eur(attesa?.importo || 0)} con PayPal: la conferma arriva da sola.</>
                : modo === "lettore" ? <>{eur(attesa?.importo || 0)} inviati al <b>{attesa?.nome}</b>: il cliente avvicina o inserisce la carta sul terminale.</>
                : <>Batti <b>{eur(attesa?.importo || 0)}</b> sul {attesa?.nome === "POS SumUp" ? "POS SumUp" : <b>{attesa?.nome}</b>}: la dashboard controlla le transazioni SumUp ogni 3 secondi e conferma da sola quando il pagamento risulta.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-2 text-3xl font-bold tabular-nums">
            <Loader2 className="size-7 animate-spin text-sky-600" />{eur(attesa?.importo || 0)}
          </div>
          {pp && attesa?.inc.link_pagamento && (
            <div className="flex flex-col items-center gap-2">
              {qr && <img src={qr} alt="QR pagamento PayPal" className="size-52 rounded border bg-white p-1" />}
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(attesa.inc.link_pagamento || ""); toast.success("Link PayPal copiato"); }}>
                <Copy className="mr-1 size-4" />Copia il link di pagamento</Button>
            </div>
          )}
          <Button variant="outline" onClick={annulla}><X className="mr-1 size-4" />Annulla</Button>
          {admin && (
            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50/60 p-2 dark:bg-amber-950/20">
              <div className="text-xs text-muted-foreground">Solo amministratore: se il pagamento c&apos;è ma la verifica non lo trova</div>
              <div className="flex gap-2">
                <Input className="h-8" placeholder="Codice transazione (facoltativo)" value={codiceManuale} onChange={(e) => setCodiceManuale(e.target.value)} />
                <Button size="sm" variant="outline" className="border-amber-400" onClick={confermaManuale}><ShieldCheck className="mr-1 size-4" />Conferma manuale</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
