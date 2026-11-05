"use client";

// CHIAMA DAL GESTIONALE (05/11/2026, Christian): il centralino fa squillare l'interno scelto e, alla risposta, chiama il numero.
// L'interno si sceglie la prima volta e resta salvato su questo computer.

import { useState } from "react";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchAPI } from "@/lib/api";
import { toastErrore } from "@/lib/errori";

const INTERNI = ["201", "202", "203", "204", "205", "206", "301", "302", "303"];
const CHIAVE = "interno_telefono";

function internoSalvato() {
  try {
    return localStorage.getItem(CHIAVE) || "";
  } catch {
    return "";
  }
}

export function PulsanteChiama({ numero, size = "sm" }: { numero: string; size?: "sm" | "default" }) {
  const [aperto, setAperto] = useState(false);
  const [interno, setInterno] = useState("");
  const [busy, setBusy] = useState(false);

  async function chiama(da: string) {
    setBusy(true);
    try {
      await fetchAPI("/api/telefonate/chiama", { method: "POST", body: JSON.stringify({ numero, interno: da }) });
      try {
        localStorage.setItem(CHIAVE, da);
      } catch { /* senza memoria si richiede ogni volta */ }
      setAperto(false);
      toast.success(`Squilla l'interno ${da}: rispondi e parte la chiamata`);
    } catch (e) {
      toastErrore(e);
    } finally {
      setBusy(false);
    }
  }

  if (!aperto) {
    return (
      <Button size={size} variant="outline" onClick={() => { setInterno(internoSalvato() || INTERNI[0]); setAperto(true); }} title={`Chiama ${numero} dal telefono del negozio`}>
        <Phone className="mr-1.5 h-4 w-4" /> Chiama
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <label className="text-xs text-muted-foreground" htmlFor={`interno-${numero}`}>dal</label>
      <select id={`interno-${numero}`} value={interno} onChange={(e) => setInterno(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm">
        {INTERNI.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <Button size={size} disabled={busy} onClick={() => chiama(interno)}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Phone className="mr-1.5 h-4 w-4" />} Chiama
      </Button>
      <Button size={size} variant="ghost" onClick={() => setAperto(false)}>Annulla</Button>
    </span>
  );
}
