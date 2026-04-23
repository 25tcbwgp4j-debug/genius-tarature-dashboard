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
  Sparkles,
  FilePlus,
  Calculator,
  UserPlus,
  Mail,
  Send,
} from "lucide-react";
import {
  listMessages,
  markRead,
  exportUrl,
  getContext,
  starMessage,
  aiSummarize,
  promoteLead,
  sendEmail,
  type ChatMessage,
  type ConversationContext,
  sourceBadge,
  initials,
  formatPhone,
} from "@/lib/chat-api";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { CustomerSidebar } from "./CustomerSidebar";
import { ConversationToolbar } from "./ConversationToolbar";
import { ForwardModal } from "./ForwardModal";
import { ScheduleSendModal } from "./ScheduleSendModal";
import { SendRDTModal } from "./SendRDTModal";
import { SendQuoteModal } from "./SendQuoteModal";
import { SendTemplateModal } from "./SendTemplateModal";
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
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showRdt, setShowRdt] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function handleStar(msg: ChatMessage) {
    const newStarred = !(msg as ChatMessage & { starred?: boolean }).starred;
    await starMessage(msg.id, newStarred);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? ({ ...m, starred: newStarred } as ChatMessage) : m,
      ),
    );
  }

  async function handleSummarize() {
    setSummaryLoading(true);
    try {
      const r = await aiSummarize(phone);
      setAiSummary(r.summary);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handlePromote() {
    try {
      const r = await promoteLead(phone);
      if (r.ok) {
        alert(r.already_customer ? "Già cliente" : "Promosso a cliente!");
        loadMessages();
      }
    } catch (e) {
      alert(`Errore: ${(e as Error).message}`);
    }
  }

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
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-56 z-20">
                <button
                  onClick={() => {
                    setShowRdt(true);
                    setShowMenu(false);
                  }}
                  disabled={!context?.customer_id}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left disabled:opacity-40"
                >
                  <FilePlus className="w-4 h-4 text-emerald-600" />
                  Invia RDT
                </button>
                <button
                  onClick={() => {
                    setShowQuote(true);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                >
                  <Calculator className="w-4 h-4 text-emerald-600" />
                  Invia preventivo
                </button>
                <button
                  onClick={() => {
                    setShowTemplate(true);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                >
                  <Send className="w-4 h-4 text-indigo-600" />
                  Invia template
                </button>
                {context?.lead_source && context.lead_source !== "customer" && context.lead_source !== "staff" && (
                  <button
                    onClick={() => {
                      handlePromote();
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                  >
                    <UserPlus className="w-4 h-4 text-purple-600" />
                    Promuovi a cliente
                  </button>
                )}
                {(context?.customer as { email?: string } | null)?.email && (
                  <button
                    onClick={() => {
                      setShowEmailModal(true);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                  >
                    <Mail className="w-4 h-4 text-blue-600" />
                    Rispondi via email
                  </button>
                )}
                <button
                  onClick={() => {
                    handleSummarize();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
                >
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  Riassumi conversazione
                </button>
                <div className="border-t my-1" />
                <a
                  href={exportUrl(phone, "txt")}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <Download className="w-4 h-4" />
                  Esporta (TXT)
                </a>
                <a
                  href={exportUrl(phone, "json")}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <FileText className="w-4 h-4" />
                  Esporta (JSON)
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

        <ConversationToolbar phone={phone} onChanged={onChanged} />

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
                    <MessageBubble
                      msg={m}
                      onImageClick={setLightboxUrl}
                      onStar={handleStar}
                      onForward={setForwardMsg}
                    />
                    {m.wa_message_id && !(m as ChatMessage & { internal_note?: boolean }).internal_note && (
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
          onRequestSchedule={() => setShowSchedule(true)}
          onRequestTemplate={() => setShowTemplate(true)}
        />
      </div>

      {/* AI Summary Panel */}
      {(aiSummary || summaryLoading) && (
        <div className="absolute top-20 left-4 right-4 lg:right-auto lg:w-96 bg-white rounded-xl shadow-xl border border-purple-200 p-4 z-30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 font-semibold text-sm text-purple-900">
              <Sparkles className="w-4 h-4" /> Riassunto AI
            </div>
            <button onClick={() => setAiSummary(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          {summaryLoading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-purple-100 rounded w-full" />
              <div className="h-3 bg-purple-100 rounded w-5/6" />
              <div className="h-3 bg-purple-100 rounded w-4/6" />
            </div>
          ) : (
            <div className="text-sm text-gray-700 whitespace-pre-wrap">{aiSummary}</div>
          )}
        </div>
      )}

      {showSidebar && context && (
        <CustomerSidebar
          context={context}
          onClose={() => setShowSidebar(false)}
          onChanged={() => {
            loadMessages();
            onChanged?.();
          }}
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

      {forwardMsg && (
        <ForwardModal
          sourceMessageId={forwardMsg.id}
          onClose={() => setForwardMsg(null)}
        />
      )}

      {showSchedule && (
        <ScheduleSendModal
          phone={phone}
          operatorEmail={operatorEmail}
          onClose={() => setShowSchedule(false)}
        />
      )}

      {showRdt && context && (
        <SendRDTModal
          phone={phone}
          operatorEmail={operatorEmail}
          context={context}
          onClose={() => {
            setShowRdt(false);
            loadMessages();
          }}
        />
      )}

      {showQuote && (
        <SendQuoteModal
          phone={phone}
          operatorEmail={operatorEmail}
          onClose={() => {
            setShowQuote(false);
            loadMessages();
          }}
        />
      )}

      {showTemplate && (
        <SendTemplateModal
          phone={phone}
          customerName={
            (context?.customer as { company_name?: string; first_name?: string } | null)?.company_name ||
            (context?.customer as { first_name?: string } | null)?.first_name ||
            null
          }
          operatorEmail={operatorEmail}
          onClose={() => setShowTemplate(false)}
          onSent={() => loadMessages()}
        />
      )}

      {showEmailModal && context?.customer && (
        <EmailQuickModal
          phone={phone}
          email={((context.customer as { email?: string }).email) || ""}
          operatorEmail={operatorEmail}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  );
}

function EmailQuickModal({
  phone,
  email,
  operatorEmail,
  onClose,
}: {
  phone: string;
  email: string;
  operatorEmail?: string;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      await sendEmail({ phone, subject, body, operator_email: operatorEmail });
      onClose();
    } catch (e) {
      alert(`Errore: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Rispondi via email
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-600">A</label>
            <div className="p-2 bg-gray-50 rounded-lg text-sm">{email}</div>
          </div>
          <div>
            <label className="text-xs text-gray-600">Oggetto</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full p-2 bg-gray-50 rounded-lg text-sm outline-none"
              placeholder="Genius S.R.L. — Risposta a Sua richiesta"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Messaggio</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full p-2 bg-gray-50 rounded-lg text-sm outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Annulla
            </button>
            <button
              onClick={send}
              disabled={!subject.trim() || !body.trim() || sending}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {sending ? "Invio..." : "Invia email"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
