"use client";

// Pulsante "Crea fattura" della sessione: prepara la bozza nella sezione Fatturazione
// (righe = strumenti tarati, cliente dall'anagrafica, pagamento dalla sessione).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { fattDaSessione } from "@/lib/api";

export function FatturaPanel({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function crea() {
    setBusy(true);
    try {
      const r = await fattDaSessione(sessionId);
      if (r.gia_presente) toast.info(`Questa sessione ha già la fattura ${r.numero || "(bozza)"}`);
      else toast.success("Bozza di fattura preparata: controllala e inviala allo SdI");
      router.push(`/fatturazione?id=${r.id}`);
    } catch (e) {
      toast.error((e as Error).message || "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <Receipt className="size-5" />
      <div className="flex-1">
        <div className="font-medium">Fattura</div>
        <div className="text-sm text-muted-foreground">Prepara la fattura elettronica di questa sessione (GENIUS LAB) e inviala allo SdI.</div>
      </div>
      <Button onClick={crea} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Receipt />} Crea fattura</Button>
    </Card>
  );
}
