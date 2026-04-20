"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, BarChart3, Megaphone } from "lucide-react";
import { ConversationsList } from "./_components/ConversationsList";
import { ChatPanel } from "./_components/ChatPanel";
import { AnalyticsWidget } from "./_components/AnalyticsWidget";
import { CommandPalette, type Command } from "./_components/CommandPalette";
import { BroadcastWizard } from "./_components/BroadcastWizard";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { ChatMessage } from "@/lib/chat-api";

export default function ChatPage() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showPalette, setShowPalette] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const channel = sb
      .channel("chat-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        () => bumpRefresh(),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [bumpRefresh]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette(true);
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        // Avoid conflicts when typing in inputs
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          setShowPalette(true);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands: Command[] = useMemo(() => [
    {
      id: "analytics",
      label: "Apri Analytics",
      keywords: ["statistiche", "kpi", "sla"],
      action: () => setShowAnalytics(true),
    },
    {
      id: "broadcast",
      label: "Nuovo Broadcast",
      keywords: ["campagna", "invio massivo", "newsletter"],
      action: () => setShowBroadcast(true),
    },
    {
      id: "unselect",
      label: "Chiudi conversazione",
      shortcut: "Esc",
      action: () => setSelectedPhone(null),
    },
    {
      id: "refresh",
      label: "Ricarica",
      action: () => bumpRefresh(),
    },
  ], [bumpRefresh]);

  return (
    <div className="h-[calc(100vh-0px)] flex bg-gray-100 overflow-hidden">
      <ConversationsList
        selectedPhone={selectedPhone}
        onSelect={setSelectedPhone}
        refreshKey={refreshKey}
      />

      {selectedPhone ? (
        <ChatPanel
          key={selectedPhone}
          phone={selectedPhone}
          onClose={() => setSelectedPhone(null)}
          onChanged={bumpRefresh}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-gradient-to-br from-gray-50 to-gray-100 relative">
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={() => setShowAnalytics(true)}
              className="px-3 py-1.5 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 text-sm flex items-center gap-1.5 shadow-sm"
            >
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              Analytics
            </button>
            <button
              onClick={() => setShowBroadcast(true)}
              className="px-3 py-1.5 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 text-sm flex items-center gap-1.5 shadow-sm"
            >
              <Megaphone className="w-4 h-4 text-purple-600" />
              Broadcast
            </button>
          </div>

          <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
            <MessageSquare className="w-12 h-12 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Chat WhatsApp Genius Tarature
          </h2>
          <p className="text-sm text-gray-500 max-w-sm mb-6">
            Seleziona una conversazione o apri Analytics / Broadcast per azioni globali.
          </p>
          <p className="text-xs text-gray-400">
            Tip: premi <kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">Cmd</kbd>+
            <kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">K</kbd> per la command palette
          </p>
        </div>
      )}

      {showAnalytics && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setShowAnalytics(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              <AnalyticsWidget />
              <button
                onClick={() => setShowAnalytics(false)}
                className="mt-4 w-full py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {showBroadcast && <BroadcastWizard onClose={() => setShowBroadcast(false)} />}

      {showPalette && <CommandPalette commands={commands} onClose={() => setShowPalette(false)} />}
    </div>
  );
}
