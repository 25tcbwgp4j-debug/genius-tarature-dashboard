"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity, CheckCircle2, AlertTriangle, Clock, Mail, RefreshCw,
  TrendingUp, AlertCircle, PauseCircle, Send, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getAutomationDailyLog, dispatchEmailNow } from "@/lib/api";

interface DayLog {
  date: string;
  scadenzario_sent: number;
  prospect_sent: number;
  errors: number;
  total_sent: number;
  batches_estimated: number;
  first_at: string | null;
  last_at: string | null;
  hours_active: string[];
  by_type: Record<string, number>;
  errors_detail: { type: string; recipient: string | null; error: string }[];
}

interface AutomationData {
  system_health: "healthy" | "warning" | "idle";
  health_message: string;
  quota_today: {
    daily_cap: number;
    sent_today_total: number;
    sent_today_scadenzario: number;
    sent_today_prospect: number;
    scadenzario_quota: number;
    prospect_quota: number;
    remaining_total: number;
  };
  pending: { scadenzario: number; prospect: number; total: number };
  last_log_at: string | null;
  last_log_type: string | null;
  daily_log: DayLog[];
}

const TYPE_LABELS: Record<string, string> = {
  expiry_email: "Scadenza oggi",
  expiry_7d_email: "Scadenza 7gg",
  expiry_30d_email: "Scadenza 30gg",
  expiry_60d_email: "Scadenza 60gg",
  prospect_marketing: "Prospect FGAS",
};

function formatDateIT(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleTimeString("it-IT", {
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "mai";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "adesso";
  if (m < 60) return `${m} min fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ore fa`;
  const d = Math.floor(h / 24);
  return `${d} giorni fa`;
}

export default function AutomazioniPage() {
  const [data, setData] = useState<AutomationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [dispatching, setDispatching] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getAutomationDailyLog(days));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore caricamento log";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60000);
    return () => clearInterval(id);
  }, [fetchData]);

  const handleDispatchNow = async () => {
    setDispatching(true);
    try {
      const r = await dispatchEmailNow();
      const sent = r.sent_in_batch ?? 0;
      const errors = r.errors_in_batch ?? 0;
      toast.success(`Batch eseguito: ${sent} inviate, ${errors} errori`);
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Errore dispatch";
      toast.error(msg);
    } finally {
      setDispatching(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!data) return null;

  const healthConfig = {
    healthy: { color: "green", icon: CheckCircle2, label: "Sistema operativo" },
    warning: { color: "amber", icon: AlertTriangle, label: "Attenzione" },
    idle: { color: "gray", icon: PauseCircle, label: "In standby" },
  }[data.system_health];
  const HealthIcon = healthConfig.icon;

  // Stima giorni a esaurimento (assumendo 80/giorno medio)
  const daysToCompletion = data.pending.total > 0
    ? Math.ceil(data.pending.total / data.quota_today.daily_cap)
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" />
            Automazioni
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Log giornaliero di tutte le attivita' automatiche del sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value={3}>Ultimi 3 giorni</option>
            <option value={7}>Ultimi 7 giorni</option>
            <option value={14}>Ultimi 14 giorni</option>
            <option value={30}>Ultimi 30 giorni</option>
          </select>
          <button onClick={fetchData} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleDispatchNow}
            disabled={dispatching}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Forza batch ora
          </button>
        </div>
      </div>

      {/* Health banner */}
      <div className={`rounded-xl border-2 p-4 flex items-start gap-3 ${
        data.system_health === "healthy" ? "bg-green-50 border-green-200" :
        data.system_health === "warning" ? "bg-amber-50 border-amber-200" :
        "bg-gray-50 border-gray-200"
      }`}>
        <HealthIcon className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
          data.system_health === "healthy" ? "text-green-600" :
          data.system_health === "warning" ? "text-amber-600" : "text-gray-500"
        }`} />
        <div className="flex-1">
          <div className="font-semibold text-gray-900">{healthConfig.label}</div>
          <div className="text-sm text-gray-600 mt-0.5">{data.health_message}</div>
          {data.last_log_at && (
            <div className="text-xs text-gray-500 mt-1">
              Ultima attivita': {timeAgo(data.last_log_at)} ({TYPE_LABELS[data.last_log_type || ""] || data.last_log_type})
            </div>
          )}
        </div>
      </div>

      {/* KPI top */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Mail className="w-4 h-4" /> Inviate oggi
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {data.quota_today.sent_today_total}
            <span className="text-base font-normal text-gray-400">/{data.quota_today.daily_cap}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {data.quota_today.remaining_total} email residue oggi
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
            <Clock className="w-4 h-4" /> Scadenzario oggi
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {data.quota_today.sent_today_scadenzario}
            <span className="text-base font-normal text-gray-400">/{data.quota_today.scadenzario_quota}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {data.pending.scadenzario} in coda
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-purple-600 text-sm mb-1">
            <TrendingUp className="w-4 h-4" /> Prospect oggi
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {data.quota_today.sent_today_prospect}
            <span className="text-base font-normal text-gray-400">/{data.quota_today.prospect_quota}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {data.pending.prospect} in coda
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
            <AlertCircle className="w-4 h-4" /> Stima completamento
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {daysToCompletion === 0 ? "—" : `${daysToCompletion} gg`}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            a {data.quota_today.daily_cap}/giorno per {data.pending.total} pendenti
          </div>
        </div>
      </div>

      {/* Tabella daily log */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-gray-900">Log giornaliero attivita'</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Ogni riga mostra cosa il sistema ha fatto in automatico quel giorno (cron 09:00-17:30 ogni 30 min)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Giorno</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Totale</th>
                <th className="text-right px-4 py-2 font-medium text-orange-600">Scadenzario</th>
                <th className="text-right px-4 py-2 font-medium text-purple-600">Prospect</th>
                <th className="text-right px-4 py-2 font-medium text-red-600">Errori</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Batch ~</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Primo</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Ultimo</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Tipi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.daily_log.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    Nessuna attivita' registrata negli ultimi {days} giorni.
                    {data.pending.total > 0 && (
                      <div className="text-amber-600 mt-2 text-sm">
                        ⚠️ Attenzione: ci sono {data.pending.total} email pendenti ma il sistema non ha inviato nulla. Verificare scheduler Railway.
                      </div>
                    )}
                  </td>
                </tr>
              ) : data.daily_log.map((d) => {
                const isToday = d.date === new Date().toISOString().slice(0, 10);
                return (
                  <tr key={d.date} className={isToday ? "bg-blue-50/40" : "hover:bg-gray-50"}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {formatDateIT(d.date)} {isToday && <span className="text-xs text-blue-600 ml-1">(oggi)</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{d.total_sent}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{d.scadenzario_sent}</td>
                    <td className="px-4 py-3 text-right text-purple-600">{d.prospect_sent}</td>
                    <td className={`px-4 py-3 text-right ${d.errors > 0 ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                      {d.errors}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">~{d.batches_estimated}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{formatTime(d.first_at)}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{formatTime(d.last_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(d.by_type).map(([t, n]) => (
                          <span key={t} className="inline-flex text-xs px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">
                            {TYPE_LABELS[t] || t}: {n}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Errori dettaglio (se presenti negli ultimi giorni) */}
      {data.daily_log.some(d => d.errors_detail.length > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> Errori recenti (max 5 per giorno)
          </h3>
          <div className="space-y-3">
            {data.daily_log.filter(d => d.errors_detail.length > 0).map(d => (
              <div key={d.date}>
                <div className="text-sm font-medium text-red-800">{formatDateIT(d.date)}</div>
                <ul className="mt-1 space-y-1">
                  {d.errors_detail.map((e, i) => (
                    <li key={i} className="text-xs text-red-700 font-mono">
                      [{TYPE_LABELS[e.type] || e.type}] {e.recipient || "n/a"} — {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info schedule */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        <div className="font-semibold mb-2">Come funziona l&apos;automazione</div>
        <ul className="space-y-1 text-blue-800">
          <li>• Lo scheduler Railway esegue il dispatcher <strong>ogni 30 minuti dalle 09:00 alle 17:30</strong> (Europe/Rome)</li>
          <li>• Ogni batch invia <strong>max 5 email</strong>, totale giornaliero <strong>cap a 80</strong> (margine sotto Resend 100/giorno)</li>
          <li>• Suddivisione: <strong>40 scadenzario + 40 prospect</strong> con sconfinamento automatico se uno e&apos; vuoto</li>
          <li>• Priorita&apos;: scadute oggi → 7gg → 30gg → 60gg → prospect FGAS</li>
          <li>• Idempotenza: solo a chi ha email e non e&apos; gia&apos; stato avvisato</li>
          <li>• Questa pagina si aggiorna automaticamente ogni 60 secondi</li>
        </ul>
      </div>
    </div>
  );
}
