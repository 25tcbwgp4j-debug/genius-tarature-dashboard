"use client";

import { useEffect, useState } from "react";
import { Check, Archive, Clock, Tag, User, Flag, AlertCircle, X } from "lucide-react";
import {
  getConversationState,
  setConversationState,
  listTags,
  type ConversationState,
  type ChatTag,
} from "@/lib/chat-api";

const OPERATORS = [
  "—",
  "christian@avantifiori.it",
  "info@avantifiori.it",
  "staff@geniuslab.it",
];

export function ConversationToolbar({
  phone,
  onChanged,
}: {
  phone: string;
  onChanged?: () => void;
}) {
  const [state, setState] = useState<ConversationState | null>(null);
  const [tags, setTags] = useState<ChatTag[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);

  useEffect(() => {
    getConversationState(phone)
      .then((r) => setState(r.state))
      .catch(() => setState(null));
    listTags()
      .then((r) => setTags(r.tags))
      .catch(() => setTags([]));
  }, [phone]);

  type StateUpdate = Omit<Parameters<typeof setConversationState>[0], "phone">;
  async function update(data: StateUpdate) {
    const r = await setConversationState({ phone, ...data });
    setState(r.state);
    onChanged?.();
  }

  function snoozeFor(hours: number) {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    update({ snoozed_until: d.toISOString() });
    setShowSnooze(false);
  }

  function toggleTag(slug: string) {
    const current = state?.tags || [];
    const next = current.includes(slug) ? current.filter((t) => t !== slug) : [...current, slug];
    update({ tags: next });
  }

  const activeTags = state?.tags || [];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50 text-xs">
      {/* Assigned */}
      <div className="relative">
        <button
          onClick={() => setShowAssign((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white border border-transparent hover:border-gray-200"
          title="Assegna operatore"
        >
          <User className="w-3.5 h-3.5" />
          <span>{state?.assigned_to || "Non assegnato"}</span>
        </button>
        {showAssign && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border py-1 w-56 z-20">
            {OPERATORS.map((op) => (
              <button
                key={op}
                onClick={() => {
                  update({ assigned_to: op === "—" ? null : op });
                  setShowAssign(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2"
              >
                {state?.assigned_to === op && <Check className="w-3 h-3 text-emerald-600" />}
                <span className={state?.assigned_to === op ? "" : "ml-5"}>{op}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="relative">
        <button
          onClick={() => setShowTags((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white border border-transparent hover:border-gray-200"
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Tag</span>
          {activeTags.length > 0 && (
            <span className="bg-emerald-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center">
              {activeTags.length}
            </span>
          )}
        </button>
        {showTags && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border py-1 w-56 z-20 max-h-64 overflow-y-auto">
            {tags.map((t) => {
              const active = activeTags.includes(t.slug);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTag(t.slug)}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2"
                >
                  {active ? <Check className="w-3 h-3 text-emerald-600" /> : <span className="w-3" />}
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Active tags chips */}
      {activeTags.map((slug) => {
        const t = tags.find((x) => x.slug === slug);
        if (!t) return null;
        return (
          <span
            key={slug}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ backgroundColor: `${t.color}20`, color: t.color }}
          >
            {t.label}
            <button onClick={() => toggleTag(slug)} className="hover:opacity-70">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        );
      })}

      <div className="flex-1" />

      {/* Priority */}
      <button
        onClick={() => update({ priority: state?.priority === 1 ? 0 : 1 })}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white border border-transparent hover:border-gray-200 ${
          state?.priority === 1 ? "text-red-600" : ""
        }`}
        title="Imposta priorità alta"
      >
        <Flag className={`w-3.5 h-3.5 ${state?.priority === 1 ? "fill-current" : ""}`} />
      </button>

      {/* Snooze */}
      <div className="relative">
        <button
          onClick={() => setShowSnooze((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white border border-transparent hover:border-gray-200 ${
            state?.snoozed_until ? "text-amber-600" : ""
          }`}
          title="Snooze"
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
        {showSnooze && (
          <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border py-1 w-48 z-20">
            {state?.snoozed_until && (
              <button
                onClick={() => {
                  update({ snoozed_until: null });
                  setShowSnooze(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-red-600"
              >
                Rimuovi snooze
              </button>
            )}
            <button onClick={() => snoozeFor(1)} className="w-full text-left px-3 py-1.5 hover:bg-gray-50">
              1 ora
            </button>
            <button onClick={() => snoozeFor(4)} className="w-full text-left px-3 py-1.5 hover:bg-gray-50">
              4 ore
            </button>
            <button onClick={() => snoozeFor(24)} className="w-full text-left px-3 py-1.5 hover:bg-gray-50">
              Domani
            </button>
            <button onClick={() => snoozeFor(24 * 7)} className="w-full text-left px-3 py-1.5 hover:bg-gray-50">
              La prossima settimana
            </button>
          </div>
        )}
      </div>

      {/* Archive */}
      <button
        onClick={() => update({ archived: !state?.archived })}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white border border-transparent hover:border-gray-200 ${
          state?.archived ? "text-purple-600" : ""
        }`}
        title={state?.archived ? "Riapri" : "Archivia"}
      >
        <Archive className="w-3.5 h-3.5" />
      </button>

      {/* SLA */}
      {state?.first_response_time_seconds !== null && state?.first_response_time_seconds !== undefined && (
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500" title="Tempo prima risposta">
          <AlertCircle className="w-3 h-3" />
          {Math.round(state.first_response_time_seconds / 60)}m
        </span>
      )}
    </div>
  );
}
