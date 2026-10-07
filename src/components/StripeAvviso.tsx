"use client";

// PAGAMENTI STRIPE RICEVUTI (07/10/2026, Christian: «quando arriva un pagamento da Stripe non mi arriva la notifica di
// riconciliazione come per i bonifici»). I pagamenti Stripe si riconciliano da soli (webhook / sweep / link della
// fattura): qui compaiono comunque, su QUALSIASI pagina, con cliente, importo, a cosa sono stati abbinati e il prossimo
// passo (es. «Crea la fattura e inviala allo SdI»). «Visto» li toglie per tutti. Se il pagamento NON si è potuto
// abbinare (importo diverso, fattura già incassata…) l'avviso è rosso con il motivo.

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, CreditCard, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { stripeAvvisi, stripeVisto, type StripeAvviso as Avviso } from "@/lib/stripeAvvisi";

const SENZA = ["/login", "/forgot-password", "/reset-password"];

const eur = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));
const dataOra = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function StripeAvviso() {
  const pathname = usePathname();
  const [avvisi, setAvvisi] = useState<Avviso[]>([]);
  const [aperto, setAperto] = useState(false);

  const carica = useCallback(() => { stripeAvvisi().then((r) => setAvvisi(r.avvisi || [])).catch(() => undefined); }, []);
  useEffect(() => {
    if (SENZA.some((p) => pathname.startsWith(p))) return;
    carica();
    const t = setInterval(carica, 60_000);
    window.addEventListener("focus", carica);
    return () => { clearInterval(t); window.removeEventListener("focus", carica); };
  }, [carica, pathname]);

  if (SENZA.some((p) => pathname.startsWith(p))) return null;
  const n = avvisi.length;
  const rossi = avvisi.filter((a) => !a.riconciliato).length;

  return (
    <>
      {n > 0 && !aperto && (
        <button type="button" onClick={() => setAperto(true)}
          className={`fixed bottom-16 right-4 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg print:hidden ${rossi ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
          title="Pagamenti Stripe arrivati: controlla a cosa sono stati abbinati e il prossimo passo">
          <span className={`absolute -left-1 -top-1 size-3 animate-ping rounded-full ${rossi ? "bg-red-400" : "bg-indigo-400"}`} />
          <CreditCard className="size-4" />
          {rossi ? <>{rossi} {rossi === 1 ? "pagamento Stripe NON abbinato" : "pagamenti Stripe NON abbinati"}</>
            : <>{n} {n === 1 ? "pagamento Stripe ricevuto" : "pagamenti Stripe ricevuti"}</>}
        </button>
      )}
      {aperto && <Pannello avvisi={avvisi} onClose={() => { setAperto(false); carica(); }} onVisto={(id) => {
        setAvvisi((x) => x.filter((a) => a.id !== id));
      }} />}
    </>
  );
}

function Pannello({ avvisi, onClose, onVisto }: { avvisi: Avviso[]; onClose: () => void; onVisto: (id: string) => void }) {
  const [busy, setBusy] = useState("");

  async function visto(a: Avviso) {
    setBusy(a.id);
    try {
      await stripeVisto(a.id);
      onVisto(a.id);
      toast.success(`Pagamento di ${a.cliente} segnato come visto`);
      if (avvisi.length <= 1) onClose();
    } catch (e) {
      toastErrore(e);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 print:hidden" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><CreditCard className="size-5 text-indigo-600" /> Pagamenti Stripe ricevuti</h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Chiudi"><X /></Button>
          </div>
          <div className="text-xs text-muted-foreground">Pagamenti con carta dai link Stripe (sessioni, pro forma, fatture). «Visto» li toglie per tutti.</div>
        </div>

        <div className="space-y-3 p-4">
          {!avvisi.length && <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nessun pagamento Stripe da vedere.</div>}
          {avvisi.map((a) => (
            <div key={a.id} className={`space-y-2 rounded-lg border-2 p-3 ${a.riconciliato ? "border-emerald-500/50" : "border-red-500 bg-red-50 dark:bg-red-950/30"}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xl font-semibold tabular-nums">{eur(a.importo)}</span>
                <span className="font-medium">{a.cliente}</span>
                <span className="ml-auto text-xs text-muted-foreground">{dataOra(a.data)}</span>
              </div>

              {a.riconciliato ? (
                <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-4" /> Già riconciliato automaticamente
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-sm font-medium text-red-700 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>NON abbinato{a.errore ? <>: <span className="font-normal">{a.errore}</span></> : " in automatico"}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Abbinato a:</span>
                {a.abbinato.length ? a.abbinato.map((d) => (
                  <Link key={d.url} href={d.url} onClick={onClose} className="inline-flex items-center gap-1 text-primary underline">
                    {d.label}{d.stato === "bozza" ? " (bozza)" : ""}<ExternalLink className="size-3" />
                  </Link>
                )) : <span>—</span>}
              </div>

              {a.prossimo_passo && (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-sm">
                  <ArrowRight className="size-4 text-indigo-600" />
                  <span><span className="text-xs text-muted-foreground">Prossimo passo: </span>{a.prossimo_passo.testo}</span>
                  {a.prossimo_passo.url && (
                    <Link href={a.prossimo_passo.url} onClick={onClose} className="ml-auto text-xs font-medium text-primary underline">Apri</Link>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-[11px] text-muted-foreground" title={a.codice}>{a.codice}</span>
                <Button size="sm" className="ml-auto" variant={a.riconciliato ? "default" : "outline"} disabled={busy === a.id} onClick={() => visto(a)}>
                  {busy === a.id ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Check className="mr-1 size-4" />}Visto
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
