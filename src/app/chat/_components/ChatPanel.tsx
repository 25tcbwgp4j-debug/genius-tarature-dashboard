"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MoreVertical,
  Download,
  X,
  ChevronDown,
  AlertTriangle,
  Info,
  FileText,
} from "lucide-react";
import {
  listMessages,
  markRead,
  exportUrl,
  getContext,
  type ChatMessage,
  type ConversationContext,
  sourceBadge,
  initials,
  formatPhone,
} from "@/lib/chat-api";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { CustomerSidebar } from "./CustomerSidebar";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

function groupByDay(messages: ChatMessage[]) {
  const groups: { label: string; items: ChatMessage[] }[] = [];
  const today = new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  for (const m of messages) {
    const d = new Date(m.created_at);
    const ds = d.toDateString();
    let label = d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
    if (ds === today) label = "Oggi";
    else if (ds === yesterdayStr) label = "Ieri";
    const existing = groups.find((g) => g.label === label);
    if (existing) existing.items.push(m);
    else groups.push({ label, items: [m] });
  }
  return groups;
}

export function ChatPanel({
  phone,
  operatorEmail,
  onClose,
  onChanged,
}: {
  phone: string;
  operatorEmail?: string;
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; body: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const [msgs, ctx] = await Promise.all([
        listMessages(phone),
        getContext(phone).catch(() => null),
      ]);
      setMessages(msgs.messages);
      setContext(ctx);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Marca letti quando apro conversazione
  useEffect(() => {
    markRead(phone).catch(() => undefined);
  }, [phone]);

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, phone]);

  // Realtime subscription
  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const normalize = (p: string) => p.replace(/^\+/, "").replace(/\s+/g, "");
    const norm = normalize(phone);
    const channel = sb
      .channel(`chat-${norm}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `phone_number=eq.${norm}` },
        (payload: { new: ChatMessage }) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          if (payload.new.direction === "inbound") {
            markRead(phone).catch(() => undefined);
          }
          onChanged?.();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages", filter: `phone_number=eq.${norm}` },
        (payload: { new: ChatMessage }) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? payload.new : m)),
          );
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [phone, onChanged]);

  const groups = useMemo(() => groupByDay(messages), [messages]);

  const lastInbound = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === "inbound") return messages[i];
    }
    return null;
  }, [messages]);

  const hoursFromLastInbound = useMemo(() => {
    if (!lastInbound) return Infinity;
    return (Date.now() - new Date(lastInbound.created_at).getTime()) / 3600000;
  }, [lastInbound]);

  const outside24h = hoursFromLastInbound > 24;
  const nearWindowEdge = !outside24h && hoursFromLastInbound > 20;

  const customerName = (context?.customer?.company_name as string | undefined) || null;
  const displayName: string =
    context?.sender_name || customerName || formatPhone(phone);
  const badge = sourceBadge(context?.lead_source || "unknown");

  return (
    <div className="flex-1 flex min-w-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22><g fill=%22%23e5e7eb%22 fill-opacity=%220.4%22><circle cx=%2230%22 cy=%2230%22 r=%221.5%22/></g></svg>')] bg-gray-50">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 p-3 bg-white border-b border-gray-200 flex-shrink-0">
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1 rounded hover:bg-gray-100"
              aria-label="Chiudi"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-semibold text-sm">
            {initials(context?.sender_name || null, phone)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 truncate">{displayName}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.bg} ${badge.text} font-medium`}>
                {badge.label}
              </span>
            </div>
            <div className="text-xs text-gray-500">{formatPhone(phone)}</div>
          </div>
          <button
            onClick={() => setShowSidebar((v) => !v)}
            className="p-2 rounded hover:bg-gray-100 text-gray-600"
            title="Info cliente"
          >
            <Info className="w-5 h-5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="p-2 rounded hover:bg-gray-100 text-gray-600"
              aria-label="Menu"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-52 z-20">
                <a
                  href={exportUrl(phone, "txt")}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <Download className="w-4 h-4" />
                  Esporta conversazione (TXT)
                </a>
                <a
                  href={exportUrl(phone, "json")}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <FileText className="w-4 h-4" />
                  Esporta JSON
                </a>
                <button
                  onClick={() => {
                    loadMessages();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                >
                  <ChevronDown className="w-4 h-4" />
                  Ricarica messaggi
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 24h banner */}
        {outside24h && lastInbound && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Ultimo messaggio cliente oltre 24h fa — serve un template approvato Meta per scrivere.
          </div>
        )}
        {nearWindowEdge && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Finestra 24h in scadenza ({Math.ceil(24 - hoursFromLastInbound)}h rimanenti)
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="space-y-2 py-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
                >
                  <div className="w-48 h-10 bg-gray-200 rounded-2xl animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              Nessun messaggio ancora.
            </div>
          )}

          {!loading &&
            groups.map((g) => (
              <div key={g.label}>
                <div className="flex justify-center my-3">
                  <span className="text-[11px] bg-white/80 backdrop-blur px-3 py-1 rounded-full text-gray-600 shadow-sm">
                    {g.label}
                  </span>
                </div>
                {g.items.map((m) => (
                  <div key={m.id} className="group relative">
                    <MessageBubble msg={m} onImageClick={setLightboxUrl} />
                    {m.wa_message_id && (
                      <button
                        onClick={() => setReplyTo({ id: m.wa_message_id!, body: m.body })}
                        className="absolute top-1 right-2 opacity-0 group-hover:opacity-100 text-xs text-emerald-700 bg-white rounded px-2 py-0.5 shadow-sm border border-gray-200 transition"
                      >
                        Rispondi
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </div>

        <Composer
          phone={phone}
          disabled={outside24h}
          disabledReason="Ultima inbound > 24h"
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          onSent={() => {
            loadMessages();
            onChanged?.();
          }}
          operatorEmail={operatorEmail}
        />
      </div>

      {showSidebar && context && (
        <CustomerSidebar
          context={context}
          onClose={() => setShowSidebar(false)}
        />
      )}

      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
