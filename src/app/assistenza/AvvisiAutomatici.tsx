"use client";

// 27/10/2026 (Christian): quello che è stato fatto IN AUTOMATICO o da Claude (bonifico arrivato, fattura emessa, scheda chiusa
// e spedita, etichetta stampata, pronto programmato partito…) compare qui come BANNER GRANDE, una riga per ogni cosa fatta,
// finché un operatore non clicca «Ho visto» (resta tracciato chi e quando). Poi va nello storico.
import { useState } from "react";
import { toast } from "sonner";
import { Bot, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OPERATORI, type Operatore } from "@/components/Operatore";
import { assAvvisi, assAvvisoVisto, assSpedisciFatturaDaIncassare, type AvvisoDashboard, type EsitoSpedisciFattura } from "@/lib/assistenza";
import { toastErrore } from "@/lib/errori";

const ora = (s: string) => new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Voci({ a, onScheda }: { a: AvvisoDashboard; onScheda?: (id: string) => void }) {
  return (
    <ul className="mt-2 space-y-1">
      {a.voci.map((v, i) => (
        <li key={i} className="flex gap-2 text-base leading-snug">
          <span className="w-6 shrink-0 text-center">{v.icona}</span>
          <span className="min-w-0 flex-1 break-words">
            {v.testo}
            {v.link && <> · <a className="underline" href={v.link} target="_blank" rel="noreferrer">apri</a></>}
          </span>
        </li>
      ))}
      {a.scheda_id && onScheda && (
        <li><button type="button" className="text-sm font-medium underline" onClick={() => onScheda(a.scheda_id!)}>Apri la scheda {a.sigla}</button></li>
      )}
    </ul>
  );
}

export function AvvisiAutomatici({ avvisi, operatore, onScheda, onVisto }: {
  avvisi: AvvisoDashboard[]; operatore: Operatore | ""; onScheda?: (id: string) => void; onVisto: () => void;
}) {
  const [chi, setChi] = useState<Operatore | "">("");
  const [busy, setBusy] = useState<string | null>(null);
  const [storico, setStorico] = useState<AvvisoDashboard[] | null>(null);
  const [fatto, setFatto] = useState<Record<string, EsitoSpedisciFattura>>({});
  const op = chi || operatore;

  // 27/10/2026 (Gianni Gallo): spedizione + fattura da incassare in un clic; il risultato (tracking, fattura) resta a video
  async function spedisciFattura(a: AvvisoDashboard) {
    if (!op) { toast.error("Scegli chi sei (CHR · VALE · DUMY · ALTRO) prima di spedire"); return; }
    if (!a.scheda_id || !confirm(`Spedire ora la scheda ${a.sigla} ed emettere la fattura DA INCASSARE?`)) return;
    setBusy(a.id);
    try {
      const r = await assSpedisciFatturaDaIncassare(a.scheda_id, op, a.id);
      setFatto((x) => ({ ...x, [a.id]: r }));
      toast.success(`Spedito: ${r.spedizione.tracking} · fattura ${r.fattura.numero ?? ""} da incassare`);
    } catch (e) { toastErrore(e); }
    finally { setBusy(null); }
  }

  async function visto(id: string) {
    if (!op) { toast.error("Scegli chi sei (CHR · VALE · DUMY · ALTRO) prima di «Ho visto»"); return; }
    setBusy(id);
    try { await assAvvisoVisto(id, op); toast.success("Segnato come visto"); onVisto(); }
    catch (e) { toastErrore(e); }
    finally { setBusy(null); }
  }
  async function apriStorico() {
    if (storico) { setStorico(null); return; }
    try { setStorico((await assAvvisi(true)).avvisi); } catch (e) { toastErrore(e); }
  }

  if (!avvisi.length && !storico) {
    return (
      <div className="flex justify-end">
        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline" onClick={apriStorico}>
          <History className="h-3 w-3" /> storico delle cose fatte in automatico
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {avvisi.map((a) => {
        const rosso = a.livello !== "info";
        return (
          <div key={a.id} className={`rounded-xl border-2 p-4 shadow-md ${rosso ? "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-50"
            : "border-indigo-600 bg-indigo-50 text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-50"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-lg font-bold">
                <Bot className="h-6 w-6 shrink-0" /> {a.titolo}
              </div>
              <span className="text-sm opacity-80">{ora(a.created_at)}{a.updated_at && a.updated_at !== a.created_at ? ` → ${ora(a.updated_at)}` : ""}</span>
            </div>
            <Voci a={a} onScheda={onScheda} />
            {a.azione?.tipo === "spedisci_fattura" && (
              fatto[a.id] ? (
                <div className="mt-3 rounded-lg border-2 border-green-700 bg-green-50 p-3 text-base font-semibold text-green-950 dark:bg-green-950/40 dark:text-green-50">
                  📦 Tracking {fatto[a.id].spedizione.tracking}{fatto[a.id].spedizione.gia_fatta ? " (già creato)" : ""} · etichetta in stampa ·
                  🧾 fattura {fatto[a.id].fattura.numero ?? "—"} DA INCASSARE{fatto[a.id].fattura.scadenza ? ` (scadenza ${fatto[a.id].fattura.scadenza})` : ""}
                </div>
              ) : (
                <Button size="lg" className="mt-3 w-full text-base font-bold" disabled={busy === a.id} onClick={() => spedisciFattura(a)}>
                  {busy === a.id ? "Spedizione e fattura in corso…" : (a.azione.etichetta || "📦 Spedisci + 🧾 fattura da incassare")}
                </Button>
              )
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm">Chi sei?</span>
              {OPERATORI.map((o) => (
                <button key={o} type="button" onClick={() => setChi(o)}
                  className={`rounded-md border px-2 py-1 text-sm font-semibold ${op === o ? "bg-foreground text-background" : "bg-background/60"}`}>{o}</button>
              ))}
              <Button size="sm" className="ml-auto" disabled={busy === a.id} onClick={() => visto(a.id)}>
                ✔ Ho visto{op ? ` (${op})` : ""}
              </Button>
            </div>
          </div>
        );
      })}
      <div className="flex justify-end">
        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline" onClick={apriStorico}>
          <History className="h-3 w-3" /> {storico ? "chiudi lo storico" : "storico delle cose fatte in automatico"}
        </button>
      </div>
      {storico && (
        <div className="space-y-2 rounded-lg border p-3 text-sm">
          {!storico.length && <p className="text-muted-foreground">Nessun avviso già visto.</p>}
          {storico.map((a) => (
            <div key={a.id} className="border-b pb-2 last:border-0">
              <div className="font-semibold">{a.titolo} <span className="font-normal text-muted-foreground">· {ora(a.created_at)} · visto da {a.visto_da} il {a.visto_il ? ora(a.visto_il) : ""}</span></div>
              <Voci a={a} onScheda={onScheda} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
