"use client";

// 01/11/2026 (Christian, 63257 · 63266 · 63268/63269 · 63233): schede doppie create al banco. Il server risponde 409
// «scheda_doppia» se esiste già una scheda APERTA dello stesso cliente con lo stesso seriale/IMEI (o lo stesso prodotto
// creata/accettata da meno di 30 minuti): qui si mostra quella scheda con il link e si crea solo con «Crea comunque».
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, ExternalLink, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assAzione } from "@/lib/assistenza";
import { toastErrore } from "@/lib/errori";
import { Modale } from "./ui";

export { nuovaChiave, schedaDoppia, type SchedaEsistente } from "@/lib/scheda-doppia";
import { nuovaChiave, schedaDoppia, type SchedaEsistente } from "@/lib/scheda-doppia";

export function DialogoSchedaDoppia({ esistente, busy, onApri, onCreaComunque, onClose }: {
  esistente: SchedaEsistente; busy: boolean; onApri: (id: string) => void; onCreaComunque: () => void; onClose: () => void;
}) {
  const quando = esistente.created_at ? new Date(esistente.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <Modale titolo={<span className="flex items-center gap-2"><AlertTriangle className="size-5 text-amber-600" />Esiste già una scheda aperta</span>} onClose={onClose}
      piedi={<>
        <Button variant="outline" onClick={onClose} disabled={busy}>Annulla</Button>
        <Button variant="outline" onClick={onCreaComunque} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}Crea comunque (è un altro dispositivo)</Button>
        <Button onClick={() => onApri(esistente.id)} disabled={busy}><ExternalLink />Apri la scheda {esistente.sigla}</Button></>}>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="text-2xl font-bold tabular-nums">N. {esistente.sigla}</div>
          <div>{esistente.cliente || "—"} · {esistente.prodotto || "—"}{esistente.seriale ? ` · S/N ${esistente.seriale}` : ""}</div>
          <div className="text-xs">{esistente.stato ? `stato: ${esistente.stato.replaceAll("_", " ")}` : ""}{quando ? ` · creata il ${quando}` : ""}</div>
        </div>
        <p><b>Perché:</b> {esistente.perche}.</p>
        <p className="text-muted-foreground">Se è lo stesso dispositivo apri la scheda esistente (se era «in arrivo» premi lì «Arrivato»). Crea una scheda nuova solo se il cliente ha portato davvero un altro dispositivo.</p>
        <a className="inline-flex items-center gap-1 text-xs text-blue-700 underline dark:text-blue-300" href={`/assistenza?id=${esistente.id}`} target="_blank" rel="noreferrer"><ExternalLink className="size-3" />apri in una nuova scheda del browser</a>
      </div>
    </Modale>
  );
}

/** 01/11/2026 (63257, 63267-63269): DUPLICA con tre scelte esplicite. Prima era un confirm() in cui «Annulla» NON annullava
 *  ma creava la scheda «stesso cliente, dispositivo nuovo» copiando il prodotto (IPHONE 12 su tre iPad); ora «Annulla»
 *  chiude e basta, il pulsante si blocca durante l'invio e la chiave di idempotenza evita le schede doppie al doppio clic. */
export function DialogoDuplica({ id, sigla, prodotto, operatore, onClose, onFatta, onApri }: {
  id: string; sigla: string; prodotto?: string | null; operatore: string; onClose: () => void;
  onFatta: (n: { id: string; sigla: string }) => void; onApri: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [doppia, setDoppia] = useState<{ es: SchedaEsistente; identica: boolean } | null>(null);
  const inviando = useRef(false);
  const chiave = useRef(nuovaChiave());
  async function duplica(identica: boolean, forza = false) {
    if (inviando.current) return;
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    inviando.current = true;
    setBusy(true);
    try {
      const n = await assAzione(id, "duplica", { operatore, stesso_dispositivo: identica, identica, chiave_idempotenza: `${chiave.current}-${identica ? "i" : "n"}`,
        ...(forza ? { forza_duplicato: true } : {}) });
      toast.success(`Nuova scheda ${n.sigla}: ${identica ? "correggi quello che serve" : "compila prodotto, seriale e difetto"}`);
      onFatta(n);
    } catch (e) {
      const es = schedaDoppia(e);
      if (es) setDoppia({ es, identica }); else toastErrore(e);
    } finally { inviando.current = false; setBusy(false); }
  }
  if (doppia) return <DialogoSchedaDoppia esistente={doppia.es} busy={busy} onClose={onClose} onApri={onApri} onCreaComunque={() => duplica(doppia.identica, true)} />;
  return (
    <Modale titolo={`Duplica la scheda ${sigla}`} onClose={onClose} piedi={<Button variant="outline" onClick={onClose} disabled={busy}>Annulla (non creare niente)</Button>}>
      <div className="space-y-2 text-sm">
        <Button className="h-auto w-full justify-start whitespace-normal py-2 text-left" disabled={busy} onClick={() => duplica(true)}>
          {busy ? <Loader2 className="animate-spin" /> : <Copy />}<span><b>Scheda IDENTICA</b><br /><span className="text-xs opacity-90">stesso cliente, stesso dispositivo{prodotto ? ` (${prodotto})` : ""}, difetto e accessori</span></span></Button>
        <Button variant="outline" className="h-auto w-full justify-start whitespace-normal py-2 text-left" disabled={busy} onClick={() => duplica(false)}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}<span><b>Stesso cliente, ALTRO dispositivo</b><br /><span className="text-xs text-muted-foreground">prodotto «DA COMPILARE»: scegli prodotto, seriale e difetto nella nuova scheda</span></span></Button>
      </div>
    </Modale>
  );
}
