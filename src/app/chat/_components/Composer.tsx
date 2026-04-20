"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, X, FileText as FileIcon, Zap } from "lucide-react";
import {
  sendText,
  sendMedia,
  listTemplates,
  type ChatTemplate,
} from "@/lib/chat-api";

export function Composer({
  phone,
  disabled,
  disabledReason,
  replyTo,
  onClearReply,
  onSent,
  operatorEmail,
}: {
  phone: string;
  disabled?: boolean;
  disabledReason?: string;
  replyTo?: { id: string; body: string | null } | null;
  onClearReply?: () => void;
  onSent?: () => void;
  operatorEmail?: string;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<ChatTemplate[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listTemplates()
      .then((r) => setTemplates(r.templates))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [file]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [text]);

  // Paste image from clipboard
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) {
            setFile(f);
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  async function handleSend() {
    if (sending || disabled) return;
    if (!text.trim() && !file) return;
    setSending(true);
    try {
      if (file) {
        const res = await sendMedia({
          phone,
          file,
          caption: text.trim() || undefined,
          operator_email: operatorEmail,
        });
        if (!res.ok && res.reason === "outside_24h_window") {
          alert("Fuori dalla finestra 24h Meta. Serve template approvato.");
        }
        setFile(null);
      } else {
        const res = await sendText({
          phone,
          text: text.trim(),
          operator_email: operatorEmail,
          reply_to_wa_id: replyTo?.id,
        });
        if (!res.ok && res.reason === "outside_24h_window") {
          alert("Fuori dalla finestra 24h Meta. Serve template approvato.");
        }
      }
      setText("");
      onClearReply?.();
      onSent?.();
    } catch (e: unknown) {
      const err = e as Error;
      alert(`Errore invio: ${err.message || String(e)}`);
    } finally {
      setSending(false);
    }
  }

  function onTextKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function applyTemplate(t: ChatTemplate) {
    setText((prev) => (prev ? prev + "\n\n" + t.body : t.body));
    setShowTemplates(false);
    textareaRef.current?.focus();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  if (disabled) {
    return (
      <div className="border-t border-gray-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Messaggio diretto disabilitato.</strong>{" "}
        {disabledReason || "Fuori dalla finestra 24h — invia un template approvato Meta."}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`relative border-t border-gray-200 bg-white ${dragOver ? "ring-2 ring-emerald-400 ring-inset" : ""}`}
    >
      {dragOver && (
        <div className="absolute inset-0 bg-emerald-50/90 flex items-center justify-center pointer-events-none z-10">
          <div className="text-emerald-700 font-medium">Rilascia il file per allegarlo</div>
        </div>
      )}

      {replyTo && (
        <div className="px-4 pt-3 flex items-start gap-2 bg-gray-50 border-b border-gray-100">
          <div className="flex-1 min-w-0 border-l-4 border-emerald-500 pl-2 py-1">
            <div className="text-[10px] text-emerald-700 font-medium">In risposta a</div>
            <div className="text-xs text-gray-600 truncate">
              {replyTo.body || "(allegato)"}
            </div>
          </div>
          <button onClick={onClearReply} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {file && (
        <div className="px-4 pt-3 flex items-center gap-3">
          {preview ? (
            <img src={preview} alt="" className="w-16 h-16 object-cover rounded-lg border" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
              <FileIcon className="w-6 h-6 text-gray-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{file.name}</div>
            <div className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <button
            onClick={() => setFile(null)}
            className="p-1 rounded hover:bg-gray-100"
            aria-label="Rimuovi allegato"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      )}

      {showTemplates && (
        <div className="px-4 pt-2 border-b border-gray-100 max-h-48 overflow-y-auto">
          {templates.length === 0 && (
            <div className="text-xs text-gray-500 py-2">Nessun template disponibile</div>
          )}
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t)}
              className="w-full text-left px-2 py-2 hover:bg-emerald-50 rounded"
            >
              <div className="text-sm font-medium text-gray-900">{t.title}</div>
              <div className="text-xs text-gray-500 truncate">{t.body}</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <button
          onClick={() => setShowTemplates((v) => !v)}
          className={`p-2 rounded-full hover:bg-gray-100 text-gray-500 ${showTemplates ? "bg-emerald-50 text-emerald-600" : ""}`}
          title="Template rapidi"
        >
          <Zap className="w-5 h-5" />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
          title="Allega file"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
          }}
        />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onTextKeyDown}
          placeholder={file ? "Aggiungi una didascalia..." : "Scrivi un messaggio..."}
          rows={1}
          className="flex-1 resize-none bg-gray-50 rounded-2xl px-4 py-2 text-sm outline-none border border-transparent focus:border-gray-300 focus:bg-white max-h-40"
        />
        <button
          onClick={handleSend}
          disabled={sending || (!text.trim() && !file)}
          className="p-2 rounded-full bg-emerald-500 text-white disabled:bg-gray-300 hover:bg-emerald-600 transition"
          title="Invia (Enter)"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
