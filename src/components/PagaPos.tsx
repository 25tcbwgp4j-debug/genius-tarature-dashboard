"use client";

// PAGAMENTO SUI POS SUMUP (01/10/2026) — due pulsanti «POS piccolo (Solo)» e «POS grande (P8)».
// L'importo parte SOLO sul lettore scelto (Cloud API SumUp); qui si aspetta l'esito controllando ogni 2 secondi.
// A pagamento riuscito si chiama onPagato: chi usa il componente registra l'incasso con modalità «pos_sumup».
// I lettori si abbinano da Impostazioni → POS SumUp; il nome decide quale pulsante è (contiene «piccolo» o «grande»).

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { posAnnulla, posIncassa, posLettori, posStato, type IncassoPos, type LettorePos } from "@/lib/api";
import { toastErrore } from "@/lib/errori";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const POS = [
  { chiave: "piccolo", etichetta: "POS piccolo (Solo)", modello: "solo" },
  { chiave: "grande", etichetta: "POS grande (P8)", modello: "p8" },
] as const;

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

export function PagaPos({ importo, descrizione, rifTipo, rifId, disabled, onPagato, size = "sm", className = "" }: {
  importo: number; descrizione?: string; rifTipo?: string; rifId?: string; disabled?: boolean;
  onPagato: (p: IncassoPos) => void | Promise<void>; size?: "sm" | "default"; className?: string;
}) {
  const [lista, setLista] = useState<LettorePos[] | null>(null);
  const [inCorso, setInCorso] = useState<{ inc: IncassoPos; nome: string; importo: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const fatto = useRef(false);
  // l'esito si consegna sempre all'ultima versione della callback (il controllo non riparte a ogni render)
  const cb = useRef(onPagato);
  useEffect(() => { cb.current = onPagato; }, [onPagato]);
  const consegna = async (s: IncassoPos) => { try { await cb.current(s); } catch (e) { toastErrore(e); } };

  useEffect(() => { let vivo = true; lettori().then((l) => { if (vivo) setLista(l); }); return () => { vivo = false; }; }, []);

  // attesa dell'esito sul POS
  useEffect(() => {
    if (!inCorso) return;
    fatto.current = false;
    let vivo = true;
    const giro = async () => {
      if (!vivo || fatto.current) return;
      try {
        const s = await posStato(inCorso.inc.id);
        if (!vivo) return;
        if (s.stato === "pagato") {
          fatto.current = true;
          toast.success(`Pagamento di ${eur(inCorso.importo)} riuscito sul ${inCorso.nome}`);
          setInCorso(null);
          await consegna(s);
          return;
        }
        if (s.stato !== "in_attesa") {
          fatto.current = true;
          toast.error(s.stato === "annullato" ? "Pagamento annullato sul POS" : "Pagamento NON riuscito sul POS");
          setInCorso(null);
          return;
        }
      } catch { /* rete: si riprova */ }
      setTimeout(giro, 2000);
    };
    const t = setTimeout(giro, 2000);
    return () => { vivo = false; clearTimeout(t); };
  }, [inCorso]);

  async function invia(l: LettorePos, nome: string) {
    if (!(importo > 0)) { toast.error("Importo da incassare mancante"); return; }
    setBusy(true);
    try {
      const inc = await posIncassa({ lettore_id: l.id, lettore_nome: nome, importo: Math.round(importo * 100) / 100,
        descrizione: (descrizione || "GENIUS LAB").slice(0, 100), rif_tipo: rifTipo, rif_id: rifId });
      setInCorso({ inc, nome, importo });
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  async function annulla() {
    if (!inCorso) return;
    try {
      const s = await posAnnulla(inCorso.inc.id);
      if (s.stato === "pagato") { fatto.current = true; setInCorso(null); toast.success("Il cliente aveva già pagato"); await consegna(s); return; }
      fatto.current = true; setInCorso(null); toast.info("Pagamento annullato sul POS");
    } catch (e) { toastErrore(e); }
  }

  return (
    <>
      {POS.map((p) => {
        const l = lista ? trova(lista, p.chiave) : undefined;
        const titolo = !lista ? "Carico i POS…" : !l ? "POS non abbinato: Impostazioni → POS SumUp" : l.online === false ? "Il POS risulta spento o non connesso" : `Invia ${eur(importo)} al ${p.etichetta}`;
        return (
          <Button key={p.chiave} type="button" size={size} variant="outline" title={titolo}
            className={`border-sky-400 text-sky-800 hover:bg-sky-50 dark:text-sky-200 dark:hover:bg-sky-950/40 ${className}`}
            disabled={disabled || busy || !l || !!inCorso || !(importo > 0)} onClick={() => l && invia(l, p.etichetta)}>
            {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CreditCard className="mr-1 size-4" />}{p.etichetta}
          </Button>
        );
      })}
      <Dialog open={!!inCorso} onOpenChange={() => { /* si chiude solo con l'esito o con «Annulla» */ }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>In attesa del pagamento sul POS…</DialogTitle>
            <DialogDescription>
              {eur(inCorso?.importo || 0)} inviati al <b>{inCorso?.nome}</b>: il cliente avvicina o inserisce la carta sul terminale.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-4 text-3xl font-bold tabular-nums">
            <Loader2 className="size-7 animate-spin text-sky-600" />{eur(inCorso?.importo || 0)}
          </div>
          <Button variant="outline" onClick={annulla}><X className="mr-1 size-4" />Annulla il pagamento sul POS</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
