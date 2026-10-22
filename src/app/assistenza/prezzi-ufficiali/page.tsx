"use client";

// PREZZI ASSISTENZA UFFICIALE MACBOOK (19/10/2026) E iMAC (22/10/2026) — backend prezzi_ufficiali.py (solo titolare).
// iMac: scheda logica, display, alimentatore, SSD/hard disk, ventola, altoparlanti, fotocamera — stesse regole di prezzo.
// Per ogni MacBook, dal più vecchio al più nuovo: scheda logica, Touch ID, display, top case, batteria, trackpad.
//   costo GSX col reso → × 1,10 (Bagnetti) × 1,22 (IVA) = quanto lo paghiamo → proposto (21/10/2026: × 1,1396 come
//   394 → 449, finale 29/49/79/99) → «scontato da» = prezzo di listino (+11%, tra 50 e 90 €, alla decina piena).
//   Batteria: mai sotto il prezzo Apple. 1ª ipotesi già proposta (storico schede): da convalidare.
// Il titolare convalida la proposta o scrive il suo prezzo; per scheda logica, display e top case imposta anche i prezzi
// della 1ª ipotesi (riparazione scheda, solo pannello, sola tastiera / Touch Bar / trackpad). Sotto, le righe del preventivo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw, Save, Search, Tags } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { fetchAPI } from "@/lib/api";
import { eur } from "@/lib/assistenza";

interface Prima { voce: string; prezzo: number | null; testo?: string; nota?: string }
interface Componente {
  componente: string; etichetta: string; costo_gsx: number; minimo: number; varianti: number; codice: string; descrizione: string;
  col_reso: boolean; pagato: number; proposto: number; margine_min: number | null; prezzo: number; scontato_da: number | null;
  margine: number; stato: string; costo_cambiato: boolean; prima_ipotesi: Prima[]; nota: string | null;
  prezzo_apple: number | null; totale_con_touch_id?: number; testi: { prima: string[]; seconda: string };
}
interface Modello {
  modello: string; famiglia?: "macbook" | "imac"; nome_apple: string | null; anno: number | null; seriale: string | null; batteria_apple: string | null;
  applecare: string | null; top_case_con_batteria: boolean; touch_bar: boolean; componenti: Componente[];
}

const numero = (t: string) => { const s = t.replace("€", "").replace(",", ".").trim(); return s === "" ? null : Number(s); };
const input = "w-20 border rounded px-1.5 py-1 text-right text-sm bg-white dark:bg-gray-900";

function RigaComponente({ m, c, onSalvato }: { m: Modello; c: Componente; onSalvato: () => void }) {
  const [prezzo, setPrezzo] = useState(String(c.prezzo));
  const [scontato, setScontato] = useState(c.scontato_da == null ? "" : String(c.scontato_da));
  const [margine, setMargine] = useState(c.margine_min == null ? "" : String(c.margine_min));
  const [prima, setPrima] = useState<Prima[]>(c.prima_ipotesi);
  const [salvo, setSalvo] = useState(false);

  const invia = async (corpo: Record<string, unknown>, ok: string) => {
    setSalvo(true);
    try {
      await fetchAPI("/api/assistenza/prezzi-ufficiali", { method: "PUT", body: JSON.stringify({ modello: m.modello, componente: c.componente, ...corpo }) });
      toast.success(ok); onSalvato();
    } catch (e) { toast.error(String((e as Error)?.message || e)); } finally { setSalvo(false); }
  };
  const salva = () => {
    const p = numero(prezzo), s = numero(scontato), mg = numero(margine);
    if ([p, s, mg].some((x) => x != null && Number.isNaN(x))) { toast.error("Importo non valido"); return; }
    const corpo: Record<string, unknown> = { azione: "salva", prima_ipotesi: prima };
    if (p !== c.prezzo) corpo.prezzo = p;
    if (s !== c.scontato_da) corpo.scontato_da = s;
    if (mg !== c.margine_min) corpo.margine_min = mg;
    invia(corpo, "Salvato");
  };
  const convalidato = c.stato === "convalidato";

  return (
    <>
      <tr className="border-t align-top">
        <td className="p-2 font-medium whitespace-nowrap">
          {c.etichetta}
          <div className="text-xs text-gray-500 font-normal">{c.codice}{c.varianti > 1 ? ` · ${c.varianti} config.` : ""}</div>
        </td>
        <td className="p-2 text-right whitespace-nowrap">
          {eur(c.costo_gsx)}
          {!c.col_reso && <div className="text-xs text-amber-600">senza reso</div>}
          {c.varianti > 1 && c.minimo !== c.costo_gsx && <div className="text-xs text-gray-500">da {eur(c.minimo)}</div>}
        </td>
        <td className="p-2 text-right font-medium whitespace-nowrap">{eur(c.pagato)}</td>
        <td className="p-2 text-right whitespace-nowrap">
          {c.componente === "touch_id" ? <span className="text-xs text-gray-500">+10%</span> :
            <input className={input} value={margine} onChange={(e) => setMargine(e.target.value)} placeholder="—" title="Margine minimo in € (vuoto = regola proporzionale 394 → 449)" />}
        </td>
        <td className="p-2 text-right whitespace-nowrap">
          {eur(c.proposto)}
          {c.prezzo_apple ? <div className="text-xs text-gray-500">Apple {eur(c.prezzo_apple)}</div> : null}
        </td>
        <td className="p-2 text-right"><input className={`${input} font-semibold`} value={prezzo} onChange={(e) => setPrezzo(e.target.value)} /></td>
        <td className="p-2 text-right">
          {c.componente === "touch_id" ? "—" : <input className={input} value={scontato} onChange={(e) => setScontato(e.target.value)} />}
        </td>
        <td className={`p-2 text-right whitespace-nowrap ${c.margine < 50 && c.componente !== "touch_id" ? "text-amber-600" : "text-green-700"}`}>
          {eur(c.margine)}
        </td>
        <td className="p-2 whitespace-nowrap">
          {convalidato ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">convalidato</span>
            : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">proposto</span>}
          {c.costo_cambiato && <div className="text-xs text-red-600 flex items-center gap-1 mt-1"><AlertTriangle className="h-3 w-3" /> costo cambiato</div>}
        </td>
        <td className="p-2 whitespace-nowrap">
          <div className="flex gap-1">
            {!convalidato && (
              <button type="button" disabled={salvo} onClick={() => invia({ azione: "convalida" }, "Prezzo convalidato")}
                className="px-2 py-1 rounded bg-green-600 text-white text-xs inline-flex items-center gap-1" title="Va bene il prezzo proposto">
                <Check className="h-3 w-3" /> Convalida
              </button>
            )}
            <button type="button" disabled={salvo} onClick={salva}
              className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1" title="Salva prezzo, scontato da, margine e 1ª ipotesi">
              {salvo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salva
            </button>
            {(convalidato || c.margine_min != null) && (
              <button type="button" disabled={salvo} onClick={() => invia({ azione: "ripristina" }, "Tornato alla proposta")}
                className="px-2 py-1 rounded border text-xs" title="Torna al prezzo calcolato"><RotateCcw className="h-3 w-3" /></button>
            )}
          </div>
        </td>
      </tr>
      {(prima.length > 0 || c.componente === "scheda_logica" || c.componente === "display" || c.componente === "top_case") && (
        <tr>
          <td />
          <td colSpan={9} className="pb-3 pr-2">
            {prima.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-1">
                {prima.map((p, i) => (
                  <label key={p.voce} className="text-xs flex items-center gap-1">
                    <span className="text-gray-600">1ª ipotesi · {p.voce}</span>
                    <input className={input} value={p.prezzo == null ? "" : String(p.prezzo)} placeholder="€"
                      onChange={(e) => { const v = numero(e.target.value); setPrima(prima.map((x, j) => (j === i ? { ...x, prezzo: v } : x))); }} />
                  </label>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-600 dark:text-gray-400 font-mono space-y-0.5">
              {c.testi.prima.map((t) => <div key={t}>{t}</div>)}
              <div>{c.testi.seconda}</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PrezziUfficiali() {
  const [modelli, setModelli] = useState<Modello[]>([]);
  const [carico, setCarico] = useState(true);
  const [errore, setErrore] = useState("");
  const [q, setQ] = useState("");
  const [soloDaConvalidare, setSoloDaConvalidare] = useState(false);
  const [fam, setFam] = useState<"macbook" | "imac">("macbook");

  const carica = useCallback(async () => {
    try {
      const r = await fetchAPI("/api/assistenza/prezzi-ufficiali");
      setModelli(r.modelli); setErrore("");
    } catch (e) { setErrore(String((e as Error)?.message || e)); } finally { setCarico(false); }
  }, []);
  useEffect(() => { carica(); }, [carica]);

  const visibili = useMemo(() => modelli.filter((m) => {
    if ((m.famiglia || "macbook") !== fam) return false;
    const testo = `${m.modello} ${m.nome_apple || ""}`.toLowerCase();
    if (q && !q.toLowerCase().split(/\s+/).every((t) => testo.includes(t))) return false;
    if (soloDaConvalidare && m.componenti.every((c) => c.stato === "convalidato" && !c.costo_cambiato)) return false;
    return true;
  }), [modelli, q, soloDaConvalidare, fam]);
  const daConvalidare = modelli.filter((m) => (m.famiglia || "macbook") === fam).reduce((n, m) => n + m.componenti.filter((c) => c.stato !== "convalidato").length, 0);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Tags className="h-5 w-5" /> Prezzi assistenza ufficiale {fam === "imac" ? "iMac" : "MacBook"}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Costo GSX col reso × 1,10 (Bagnetti) × 1,22 (IVA) = quanto lo paghi · proposto: × 1,1396 (come 394 → 449), finale 29/49/79/99
          (o il margine minimo che scrivi) · scontato da = prezzo di listino: +11% (tra 50 e 90 €) alla decina piena · batteria mai sotto il prezzo Apple ·
          1ª ipotesi già proposta dallo storico delle schede: controlla e convalida.
          «Convalida» se ti va bene, altrimenti scrivi il prezzo e «Salva».
        </p>
      </div>

      <Card className="p-3 flex flex-wrap gap-3 items-center">
        <div className="inline-flex rounded-md border overflow-hidden text-sm">
          {(["macbook", "imac"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFam(f)}
              className={`px-3 py-1.5 ${fam === f ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-900"}`}>
              {f === "imac" ? "iMac" : "MacBook"} ({modelli.filter((m) => (m.famiglia || "macbook") === f).length})
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={fam === "imac" ? "Cerca modello (es. 27 5K 2019, 24 M1)" : "Cerca modello (es. Air M1, Pro 16 2019)"}
            className="w-full border rounded-md pl-8 pr-2 py-1.5 text-sm bg-white dark:bg-gray-900" />
        </div>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={soloDaConvalidare} onChange={(e) => setSoloDaConvalidare(e.target.checked)} />
          Solo da convalidare ({daConvalidare})
        </label>
      </Card>

      {errore && <Card className="p-3 text-sm text-red-600">{errore}</Card>}
      {carico && <Loader2 className="h-5 w-5 animate-spin" />}

      {visibili.map((m) => (
        <Card key={m.modello} className="overflow-x-auto">
          <div className="px-3 pt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="font-semibold">{m.nome_apple || m.modello}</h2>
            <span className="text-xs text-gray-500">{m.anno} · GSX: {m.modello}{m.seriale ? ` (${m.seriale})` : ""}</span>
            {m.batteria_apple && <span className="text-xs text-gray-500">Batteria Apple {m.batteria_apple}</span>}
            {m.applecare && <span className="text-xs text-gray-500">AppleCare+ {m.applecare}</span>}
            {m.top_case_con_batteria && <span className="text-xs text-amber-600">top case con batteria</span>}
            {m.touch_bar && <span className="text-xs text-gray-500">Touch Bar</span>}
          </div>
          <table className="w-full text-sm mt-2">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="p-2">Pezzo</th><th className="p-2 text-right">GSX col reso</th><th className="p-2 text-right">Lo paghi</th>
                <th className="p-2 text-right">Margine min</th><th className="p-2 text-right">Proposto</th><th className="p-2 text-right">Prezzo</th>
                <th className="p-2 text-right">Listino (scontato da)</th><th className="p-2 text-right">Margine</th><th className="p-2">Stato</th><th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {m.componenti.map((c) => (
                <RigaComponente key={`${c.componente}-${c.prezzo}-${c.stato}-${c.margine_min}-${c.scontato_da}`} m={m} c={c} onSalvato={carica} />
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
