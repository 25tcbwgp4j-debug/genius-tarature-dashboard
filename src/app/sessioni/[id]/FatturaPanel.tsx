"use client";

// Fattura della sessione di taratura (GENIUS LAB):
// - EMETTI FATTURA SUBITO (cliente al banco): crea e invia allo SdI in un colpo solo
// - PRO FORMA → pagamento (pulsanti PROFORMA qui sopra) → TRASFORMA IN FATTURA (riprende pro forma e pagamento)
// - oppure bozza da controllare prima dell'invio.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileEdit, Loader2, Receipt, Send } from "lucide-react";
import { toast } from "sonner";
import { fattDaSessione, fattStatoSessione } from "@/lib/api";

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));

interface Stato {
  fattura: { id: string; numero: string | null; stato: string; totale: number; pagamento_stato: string; data: string } | null;
  sessione: { payment_status?: string; payment_method?: string; total_amount?: number; proforma_sent_at?: string | null };
  proforma: { proforma_number: string; total: number; payment_status: string } | null;
}

export function FatturaPanel({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [st, setSt] = useState<Stato | null>(null);
  const [busy, setBusy] = useState("");

  const carica = useCallback(() => { fattStatoSessione(sessionId).then(setSt).catch(() => undefined); }, [sessionId]);
  useEffect(() => { carica(); }, [carica]);

  async function crea(emetti: boolean) {
    if (emetti && !confirm("Emettere subito la fattura e inviarla allo SdI?")) return;
    setBusy(emetti ? "emetti" : "bozza");
    try {
      const r = await fattDaSessione(sessionId, emetti);
      if (r.gia_presente) { toast.info(`Questa sessione ha già la fattura ${r.numero || "(bozza)"}`); router.push(`/fatturazione?id=${r.id}`); return; }
      if (emetti) {
        if (r.invio?.ok) toast.success(`Fattura ${r.invio.numero} emessa e inviata allo SdI`);
        else toast.error(`Fattura in bozza: ${r.invio?.errore || "da completare"}`);
      } else toast.success("Bozza di fattura preparata: controllala e inviala allo SdI");
      router.push(`/fatturazione?id=${r.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(""); }
  }

  const pagata = st?.sessione?.payment_status === "pagato";
  const f = st?.fattura;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Receipt className="size-5" />
        <div className="font-medium">Fattura</div>
        <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
          {st?.proforma && <span className="rounded bg-muted px-1.5 py-0.5">Pro forma {st.proforma.proforma_number} · {eur(st.proforma.total)}</span>}
          <span className={`rounded px-1.5 py-0.5 ${pagata ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
            {pagata ? `Pagata (${st?.sessione?.payment_method || "—"})` : "Da pagare"}</span>
        </div>
      </div>

      {f ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Fattura <b>{f.numero || "bozza"}</b> · {eur(f.totale)} · {f.stato} · {f.pagamento_stato === "pagata" ? "incassata" : "da incassare"}</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => router.push(`/fatturazione?id=${f.id}`)}><ExternalLink /> Apri</Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {st?.proforma
              ? pagata ? "La pro forma è pagata: trasformala in fattura." : "Pro forma inviata: quando il cliente paga (o anche prima) puoi trasformarla in fattura."
              : "Cliente al banco? Emetti subito la fattura. Altrimenti invia prima la PRO FORMA con i pulsanti qui sopra, fatti pagare e poi trasformala in fattura."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => crea(true)} disabled={!!busy}>
              {busy === "emetti" ? <Loader2 className="animate-spin" /> : <Send />} {st?.proforma ? "Trasforma pro forma in fattura e invia" : "Emetti fattura subito"}</Button>
            <Button variant="outline" onClick={() => crea(false)} disabled={!!busy}>
              {busy === "bozza" ? <Loader2 className="animate-spin" /> : <FileEdit />} Prepara bozza da controllare</Button>
          </div>
        </>
      )}
    </Card>
  );
}
