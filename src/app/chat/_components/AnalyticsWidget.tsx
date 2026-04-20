"use client";

import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Clock, MessageCircle, MailCheck } from "lucide-react";
import { getAnalytics, formatDuration, type Analytics } from "@/lib/chat-api";

export function AnalyticsWidget() {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    getAnalytics(days)
      .then(setData)
      .catch(() => setData(null));
  }, [days]);

  if (!data) {
    return (
      <div className="p-4 animate-pulse bg-white rounded-xl border">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-8 bg-gray-200 rounded" />
      </div>
    );
  }

  const total = data.totals.inbound + data.totals.outbound;
  const ratio = data.totals.inbound > 0 ? data.totals.outbound / data.totals.inbound : 0;

  return (
    <div className="p-4 bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          Analytics chat
        </div>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="text-xs bg-gray-50 rounded px-2 py-1 outline-none"
        >
          <option value={7}>7 giorni</option>
          <option value={30}>30 giorni</option>
          <option value={90}>90 giorni</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
            <MessageCircle className="w-3 h-3" /> Ricevuti
          </div>
          <div className="text-2xl font-bold text-gray-900">{data.totals.inbound}</div>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
            <MailCheck className="w-3 h-3" /> Inviati
          </div>
          <div className="text-2xl font-bold text-gray-900">{data.totals.outbound}</div>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg col-span-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
            <Clock className="w-3 h-3" /> Tempo prima risposta medio
          </div>
          <div className="text-xl font-bold text-emerald-600">
            {formatDuration(data.sla_avg_seconds)}
          </div>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg col-span-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
            <TrendingUp className="w-3 h-3" /> Ratio risposte
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {ratio.toFixed(1)} outbound per inbound · totale {total} msg
          </div>
        </div>
      </div>
    </div>
  );
}
