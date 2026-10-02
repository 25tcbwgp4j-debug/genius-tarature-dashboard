"use client";

// CONTABILITÀ PER IL COMMERCIALISTA (02/10/2026) — solo amministratore.
// Christian: «Non mi serve un file da scaricare e poi inviare per mail: deve essere un'automazione».
// Il pacchetto non si scarica più da qui: lo prepara, lo controlla e lo invia il backend da solo (giorno 5 alle 9:00).
// Questo pulsante porta alla sezione Fatturazione → Commercialista, sul mese appena chiuso.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FolderArchive } from "lucide-react";

/** Mese prima di quello del giorno mostrato (a inizio mese si manda il mese appena finito). */
function mesePrecedente(giorno: string) {
  const [y, m] = giorno.split("-").map((x) => parseInt(x, 10));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function ReportCommercialista({ giorno }: { giorno: string }) {
  return (
    <Link href={`/fatturazione?tab=commercialista&periodo=${mesePrecedente(giorno)}`}
      title="Contabilità del mese allo studio Gargiulo: stato, controlli e invio automatico">
      <Button size="sm" variant="outline"><FolderArchive className="mr-1 size-4" />Commercialista</Button>
    </Link>
  );
}
