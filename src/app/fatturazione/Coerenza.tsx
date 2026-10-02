"use client";

// Sessioni di taratura ↔ fatture (03/10/2026): la fattura è la fonte di verità del pagamento.
// Elenca le incoerenze (sessione «pagata» con fattura da pagare, fattura pagata con sessione in attesa, fatture con
// i rapporti della sessione ma non collegate, pagate senza fattura, pronte senza documento, spedite senza pagamento).
// «Correggi i casi certi» collega le fatture univoche (RDT/matricole) e allinea il pagamento alla fattura.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { fattCoerenzaCorreggi, fattCoerenzaSessioni, type CoerenzaVoce } from "@/lib/api";

const TITOLI: Record<string, string> = {
  sessione_pagata_fattura_no: "Sessione pagata, fattura da pagare",
  fattura_pagata_sessione_no: "Fattura pagata, sessione non pagata",
  da_collegare: "Fattura da collegare alla sessione",
  metodo_mancante: "Metodo di pagamento mancante",
  metodo_diverso: "Metodo diverso fra sessione e fattura",
  pagata_senza_fattura: "Pagata senza fattura",
  pronto_senza_documento: "Pronto al ritiro senza fattura né pro forma",
  completata_senza_fattura: "Completata senza fattura",
  spedita_senza_pagamento: "Spedita senza pagamento",
  rdt_su_altra_sessione: "Rapporti in una fattura di un'altra sessione",
};

export function Coerenza({ anno }: { anno: number }) {
  const [voci, setVoci] = useState<CoerenzaVoce[] | null>(null);
  const [busy, setBusy] = useState(false);
  const carica = useCallback(() => {
    setVoci(null);
    fattCoerenzaSessioni(anno).then((r) => setVoci(r.voci)).catch((e: Error) => { toast.error(e.message); setVoci([]); });
  }, [anno]);
  useEffect(() => { carica(); }, [carica]);

  const certi = (voci || []).filter((v) => v.certo);
  const gruppi = Object.entries(TITOLI).map(([k, t]) => [k, t, (voci || []).filter((v) => v.codice === k)] as const).filter(([, , l]) => l.length);

  async function correggi() {
    if (!confirm(`Correggere ${certi.length} casi certi?\n\n• collega le fatture che contengono i rapporti (o le matricole) di una sola sessione\n• allinea il pagamento della sessione alla sua fattura\n\nNessuna mail e nessun WhatsApp ai clienti.`)) return;
    setBusy(true);
    try {
      const r = await fattCoerenzaCorreggi(anno);
      toast.success(`Collegate ${r.collegate.length} fatture · allineate ${r.allineate.length} sessioni`);
      carica();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="size-5" />
        <div className="font-medium">Sessioni di taratura ↔ fatture {anno || ""}</div>
        <span className="text-xs text-muted-foreground">vale la fattura: la sessione mostra il suo stato di pagamento</span>
        {certi.length > 0 && (
          <Button size="sm" className="ml-auto" disabled={busy} onClick={correggi}>
            {busy ? <Loader2 className="animate-spin" /> : <Wrench />} Correggi i casi certi ({certi.length})</Button>
        )}
      </div>
      {!voci ? <Loader2 className="animate-spin" /> : !gruppi.length ? (
        <p className="text-sm text-emerald-700">Tutto coerente: nessuna incoerenza fra sessioni e fatture.</p>
      ) : gruppi.map(([k, t, l]) => (
        <div key={k} className="space-y-1">
          <div className="text-sm font-semibold">{t} <span className="font-normal text-muted-foreground">({l.length})</span></div>
          <ul className="space-y-0.5 text-sm">
            {l.slice(0, 200).map((v, i) => (
              <li key={`${v.session_id}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/sessioni/${v.session_id}`} className="font-medium underline">Sess. {v.session_number}</Link>
                <span className="text-muted-foreground">{v.cliente}</span>
                <span>{v.testo}</span>
                {v.fattura && <Link href={`/fatturazione?id=${v.fattura.id}`} className="text-xs underline">fattura {v.fattura.numero}</Link>}
                <span className={`rounded px-1 text-[10px] ${v.certo ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}>
                  {v.certo ? "correggibile" : "da decidere"}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}
