"use client";

// SCHEDE DI ASSISTENZA Apple — il banco di FileMaker nel Genius Lab Gestionale (02/10/2026). La pagina vera è in Banco.tsx.
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Banco } from "./Banco";

export default function AssistenzaPage() {
  return <Suspense fallback={<div className="p-6"><Loader2 className="animate-spin" /></div>}><Banco /></Suspense>;
}
