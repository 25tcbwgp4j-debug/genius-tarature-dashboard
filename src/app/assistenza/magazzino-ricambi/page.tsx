"use client";

// MAGAZZINO RICAMBI APPLE (22/10/2026) — backend ricambi_apple_api.py (migr. 124).
// Tre schede: Ricambi Apple (a quantità: nuovi e usati, posizione e scaffale), Display e Schede logiche (messi da parte,
// uno per riga con stato: funzionante, rotto, usato…).
// In magazzino: si SPARA il codice col lettore nel riquadro in alto (il lettore scrive il codice e preme Invio) → la pagina
// va sulla riga, la evidenzia e apre la CONTA: si contano i pezzi e si conferma la quantità (resta nei movimenti).
// Su ogni riga: + carica, − togli (la quantità si aggiorna), modifica, storico, elimina (si può ripristinare).
// Il lettore lavora in tre modi (scelta accanto al riquadro): CONTA (inventario), CARICA (arriva merce: se il codice non
// c'è, si apre «nuovo articolo» già compilato con descrizione e modelli dai ricambi GSX), TOGLI.
// Posizione (Christian 22/10/2026): REPARTO/ripiano (A1, H3, F…) · SCAFFALE (1°/2°/3°, lo scaffale grande a tre
// cassettoni) · CONFEZIONE (busta, busta sciolta…). Accanto alla descrizione l'esito dell'ultima verifica sul GSX.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Check, History, Loader2, Minus, Pencil, Plus, RotateCcw, ScanLine, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { fetchAPI } from "@/lib/api";

type Tipo = "ricambio" | "display" | "scheda_logica" | "top_case" | "garanzia";
interface Riga {
  id: number; tipo: Tipo; codice: string | null; mpn: string | null; descrizione: string; modelli: string | null;
  qta_nuovo: number; qta_usato: number; posizione: string | null; scaffale: string | null; confezione: string | null;
  codici_alt: string | null; gsx_descrizione: string | null; gsx_stato: string | null; gsx_costo?: number | null;
  gsx_sostituito_da: string | null; gsx_verificato_il: string | null; stato: string | null;
  etichetta: string | null; grado: string | null; colore: string | null; anno: string | null;
  data_riparazione: string | null; scadenza: string | null;
  condizioni: string | null; seriale: string | null; costo?: number | null; note: string | null; attivo: boolean;
  inventario_il: string | null; inventario_da: string | null; updated_at: string;
}
interface Movimento {
  id: number; tipo: string; campo: string | null; delta: number | null; qta_prima: number | null; qta_dopo: number | null;
  nota: string | null; dettaglio: Record<string, unknown> | null; utente: string | null; created_at: string;
}

const TIPI: { k: Tipo; t: string }[] = [
  { k: "ricambio", t: "Ricambi Apple" }, { k: "display", t: "Display" }, { k: "scheda_logica", t: "Schede logiche" },
  { k: "top_case", t: "Top case" }, { k: "garanzia", t: "Dispositivi in garanzia" },
];
const STATI_TESTO: Record<string, string> = {
  funzionante: "Funzionante", rotto: "Rotto", usato: "Usato", da_verificare: "Da verificare", nuovo: "Nuovo", riservato: "Riservato",
  x_sostituzione: "Per sostituzione", da_riparare: "Da riparare",
};
const COLORE_STATO: Record<string, string> = {
  funzionante: "bg-green-100 text-green-800", rotto: "bg-red-100 text-red-800", usato: "bg-amber-100 text-amber-800",
  da_verificare: "bg-gray-100 text-gray-700", nuovo: "bg-blue-100 text-blue-800", riservato: "bg-purple-100 text-purple-800",
  x_sostituzione: "bg-orange-100 text-orange-800", da_riparare: "bg-pink-100 text-pink-800",
};
const inp = "border rounded px-2 py-1 text-sm bg-white dark:bg-gray-900";
const dove = (r: Partial<Riga>) => [r.posizione && `reparto ${r.posizione}`, r.scaffale, r.confezione?.toLowerCase()].filter(Boolean).join(" · ");
const norm = (t: string | null | undefined) => (t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
type Modo = "conta" | "carico" | "scarico";
const giorno = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("it-IT") : "");
const data = (s: string | null) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

function Finestra({ titolo, onChiudi, children }: { titolo: string; onChiudi: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-4 overflow-y-auto" onClick={onChiudi}>
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-xl mt-10 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{titolo}</h3>
          <button type="button" onClick={onChiudi} className="p-1"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Conta({ r, onFatto, onChiudi }: { r: Riga; onFatto: () => void; onChiudi: () => void }) {
  const [nuovi, setNuovi] = useState(String(r.qta_nuovo));
  const [usati, setUsati] = useState(String(r.qta_usato));
  const [salvo, setSalvo] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  const conferma = async () => {
    const n = Number(nuovi), u = Number(usati);
    if (![n, u].every((x) => Number.isInteger(x) && x >= 0)) { toast.error("Scrivi numeri interi"); return; }
    setSalvo(true);
    try {
      await fetchAPI(`/api/ricambi-apple/${r.id}/movimento`, { method: "POST", body: JSON.stringify({ tipo: "inventario", campo: "nuovo", quantita: n, nota: "conta in magazzino" }) });
      if (u !== r.qta_usato) {
        await fetchAPI(`/api/ricambi-apple/${r.id}/movimento`, { method: "POST", body: JSON.stringify({ tipo: "inventario", campo: "usato", quantita: u, nota: "conta in magazzino" }) });
      }
      toast.success(n === r.qta_nuovo && u === r.qta_usato ? "Quantità confermata" : "Quantità corretta e confermata");
      onFatto();
    } catch (e) { toast.error(String((e as Error)?.message || e)); } finally { setSalvo(false); }
  };
  return (
    <Finestra titolo={`Conta: ${r.codice || ""} ${r.descrizione}`} onChiudi={onChiudi}>
      <p className="text-sm text-gray-600 mb-3">
        A sistema: <b>{r.qta_nuovo}</b> nuovi{r.qta_usato ? <> · <b>{r.qta_usato}</b> usati</> : null}
        {dove(r) ? <> · <b>{dove(r)}</b></> : null}
        {r.inventario_il ? <span className="block text-xs mt-1">Ultima conta {data(r.inventario_il)} ({r.inventario_da})</span> : null}
      </p>
      <div className="flex gap-4 items-end">
        <label className="text-sm">Nuovi contati<br />
          <input ref={ref} className={`${inp} w-24 text-right text-lg`} inputMode="numeric" value={nuovi}
            onChange={(e) => setNuovi(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") conferma(); }} />
        </label>
        <label className="text-sm">Usati contati<br />
          <input className={`${inp} w-24 text-right text-lg`} inputMode="numeric" value={usati}
            onChange={(e) => setUsati(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") conferma(); }} />
        </label>
        <button type="button" disabled={salvo} onClick={conferma}
          className="px-3 py-2 rounded bg-green-600 text-white text-sm inline-flex items-center gap-1">
          {salvo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Conferma quantità
        </button>
      </div>
    </Finestra>
  );
}

function Movimenta({ r, tipo, onFatto, onChiudi }: { r: Riga; tipo: "carico" | "scarico"; onFatto: () => void; onChiudi: () => void }) {
  const [q, setQ] = useState("1");
  const [campo, setCampo] = useState<"nuovo" | "usato">("nuovo");
  const [nota, setNota] = useState("");
  const [pos, setPos] = useState({ posizione: r.posizione || "", scaffale: r.scaffale || "", confezione: r.confezione || "" });
  const [salvo, setSalvo] = useState(false);
  const invia = async () => {
    const n = Number(q);
    if (!Number.isInteger(n) || n <= 0) { toast.error("Quantità non valida"); return; }
    setSalvo(true);
    try {
      if (tipo === "carico" && (pos.posizione !== (r.posizione || "") || pos.scaffale !== (r.scaffale || "") || pos.confezione !== (r.confezione || ""))) {
        await fetchAPI(`/api/ricambi-apple/${r.id}`, { method: "PATCH", body: JSON.stringify(pos) });
      }
      await fetchAPI(`/api/ricambi-apple/${r.id}/movimento`, { method: "POST", body: JSON.stringify({ tipo, campo, quantita: n, nota: nota || null }) });
      toast.success(tipo === "carico" ? `Aggiunti ${n}` : `Tolti ${n}`); onFatto();
    } catch (e) { toast.error(String((e as Error)?.message || e)); } finally { setSalvo(false); }
  };
  return (
    <Finestra titolo={`${tipo === "carico" ? "Aggiungi" : "Togli"}: ${r.codice || ""} ${r.descrizione}`} onChiudi={onChiudi}>
      <p className="text-sm text-gray-600 mb-3">Ora: {r.qta_nuovo} nuovi · {r.qta_usato} usati{dove(r) ? ` · ${dove(r)}` : ""}</p>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">Quanti<br /><input autoFocus className={`${inp} w-20 text-right`} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") invia(); }} /></label>
        <label className="text-sm">Quali<br />
          <select className={inp} value={campo} onChange={(e) => setCampo(e.target.value as "nuovo" | "usato")}>
            <option value="nuovo">nuovi</option><option value="usato">usati</option>
          </select>
        </label>
        {tipo === "carico" && (
          <div className="w-full grid grid-cols-3 gap-2">
            <label className="text-sm">Reparto / ripiano<br /><input className={`${inp} w-full`} placeholder="A1, H3…" value={pos.posizione} onChange={(e) => setPos({ ...pos, posizione: e.target.value.toUpperCase() })} /></label>
            <label className="text-sm">Scaffale<br /><input className={`${inp} w-full`} placeholder="1° SCAFFALE" value={pos.scaffale} onChange={(e) => setPos({ ...pos, scaffale: e.target.value.toUpperCase() })} /></label>
            <label className="text-sm">Confezione<br /><input className={`${inp} w-full`} placeholder="BUSTA, BUSTA SCIOLTA" value={pos.confezione} onChange={(e) => setPos({ ...pos, confezione: e.target.value.toUpperCase() })} /></label>
          </div>
        )}
        <label className="text-sm flex-1 min-w-[180px]">Nota (es. scheda 63207, ordine Bagnetti)<br />
          <input className={`${inp} w-full`} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
        <button type="button" disabled={salvo} onClick={invia}
          className={`px-3 py-2 rounded text-white text-sm ${tipo === "carico" ? "bg-blue-600" : "bg-amber-600"}`}>
          {salvo ? <Loader2 className="h-4 w-4 animate-spin" /> : tipo === "carico" ? "Aggiungi" : "Togli"}
        </button>
      </div>
    </Finestra>
  );
}

function Scheda({ r, tipo, titolare, stati, onFatto, onChiudi }: {
  r: Partial<Riga> | null; tipo: Tipo; titolare: boolean; stati: string[]; onFatto: () => void; onChiudi: () => void;
}) {
  const nuovo = !r?.id;
  const [v, setV] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const k of ["codice", "codici_alt", "mpn", "descrizione", "modelli", "posizione", "scaffale", "confezione", "stato", "condizioni", "seriale", "note", "costo", "qta_nuovo", "qta_usato", "gsx_descrizione", "gsx_sostituito_da", "gsx_costo", "gsx_sostituzione", "etichetta", "grado", "colore", "anno", "data_riparazione", "scadenza"]) {
      const x = (r as Record<string, unknown> | null)?.[k];
      o[k] = x == null ? "" : String(x);
    }
    return o;
  });
  const [salvo, setSalvo] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const salva = async () => {
    setSalvo(true);
    try {
      const corpo: Record<string, unknown> = { ...v, tipo: r?.tipo || tipo };
      if (!nuovo) { delete corpo.gsx_descrizione; delete corpo.gsx_sostituito_da; delete corpo.gsx_costo; delete corpo.gsx_sostituzione; }
      if (!titolare) delete corpo.costo;
      else corpo.costo = v.costo === "" ? null : Number(v.costo.replace(",", "."));
      if (nuovo) await fetchAPI("/api/ricambi-apple", { method: "POST", body: JSON.stringify(corpo) });
      else {
        delete corpo.qta_nuovo; delete corpo.qta_usato;   // le quantità solo con i movimenti
        await fetchAPI(`/api/ricambi-apple/${r!.id}`, { method: "PATCH", body: JSON.stringify(corpo) });
      }
      toast.success(nuovo ? "Aggiunto" : "Salvato"); onFatto();
    } catch (e) { toast.error(String((e as Error)?.message || e)); } finally { setSalvo(false); }
  };
  const campo = (k: string, t: string, cls = "") => (
    <label className={`text-sm ${cls}`}>{t}<br /><input className={`${inp} w-full`} value={v[k]} onChange={set(k)} /></label>
  );
  const t = r?.tipo || tipo;
  const pezzo = t !== "ricambio" && t !== "garanzia";
  const gar = t === "garanzia";
  return (
    <Finestra titolo={nuovo ? `Nuovo: ${TIPI.find((x) => x.k === tipo)?.t}` : `Modifica ${r?.codice || ""}`} onChiudi={onChiudi}>
      <div className="grid grid-cols-2 gap-3">
        {(pezzo || gar || v.etichetta) && campo("etichetta", gar ? "Riferimento (n. scheda)" : "Sigla sul pezzo (AIR1, DLR5, TP2…)")}
        {campo("codice", t === "scheda_logica" ? "Codice scheda (820-…)" : "Codice (APN)")}
        {campo("mpn", "MPN / codice produttore")}
        {campo("codici_alt", "Altri codici dello stesso pezzo", "col-span-2")}
        {campo("descrizione", "Descrizione", "col-span-2")}
        {v.gsx_descrizione && norm(v.gsx_descrizione) !== norm(v.descrizione) && (
          <div className="col-span-2 text-xs -mt-2 flex items-center gap-2">
            <span className="text-gray-500">GSX: {v.gsx_descrizione}</span>
            <button type="button" className="underline text-blue-600" onClick={() => setV({ ...v, descrizione: v.gsx_descrizione })}>usa questa</button>
          </div>
        )}
        <label className="text-sm col-span-2">Modelli interessati<br />
          <textarea className={`${inp} w-full`} rows={2} value={v.modelli} onChange={set("modelli")} /></label>
        {campo("posizione", "Reparto / ripiano (A1, H3…)")}
        {campo("scaffale", "Scaffale (1°/2°/3°)")}
        {campo("confezione", "Confezione (busta, sciolta…)")}
        {(pezzo || v.stato) && (
          <label className="text-sm">Stato<br />
            <select className={`${inp} w-full`} value={v.stato} onChange={set("stato")}>
              <option value="">—</option>
              {stati.map((s) => <option key={s} value={s}>{STATI_TESTO[s] || s}</option>)}
            </select>
          </label>
        )}
        {(pezzo || gar || v.seriale) && campo("seriale", "Seriale")}
        {(pezzo || gar || v.colore) && campo("colore", "Colore")}
        {(pezzo || v.grado) && campo("grado", "Grado (A++, A+, A, A-, rotto)")}
        {(pezzo || v.anno) && campo("anno", "Anno / codice A del modello")}
        {gar && (
          <>
            <label className="text-sm">Data riparazione<br /><input type="date" className={`${inp} w-full`} value={v.data_riparazione} onChange={set("data_riparazione")} /></label>
            <label className="text-sm">Scadenza garanzia<br /><input type="date" className={`${inp} w-full`} value={v.scadenza} onChange={set("scadenza")} /></label>
          </>
        )}
        {(pezzo || gar || v.condizioni) && campo("condizioni", gar ? "Garanzia AppleCare" : "Condizioni (graffi, righe, pixel…)", "col-span-2")}
        {nuovo && !gar && campo("qta_nuovo", "Quantità nuovi")}
        {nuovo && !gar && campo("qta_usato", "Quantità usati")}
        {titolare && campo("costo", "Costo € (solo titolare)")}
        {campo("note", "Note", "col-span-2")}
      </div>
      {!nuovo && <p className="text-xs text-gray-500 mt-2">Le quantità si cambiano con + / − o con la conta: così resta tutto nello storico.</p>}
      <div className="flex justify-end mt-4">
        <button type="button" disabled={salvo} onClick={salva} className="px-3 py-2 rounded bg-blue-600 text-white text-sm inline-flex items-center gap-1">
          {salvo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {nuovo ? "Aggiungi" : "Salva"}
        </button>
      </div>
    </Finestra>
  );
}

function Storico({ r, onChiudi }: { r: Riga; onChiudi: () => void }) {
  const [mov, setMov] = useState<Movimento[] | null>(null);
  useEffect(() => { fetchAPI(`/api/ricambi-apple/${r.id}/movimenti`).then((x) => setMov(x.movimenti)).catch((e) => toast.error(String(e?.message || e))); }, [r.id]);
  return (
    <Finestra titolo={`Storico ${r.codice || ""} ${r.descrizione}`} onChiudi={onChiudi}>
      {!mov ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <table className="w-full text-xs">
          <tbody>
            {mov.map((m) => (
              <tr key={m.id} className="border-t align-top">
                <td className="py-1 pr-2 whitespace-nowrap">{data(m.created_at)}</td>
                <td className="py-1 pr-2 font-medium">{m.tipo}{m.campo ? ` ${m.campo === "usato" ? "usati" : "nuovi"}` : ""}</td>
                <td className="py-1 pr-2 whitespace-nowrap">{m.qta_prima != null ? `${m.qta_prima} → ${m.qta_dopo}` : ""}</td>
                <td className="py-1 pr-2">{m.nota}{m.dettaglio && m.tipo === "modifica"
                  ? Object.entries(m.dettaglio).map(([k, x]) => ` ${k}: ${JSON.stringify((x as unknown[])[0])} → ${JSON.stringify((x as unknown[])[1])}`).join(" ·") : ""}</td>
                <td className="py-1 text-gray-500">{m.utente}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Finestra>
  );
}

export default function MagazzinoRicambi() {
  const [tipo, setTipo] = useState<Tipo>("ricambio");
  const [righe, setRighe] = useState<Riga[]>([]);
  const [conteggi, setConteggi] = useState<Record<string, number>>({});
  const [stati, setStati] = useState<string[]>([]);
  const [titolare, setTitolare] = useState(false);
  const [q, setQ] = useState("");
  const [eliminati, setEliminati] = useState(false);
  const [carico, setCarico] = useState(true);
  const [evid, setEvid] = useState<number | null>(null);
  const [scan, setScan] = useState("");
  const [modo, setModo] = useState<Modo>("conta");
  const [scelte, setScelte] = useState<Riga[] | null>(null);
  const [conta, setConta] = useState<Riga | null>(null);
  const [mov, setMov] = useState<{ r: Riga; t: "carico" | "scarico" } | null>(null);
  const [mod, setMod] = useState<{ r: Partial<Riga> | null } | null>(null);
  const [sto, setSto] = useState<Riga | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const carica = useCallback(async () => {
    try {
      const r = await fetchAPI(`/api/ricambi-apple?${new URLSearchParams({ tipo, eliminati: String(eliminati) })}`);
      setRighe(r.righe); setConteggi(r.conteggi); setStati(r.stati); setTitolare(r.titolare);
    } catch (e) { toast.error(String((e as Error)?.message || e)); } finally { setCarico(false); }
  }, [tipo, eliminati]);
  useEffect(() => { carica(); }, [carica]);

  const visibili = useMemo(() => {
    const t = q.toLowerCase().split(/\s+/).filter(Boolean);
    // display, schede, top case: in ordine di sigla (AIR1, AIR2… AIR10), i ricambi per codice
    const ordinate = righe.some((r) => r.etichetta)
      ? [...righe].sort((a, b) => (a.etichetta || "~").localeCompare(b.etichetta || "~", "it", { numeric: true }))
      : righe;
    if (!t.length) return ordinate;
    return ordinate.filter((r) => {
      const s = [r.codice, r.mpn, r.descrizione, r.modelli, r.posizione, r.scaffale, r.seriale, r.note, r.stato, r.etichetta, r.colore, r.grado, r.condizioni, r.codici_alt].join(" ").toLowerCase();
      return t.every((x) => s.includes(x));
    });
  }, [righe, q]);

  const vaiA = (r: Riga, m: Modo = modo) => {
    setScelte(null); setQ(""); setEliminati(false);
    if (r.tipo !== tipo) setTipo(r.tipo);
    setEvid(r.id);
    setTimeout(() => document.getElementById(`riga-${r.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
    if (m === "conta") setConta(r); else setMov({ r, t: m });
  };
  const nuovoDaCatalogo = async (codice: string) => {
    try {
      const c = await fetchAPI(`/api/ricambi-apple/catalogo/${encodeURIComponent(codice)}`);
      const g = c.gsx;
      if (g) toast.success(`Trovato fra i ricambi GSX: ${g.descrizione}`);
      else toast.info(`${c.codice}: non è fra i ricambi GSX letti — scrivi tu la descrizione`);
      setMod({ r: { codice: c.codice, tipo, descrizione: g?.descrizione || "", modelli: g?.modelli || null, gsx_descrizione: g?.descrizione || null,
        gsx_sostituito_da: g?.sostituito_da || null, gsx_costo: g?.gsx_costo ?? null, qta_nuovo: 1 } as Partial<Riga> });
    } catch (e) { toast.error(String((e as Error)?.message || e)); }
  };

  const spara = async () => {
    const c = scan.trim();
    if (!c) return;
    try {
      const r = await fetchAPI(`/api/ricambi-apple/codice/${encodeURIComponent(c)}`);
      setScan("");
      if (r.righe.length === 1) vaiA(r.righe[0]);
      else if (r.righe.length > 1) setScelte(r.righe);
      else if (modo === "carico") nuovoDaCatalogo(r.codice);
      else {
        toast.error(`${r.codice}: non c'è in magazzino`, { action: { label: "Caricalo", onClick: () => nuovoDaCatalogo(r.codice) } });
      }
    } catch (e) { toast.error(String((e as Error)?.message || e)); }
  };
  useEffect(() => { if (!conta && !mov && !mod && !sto) scanRef.current?.focus(); }, [conta, mov, mod, sto]);

  const fatto = () => { setConta(null); setMov(null); setMod(null); carica(); };
  const elimina = async (r: Riga) => {
    const nota = window.prompt(`Eliminare ${r.codice || ""} ${r.descrizione}? Motivo (facoltativo):`, "");
    if (nota === null) return;
    try { await fetchAPI(`/api/ricambi-apple/${r.id}?${new URLSearchParams({ nota })}`, { method: "DELETE" }); toast.success("Eliminato (si può ripristinare)"); carica(); }
    catch (e) { toast.error(String((e as Error)?.message || e)); }
  };
  const ripristina = async (r: Riga) => {
    try { await fetchAPI(`/api/ricambi-apple/${r.id}/ripristina`, { method: "POST" }); toast.success("Ripristinato"); carica(); }
    catch (e) { toast.error(String((e as Error)?.message || e)); }
  };
  const pezzi = tipo !== "ricambio" && tipo !== "garanzia";
  const gar = tipo === "garanzia";
  const totNuovi = visibili.reduce((n, r) => n + r.qta_nuovo, 0), totUsati = visibili.reduce((n, r) => n + r.qta_usato, 0);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Boxes className="h-5 w-5" /> Magazzino ricambi Apple</h1>
        <p className="text-sm text-gray-500 mt-1">
          Scegli cosa fai (Conta, Carica, Togli) e spara il codice col lettore (o scrivilo e premi Invio): la pagina va sulla riga.
          Conta: conti i pezzi e confermi. Carica: dici quanti e dove li metti (se il codice è nuovo si compila da solo dai ricambi GSX).
          Ogni cambio resta nello Storico.
        </p>
      </div>

      <Card className="p-3 flex flex-wrap gap-3 items-center border-2 border-blue-200">
        <ScanLine className="h-5 w-5 text-blue-600" />
        <input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") spara(); }}
          placeholder="Spara qui il codice (APN, MPN o seriale)" className="flex-1 min-w-[220px] border rounded-md px-3 py-2 text-base font-mono bg-white dark:bg-gray-900" />
        <div className="inline-flex rounded-md border overflow-hidden text-sm">
          {([["conta", "Conta"], ["carico", "Carica"], ["scarico", "Togli"]] as [Modo, string][]).map(([k, t]) => (
            <button key={k} type="button" onClick={() => { setModo(k); scanRef.current?.focus(); }}
              className={`px-3 py-2 ${modo === k ? (k === "carico" ? "bg-green-600 text-white" : k === "scarico" ? "bg-amber-600 text-white" : "bg-blue-600 text-white") : "bg-white dark:bg-gray-900"}`}>{t}</button>
          ))}
        </div>
        <button type="button" onClick={spara} className="px-3 py-2 rounded bg-blue-600 text-white text-sm">Trova</button>
      </Card>

      {scelte && (
        <Card className="p-3">
          <p className="text-sm font-medium mb-2">Questo codice c&apos;è in più righe: quale stai contando?</p>
          <div className="flex flex-col gap-1">
            {scelte.map((r) => (
              <button key={r.id} type="button" onClick={() => vaiA(r)} className="text-left text-sm px-2 py-1 rounded border hover:bg-blue-50">
                <b>{r.codice}</b> {r.descrizione} · {TIPI.find((x) => x.k === r.tipo)?.t} · {r.qta_nuovo} nuovi / {r.qta_usato} usati {r.posizione ? `· ${r.posizione}` : ""}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="inline-flex rounded-md border overflow-hidden text-sm">
          {TIPI.map((x) => (
            <button key={x.k} type="button" onClick={() => { setTipo(x.k); setEvid(null); }}
              className={`px-3 py-1.5 ${tipo === x.k ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-900"}`}>
              {x.t} ({conteggi[x.k] ?? 0})
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtra (codice, descrizione, modello, posizione…)"
            className="w-full border rounded-md pl-8 pr-2 py-1.5 text-sm bg-white dark:bg-gray-900" />
        </div>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={eliminati} onChange={(e) => setEliminati(e.target.checked)} /> Eliminati</label>
        <button type="button" onClick={() => setMod({ r: null })} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm inline-flex items-center gap-1">
          <Plus className="h-4 w-4" /> Aggiungi
        </button>
      </div>

      <Card className="overflow-x-auto">
        {carico ? <div className="p-4"><Loader2 className="h-5 w-5 animate-spin" /></div> : visibili.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">
            {pezzi && !q && !eliminati ? "Ancora vuoto: si caricherà dal file Excel, oppure aggiungili con «Aggiungi»." : "Nessuna riga."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="p-2">Codice</th><th className="p-2">Descrizione / modelli</th>
                {pezzi && <th className="p-2">Stato</th>}
                {gar ? <><th className="p-2">Riparato il</th><th className="p-2">Scadenza</th></>
                  : <><th className="p-2 text-right">Nuovi</th><th className="p-2 text-right">Usati</th></>}
                <th className="p-2">Dove</th>{titolare && <th className="p-2 text-right">Costo</th>}
                <th className="p-2">Ultima conta</th><th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {visibili.map((r) => (
                <tr key={r.id} id={`riga-${r.id}`} className={`border-t align-top ${evid === r.id ? "bg-yellow-100 dark:bg-yellow-900/40" : ""}`}>
                  <td className="p-2 font-mono whitespace-nowrap">{r.etichetta ? <div className="font-bold">{r.etichetta}</div> : null}{r.codice}{r.codici_alt ? <div className="text-xs text-gray-500">= {r.codici_alt}</div> : null}
                    {r.mpn ? <div className="text-xs text-gray-500">{r.mpn}</div> : null}
                    {r.gsx_stato && <div className={`text-[10px] mt-0.5 ${r.gsx_stato === "in_vendita" ? "text-green-700" : "text-gray-400"}`}
                      title={r.gsx_verificato_il ? `verificato sul GSX il ${data(r.gsx_verificato_il)}` : ""}>{r.gsx_stato === "in_vendita" ? "GSX: in vendita" : "GSX: fuori vendita"}</div>}
                    {r.seriale ? <div className="text-xs text-gray-500">SN {r.seriale}</div> : null}</td>
                  <td className="p-2">
                    <div className="font-medium">{r.descrizione}</div>
                    {r.gsx_descrizione && norm(r.gsx_descrizione) !== norm(r.descrizione) && <div className="text-xs text-blue-700">GSX: {r.gsx_descrizione}</div>}
                    {r.gsx_sostituito_da && <div className="text-xs text-amber-700">sostituito da {r.gsx_sostituito_da}</div>}
                    {r.modelli && <div className="text-xs text-gray-500 whitespace-pre-line line-clamp-2" title={r.modelli}>{r.modelli}</div>}
                    {(r.colore || r.grado || r.anno) && <div className="text-xs text-gray-600">{[r.colore, r.grado && `grado ${r.grado}`, r.anno].filter(Boolean).join(" · ")}</div>}
                    {r.condizioni && <div className="text-xs text-amber-700">{r.condizioni}</div>}
                    {r.note && <div className="text-xs text-gray-500 italic">{r.note}</div>}
                  </td>
                  {pezzi && <td className="p-2">{r.stato ? <span className={`text-xs px-2 py-0.5 rounded-full ${COLORE_STATO[r.stato] || "bg-gray-100"}`}>{STATI_TESTO[r.stato] || r.stato}</span> : "—"}</td>}
                  {gar ? <>
                    <td className="p-2 whitespace-nowrap">{giorno(r.data_riparazione)}</td>
                    <td className={`p-2 whitespace-nowrap ${r.scadenza && r.scadenza < new Date().toISOString().slice(0, 10) ? "text-gray-400 line-through" : "font-semibold"}`}>{giorno(r.scadenza)}</td>
                  </> : <>
                    <td className={`p-2 text-right text-base font-semibold ${r.qta_nuovo === 0 ? "text-gray-400" : ""}`}>{r.qta_nuovo}</td>
                    <td className={`p-2 text-right ${r.qta_usato === 0 ? "text-gray-400" : ""}`}>{r.qta_usato}</td>
                  </>}
                  <td className="p-2 whitespace-nowrap">{r.posizione ? <span className="font-semibold">{r.posizione}</span> : null}
                    {r.scaffale ? <div className="text-xs">{r.scaffale}</div> : null}{r.confezione ? <div className="text-xs text-gray-500">{r.confezione.toLowerCase()}</div> : null}</td>
                  {titolare && <td className="p-2 text-right">{r.costo != null ? `€ ${Number(r.costo).toFixed(2).replace(".", ",")}` : ""}</td>}
                  <td className="p-2 text-xs text-gray-500 whitespace-nowrap">{data(r.inventario_il)}</td>
                  <td className="p-2 whitespace-nowrap">
                    {r.attivo ? (
                      <div className="flex gap-1">
                        {!gar && (<>
                        <button type="button" title="Conta i pezzi e conferma la quantità" onClick={() => { setEvid(r.id); setConta(r); }} className="px-2 py-1 rounded border text-xs">Conta</button>
                        <button type="button" title="Carica: arrivano pezzi" onClick={() => setMov({ r, t: "carico" })} className="px-2 py-1 rounded border text-xs inline-flex items-center gap-0.5 text-green-700"><Plus className="h-3 w-3" />Carica</button>
                        <button type="button" title="Togli: pezzi usati o venduti" onClick={() => setMov({ r, t: "scarico" })} className="px-2 py-1 rounded border text-xs inline-flex items-center gap-0.5 text-amber-700"><Minus className="h-3 w-3" />Togli</button>
                        </>)}
                        <button type="button" title="Modifica i dati" onClick={() => setMod({ r })} className="px-2 py-1 rounded border text-xs inline-flex items-center gap-0.5"><Pencil className="h-3 w-3" />Modifica</button>
                        <button type="button" title="Storico: chi ha cambiato cosa e quando" onClick={() => setSto(r)} className="px-2 py-1 rounded border text-xs inline-flex items-center gap-0.5"><History className="h-3 w-3" />Storico</button>
                        <button type="button" title="Elimina (si può ripristinare)" onClick={() => elimina(r)} className="px-2 py-1 rounded border text-xs text-red-600 inline-flex items-center gap-0.5"><Trash2 className="h-3 w-3" />Elimina</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => ripristina(r)} className="px-2 py-1 rounded border text-xs inline-flex items-center gap-1"><RotateCcw className="h-3 w-3" /> Ripristina</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t text-xs text-gray-500">
                <td className="p-2" colSpan={pezzi ? 3 : 2}>{visibili.length} righe</td>
                <td className="p-2 text-right font-medium">{totNuovi}</td><td className="p-2 text-right">{totUsati}</td><td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      {conta && <Conta r={conta} onFatto={fatto} onChiudi={() => setConta(null)} />}
      {mov && <Movimenta r={mov.r} tipo={mov.t} onFatto={fatto} onChiudi={() => setMov(null)} />}
      {mod && <Scheda r={mod.r} tipo={tipo} titolare={titolare} stati={stati} onFatto={fatto} onChiudi={() => setMod(null)} />}
      {sto && <Storico r={sto} onChiudi={() => setSto(null)} />}
    </div>
  );
}
