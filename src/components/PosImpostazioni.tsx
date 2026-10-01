"use client";

// IMPOSTAZIONI → POS SUMUP (01/10/2026): abbinamento dei due lettori alla Cloud API SumUp.
// Sul POS: Impostazioni → Connessioni → API → «Collega» mostra un codice di 8-9 caratteri; qui si scrive il nome
// («POS piccolo (Solo)» o «POS grande (P8)»: il nome decide quale pulsante di pagamento usa il lettore) e il codice.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { posAbbina, posLettori, posRimuovi, type LettorePos } from "@/lib/api";
import { toastErrore } from "@/lib/errori";

const NOMI = ["POS piccolo (Solo)", "POS grande (P8)"];
const ABB: Record<string, string> = { paired: "abbinato", processing: "in abbinamento (conferma sul POS)", expired: "abbinamento scaduto", unknown: "sconosciuto" };

export function PosImpostazioni() {
  const [lista, setLista] = useState<LettorePos[] | null>(null);
  const [errore, setErrore] = useState("");
  const [nuovo, setNuovo] = useState({ nome: NOMI[0], codice: "" });
  const [busy, setBusy] = useState("");

  const carica = useCallback(() => {
    setErrore("");
    posLettori().then((r) => setLista(r.lettori || [])).catch((e: Error) => { setLista([]); setErrore(e.message); });
  }, []);
  useEffect(() => { carica(); }, [carica]);

  async function abbina() {
    const codice = nuovo.codice.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (codice.length < 8 || codice.length > 9) { toast.error("Il codice di abbinamento ha 8 o 9 caratteri (lo mostra il POS)"); return; }
    if (!nuovo.nome.trim()) { toast.error("Scrivi il nome del POS"); return; }
    setBusy("abbina");
    try { await posAbbina(codice, nuovo.nome.trim()); toast.success("POS abbinato: conferma sul terminale se lo chiede"); setNuovo({ ...nuovo, codice: "" }); carica(); }
    catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function rimuovi(l: LettorePos) {
    if (!confirm(`Scollegare «${l.nome}» dalla dashboard?`)) return;
    setBusy(l.id);
    try { await posRimuovi(l.id); toast.success("POS scollegato"); carica(); } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold"><CreditCard className="size-5" />POS SumUp (pagamenti dalla dashboard)</h3>
        <Button size="sm" variant="ghost" onClick={carica}><RefreshCw className="mr-1 size-4" />Aggiorna</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Con i POS abbinati, scontrino, fattura, ordini e cassa del giorno mostrano i pulsanti «POS piccolo (Solo)» e «POS grande (P8)»:
        l&apos;importo arriva solo sul terminale scelto. Il nome deve contenere «piccolo» o «grande».
      </p>
      {errore && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errore}</div>}
      <div className="divide-y rounded-md border">
        {lista === null ? <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carico…</div>
          : !lista.length ? <div className="p-3 text-sm text-muted-foreground">Nessun POS abbinato.</div>
          : lista.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-medium">{l.nome}</span>
              <span className="text-xs text-muted-foreground">{l.modello || ""} {l.seriale || ""}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${l.abbinamento === "paired" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{ABB[l.abbinamento] || l.abbinamento}</span>
              {l.online !== null && <span className={`text-xs ${l.online ? "text-emerald-700" : "text-red-700"}`}>{l.online ? "online" : "offline"}{l.stato ? ` · ${l.stato}` : ""}{typeof l.batteria === "number" ? ` · batteria ${Math.round(l.batteria)}%` : ""}</span>}
              <Button size="xs" variant="ghost" className="ml-auto text-red-600" disabled={!!busy} onClick={() => rimuovi(l)}>
                {busy === l.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Scollega</Button>
            </div>
          ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-3">
        <label className="space-y-1 text-sm"><span className="block text-xs text-muted-foreground">Nome</span>
          <Input className="h-9 w-56" list="nomi-pos" value={nuovo.nome} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })} />
          <datalist id="nomi-pos">{NOMI.map((n) => <option key={n} value={n} />)}</datalist>
        </label>
        <label className="space-y-1 text-sm"><span className="block text-xs text-muted-foreground">Codice di abbinamento (dal POS)</span>
          <Input className="h-9 w-44 font-mono uppercase" maxLength={12} placeholder="es. 4WX7K2PQ" value={nuovo.codice}
            onChange={(e) => setNuovo({ ...nuovo, codice: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") abbina(); }} />
        </label>
        <Button onClick={abbina} disabled={!!busy}>{busy === "abbina" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}Abbina POS</Button>
      </div>
      <p className="text-xs text-muted-foreground">Sul POS: menu → Impostazioni → Connessioni → API → Collega: compare il codice da scrivere qui.</p>
    </Card>
  );
}
