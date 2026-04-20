"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.keywords?.some((k) => k.toLowerCase().includes(q)),
    );
  }, [query, commands]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const c = filtered[activeIdx];
        if (c) {
          c.action();
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, activeIdx, onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-center gap-2 p-3 border-b">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Cerca azione..."
            className="flex-1 text-sm outline-none"
          />
          <span className="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">esc</span>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="p-4 text-center text-sm text-gray-500">Nessuna azione</div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => {
                c.action();
                onClose();
              }}
              className={`w-full text-left px-3 py-2 flex items-center justify-between transition ${
                i === activeIdx ? "bg-emerald-50" : ""
              }`}
            >
              <span className="text-sm">{c.label}</span>
              {c.shortcut && (
                <span className="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded border">
                  {c.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
