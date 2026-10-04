"use client";

// FATTURATO NEGOZIO (GENIUS LAB) — 01/10/2026. Stessa impostazione delle Statistiche tarature, ma sul fatturato
// totale: scontrini (registratore, netti di annulli e resi) + fatture emesse (note di credito in negativo),
// per giorno e per mese, con il metodo di pagamento. Le regole sono quelle della Cassa del giorno: i numeri tornano.
// Solo amministratore.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  BarChart3, Euro, Receipt, FileText, Loader2, Clock, TrendingUp, TrendingDown, CalendarDays,
  Table as TableIcon, CreditCard, ScanLine, Trophy, AlertTriangle, CheckCircle2, Wrench, Smartphone, HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { usePermessi } from "@/components/permessi";
import { TabStatistiche } from "@/components/TabStatistiche";
import { oggiRoma } from "@/lib/date";
import { CATEGORIE, fatturatoStatistiche, METODI, NOMI_CATEGORIE, NOMI_METODI, type Categoria, type FattStatistiche, type ImportiCategoria, type Metodo } from "@/lib/fatturato";

const C = {
  scontrini: "#0d9488", // teal
  fatture: "#2563eb", // blu
  cumulato: "#4f46e5", // indaco
  anno_prima: "#9ca3af",
  grid: "#e5e7eb",
  axis: "#9ca3af",
};
const C_CAT: Record<Categoria, string> = { tarature: "#ea580c", apple: "#475569", da_classificare: "#fbbf24" };
const C_METODI: Record<Metodo, string> = {
  contanti: "#059669", pos: "#2563eb", bonifico: "#f59e0b", paypal: "#4f46e5", stripe: "#9333ea",
};

const fmtEur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);
const fmtEur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const MONTH_IT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const meseLabel = (mk: string) => { const [y, m] = mk.split("-"); return `${MONTH_IT[parseInt(m, 10) - 1] || m} ${y.slice(2)}`; };
const giornoLabel = (g: string) => { const [, m, d] = g.split("-"); return `${parseInt(d, 10)}/${parseInt(m, 10)}`; };
const pct = (v: number, tot: number) => tot ? `${(Math.round((v / tot) * 1000) / 10).toLocaleString("it-IT")}%` : "—";
const giornoLungo = (g: string) => new Date(g + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function niceMax(v: number) {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function isoDi(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function presets(): { id: string; label: string; dal: string; al: string }[] {
  const oggi = oggiRoma();
  const [y, m] = oggi.split("-").map((x) => parseInt(x, 10));
  const d = new Date(oggi + "T12:00:00");
  const meno = (gg: number) => { const x = new Date(d); x.setDate(x.getDate() - gg); return isoDi(x); };
  const fineMesePrec = isoDi(new Date(y, m - 1, 0));
  const inizioMesePrec = fineMesePrec.slice(0, 8) + "01";
  const dodici = isoDi(new Date(y, m - 12, 1));
  return [
    { id: "mese", label: "Questo mese", dal: oggi.slice(0, 8) + "01", al: oggi },
    { id: "mese_prec", label: "Mese scorso", dal: inizioMesePrec, al: fineMesePrec },
    { id: "30", label: "Ultimi 30 giorni", dal: meno(29), al: oggi },
    { id: "anno", label: "Anno in corso", dal: `${y}-01-01`, al: oggi },
    { id: "12m", label: "Ultimi 12 mesi", dal: dodici, al: oggi },
  ];
}

/* ---------- Barre impilate (scontrini/fatture oppure tarature/Apple/da classificare), per giorno o per mese ---------- */
interface Parte { label: string; color: string; value: number }
interface Barra { key: string; label: string; parti: Parte[]; totale: number; extra?: ReactNode; prec?: number | null }

function Bars({ data, mostraValori, percentuali = false }: { data: Barra[]; mostraValori: boolean; percentuali?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = 320, padL = 56, padR = 16, padT = 18, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.parti.reduce((a, p) => a + Math.max(0, p.value), 0), d.prec || 0))));
  const n = data.length || 1;
  const band = plotW / n;
  const bw = Math.max(2, Math.min(46, band * 0.66));
  const y = (v: number) => padT + plotH - (Math.max(0, v) / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const ogniEtichetta = Math.max(1, Math.ceil(n / 16));

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Fatturato per giorno o mese">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={C.grid} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={C.axis}>{fmtEur0(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2;
          const x = cx - bw / 2;
          const on = hover === i;
          let base = padT + plotH;
          const rette = d.parti.map((p, j) => {
            const h = (Math.max(0, p.value) / max) * plotH;
            if (h <= 0) return null;
            const gap = base < padT + plotH && bw > 6 ? 2 : 0;
            const top = base - h - gap;
            base = top;
            return <rect key={j} x={x} y={top} width={bw} height={h} rx={bw > 8 ? 3 : 1} fill={p.color} />;
          });
          return (
            <g key={d.key} opacity={hover === null || on ? 1 : 0.55}>
              {d.prec ? <line x1={x - 2} x2={x + bw + 2} y1={y(d.prec)} y2={y(d.prec)} stroke={C.anno_prima} strokeWidth={2} strokeDasharray="3 2" /> : null}
              {rette}
              {mostraValori && (
                <text x={cx} y={base - 6} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#374151">{fmtEur0(d.totale)}</text>
              )}
              {i % ogniEtichetta === 0 && (
                <text x={cx} y={H - padB + 16} textAnchor="middle" fontSize={11} fill="#6b7280">{d.label}</text>
              )}
              <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="absolute -translate-x-1/2 pointer-events-none bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-xs z-10 min-w-44"
          style={{ left: `${Math.min(85, Math.max(15, ((padL + band * hover + band / 2) / W) * 100))}%`, top: 4 }}>
          <div className="font-semibold text-gray-800 mb-1">{data[hover].extra ?? data[hover].label}</div>
          {data[hover].parti.map((p) => (
            <div key={p.label} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.color }} />{p.label}: <strong>{fmtEur(p.value)}</strong>
              {percentuali && data[hover].totale ? <span className="text-gray-400">({pct(p.value, data[hover].totale)})</span> : null}</div>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">Totale: <strong>{fmtEur(data[hover].totale)}</strong></div>
          {data[hover].prec ? <div className="text-gray-500">Anno prima: {fmtEur(data[hover].prec || 0)}</div> : null}
        </div>
      )}
    </div>
  );
}

const partiDoc = (scontrini: number, fatture: number): Parte[] => [
  { label: "Scontrini", color: C.scontrini, value: scontrini }, { label: "Fatture", color: C.fatture, value: fatture },
];

/* ---------- Cumulato (area + linea) ---------- */
function Cumulato({ punti }: { punti: { key: string; label: string; v: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = 220, padL = 56, padR = 16, padT = 16, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = niceMax(Math.max(1, ...punti.map((d) => d.v)));
  const n = punti.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => padT + plotH - (Math.max(0, v) / max) * plotH;
  const pts = punti.map((d, i) => `${x(i)},${y(d.v)}`).join(" ");
  const area = `${padL},${y(0)} ${pts} ${x(n - 1)},${y(0)}`;
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const ogni = Math.max(1, Math.ceil(n / 12));
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Fatturato cumulato">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={C.grid} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={C.axis}>{fmtEur0(t)}</text>
          </g>
        ))}
        <polygon points={area} fill={C.cumulato} opacity={0.10} />
        <polyline points={pts} fill="none" stroke={C.cumulato} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {punti.map((d, i) => (
          <g key={d.key}>
            {(n <= 40 || hover === i) && <circle cx={x(i)} cy={y(d.v)} r={hover === i ? 5.5 : 3} fill="#fff" stroke={C.cumulato} strokeWidth={2} />}
            {i % ogni === 0 && <text x={x(i)} y={H - padB + 16} textAnchor="middle" fontSize={11} fill="#6b7280">{d.label}</text>}
            <rect x={x(i) - plotW / (2 * Math.max(n, 1))} y={padT} width={plotW / Math.max(n, 1)} height={plotH}
              fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
      </svg>
      {hover !== null && punti[hover] && (
        <div className="absolute -translate-x-1/2 pointer-events-none bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-xs z-10"
          style={{ left: `${Math.min(85, Math.max(15, (x(hover) / W) * 100))}%`, top: 4 }}>
          <div className="font-semibold text-gray-800">{punti[hover].label}</div>
          <div>Cumulato: <strong>{fmtEur(punti[hover].v)}</strong></div>
        </div>
      )}
    </div>
  );
}

function StackedBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const pos = parts.map((p) => ({ ...p, value: Math.max(0, p.value) }));
  const tot = pos.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div>
      <div className="flex w-full h-5 rounded-md overflow-hidden bg-gray-100">
        {pos.map((p) => <div key={p.label} style={{ width: `${(p.value / tot) * 100}%`, background: p.color }} title={`${p.label}: ${fmtEur(p.value)}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label}: <strong>{fmtEur(p.value)}</strong>
            <span className="text-gray-400">({Math.round((Math.max(0, p.value) / tot) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone = "gray" }: { icon: ReactNode; label: string; value: string; sub?: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    gray: "text-gray-500", emerald: "text-emerald-600", orange: "text-orange-600", teal: "text-teal-600",
    amber: "text-amber-600", blue: "text-blue-600", indigo: "text-indigo-600", purple: "text-purple-600",
  };
  return (
    <Card className="p-4">
      <div className={`flex items-center gap-2 text-sm mb-1 ${tones[tone]}`}>{icon}{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </Card>
  );
}

function Variazione({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return null;
  return pct >= 0
    ? <span className="text-emerald-600 inline-flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />+{pct}% a/a</span>
    : <span className="text-red-500 inline-flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{pct}% a/a</span>;
}

/* ---------- Tarature / Apple / Da classificare ---------- */
function Attivita({ dati, scala }: { dati: FattStatistiche; scala: "giorno" | "mese" }) {
  const [tabella, setTabella] = useState(false);
  const [elenco, setElenco] = useState(false);
  const t = dati.totali;
  const parti = (c: ImportiCategoria): Parte[] => CATEGORIE.map((k) => ({ label: NOMI_CATEGORIE[k], color: C_CAT[k], value: c[k] }));
  const barre: Barra[] = useMemo(() => {
    if (scala === "mese") return dati.mensile.map((m) => ({ key: m.mese, label: meseLabel(m.mese), parti: parti(m.cat), totale: m.totale }));
    const per = new Map(dati.giornaliero.map((g) => [g.giorno, g]));
    const out: Barra[] = [];
    const d = new Date(dati.dal + "T12:00:00"), fine = new Date(dati.al + "T12:00:00");
    const zero: ImportiCategoria = { tarature: 0, apple: 0, da_classificare: 0 };
    while (d <= fine) {
      const k = isoDi(d);
      const g = per.get(k);
      out.push({ key: k, label: giornoLabel(k), parti: parti(g?.cat || zero), totale: g?.totale || 0, extra: giornoLungo(k) + (dati.chiusi?.[k] ? ` · chiuso (${dati.chiusi[k]})` : "") });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [dati, scala]);
  const righe = scala === "mese"
    ? dati.mensile.map((m) => ({ k: m.mese, l: meseLabel(m.mese), r: m }))
    : dati.giornaliero.map((g) => ({ k: g.giorno, l: giornoLungo(g.giorno), r: g }));
  const sub = (k: Categoria) => `scontrini ${fmtEur(t.cat_scontrini[k])} · fatture ${fmtEur(t.cat_fatture[k])}`;
  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2">
          <Wrench className="w-4 h-4 text-orange-600" /> Tarature / Apple (riparazioni, vendite, accessori) per {scala === "mese" ? "mese" : "giorno"}
        </h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          {CATEGORIE.map((k) => <span key={k} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C_CAT[k] }} />{NOMI_CATEGORIE[k]}</span>)}
          <button onClick={() => setTabella((v) => !v)} className="flex items-center gap-1 text-blue-600 hover:underline">
            <TableIcon className="w-3.5 h-3.5" />{tabella ? "Grafico" : "Tabella"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi icon={<Wrench className="w-4 h-4" />} label={`Tarature · ${pct(t.cat.tarature, t.totale)}`} tone="orange" value={fmtEur(t.cat.tarature)} sub={sub("tarature")} />
        <Kpi icon={<Smartphone className="w-4 h-4" />} label={`Apple · ${pct(t.cat.apple, t.totale)}`} tone="gray" value={fmtEur(t.cat.apple)} sub={sub("apple")} />
        <Kpi icon={<HelpCircle className="w-4 h-4" />} label={`Da classificare · ${pct(t.cat.da_classificare, t.totale)}`} tone="amber" value={fmtEur(t.cat.da_classificare)}
          sub={dati.da_classificare.length ? <button className="text-blue-600 hover:underline" onClick={() => setElenco((v) => !v)}>{dati.da_classificare.length} documenti · {elenco ? "nascondi" : "vedi quali"}</button> : "niente da classificare"} />
      </div>
      <StackedBar parts={CATEGORIE.map((k) => ({ label: NOMI_CATEGORIE[k], value: t.cat[k], color: C_CAT[k] }))} />
      {elenco && dati.da_classificare.length > 0 && (
        <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-md border border-amber-200 bg-amber-50/40">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-amber-50"><tr className="text-left text-gray-500"><th className="p-1.5">Giorno</th><th className="p-1.5">Documento</th><th className="p-1.5">Cliente</th><th className="p-1.5">Descrizione</th><th className="p-1.5 text-right">Importo</th></tr></thead>
            <tbody>
              {dati.da_classificare.map((x, i) => (
                <tr key={i} className="border-t border-amber-100">
                  <td className="p-1.5 whitespace-nowrap">{giornoLabel(x.giorno)}</td><td className="p-1.5 whitespace-nowrap">{x.documento} {x.numero}</td>
                  <td className="p-1.5">{x.cliente}</td><td className="p-1.5">{x.descrizione}</td><td className="p-1.5 text-right font-medium">{fmtEur(x.importo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tabella ? (
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-gray-500 border-b">
                <th className="py-1.5 pr-3">{scala === "mese" ? "Mese" : "Giorno"}</th>
                <th className="py-1.5 px-2 text-right">Tarature</th><th className="py-1.5 px-2 text-right">%</th>
                <th className="py-1.5 px-2 text-right">Apple</th><th className="py-1.5 px-2 text-right">%</th>
                <th className="py-1.5 px-2 text-right">Da classificare</th><th className="py-1.5 pl-2 text-right">Totale</th>
              </tr>
            </thead>
            <tbody>
              {righe.map(({ k, l, r }) => (
                <tr key={k} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{l}{scala === "giorno" && dati.chiusi?.[k] ? <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-600" title={dati.chiusi[k]}>chiuso</span> : null}</td>
                  <td className="py-1.5 px-2 text-right text-orange-700">{fmtEur(r.cat.tarature)}</td><td className="py-1.5 px-2 text-right text-gray-500">{pct(r.cat.tarature, r.totale)}</td>
                  <td className="py-1.5 px-2 text-right text-slate-700">{fmtEur(r.cat.apple)}</td><td className="py-1.5 px-2 text-right text-gray-500">{pct(r.cat.apple, r.totale)}</td>
                  <td className="py-1.5 px-2 text-right text-amber-700">{r.cat.da_classificare ? fmtEur(r.cat.da_classificare) : "—"}</td>
                  <td className="py-1.5 pl-2 text-right font-semibold">{fmtEur(r.totale)}</td>
                </tr>
              ))}
              <tr className="font-semibold border-t-2">
                <td className="py-1.5 pr-3">Totale</td>
                <td className="py-1.5 px-2 text-right">{fmtEur(t.cat.tarature)}</td><td className="py-1.5 px-2 text-right">{pct(t.cat.tarature, t.totale)}</td>
                <td className="py-1.5 px-2 text-right">{fmtEur(t.cat.apple)}</td><td className="py-1.5 px-2 text-right">{pct(t.cat.apple, t.totale)}</td>
                <td className="py-1.5 px-2 text-right">{fmtEur(t.cat.da_classificare)}</td><td className="py-1.5 pl-2 text-right">{fmtEur(t.totale)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : <Bars data={barre} mostraValori={barre.length <= 14} percentuali />}
      <p className="text-xs text-gray-400">
        Divisione riga per riga: tarature = righe di taratura/RDT/strumenti F-GAS e documenti collegati a una sessione di taratura;
        Apple = schede di assistenza, dispositivi, accessori e ricambi; spedizioni e righe di servizio seguono il documento.
        Quello che non si riconosce resta in «Da classificare».
      </p>
    </Card>
  );
}

export default function FatturatoPage() {
  const { admin, caricato } = usePermessi();
  const [errore, setErrore] = useState<string | null>(null);
  const pp = useMemo(presets, []);
  const [periodo, setPeriodo] = useState(() => ({ dal: pp[3].dal, al: pp[3].al }));
  const [dati, setDati] = useState<FattStatistiche | null>(null);
  const [loading, setLoading] = useState(true);
  const [scala, setScala] = useState<"giorno" | "mese">("mese");
  const [tabella, setTabella] = useState(false);

  const carica = useCallback(async (dal: string, al: string) => {
    setLoading(true);
    try {
      const d = await fatturatoStatistiche(dal, al);
      setDati(d);
      setErrore(null);
      // periodo breve: di default per giorno
      const giorni = (new Date(al).getTime() - new Date(dal).getTime()) / 86400000;
      setScala(giorni <= 62 ? "giorno" : "mese");
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Errore caricamento fatturato";
      setErrore(m);
      toast.error(m);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void carica(periodo.dal, periodo.al); }, [carica, periodo]);

  const barre: Barra[] = useMemo(() => {
    if (!dati) return [];
    if (scala === "mese") {
      return dati.mensile.map((m) => ({ key: m.mese, label: meseLabel(m.mese), parti: partiDoc(m.scontrini, m.fatture), totale: m.totale, prec: m.anno_prima ?? null }));
    }
    // per giorno: tutti i giorni del periodo, anche quelli a zero (domeniche, chiusure)
    const per = new Map(dati.giornaliero.map((g) => [g.giorno, g]));
    const out: Barra[] = [];
    const d = new Date(dati.dal + "T12:00:00"), fine = new Date(dati.al + "T12:00:00");
    while (d <= fine) {
      const k = isoDi(d);
      const g = per.get(k);
      out.push({ key: k, label: giornoLabel(k), parti: partiDoc(g?.scontrini || 0, g?.fatture || 0), totale: g?.totale || 0, extra: giornoLungo(k) + (dati.chiusi?.[k] ? ` · chiuso (${dati.chiusi[k]})` : "") });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [dati, scala]);

  const cumulato = useMemo(() => {
    let acc = 0;
    return barre.map((b) => { acc += b.totale; return { key: b.key, label: b.label, v: acc }; });
  }, [barre]);

  if ((caricato && !admin) || (errore && !dati)) {
    return <div className="p-6 text-sm text-gray-500">{caricato && !admin ? "Sezione riservata all'amministratore." : errore}</div>;
  }

  const t = dati?.totali;
  const cf = dati?.confronto;
  const diffRt = dati && t ? Math.round((t.scontrini - dati.rt_totale) * 100) / 100 : 0;
  const giorniDiff = dati?.giornaliero.filter((g) => g.differenza_rt !== null && g.differenza_rt !== 0) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" /> Statistiche · Fatturato negozio
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Genius Lab · scontrini (netti di annulli e resi) + fatture emesse (note di credito in negativo) · importi IVA inclusa
          </p>
        </div>
        <TabStatistiche attivo="fatturato" />
      </div>

      {/* Filtro periodo */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {pp.map((p) => {
            const on = p.dal === periodo.dal && p.al === periodo.al;
            return (
              <button key={p.id} onClick={() => setPeriodo({ dal: p.dal, al: p.al })}
                className={`px-3 py-1.5 rounded-md text-sm border ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}>
                {p.label}
              </button>
            );
          })}
          <span className="mx-1 text-gray-300">|</span>
          <label className="flex items-center gap-1 text-sm text-gray-600"><CalendarDays className="w-4 h-4" />dal
            <input type="date" className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm" value={periodo.dal} max={periodo.al}
              onChange={(e) => e.target.value && setPeriodo((p) => ({ ...p, dal: e.target.value }))} />
          </label>
          <label className="flex items-center gap-1 text-sm text-gray-600">al
            <input type="date" className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm" value={periodo.al} min={periodo.dal}
              onChange={(e) => e.target.value && setPeriodo((p) => ({ ...p, al: e.target.value }))} />
          </label>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
      </Card>

      {!dati || !t ? (
        <div className="p-6 flex justify-center min-h-[300px]"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <Kpi icon={<Euro className="w-4 h-4" />} label="Fatturato totale" value={fmtEur(t.totale)}
              sub={cf ? <Variazione pct={cf.var_totale_pct} /> : `${t.giorni_attivi} giorni con incassi`} />
            <Kpi icon={<Receipt className="w-4 h-4" />} label="Scontrini" tone="teal" value={fmtEur(t.scontrini)}
              sub={<>{t.n_scontrini} scontrini{t.n_annulli ? ` · ${t.n_annulli} annulli/resi` : ""} {cf ? <Variazione pct={cf.var_scontrini_pct} /> : null}</>} />
            <Kpi icon={<FileText className="w-4 h-4" />} label="Fatture" tone="blue" value={fmtEur(t.fatture)}
              sub={<>{t.n_fatture} fatture{t.n_note_credito ? ` · ${t.n_note_credito} NC (${fmtEur(t.note_credito)})` : ""} {cf ? <Variazione pct={cf.var_fatture_pct} /> : null}</>} />
            <Kpi icon={<FileText className="w-4 h-4" />} label="Imponibile fatture" tone="indigo" value={fmtEur(t.imponibile)}
              sub={`IVA ${fmtEur(t.iva)}`} />
            <Kpi icon={<CalendarDays className="w-4 h-4" />} label="Media al giorno" tone="purple" value={fmtEur(t.media_giorno)}
              sub={`scontrino medio ${fmtEur(t.scontrino_medio)} · fattura ${fmtEur(t.fattura_media)}${t.giorni_lavorati !== undefined ? ` · ${t.giorni_lavorati} giorni lavorati, ${t.giorni_chiusi} chiusi` : ""}`} />
            <Kpi icon={<Trophy className="w-4 h-4" />} label="Giorno migliore" tone="amber"
              value={t.giorno_migliore ? fmtEur(t.giorno_migliore.totale) : "—"}
              sub={t.giorno_migliore ? giornoLungo(t.giorno_migliore.giorno) : undefined} />
          </div>

          {/* Andamento */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" /> Fatturato per {scala === "mese" ? "mese" : "giorno"}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.scontrini }} />Scontrini</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.fatture }} />Fatture</span>
                {scala === "mese" && dati.mensile.some((m) => m.anno_prima) && (
                  <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed" style={{ borderColor: C.anno_prima }} />Anno prima</span>
                )}
                <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                  {(["giorno", "mese"] as const).map((s) => (
                    <button key={s} onClick={() => setScala(s)} className={`px-2 py-1 ${scala === s ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-50"}`}>
                      Per {s}
                    </button>
                  ))}
                </div>
                <button onClick={() => setTabella((v) => !v)} className="flex items-center gap-1 text-blue-600 hover:underline">
                  <TableIcon className="w-3.5 h-3.5" />{tabella ? "Grafico" : "Tabella"}
                </button>
              </div>
            </div>
            {barre.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">Nessun dato nel periodo</p>
            ) : tabella ? (
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm mt-2">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-1.5 pr-3">{scala === "mese" ? "Mese" : "Giorno"}</th>
                      <th className="py-1.5 px-2 text-right">Scontrini</th><th className="py-1.5 px-2 text-right">N.</th>
                      <th className="py-1.5 px-2 text-right">Fatture</th><th className="py-1.5 px-2 text-right">N.</th>
                      <th className="py-1.5 px-2 text-right">Imponibile</th><th className="py-1.5 px-2 text-right">IVA</th>
                      <th className="py-1.5 px-2 text-right">Totale</th>
                      {METODI.map((m) => <th key={m} className="py-1.5 px-2 text-right">{NOMI_METODI[m]}</th>)}
                      {scala === "giorno" && <th className="py-1.5 pl-2 text-right">Chiusura RT</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(scala === "mese" ? dati.mensile.map((m) => ({ k: m.mese, l: meseLabel(m.mese), r: m, ns: m.n_scontrini, rt: undefined as number | null | undefined, drt: null as number | null }))
                      : dati.giornaliero.map((g) => ({ k: g.giorno, l: giornoLungo(g.giorno), r: g, ns: g.n_scontrini, rt: g.rt, drt: g.differenza_rt }))).map(({ k, l, r, ns, rt, drt }) => (
                      <tr key={k} className="border-b border-gray-50">
                        <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{l}{scala === "giorno" && dati.chiusi?.[k] ? <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-600" title={dati.chiusi[k]}>chiuso</span> : null}</td>
                        <td className="py-1.5 px-2 text-right text-teal-700">{fmtEur(r.scontrini)}</td>
                        <td className="py-1.5 px-2 text-right text-gray-500">{ns}</td>
                        <td className="py-1.5 px-2 text-right text-blue-700">{fmtEur(r.fatture)}</td>
                        <td className="py-1.5 px-2 text-right text-gray-500">{r.n_fatture}{r.n_note_credito ? `+${r.n_note_credito}NC` : ""}</td>
                        <td className="py-1.5 px-2 text-right">{fmtEur(r.imponibile)}</td>
                        <td className="py-1.5 px-2 text-right">{fmtEur(r.iva)}</td>
                        <td className="py-1.5 px-2 text-right font-semibold">{fmtEur(r.totale)}</td>
                        {METODI.map((m) => <td key={m} className="py-1.5 px-2 text-right text-gray-600">{r.pagamenti[m] ? fmtEur(r.pagamenti[m]) : "—"}</td>)}
                        {scala === "giorno" && (
                          <td className={`py-1.5 pl-2 text-right ${drt ? "text-red-600 font-medium" : "text-gray-500"}`} title={drt ? `scontrini − RT = ${fmtEur(drt)}` : undefined}>
                            {rt === null || rt === undefined ? "—" : fmtEur(rt)}{drt ? " ⚠" : ""}
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="font-semibold border-t-2">
                      <td className="py-1.5 pr-3">Totale</td>
                      <td className="py-1.5 px-2 text-right">{fmtEur(t.scontrini)}</td><td className="py-1.5 px-2 text-right">{t.n_scontrini}</td>
                      <td className="py-1.5 px-2 text-right">{fmtEur(t.fatture)}</td><td className="py-1.5 px-2 text-right">{t.n_fatture}</td>
                      <td className="py-1.5 px-2 text-right">{fmtEur(t.imponibile)}</td><td className="py-1.5 px-2 text-right">{fmtEur(t.iva)}</td>
                      <td className="py-1.5 px-2 text-right">{fmtEur(t.totale)}</td>
                      {METODI.map((m) => <td key={m} className="py-1.5 px-2 text-right">{fmtEur(t.pagamenti[m])}</td>)}
                      {scala === "giorno" && <td className="py-1.5 pl-2 text-right">{fmtEur(dati.rt_totale)}</td>}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : <Bars data={barre} mostraValori={barre.length <= 14} />}
          </Card>

          {/* Tarature / Apple */}
          <Attivita dati={dati} scala={scala} />

          {/* Cumulato + composizione */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-5 lg:col-span-2">
              <h3 className="font-semibold mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-600" /> Fatturato cumulato</h3>
              {cumulato.length ? <Cumulato punti={cumulato} /> : <p className="text-sm text-gray-400 py-8 text-center">Nessun dato</p>}
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Euro className="w-4 h-4 text-emerald-600" /> Scontrini e fatture</h3>
              <StackedBar parts={[
                { label: "Scontrini", value: t.scontrini, color: C.scontrini },
                { label: "Fatture", value: t.fatture, color: C.fatture },
              ]} />
              <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Fatture (lordo NC)</span><span className="font-medium">{fmtEur(t.fatture - t.note_credito)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Note di credito</span><span className="font-medium text-red-600">{fmtEur(t.note_credito)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Imponibile / IVA fatture</span><span className="font-medium">{fmtEur(t.imponibile)} / {fmtEur(t.iva)}</span></div>
                {cf && (
                  <div className="flex justify-between"><span className="text-gray-500">Stesso periodo anno prima</span><span className="font-medium">{fmtEur(cf.totale)}</span></div>
                )}
              </div>
            </Card>
          </div>

          {/* Metodi di pagamento + controllo RT */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><CreditCard className="w-4 h-4 text-blue-600" /> Metodo di pagamento</h3>
              <StackedBar parts={METODI.map((m) => ({ label: NOMI_METODI[m], value: t.pagamenti[m], color: C_METODI[m] }))} />
              <table className="w-full text-sm mt-4">
                <thead><tr className="text-left text-gray-500 border-b"><th className="py-1.5">Metodo</th><th className="py-1.5 text-right">Scontrini</th><th className="py-1.5 text-right">Fatture</th><th className="py-1.5 text-right">Totale</th></tr></thead>
                <tbody>
                  {METODI.map((m) => (
                    <tr key={m} className="border-b border-gray-50">
                      <td className="py-1.5 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C_METODI[m] }} />{NOMI_METODI[m]}</td>
                      <td className="py-1.5 text-right">{fmtEur(t.pag_scontrini[m])}</td>
                      <td className="py-1.5 text-right">{fmtEur(t.pag_fatture[m])}</td>
                      <td className="py-1.5 text-right font-medium">{fmtEur(t.pagamenti[m])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">Fatture senza modalità o da incassare: contate come bonifico (come nella Cassa del giorno).</p>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><ScanLine className="w-4 h-4 text-teal-600" /> Scontrini e registratore telematico</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><div className="text-xs text-gray-500">Scontrini cassa</div><div className="text-lg font-bold">{fmtEur(t.scontrini)}</div></div>
                <div><div className="text-xs text-gray-500">Chiusure RT ({dati.giorni_con_rt} gg)</div><div className="text-lg font-bold">{fmtEur(dati.rt_totale)}</div></div>
                <div><div className="text-xs text-gray-500">Differenza</div>
                  <div className={`text-lg font-bold ${Math.abs(diffRt) > 0.5 ? "text-red-600" : "text-emerald-600"}`}>{fmtEur(diffRt)}</div></div>
              </div>
              {giorniDiff.length === 0 ? (
                <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Ogni giorno gli scontrini tornano con la chiusura del registratore.</p>
              ) : (
                <div className="text-sm">
                  <p className="text-amber-700 flex items-center gap-1.5 mb-1"><AlertTriangle className="w-4 h-4" />{giorniDiff.length} giorni non tornano con la chiusura RT:</p>
                  <div className="max-h-40 overflow-y-auto">
                    {giorniDiff.map((g) => (
                      <div key={g.giorno} className="flex justify-between py-0.5 hover:bg-gray-50 rounded px-1">
                        <span>{giornoLungo(g.giorno)}</span>
                        <span className="text-gray-500">cassa {fmtEur(g.scontrini)} · RT {fmtEur(g.rt || 0)} · <b className="text-red-600">{fmtEur(g.differenza_rt || 0)}</b></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Dati live dal {dati.primo_dato ? giornoLungo(dati.primo_dato) : "—"} (inizio storico) · stesse regole della Cassa del giorno:
            giornate importate dall&apos;Excel = righe dell&apos;Excel, le altre = scontrini del registratore + righe a mano; fatture alla data del documento.
          </p>
        </>
      )}
    </div>
  );
}
