"use client";

// DIALOGHI DELL'APP al posto di confirm() e prompt() del browser (15/11/2026, piano 2.5).
// I dialoghi del browser su iPhone sono piccoli, si confermano per sbaglio e prompt() accetta il motivo vuoto.
// Uso (da qualsiasi componente, senza contesto):
//   if (!(await conferma({ titolo: "Annullare la scheda?", testo: "…", ok: "Annulla la scheda", pericolo: true }))) return;
//   const motivo = await chiediTesto({ titolo: "Motivo", obbligatorio: true });   // null = annullato
// Il contenitore <DialoghiApp /> è montato una volta nel layout.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Modale } from "@/app/assistenza/scheda/ui";

type Richiesta = {
  id: number;
  titolo: string;
  testo?: string;
  ok?: string;
  annulla?: string;
  pericolo?: boolean;
  /** campo di testo: undefined = solo conferma */
  campo?: { etichetta?: string; iniziale?: string; obbligatorio?: boolean; righe?: number; segnaposto?: string };
  /** spunta da mettere per poter confermare (es. «consegno senza incasso») */
  spunta?: string;
  risolvi: (v: string | boolean | null) => void;
};

let coda: Richiesta[] = [];
let prossimo = 1;
const ascoltatori = new Set<() => void>();
const avvisa = () => ascoltatori.forEach((f) => f());

function apri(r: Omit<Richiesta, "id" | "risolvi">): Promise<string | boolean | null> {
  return new Promise((risolvi) => {
    coda = [...coda, { ...r, id: prossimo++, risolvi }];
    avvisa();
  });
}

/** Conferma con i pulsanti dell'app. Restituisce true solo se si preme il pulsante di conferma. */
export async function conferma(o: { titolo: string; testo?: string; ok?: string; annulla?: string; pericolo?: boolean; spunta?: string }): Promise<boolean> {
  return (await apri(o)) === true;
}

/** Testo da scrivere (motivo, nota…). null = annullato; con `obbligatorio` il pulsante resta spento finché è vuoto. */
export async function chiediTesto(o: { titolo: string; testo?: string; ok?: string; pericolo?: boolean; etichetta?: string; iniziale?: string; obbligatorio?: boolean; righe?: number; segnaposto?: string }): Promise<string | null> {
  const { etichetta, iniziale, obbligatorio, righe, segnaposto, ...resto } = o;
  const v = await apri({ ...resto, campo: { etichetta, iniziale, obbligatorio, righe, segnaposto } });
  return typeof v === "string" ? v : null;
}

const iscrivi = (f: () => void) => { ascoltatori.add(f); return () => { ascoltatori.delete(f); }; };
const leggi = () => coda;
const vuota: Richiesta[] = [];

export function DialoghiApp() {
  const lista = useSyncExternalStore(iscrivi, leggi, () => vuota);
  const r = lista[0];
  if (!r) return null;
  return <Dialogo key={r.id} r={r} />;
}

function Dialogo({ r }: { r: Richiesta }) {
  const [testo, setTesto] = useState(r.campo?.iniziale || "");
  const [spuntata, setSpuntata] = useState(false);
  const rif = useRef<HTMLTextAreaElement>(null);
  const okRif = useRef<HTMLButtonElement>(null);
  useEffect(() => { (r.campo ? rif.current : okRif.current)?.focus(); }, [r.campo]);
  const chiudi = (v: string | boolean | null) => { coda = coda.filter((x) => x.id !== r.id); avvisa(); r.risolvi(v); };
  const bloccato = (!!r.campo?.obbligatorio && testo.trim().length < 3) || (!!r.spunta && !spuntata);
  const conferma = () => { if (!bloccato) chiudi(r.campo ? testo.trim() : true); };
  return (
    <Modale titolo={r.titolo} onClose={() => chiudi(null)} piedi={<>
      <Button variant="outline" onClick={() => chiudi(null)}>{r.annulla || "Indietro"}</Button>
      <Button ref={okRif} variant={r.pericolo ? "destructive" : "default"} disabled={bloccato} onClick={conferma}>{r.ok || "Conferma"}</Button>
    </>}>
      {r.testo && <p className="whitespace-pre-line text-sm">{r.testo}</p>}
      {r.campo && (
        <label className="mt-3 block">
          {r.campo.etichetta && <span className="mb-1 block text-xs font-medium text-muted-foreground">{r.campo.etichetta}{r.campo.obbligatorio ? " (obbligatorio)" : ""}</span>}
          <textarea ref={rif} rows={r.campo.righe || 3} value={testo} placeholder={r.campo.segnaposto}
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) conferma(); }}
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
        </label>
      )}
      {r.spunta && (
        <label className="mt-3 flex min-h-10 items-start gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-2 text-sm font-medium text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <input type="checkbox" className="mt-0.5 size-4" checked={spuntata} onChange={(e) => setSpuntata(e.target.checked)} />{r.spunta}
        </label>
      )}
    </Modale>
  );
}
