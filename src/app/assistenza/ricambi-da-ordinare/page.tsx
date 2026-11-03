"use client";

// RICAMBI DA ORDINARE (03/11/2026, Christian, 63281): tutti i ricambi delle schede aperte in un solo elenco, con il link messo
// dal tecnico ben visibile. Da qui si apre il link, si segna ordinato (n. ordine e arrivo previsto) e arrivato; la scheda segue da sola.
// «Ordina con Claude» mette il ricambio nella coda d'acquisto già esistente (fattura Genius, PayPal con l'impronta di Christian).
import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, PackageCheck, RotateCcw, ShoppingCart, Truck } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { fetchAPI } from "@/lib/api";
import type { RicambioAtteso } from "@/lib/assistenza";

type Riga = RicambioAtteso & {
  indice: number; scheda_id: string; scheda: string; cliente: string | null; prodotto: string | null; seriale: string | null;
  stato_scheda: string; preventivo_esito: string | null; tecnico: string | null;
};
type Stato = NonNullable<RicambioAtteso["stato"]>;

const SEZIONI: { k: Stato; label: string }[] = [
  { k: "da_ordinare", label: "Da ordinare" }, { k: "richiesto", label: "In coda per Claude" },
  { k: "ordinato", label: "Ordinati" }, { k: "arrivato", label: "Arrivati" },
];
const campo = "h-9 rounded-md border border-input bg-background px-2.5 text-sm";
const dataIt = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");

export default function RicambiDaOrdinarePage() {
  const [righe, setRighe] = useState<Riga[] | null>(null);
  const [sezione, setSezione] = useState<Stato>("da_ordinare");
  const [operatore, setOperatore] = useOperatore();

  const carica = useCallback(async () => {
    try { setRighe((await fetchAPI("/api/assistenza/ricambi-gestione")).ricambi); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Errore nel caricamento"); setRighe([]); }
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const visibili = (righe || []).filter((r) => r.stato === sezione);
  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 md:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Ricambi da ordinare</h1>
        <span className="ml-auto"><SceltaOperatore value={operatore} onChange={setOperatore} compatto /></span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SEZIONI.map((x) => (
          <Button key={x.k} size="sm" variant={sezione === x.k ? "default" : "outline"} onClick={() => setSezione(x.k)}>
            {x.label} ({(righe || []).filter((r) => r.stato === x.k).length})
          </Button>
        ))}
      </div>
      {righe === null && <Loader2 className="animate-spin" />}
      {righe !== null && !visibili.length && <p className="py-6 text-sm text-muted-foreground">Nessun ricambio in questa sezione.</p>}
      <ul className="space-y-2">
        {visibili.map((r) => <RigaRicambio key={`${r.scheda_id}-${r.indice}`} r={r} operatore={operatore} onCambiata={carica} />)}
      </ul>
    </div>
  );
}

function RigaRicambio({ r, operatore, onCambiata }: { r: Riga; operatore: string; onCambiata: () => Promise<void> }) {
  const [apriOrdine, setApriOrdine] = useState(false);
  const [ordine, setOrdine] = useState(r.ordine || "");
  const [arrivo, setArrivo] = useState((r.arrivo_previsto || "").slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function chiama(percorso: string, corpo: Record<string, unknown>, msg: string) {
    if (!operatore) { toast.error("Scegli l'operatore (in alto)"); return; }
    setBusy(true);
    try {
      await fetchAPI(`/api/assistenza/schede/${r.scheda_id}/ricambi/${percorso}`, { method: "POST", body: JSON.stringify({ operatore, ...corpo }) });
      toast.success(msg);
      await onCambiata();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Operazione non riuscita"); } finally { setBusy(false); }
  }
  const aggiorna = (corpo: Record<string, unknown>, msg: string) => chiama(`${r.indice}/aggiorna`, corpo, msg);

  return (
    <li className="space-y-2 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Link className="font-mono text-sm font-semibold underline" href={`/assistenza?id=${r.scheda_id}`}>{r.scheda}</Link>
        <span className="text-sm font-medium">{r.cliente}</span>
        <span className="text-xs text-muted-foreground">{r.prodotto}{r.seriale ? ` · ${r.seriale}` : ""}{r.tecnico ? ` · ${r.tecnico}` : ""}</span>
        <span className={`ml-auto text-xs font-medium ${r.preventivo_esito === "accettato" ? "text-emerald-700" : "text-amber-700"}`}>
          {r.preventivo_esito === "accettato" ? "Preventivo accettato" : "Preventivo non ancora accettato"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 basis-48 text-[15px] font-semibold">{r.cosa || "(senza descrizione)"}{r.fornitore ? <span className="font-normal text-muted-foreground"> · {r.fornitore}</span> : null}</span>
        {r.link
          ? <a className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-700 px-3 text-sm font-medium text-white" href={r.link} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Apri il link</a>
          : <span className="text-xs text-amber-700">Nessun link: aggiungilo dalla scheda</span>}
        {r.stato === "da_ordinare" && <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setApriOrdine((x) => !x)}><Truck />Ho ordinato</Button>
          <Button size="sm" variant="outline" disabled={busy} title="Lo compra Claude: fattura Genius e PayPal, col riferimento alla scheda. Il pagamento chiede la tua impronta."
            onClick={() => { if (confirm(`Mettere in coda l'acquisto per la scheda ${r.scheda}?\n\n${r.cosa || ""}`)) chiama("ordina", { indice: r.indice }, "In coda per l'acquisto"); }}><ShoppingCart />Ordina con Claude</Button>
        </>}
        {r.stato === "richiesto" && <Button size="sm" variant="outline" disabled={busy} onClick={() => setApriOrdine((x) => !x)}><Truck />Ordinato</Button>}
        {r.stato === "ordinato" && <Button size="sm" disabled={busy} onClick={() => aggiorna({ stato: "arrivato" }, "Ricambio arrivato")}><PackageCheck />Arrivato</Button>}
        {(r.stato === "richiesto" || r.stato === "ordinato" || r.stato === "arrivato") && (
          <Button size="sm" variant="ghost" disabled={busy} title="Rimetti tra quelli da ordinare" onClick={() => aggiorna({ stato: "da_ordinare" }, "Rimesso da ordinare")}><RotateCcw />Da ordinare</Button>)}
      </div>
      {(r.stato === "ordinato" || r.stato === "arrivato" || r.stato === "richiesto") && (
        <div className="text-xs text-muted-foreground">
          {r.richiesto_il && r.stato === "richiesto" ? `In coda dal ${dataIt(r.richiesto_il)}${r.richiesto_da ? ` · ${r.richiesto_da}` : ""}` : null}
          {r.ordine ? `Ordine ${r.ordine}` : null}{r.ordinato_il ? ` · ordinato il ${dataIt(r.ordinato_il)}` : null}
          {r.arrivo_previsto ? ` · arrivo previsto ${dataIt(r.arrivo_previsto)}` : null}{r.arrivato_il ? ` · arrivato il ${dataIt(r.arrivato_il)}` : null}
        </div>)}
      {apriOrdine && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-2">
          <label className="text-xs">N. ordine<input className={`${campo} mt-0.5 block w-48`} value={ordine} onChange={(e) => setOrdine(e.target.value)} /></label>
          <label className="text-xs">Arrivo previsto<input className={`${campo} mt-0.5 block`} type="date" value={arrivo} onChange={(e) => setArrivo(e.target.value)} /></label>
          <Button size="sm" disabled={busy} onClick={() => aggiorna({ stato: "ordinato", ordine, arrivo_previsto: arrivo }, "Segnato come ordinato")}><Check />Salva</Button>
        </div>)}
      {r.nota && <p className="text-xs text-muted-foreground">{r.nota}</p>}
    </li>
  );
}
