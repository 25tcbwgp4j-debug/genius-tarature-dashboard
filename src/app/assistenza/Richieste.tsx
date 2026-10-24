"use client";

// 24/10/2026 (Christian): RICHIESTE DA WHATSAPP — provvisorie finché il banco non apre la scheda o le scarta.
// Arrivano dal chatbot (richiesta di riparazione) o dalla chat dello staff (QR + nome + email).
// Le schede per cui è già prenotato il ritiro non passano di qui: nascono subito «in arrivo col corriere».

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Trash2, FilePlus2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { assRichieste, assRichiestaScarta, dataOra, type Richiesta } from "@/lib/assistenza";
import { Modale, Pill } from "./scheda/ui";

export function RichiesteWhatsApp({ operatore, onApriScheda, onCambiate }: {
  operatore: string; onApriScheda: (r: Richiesta) => void; onCambiate: () => void;
}) {
  const [lista, setLista] = useState<Richiesta[] | null>(null);
  const carica = () => assRichieste().then((r) => setLista(r.richieste)).catch(toastErrore);
  useEffect(() => { carica(); }, []);
  async function scarta(r: Richiesta) {
    if (!operatore) { toast.error("Scegli l'operatore"); return; }
    const m = prompt("Perché si scarta? (es. solo informazioni, spam, già passato al banco)", "");
    if (m === null) return;
    try { await assRichiestaScarta(r.id, { motivo: m, operatore }); toast.success("Richiesta scartata"); carica(); onCambiate(); }
    catch (e) { toastErrore(e); }
  }
  if (!lista) return <div className="p-4 text-center"><Loader2 className="inline animate-spin" /></div>;
  if (!lista.length) return <div className="p-4 text-sm text-muted-foreground">Nessuna richiesta da gestire.</div>;
  return (
    <div className="space-y-2">
      {lista.map((r) => (
        <div key={r.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <b>{r.cliente?.denominazione || r.nome || "Cliente senza nome"}</b>
            {r.cliente ? <Pill tono="verde">in rubrica</Pill> : <Pill tono="ambra">nuovo cliente</Pill>}
            <Pill>{r.origine === "chatbot" ? "chatbot" : r.origine === "whatsapp_staff" ? "WhatsApp staff" : "a mano"}</Pill>
            <span className="text-xs text-muted-foreground">R-{r.id.slice(0, 6).toUpperCase()} · {dataOra(r.created_at)}</span>
            <span className="ml-auto flex gap-1">
              <Button size="sm" onClick={() => onApriScheda(r)}><FilePlus2 />Apri scheda</Button>
              <Button size="sm" variant="ghost" className="text-red-700" onClick={() => scarta(r)}><Trash2 />Scarta</Button>
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
            {r.telefono && <span>📱 {r.telefono}</span>}
            {r.email && <span>✉️ {r.email}</span>}
            {(r.dispositivo || r.seriale) && <span>💻 {[r.dispositivo, r.seriale && `S/N ${r.seriale}`].filter(Boolean).join(" · ")}</span>}
          </div>
          {r.problema && <div className="mt-1 whitespace-pre-line text-sm">{r.problema}</div>}
          {r.conversazione && <details className="mt-1 text-xs"><summary className="cursor-pointer text-muted-foreground">conversazione</summary>
            <div className="mt-1 whitespace-pre-line">{r.conversazione}</div></details>}
        </div>
      ))}
    </div>
  );
}

/** Riga in alto nel banco: «📲 N richieste da WhatsApp da gestire» → apre l'elenco. */
export function AvvisoRichieste({ n, operatore, onApriScheda, onCambiate }: {
  n: number; operatore: string; onApriScheda: (r: Richiesta) => void; onCambiate: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  if (!n) return null;
  return (
    <>
      <button type="button" onClick={() => setAperto(true)}
        className="flex w-full items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-3 py-2 text-left text-sm font-semibold text-emerald-950 shadow-sm hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
        <MessageCircle className="size-4" />{n} {n === 1 ? "richiesta" : "richieste"} da WhatsApp da gestire
        <span className="ml-auto text-xs font-normal underline">apri</span>
      </button>
      {aperto && (
        <Modale titolo="Richieste da WhatsApp (provvisorie)" onClose={() => setAperto(false)} largo>
          <p className="mb-2 text-sm text-muted-foreground">Arrivano dal chatbot o dalla chat staff. Diventano una scheda solo quando il banco la apre («Apri scheda»); altrimenti si scartano.</p>
          <RichiesteWhatsApp operatore={operatore} onApriScheda={(r) => { setAperto(false); onApriScheda(r); }} onCambiate={onCambiate} />
        </Modale>
      )}
    </>
  );
}
