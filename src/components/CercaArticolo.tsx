"use client";

// Ricerca articolo unica (fattura, cassa del giorno): cerca per descrizione, codice o codice a barre nel
// MAGAZZINO e nel LISTINO di fatturazione (tarature, assistenza, spedizioni…). Con la pistola dei codici a
// barre il codice arriva seguito da Invio: se corrisponde a un prodotto lo aggiunge subito.

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { magPerCodice, magProdotti, type Prodotto } from "@/lib/api";

export interface ArticoloScelto { descrizione: string; prezzo_ivato: number | null; aliquota: number; prodotto_id?: string | null; codice?: string | null }
export interface VoceListino { codice?: string | null; descrizione: string; prezzo_ivato: number | null; aliquota: number; gruppo?: string }

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function CercaArticolo({ onScelto, listino = [], placeholder = "Cerca articolo: nome, codice o spara il codice a barre…", className = "" }: {
  onScelto: (a: ArticoloScelto) => void; listino?: VoceListino[]; placeholder?: string; className?: string;
}) {
  const [q, setQ] = useState("");
  const [prod, setProd] = useState<Prodotto[]>([]);
  const [aperto, setAperto] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => magProdotti(q.trim(), false, 15).then((r) => setProd(r.prodotti || [])).catch(() => setProd([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const fuori = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setAperto(false); };
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, []);

  // ogni parola cercata deve comparire (es. «tar multi» trova «Taratura multimetro»)
  const parole = norm(q).split(/\s+/).filter(Boolean);
  const dalListino = q.trim().length < 2 ? [] : listino.filter((v) => {
    const t = norm(`${v.descrizione} ${v.codice || ""} ${v.gruppo || ""}`);
    return parole.every((p) => t.includes(p));
  }).slice(0, 12);
  const dalMagazzino = q.trim().length < 2 ? [] : prod;

  function scegli(a: ArticoloScelto) { onScelto(a); setQ(""); setProd([]); setAperto(false); }

  async function invio() {
    const c = q.trim();
    if (!c) return;
    if (/^[0-9A-Za-z-]{6,}$/.test(c) && !c.includes(" ")) {   // sembra un codice: provo il codice a barre
      try {
        const p = await magPerCodice(c);
        scegli({ descrizione: p.descrizione, prezzo_ivato: Number(p.prezzo), aliquota: Number(p.aliquota), prodotto_id: p.id, codice: p.codice });
        return;
      } catch { /* non è un codice: resta la ricerca per testo */ }
    }
    const primo = dalMagazzino[0] ? { descrizione: dalMagazzino[0].descrizione, prezzo_ivato: Number(dalMagazzino[0].prezzo), aliquota: Number(dalMagazzino[0].aliquota), prodotto_id: dalMagazzino[0].id }
      : dalListino[0] ? { descrizione: dalListino[0].descrizione, prezzo_ivato: dalListino[0].prezzo_ivato, aliquota: dalListino[0].aliquota } : null;
    if (primo && dalMagazzino.length + dalListino.length === 1) scegli(primo);
  }

  const vuoto = q.trim().length >= 2 && !dalListino.length && !dalMagazzino.length;
  return (
    <div ref={box} className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground" />
      <Input className="h-8 pl-8" placeholder={placeholder} value={q}
        onChange={(e) => { setQ(e.target.value); setAperto(true); if (e.target.value.trim().length < 2) setProd([]); }}
        onFocus={() => setAperto(true)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); invio(); } if (e.key === "Escape") setAperto(false); }} />
      {aperto && (dalListino.length > 0 || dalMagazzino.length > 0 || vuoto) && (
        <div className="absolute z-30 mt-1 max-h-80 w-full min-w-[320px] overflow-auto rounded-md border bg-popover text-sm shadow-lg">
          {dalMagazzino.length > 0 && <div className="px-2 pt-2 text-[10px] font-semibold uppercase text-muted-foreground">Magazzino</div>}
          {dalMagazzino.map((p) => (
            <button key={p.id} type="button" className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => scegli({ descrizione: p.descrizione, prezzo_ivato: Number(p.prezzo), aliquota: Number(p.aliquota), prodotto_id: p.id, codice: p.codice })}>
              <span className="truncate">{p.descrizione}{p.barcode ? <span className="ml-1 text-xs text-muted-foreground">{p.barcode}</span> : null}</span>
              <span className="shrink-0 tabular-nums">{eur(Number(p.prezzo))}{p.gestisce_giacenza ? <span className="ml-1 text-xs text-muted-foreground">({Number(p.giacenza)} pz)</span> : null}</span>
            </button>
          ))}
          {dalListino.length > 0 && <div className="px-2 pt-2 text-[10px] font-semibold uppercase text-muted-foreground">Listino</div>}
          {dalListino.map((v, i) => (
            <button key={`${v.codice}-${i}`} type="button" className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => scegli({ descrizione: v.descrizione, prezzo_ivato: v.prezzo_ivato, aliquota: v.aliquota, codice: v.codice })}>
              <span className="truncate">{v.descrizione.replace(/^Rapporto di Taratura per /, "Taratura ").replace(/ n\. RDT \d+-$/, "")}</span>
              <span className="shrink-0 tabular-nums">{v.prezzo_ivato !== null ? eur(v.prezzo_ivato) : "prezzo libero"}</span>
            </button>
          ))}
          {vuoto && <div className="px-2 py-2 text-muted-foreground">Nessun articolo trovato: scrivi la descrizione a mano o aggiungilo in Magazzino.</div>}
        </div>
      )}
    </div>
  );
}
