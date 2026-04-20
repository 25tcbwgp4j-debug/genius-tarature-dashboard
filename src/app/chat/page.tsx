"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { ConversationsList } from "./_components/ConversationsList";
import { ChatPanel } from "./_components/ChatPanel";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { ChatMessage } from "@/lib/chat-api";

export default function ChatPage() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Subscribe globale per aggiornare la lista conversazioni su qualsiasi nuovo msg
  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const channel = sb
      .channel("chat-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (_payload: { new: ChatMessage }) => {
          bumpRefresh();
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [bumpRefresh]);

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
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-gradient-to-br from-gray-50 to-gray-100">
          <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
            <MessageSquare className="w-12 h-12 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Chat WhatsApp Genius Tarature
          </h2>
          <p className="text-sm text-gray-500 max-w-sm">
            Seleziona una conversazione a sinistra per visualizzare i messaggi, rispondere ai
            clienti e inviare allegati direttamente dalla dashboard.
          </p>
        </div>
      )}
    </div>
  );
}
