"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  BarChart3, Euro, Users, FileText, CalendarClock,
  TrendingUp, TrendingDown, Wrench, Loader2, Clock, CheckCircle2,
  AlertCircle, Truck, Package, Percent, Table as TableIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getStatistics } from "@/lib/api";

interface MonthRow {
  mese: string;
  strumenti: number;
  spedizione: number;
  totale: number;
  pagato: number;
  in_attesa: number;
  n_sessioni: number;
  n_strumenti: number;
  cumulato: number;
  media_sessione: number;
}

interface Stats {
  sessioni: {
    totali: number; oggi: number; mese: number;
    by_status: Record<string, number>;
    by_payment: Record<string, number>;
  };
  fatturato: {
    totale: number; pagato: number; in_attesa: number; mese_corrente: number;
    strumenti: number; spedizioni: number;
    media_sessione: number; media_strumento: number;
    crescita_mom_pct: number | null;
    primo_mese: string | null; ultimo_mese: string | null;
  };
  mensile: MonthRow[];
  clienti: { totali: number; nuovi_mese: number };
  rdt: { totali: number; mese: number };
  strumenti_totali: number;
  scadenze_prossime_30gg: number;
  top_strumenti: { name: string; count: number; revenue: number }[];
  top_clienti: { customer_id: string; company_name: string; revenue: number; sessions: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  registrazione: "Registrazione",
  in_lavorazione: "In lavorazione",
  pronto_ritiro: "Pronto ritiro",
  attesa_pagamento: "Attesa pagamento",
  completata: "Completata",
};
const PAYMENT_LABELS: Record<string, string> = {
  non_richiesto: "Non richiesto",
  in_attesa: "In attesa",
  pagato: "Pagato",
  parziale: "Parziale",
};

// Palette (identità per entità, ordine fisso — non ciclata)
const C = {
  strumenti: "#2563eb", // blu
  spedizione: "#f59e0b", // ambra
  cumulato: "#4f46e5", // indaco
  pagato: "#059669", // emerald
  in_attesa: "#ea580c", // arancio
  non_richiesto: "#64748b", // slate
  grid: "#e5e7eb",
  axis: "#9ca3af",
};

const fmtEur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);
const fmtEur0 = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const MONTH_IT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const meseLabel = (mk: string) => {
  const [y, m] = mk.split("-");
  return `${MONTH_IT[parseInt(m, 10) - 1] || m} ${y.slice(2)}`;
};

function niceMax(v: number) {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/* ---------- Grafico: fatturato mensile (barre impilate) ---------- */
function MonthlyBars({ data }: { data: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = 320, padL = 52, padR = 16, padT = 16, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = niceMax(Math.max(1, ...data.map((d) => d.totale)));
  const n = data.length || 1;
  const band = plotW / n;
  const bw = Math.min(46, band * 0.6);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label="Grafico fatturato mensile">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke={C.grid} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={C.axis}>
              {fmtEur0(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2;
          const x = cx - bw / 2;
          const hS = (d.strumenti / max) * plotH;
          const hSh = (d.spedizione / max) * plotH;
          const yS = padT + plotH - hS;
          const ySh = yS - hSh - (hSh > 0 ? 2 : 0);
          const on = hover === i;
          return (
            <g key={d.mese} opacity={hover === null || on ? 1 : 0.55}>
              {/* strumenti */}
              <rect x={x} y={yS} width={bw} height={Math.max(0, hS)} rx={3} fill={C.strumenti} />
              {/* spedizione (gap 2px sopra) */}
              {d.spedizione > 0 && (
                <rect x={x} y={ySh} width={bw} height={Math.max(0, hSh)} rx={3} fill={C.spedizione} />
              )}
              {/* valore totale sopra la barra */}
              <text x={cx} y={y(d.totale) - (d.spedizione > 0 ? hSh + 8 : 6)} textAnchor="middle"
                fontSize={10.5} fontWeight={600} fill="#374151">
                {fmtEur0(d.totale)}
              </text>
              <text x={cx} y={H - padB + 16} textAnchor="middle" fontSize={11} fill="#6b7280">
                {meseLabel(d.mese)}
              </text>
              {/* hit area */}
              <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="absolute -translate-x-1/2 pointer-events-none bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-xs z-10"
          style={{ left: `${((padL + band * hover + band / 2) / W) * 100}%`, top: 4 }}>
          <div className="font-semibold text-gray-800 mb-1">{meseLabel(data[hover].mese)}</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: C.strumenti }} />Strumenti: <strong>{fmtEur(data[hover].strumenti)}</strong></div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: C.spedizione }} />Spedizione: <strong>{fmtEur(data[hover].spedizione)}</strong></div>
          <div className="border-t border-gray-100 mt-1 pt-1">Totale: <strong>{fmtEur(data[hover].totale)}</strong></div>
          <div className="text-gray-500">{data[hover].n_sessioni} sess · {data[hover].n_strumenti} strum · media {fmtEur(data[hover].media_sessione)}</div>
        </div>
      )}
    </div>
  );
}

/* ---------- Grafico: cumulato (area + linea) ---------- */
function CumulativeChart({ data }: { data: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = 220, padL = 52, padR = 16, padT = 16, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = niceMax(Math.max(1, ...data.map((d) => d.cumulato)));
  const n = data.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const pts = data.map((d, i) => `${x(i)},${y(d.cumulato)}`).join(" ");
  const area = `${padL},${y(0)} ${pts} ${x(n - 1)},${y(0)}`;
  const ticks = [0, 0.5, 1].map((t) => t * max);

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
        <polyline points={pts} fill="none" stroke={C.cumulato} strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={d.mese}>
            <circle cx={x(i)} cy={y(d.cumulato)} r={hover === i ? 5.5 : 3.5} fill="#fff"
              stroke={C.cumulato} strokeWidth={2} />
            <text x={x(i)} y={H - padB + 16} textAnchor="middle" fontSize={11} fill="#6b7280">{meseLabel(d.mese)}</text>
            <rect x={x(i) - plotW / (2 * Math.max(n, 1))} y={padT} width={plotW / Math.max(n, 1)} height={plotH}
              fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
      </svg>
      {hover !== null && data[hover] && (
        <div className="absolute -translate-x-1/2 pointer-events-none bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-xs z-10"
          style={{ left: `${(x(hover) / W) * 100}%`, top: 4 }}>
          <div className="font-semibold text-gray-800">{meseLabel(data[hover].mese)}</div>
          <div>Cumulato: <strong>{fmtEur(data[hover].cumulato)}</strong></div>
        </div>
      )}
    </div>
  );
}

/* ---------- Barra orizzontale impilata (pagamenti) ---------- */
function StackedBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const tot = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div>
      <div className="flex w-full h-5 rounded-md overflow-hidden bg-gray-100">
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.value / tot) * 100}%`, background: p.color }}
            title={`${p.label}: ${fmtEur(p.value)}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label}: <strong>{fmtEur(p.value)}</strong>
            <span className="text-gray-400">({Math.round((p.value / tot) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Lista a barre (top strumenti/clienti) ---------- */
function HBars({ items, color }: { items: { label: string; value: number; sub?: string }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="text-sm">
          <div className="flex justify-between mb-0.5">
            <span className="truncate max-w-[62%] flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-600 text-[10px] flex items-center justify-center font-semibold shrink-0">{i + 1}</span>
              <span className="truncate">{it.label}</span>
            </span>
            <span className="text-gray-700 font-medium shrink-0">{fmtEur(it.value)}{it.sub ? <span className="text-gray-400 font-normal"> · {it.sub}</span> : null}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone = "gray" }: {
  icon: ReactNode; label: string; value: string; sub?: ReactNode; tone?: string;
}) {
  const tones: Record<string, string> = {
    gray: "text-gray-500", emerald: "text-emerald-600", orange: "text-orange-600",
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

export default function StatistichePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    (async () => {
      try { setStats(await getStatistics()); }
      catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Errore caricamento statistiche"); }
      finally { setLoading(false); }
    })();
  }, []);

  const mensile = useMemo(() => stats?.mensile ?? [], [stats]);

  if (loading) {
    return <div className="p-6 flex justify-center min-h-[400px]"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }
  if (!stats) return null;

  const f = stats.fatturato;
  const mom = f.crescita_mom_pct;
  const nonRichiesto = Math.max(0, f.totale - f.pagato - f.in_attesa);
  const periodo = f.primo_mese && f.ultimo_mese
    ? `${meseLabel(f.primo_mese)} → ${meseLabel(f.ultimo_mese)}` : "—";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-600" /> Statistiche
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Fatturato registrato a sistema (IVA inclusa) · periodo {periodo} · {stats.sessioni.totali} sessioni
        </p>
      </div>

      {/* KPI principali */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi icon={<Euro className="w-4 h-4" />} label="Fatturato totale" value={fmtEur(f.totale)}
          sub={<span className="flex items-center gap-1">
            {mom !== null && (mom >= 0
              ? <span className="text-emerald-600 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{mom}% m/m</span>
              : <span className="text-red-500 flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{mom}% m/m</span>)}
          </span>} />
        <Kpi icon={<CheckCircle2 className="w-4 h-4" />} label="Incassato" tone="emerald"
          value={fmtEur(f.pagato)} sub={`${stats.sessioni.by_payment.pagato || 0} sessioni pagate`} />
        <Kpi icon={<AlertCircle className="w-4 h-4" />} label="In attesa" tone="orange"
          value={fmtEur(f.in_attesa)} sub={`${stats.sessioni.by_payment.in_attesa || 0} da incassare`} />
        <Kpi icon={<Truck className="w-4 h-4" />} label="Spedizioni" tone="amber"
          value={fmtEur(f.spedizioni)} sub="incluse nel totale" />
        <Kpi icon={<Percent className="w-4 h-4" />} label="Scontrino medio" tone="indigo"
          value={fmtEur(f.media_sessione)} sub={`${fmtEur(f.media_strumento)} / strumento`} />
        <Kpi icon={<CalendarClock className="w-4 h-4" />} label="Scadenze 30gg" tone="blue"
          value={String(stats.scadenze_prossime_30gg)} sub="tarature in rinnovo" />
      </div>

      {/* Grafico fatturato mensile */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" /> Fatturato per mese
          </h3>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.strumenti }} />Strumenti</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.spedizione }} />Spedizione</span>
            <button onClick={() => setShowTable((v) => !v)} className="flex items-center gap-1 text-blue-600 hover:underline">
              <TableIcon className="w-3.5 h-3.5" />{showTable ? "Grafico" : "Tabella"}
            </button>
          </div>
        </div>
        {mensile.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Nessun dato disponibile</p>
        ) : showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1.5 pr-3">Mese</th><th className="py-1.5 px-3 text-right">Strumenti</th>
                  <th className="py-1.5 px-3 text-right">Spedizione</th><th className="py-1.5 px-3 text-right">Totale</th>
                  <th className="py-1.5 px-3 text-right">Incassato</th><th className="py-1.5 px-3 text-right">Sess.</th>
                  <th className="py-1.5 px-3 text-right">Strum.</th><th className="py-1.5 pl-3 text-right">Cumulato</th>
                </tr>
              </thead>
              <tbody>
                {mensile.map((m) => (
                  <tr key={m.mese} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3 font-medium">{meseLabel(m.mese)}</td>
                    <td className="py-1.5 px-3 text-right">{fmtEur(m.strumenti)}</td>
                    <td className="py-1.5 px-3 text-right">{fmtEur(m.spedizione)}</td>
                    <td className="py-1.5 px-3 text-right font-semibold">{fmtEur(m.totale)}</td>
                    <td className="py-1.5 px-3 text-right text-emerald-700">{fmtEur(m.pagato)}</td>
                    <td className="py-1.5 px-3 text-right">{m.n_sessioni}</td>
                    <td className="py-1.5 px-3 text-right">{m.n_strumenti}</td>
                    <td className="py-1.5 pl-3 text-right text-indigo-700">{fmtEur(m.cumulato)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <MonthlyBars data={mensile} />}
      </Card>

      {/* Cumulato + pagamenti */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" /> Fatturato cumulato
          </h3>
          {mensile.length ? <CumulativeChart data={mensile} /> : <p className="text-sm text-gray-400 py-8 text-center">Nessun dato</p>}
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Euro className="w-4 h-4 text-emerald-600" /> Stato incassi
          </h3>
          <StackedBar parts={[
            { label: "Pagato", value: f.pagato, color: C.pagato },
            { label: "In attesa", value: f.in_attesa, color: C.in_attesa },
            { label: "Non richiesto", value: nonRichiesto, color: C.non_richiesto },
          ]} />
          <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Fatturato strumenti</span><span className="font-medium">{fmtEur(f.strumenti)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Fatturato spedizioni</span><span className="font-medium">{fmtEur(f.spedizioni)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Strumenti tarati</span><span className="font-medium">{stats.strumenti_totali}</span></div>
          </div>
        </Card>
      </div>

      {/* Sessioni & Rapporti/Clienti */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Wrench className="w-4 h-4 text-purple-600" /> Sessioni</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div><div className="text-xs text-gray-500">Totali</div><div className="text-xl font-bold">{stats.sessioni.totali}</div></div>
            <div><div className="text-xs text-gray-500">Mese</div><div className="text-xl font-bold">{stats.sessioni.mese}</div></div>
            <div><div className="text-xs text-gray-500">Oggi</div><div className="text-xl font-bold">{stats.sessioni.oggi}</div></div>
          </div>
          <div className="space-y-1">
            {Object.entries(stats.sessioni.by_status).map(([st, nn]) => (
              <div key={st} className="flex justify-between text-sm"><span className="text-gray-600">{STATUS_LABELS[st] || st}</span><span className="font-medium">{nn}</span></div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-600" /> Rapporti & Clienti</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><div className="text-xs text-gray-500">RDT totali</div><div className="text-xl font-bold">{stats.rdt.totali}</div><div className="text-xs text-gray-400">{stats.rdt.mese} questo mese</div></div>
            <div><div className="text-xs text-gray-500">Clienti totali</div><div className="text-xl font-bold flex items-center gap-1">{stats.clienti.totali}<Users className="w-4 h-4 text-gray-400" /></div><div className="text-xs text-gray-400">{stats.clienti.nuovi_mese} nuovi mese</div></div>
          </div>
          <div className="space-y-1">
            {Object.entries(stats.sessioni.by_payment).map(([ps, nn]) => (
              <div key={ps} className="flex justify-between text-sm"><span className="text-gray-600">Pagamento: {PAYMENT_LABELS[ps] || ps}</span><span className="font-medium">{nn}</span></div>
            ))}
          </div>
        </Card>
      </div>

      {/* Top strumenti e clienti */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Package className="w-4 h-4 text-orange-600" /> Top strumenti per ricavo</h3>
          {stats.top_strumenti.length === 0 ? <p className="text-sm text-gray-400">Nessun dato</p> :
            <HBars color={C.strumenti} items={stats.top_strumenti.map((s) => ({ label: s.name, value: s.revenue, sub: `${s.count} pz` }))} />}
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-purple-600" /> Top clienti per fatturato</h3>
          {stats.top_clienti.length === 0 ? <p className="text-sm text-gray-400">Nessun dato</p> :
            <HBars color={C.cumulato} items={stats.top_clienti.map((c) => ({ label: c.company_name, value: c.revenue, sub: `${c.sessions} sess` }))} />}
        </Card>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Clock className="w-3 h-3" /> Dati live al caricamento · fatturato = strumenti + spedizione (IVA incl.), solo sessioni registrate a sistema. Ricarica per aggiornare.
      </p>
    </div>
  );
}
