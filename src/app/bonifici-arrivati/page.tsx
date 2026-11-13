"use client";

// BONIFICI ARRIVATI (03/11/2026, Christian): il pulsante rosso mostra solo quelli da gestire e, una volta gestiti, spariscono.
// Qui ci sono tutti: quando sono arrivati, da chi, a che cosa sono abbinati e chi li ha gestiti.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchAPI } from "@/lib/api";

type Riga = {
  id: string; data: string; importo: number | string; ordinante: string | null; causale: string | null; stato: string; esito: string | null;
  gestito_da: string | null; gestito_il: string | null; documento_tipo: string | null; documento_numero: string | null; attivita: string | null;
};

const PERIODI = [[7, "7 giorni"], [30, "30 giorni"], [90, "90 giorni"]] as const;
const eur = (v: number | string) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(Number(v || 0));
const giorno = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const quando = (d: string | null) => (d ? new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const chi = (g: string | null) => {
  if (!g) return "";
  if (g === "automatico") return "Automatico";
  if (g.startsWith("service@")) return "Claude";
  return g.includes("·") ? g.split("·").pop()!.trim() : g.split("@")[0];
};
const STATI: Record<string, [string, string]> = {
  nuovo: ["Da gestire", "bg-rose-50 text-rose-800"], abbinato: ["Da confermare", "bg-amber-50 text-amber-900"],
  gestito: ["Gestito", "bg-emerald-50 text-emerald-800"], ignorato: ["Non è di un cliente", "bg-muted text-muted-foreground"],
};

export default function BonificiArrivatiPage() {
  const [giorni, setGiorni] = useState<number>(30);
  const [righe, setRighe] = useState<Riga[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchAPI(`/api/bonifici/arrivati?giorni=${giorni}`)
      .then((r) => { if (vivo) setRighe(r.bonifici); })
      .catch((e) => { if (vivo) { toast.error(e instanceof Error ? e.message : "Errore nel caricamento"); setRighe([]); } });
    return () => { vivo = false; };
  }, [giorni]);

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">Bonifici arrivati</h1>
        {PERIODI.map(([g, l]) => <Button key={g} size="sm" variant={giorni === g ? "default" : "outline"} onClick={() => { setRighe(null); setGiorni(g); }}>{l}</Button>)}
      </div>
      {righe === null ? <Loader2 className="animate-spin" /> : !righe.length ? <p className="py-6 text-sm text-muted-foreground">Nessun bonifico in questo periodo.</p> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          {/* 13/11/2026 (revisione iPhone): sotto i 640px ogni bonifico è una scheda (tabella-schede, globals.css) */}
          <table className="tabella-schede w-full min-w-[820px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr><th className="p-2.5">Data</th><th className="p-2.5 text-right">Importo</th><th className="p-2.5">Da</th><th className="p-2.5">Causale</th><th className="p-2.5">Stato</th><th className="p-2.5">Abbinato a</th><th className="p-2.5">Gestito da</th></tr>
            </thead>
            <tbody className="divide-y">
              {righe.map((r) => {
                const [etichetta, tono] = STATI[r.stato] || [r.stato, "bg-muted"];
                return (
                  <tr key={r.id} className="align-top">
                    <td className="in-riga whitespace-nowrap p-2.5">{giorno(r.data)}</td>
                    <td className="in-riga whitespace-nowrap p-2.5 text-right font-semibold tabular-nums">{eur(r.importo)}</td>
                    <td data-label="Da" className="p-2.5 font-medium">{r.ordinante}</td>
                    <td data-label="Causale" className="p-2.5 text-xs">{r.causale}</td>
                    <td data-label="Stato" className="p-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tono}`}>{etichetta}</span></td>
                    <td data-label="Abbinato a" className="p-2.5 text-xs">{r.documento_numero && r.documento_numero !== "bozza" ? `${r.documento_tipo || ""} ${r.documento_numero}` : r.esito}</td>
                    <td data-label="Gestito da" className="whitespace-nowrap p-2.5 text-xs">{chi(r.gestito_da)}{r.gestito_il ? <span className="block text-muted-foreground">{quando(r.gestito_il)}</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
