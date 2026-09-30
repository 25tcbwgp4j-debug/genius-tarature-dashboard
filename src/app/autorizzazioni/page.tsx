"use client";

// AUTORIZZAZIONI (01/10/2026): le operazioni protette chieste dagli operatori (cancellazioni, storni, riaperture…).
// L'amministratore le approva — il server esegue da solo la stessa chiamata — o le rifiuta. Sotto lo storico.
// L'operatore vede in sola lettura le proprie richieste e il loro esito.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePermessi } from "@/components/permessi";
import { toastErrore } from "@/lib/errori";
import { autApprova, autElenco, autRifiuta, TIPI_AUTORIZZAZIONE, type Autorizzazione } from "@/lib/api";

const STATI: Record<string, { l: string; c: string }> = {
  in_attesa: { l: "in attesa", c: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  approvata: { l: "approvata", c: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  eseguita: { l: "eseguita", c: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  rifiutata: { l: "rifiutata", c: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  errore: { l: "errore", c: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
};
const quando = (d: string | null) => d ? new Date(d).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

function Stato({ s }: { s: string }) {
  const x = STATI[s] || { l: s, c: "bg-muted" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${x.c}`}>{x.l}</span>;
}

function esitoTesto(e: unknown): string {
  if (!e || typeof e !== "object") return "";
  const o = e as { http?: number; risposta?: unknown; errore?: string };
  if (o.errore) return o.errore;
  if (o.risposta && o.risposta !== "ok") {
    const r = o.risposta as { detail?: unknown };
    const d = r?.detail ?? r;
    return typeof d === "string" ? d : JSON.stringify(d).slice(0, 200);
  }
  return "";
}

export default function AutorizzazioniPage() {
  const { admin, caricato, aggiornaInAttesa } = usePermessi();
  const [attesa, setAttesa] = useState<Autorizzazione[]>([]);
  const [storico, setStorico] = useState<Autorizzazione[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const tutte = await autElenco("");
      setAttesa(tutte.filter((a) => a.stato === "in_attesa"));
      setStorico(tutte.filter((a) => a.stato !== "in_attesa"));
    } catch (e) { toastErrore(e); } finally { setLoading(false); }
    aggiornaInAttesa();
  }, [aggiornaInAttesa]);
  useEffect(() => {
    carica();
    const t = setInterval(() => { if (!document.hidden) carica(); }, 30_000);
    return () => clearInterval(t);
  }, [carica]);

  async function decidi(a: Autorizzazione, approva: boolean) {
    if (busy) return;
    if (!approva && !confirm(`Rifiutare la richiesta di ${a.richiesta_da || "operatore"}?`)) return;
    setBusy(a.id);
    try {
      if (approva) { await autApprova(a.id); toast.success("Approvata ed eseguita"); }
      else { await autRifiuta(a.id); toast.success("Richiesta rifiutata"); }
    } catch (e) { toastErrore(e); } finally { setBusy(""); carica(); }
  }

  const riga = (a: Autorizzazione, conAzioni: boolean) => {
    const esito = esitoTesto(a.esito);
    return (
      <div key={a.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{TIPI_AUTORIZZAZIONE[a.tipo] || a.tipo}</span>
            <Stato s={a.stato} />
          </div>
          {a.descrizione && <div>{a.descrizione}</div>}
          <div className="text-xs text-muted-foreground">
            chiesta da <b>{a.richiesta_da || "—"}</b> il {quando(a.created_at)}
            {a.decisa_da && <> · {a.stato === "rifiutata" ? "rifiutata" : "autorizzata"} da <b>{a.decisa_da}</b>{a.decisa_il ? ` il ${quando(a.decisa_il)}` : ""}</>}
          </div>
          {a.motivo && <div className="text-xs">Motivo: <i>{a.motivo}</i></div>}
          {esito && <div className="text-xs text-red-700 dark:text-red-300">Esito: {esito}</div>}
        </div>
        {conAzioni && admin && (
          <div className="flex gap-2">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={!!busy} onClick={() => decidi(a, true)}>
              {busy === a.id ? <Loader2 className="animate-spin" /> : <Check />} Approva
            </Button>
            <Button size="sm" variant="outline" className="text-red-600" disabled={!!busy} onClick={() => decidi(a, false)}><X /> Rifiuta</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 p-1 md:p-2">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="size-6" /><h1 className="text-2xl font-semibold">Autorizzazioni</h1>
        <span className="text-sm text-muted-foreground">
          {caricato && !admin ? "Le tue richieste all'amministratore" : "Operazioni protette chieste dagli operatori: approvando, il server le esegue"}
        </span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={carica} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Aggiorna
        </Button>
      </div>

      <Card className="p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">In attesa ({attesa.length})</div>
        <div className="divide-y">
          {attesa.map((a) => riga(a, true))}
          {!attesa.length && <div className="p-6 text-center text-sm text-muted-foreground">{loading ? "Carico…" : "Nessuna richiesta in attesa"}</div>}
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">Storico</div>
        <div className="divide-y">
          {storico.map((a) => riga(a, false))}
          {!storico.length && <div className="p-6 text-center text-sm text-muted-foreground">{loading ? "Carico…" : "Nessuna richiesta decisa"}</div>}
        </div>
      </Card>
    </div>
  );
}
