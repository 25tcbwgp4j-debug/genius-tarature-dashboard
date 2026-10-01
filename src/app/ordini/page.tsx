"use client";

// ORDINI CLIENTE, PREVENTIVI, PRO FORMA e DDT — la pagina vera è in Documenti.tsx (condivisa con /proforma).
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PaginaDocumenti } from "./Documenti";

export default function OrdiniPage() {
  return <Suspense fallback={<div className="p-6"><Loader2 className="animate-spin" /></div>}><PaginaDocumenti /></Suspense>;
}
