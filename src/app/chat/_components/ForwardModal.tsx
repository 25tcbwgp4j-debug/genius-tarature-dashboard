"use client";

import { useEffect, useState } from "react";
import { X, Search } from "lucide-react";
import {
  listConversations,
  forwardMessage,
  type Conversation,
  formatPhone,
  initials,
} from "@/lib/chat-api";

export function ForwardModal({
  sourceMessageId,
  onClose,
}: {
  sourceMessageId: string;
  onClose: () => void;
}) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    listConversations({ search: query || undefined })
      .then((r) => setConvs(r.conversations))
      .catch(() => undefined);
  }, [query]);

  async function forward(phone: string) {
    setSending(phone);
    try {
      await forwardMessage({ source_message_id: sourceMessageId, to_phone: phone });
      onClose();
    } catch (e) {
      alert(`Errore forward: ${(e as Error).message}`);
    } finally {
      setSending(null);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Inoltra messaggio</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca conversazione..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 rounded-lg outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-500">Nessuna conversazione</div>
          )}
          {convs.map((c) => (
            <button
              key={c.phone_number}
              onClick={() => forward(c.phone_number)}
              disabled={!!sending}
              className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-b disabled:opacity-50 text-left"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-semibold">
                {initials(c.sender_name, c.phone_number)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.sender_name || formatPhone(c.phone_number)}</div>
                <div className="text-xs text-gray-500">{formatPhone(c.phone_number)}</div>
              </div>
              {sending === c.phone_number && (
                <span className="text-xs text-emerald-600">Invio...</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
