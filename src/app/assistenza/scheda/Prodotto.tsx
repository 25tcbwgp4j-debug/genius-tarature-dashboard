"use client";

// MENU PRODOTTI con ricerca (05/10/2026, specifica §10.1): elenco COMPLETO come la lista valori di FileMaker (nomi esatti
// dello storico) + i prodotti nuovi, raggruppato per famiglia. Si scrive per filtrare («16», «pro max», «air 13»),
// frecce ↑↓ e Invio per scegliere. La famiglia della scheda segue il gruppo della voce scelta.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GruppoProdotti } from "@/lib/assistenza";
import { campo } from "./ui";

const norm = (t: string) => t.toUpperCase().replace(/[’']/g, "'").replace(/,/g, ".").replace(/\s+/g, " ").trim();

export function ProdottoCombo({ valore, gruppi, onScelto, disabled, autoFocus }: {
  valore: string; gruppi: GruppoProdotti[]; onScelto: (prodotto: string, famiglia: string) => void; disabled?: boolean; autoFocus?: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const [q, setQ] = useState("");
  const [att, setAtt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  // voci filtrate: tutti i termini devono comparire (nel nome o nel gruppo)
  const filtrate = useMemo(() => {
    const termini = norm(q).split(" ").filter(Boolean);
    const out: { gruppo: string; famiglia: string; voce: string }[] = [];
    for (const g of gruppi) for (const v of g.voci) {
      const testo = norm(`${g.gruppo} ${v}`);
      if (termini.every((t) => testo.includes(t))) out.push({ gruppo: g.gruppo, famiglia: g.famiglia, voce: v });
    }
    return out;
  }, [q, gruppi]);
  useEffect(() => {
    if (!aperto) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setAperto(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [aperto]);
  useEffect(() => { lista.current?.querySelector(`[data-i="${att}"]`)?.scrollIntoView({ block: "nearest" }); }, [att]);

  function scegli(i: number) {
    const x = filtrate[i];
    if (!x) return;
    onScelto(x.voce, x.famiglia);
    setAperto(false); setQ("");
  }
  const nelMenu = gruppi.some((g) => g.voci.includes(valore));

  return (
    <div ref={box} className="relative">
      <button type="button" disabled={disabled} onClick={() => setAperto((x) => !x)} data-testid="prodotto-combo"
        className={cn(campo, "flex items-center gap-2 text-left", !valore && "text-muted-foreground")}>
        <span className="min-w-0 flex-1 truncate">{valore || "— scegli il prodotto —"}</span>
        {valore && !nelMenu && <span className="shrink-0 text-[10px] text-amber-700">storico</span>}
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </button>
      {aperto && (
        <div className="absolute z-40 mt-1 w-full min-w-[280px] rounded-lg border bg-popover shadow-lg">
          <div className="relative border-b p-1.5">
            <Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
            <input autoFocus={autoFocus !== false} className={cn(campo, "pl-8")} placeholder="Cerca: «16», «pro max», «air 13», «ipad pro»…" value={q}
              onChange={(e) => { setQ(e.target.value); setAtt(0); }} aria-label="Cerca prodotto"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setAtt((a) => Math.min(filtrate.length - 1, a + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setAtt((a) => Math.max(0, a - 1)); }
                else if (e.key === "Enter") { e.preventDefault(); scegli(att); }
                else if (e.key === "Escape") { e.preventDefault(); setAperto(false); }
              }} />
            {q && <button type="button" className="absolute right-3 top-3.5 text-muted-foreground" onClick={() => setQ("")} aria-label="Pulisci"><X className="size-4" /></button>}
          </div>
          <div ref={lista} className="max-h-80 overflow-y-auto py-1 text-sm">
            {filtrate.length === 0 && <div className="px-3 py-2 text-muted-foreground">Nessun prodotto: prova con meno parole, oppure «ALTRO NON APPLE».</div>}
            {filtrate.map((x, i) => (
              <div key={x.voce}>
                {(i === 0 || filtrate[i - 1].gruppo !== x.gruppo) && (
                  <div className="sticky top-0 bg-popover px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{x.gruppo}</div>
                )}
                <button type="button" data-i={i} onMouseEnter={() => setAtt(i)} onClick={() => scegli(i)}
                  className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left", i === att && "bg-muted")}>
                  <span className="flex-1">{x.voce}</span>
                  {x.voce === valore && <Check className="size-4 text-emerald-600" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Anno del prodotto: si sceglie dall'elenco o si scrive. */
export function AnnoInput({ valore, onChange, disabled }: { valore: number | string | null | undefined; onChange: (v: number | null) => void; disabled?: boolean }) {
  const oggi = new Date().getFullYear();
  const anni = Array.from({ length: oggi - 2005 + 2 }, (_, i) => oggi + 1 - i);
  // testo locale: l'anno si comunica solo quando è completo (4 cifre) o vuoto, così «20…» non va al backend
  const [txt, setTxt] = useState(valore == null ? "" : String(valore));
  const [prima, setPrima] = useState(valore);
  if (prima !== valore) { setPrima(valore); setTxt(valore == null ? "" : String(valore)); }   // il valore cambiato da fuori (decodifica)
  return (
    <>
      <input className={campo} list="anni-prodotto" inputMode="numeric" disabled={disabled} placeholder="es. 2021" value={txt} aria-label="Anno"
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
          setTxt(v);
          if (!v) onChange(null); else if (v.length === 4 && Number(v) >= 1990) onChange(Number(v));
        }} />
      <datalist id="anni-prodotto">{anni.map((a) => <option key={a} value={a} />)}</datalist>
    </>
  );
}
