"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Circle } from "lucide-react";
import {
  listConversations,
  type Conversation,
  sourceBadge,
  initials,
  formatTime,
  formatPhone,
} from "@/lib/chat-api";

type Filter = "all" | "customer" | "fgas" | "cold" | "staff" | "unknown" | "unread";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tutti" },
  { id: "unread", label: "Non letti" },
  { id: "customer", label: "Clienti" },
  { id: "fgas", label: "F-GAS" },
  { id: "cold", label: "Lead" },
  { id: "staff", label: "Staff" },
  { id: "unknown", label: "Sconosciuti" },
];

export function ConversationsList({
  selectedPhone,
  onSelect,
  refreshKey,
}: {
  selectedPhone: string | null;
  onSelect: (phone: string) => void;
  refreshKey: number;
}) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const source = filter === "unread" ? undefined : filter === "all" ? undefined : filter;
    const unreadOnly = filter === "unread";
    listConversations({ source, search: search || undefined, unreadOnly })
      .then((res) => setConvs(res.conversations))
      .catch(() => setConvs([]))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [filter, search, refreshKey]);

  const totalUnread = useMemo(
    () => convs.reduce((s, c) => s + (c.unread_count || 0), 0),
    [convs],
  );

  return (
    <aside className="w-[360px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Chat{" "}
            {totalUnread > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500 text-white text-xs px-2 py-0.5">
                {totalUnread}
              </span>
            )}
          </h2>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome o numero..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 rounded-lg border border-transparent focus:border-gray-300 focus:bg-white outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                filter === f.id
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && convs.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500">
            <Filter className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            Nessuna conversazione
          </div>
        )}

        {!loading &&
          convs.map((c) => {
            const badge = sourceBadge(c.lead_source);
            const isActive = selectedPhone === c.phone_number;
            const displayName = c.sender_name || formatPhone(c.phone_number);
            const preview = c.last_message_body
              ? c.last_direction === "outbound"
                ? `Tu: ${c.last_message_body}`
                : c.last_message_body
              : `[${c.last_message_type}]`;

            return (
              <button
                key={c.phone_number}
                onClick={() => onSelect(c.phone_number)}
                className={`w-full flex items-start gap-3 p-3 hover:bg-gray-50 border-b border-gray-100 transition text-left ${
                  isActive ? "bg-emerald-50 hover:bg-emerald-50" : ""
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                  {initials(c.sender_name, c.phone_number)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900 truncate">{displayName}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatTime(c.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-sm text-gray-600 truncate">{preview}</p>
                    {c.unread_count > 0 && (
                      <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold rounded-full bg-emerald-500 text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.bg} ${badge.text} font-medium`}>
                      {badge.label}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {formatPhone(c.phone_number)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </aside>
  );
}
