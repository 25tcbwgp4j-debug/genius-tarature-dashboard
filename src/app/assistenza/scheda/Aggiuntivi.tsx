"use client";

// 03/11/2026 (Christian): altri pezzi consegnati con la stessa scheda (hard disk dove riversare i dati, iPhone di
// destinazione…): ognuno ha una descrizione e la sua etichetta con lo stesso numero, 63300/1, /2, /3.
import { useState } from "react";
import { Check, HardDrive, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Scheda } from "@/lib/assistenza";
import { campo, Sezione } from "./ui";

export function Aggiuntivi({ s, ro, busy, azione, stampa }: {
  s: Scheda; ro: boolean; busy: boolean;
  azione: (nome: string, body: Record<string, unknown>, msg: string) => Promise<unknown>;
  stampa: (n?: number) => void;
}) {
  const [nuovo, setNuovo] = useState("");
  const [inModifica, setInModifica] = useState<number | null>(null);
  const [testo, setTesto] = useState("");
  const voci = (s.dispositivi_aggiuntivi || []).filter((x) => !x.tolto_il);
  if (ro && !voci.length) return null;

  async function aggiungi() {
    const descrizione = nuovo.trim();
    if (!descrizione) return;
    if (await azione("aggiuntivi", { descrizione }, "Dispositivo aggiuntivo inserito")) setNuovo("");
  }
  async function correggi(n: number) {
    if (await azione(`aggiuntivi/${n}`, { descrizione: testo.trim() }, `${s.sigla}/${n} corretto`)) setInModifica(null);
  }

  return (
    <Sezione titolo="Dispositivi aggiuntivi" icona={<HardDrive />} sottotitolo="altri pezzi consegnati con questa scheda"
      azioni={voci.length > 1 ? <Button size="sm" variant="outline" onClick={() => stampa()}><Tag />Stampa tutte</Button> : undefined}>
      {voci.length > 0 && (
        <ul className="mb-3 divide-y rounded-md border">
          {voci.map((x) => (
            <li key={x.n} className="flex flex-wrap items-center gap-2 px-2.5 py-2">
              <span className="font-mono text-sm font-semibold">{s.sigla}/{x.n}</span>
              {inModifica === x.n ? (
                <>
                  <input className={`${campo} min-w-0 flex-1`} autoFocus maxLength={200} value={testo} onChange={(e) => setTesto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") correggi(x.n); }} />
                  <Button size="sm" disabled={busy || !testo.trim()} onClick={() => correggi(x.n)}><Check />Salva</Button>
                  <Button size="sm" variant="ghost" onClick={() => setInModifica(null)}><X />Chiudi</Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-sm">{x.descrizione}</span>
                  <Button size="sm" variant="outline" onClick={() => stampa(x.n)} title="Etichetta Brother di questo pezzo"><Tag />Etichetta</Button>
                  {!ro && <Button size="sm" variant="ghost" aria-label={`Correggi ${s.sigla}/${x.n}`} title="Correggi la descrizione"
                    onClick={() => { setInModifica(x.n); setTesto(x.descrizione); }}><Pencil /></Button>}
                  {!ro && <Button size="sm" variant="ghost" className="text-red-700" disabled={busy} aria-label={`Togli ${s.sigla}/${x.n}`}
                    title="Togli dalla scheda (il numero non viene riusato)"
                    onClick={() => { if (confirm(`Togliere ${s.sigla}/${x.n} (${x.descrizione}) dalla scheda?`)) azione(`aggiuntivi/${x.n}/togli`, {}, `${s.sigla}/${x.n} tolto`); }}><Trash2 /></Button>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {!ro && (
        <div className="flex flex-wrap gap-2">
          <input className={`${campo} min-w-0 flex-1 basis-64`} maxLength={200} value={nuovo} placeholder="Che cos'è: es. hard disk esterno dove riversare i dati · iPhone 15 di destinazione"
            onChange={(e) => setNuovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") aggiungi(); }} />
          <Button size="sm" variant="outline" disabled={busy || !nuovo.trim()} onClick={aggiungi}><Plus />Aggiungi</Button>
        </div>
      )}
    </Sezione>
  );
}
