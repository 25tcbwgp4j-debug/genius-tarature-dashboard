"use client";

// PRO FORMA (serie PF n/AAAA): elenco e dettaglio — anche quelli preparati dalle sessioni di taratura.
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PaginaDocumenti } from "../ordini/Documenti";

export default function ProformaPage() {
  return <Suspense fallback={<div className="p-6"><Loader2 className="animate-spin" /></div>}><PaginaDocumenti soloTipo="proforma" /></Suspense>;
}
