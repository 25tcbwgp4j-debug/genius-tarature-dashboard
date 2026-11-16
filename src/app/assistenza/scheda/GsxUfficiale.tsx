"use client";
// 16/11/2026 (Christian): RIPARAZIONE UFFICIALE APPLE — finché Christian non l'ha aperta in GSX la scheda non va al tecnico
// («Da aprire in GSX (Christian)»). Qui: l'avviso con la verifica di «Trova il mio» fatta da Apple (mai sulla parola del
// cliente), «Cerca in GSX» (legge la riparazione aperta sul seriale) e «Segna aperta» col numero Apple facoltativo.
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchAPI } from "@/lib/api";
import type { Scheda } from "@/lib/assistenza";

const TITOLO = "Da aprire in GSX (Christian)";

export function daAprireGsx(s: Scheda): boolean {
  return s.avanzamento?.situazione?.titolo === TITOLO;
}

export function GsxUfficiale({ s, ro, operatore, onScheda }: { s: Scheda; ro: boolean; operatore: string; onScheda: (x: Scheda) => void }) {
  const [numero, setNumero] = useState("");
  const [busy, setBusy] = useState<"" | "cerca" | "segna">("");
  if (!daAprireGsx(s) && !s.gsx_aperta_il) return null;
  if (s.gsx_aperta_il) {
    if (s.stato !== "accettato") return null;
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100" data-testid="gsx-aperta">
        ✅ Riparazione ufficiale Apple <b>aperta in GSX</b>{s.gsx_riparazione_apple ? ` · n. ${s.gsx_riparazione_apple}` : ""}
        {s.gsx_aperta_da ? ` · da ${s.gsx_aperta_da}` : ""}: si può assegnare al tecnico.
      </div>);
  }
  const tv = s.gsx?.trova_verifica;
  const trova = tv?.stato === "non_attivo" ? { t: "disattivato (verificato da Apple)", c: "text-emerald-800 dark:text-emerald-300" }
    : tv?.stato === "attivo" ? { t: "ATTIVO: il cliente deve disattivarlo", c: "text-red-700 dark:text-red-300" }
      : { t: "non verificato da Apple: fai la Decodifica GSX o controllalo sul dispositivo", c: "text-amber-800 dark:text-amber-300" };
  async function chiama(cosa: "cerca" | "segna") {
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    setBusy(cosa);
    try {
      const x: Scheda = await fetchAPI(`/api/assistenza/schede/${s.id}/gsx-aperta`, { method: "POST",
        body: JSON.stringify({ operatore, ...(cosa === "cerca" ? { cerca: true } : { numero: numero.trim() || undefined }) }) });
      onScheda(x);
      toast.success(`Riparazione ufficiale segnata aperta in GSX${x.gsx_riparazione_apple ? ` (n. ${x.gsx_riparazione_apple})` : ""}: ora si assegna al tecnico`);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  }
  return (
    <div className="rounded-xl border-2 border-red-500 bg-red-50 p-3 text-sm text-red-950 dark:bg-red-950/30 dark:text-red-50" data-testid="gsx-da-aprire">
      <div className="text-base font-bold">👑 Da aprire in GSX (Christian)</div>
      <p className="mt-1">Riparazione <b>ufficiale Apple</b>: aprila in GSX prima di assegnarla al tecnico.</p>
      <p className={`mt-1 font-medium ${trova.c}`}>«Trova il mio»: {trova.t}{tv?.verificato_il ? ` · ${new Date(tv.verificato_il).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
      {!ro && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!!busy} onClick={() => chiama("cerca")}>{busy === "cerca" ? <Loader2 className="animate-spin" /> : <Search />}Cerca la riparazione in GSX</Button>
          <Input className="h-8 w-40 bg-white dark:bg-gray-900" placeholder="n. riparazione (G…)" value={numero} onChange={(e) => setNumero(e.target.value)} />
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => chiama("segna")}>{busy === "segna" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Segna aperta in GSX</Button>
        </div>)}
    </div>);
}
