"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, X, FileText as FileIcon, Zap, Sparkles, StickyNote, Clock, MessageSquare } from "lucide-react";
import {
  sendText,
  sendMedia,
  listTemplates,
  aiSuggest,
  addInternalNote,
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
  onRequestSchedule,
  onRequestTemplate,
}: {
  phone: string;
  disabled?: boolean;
  disabledReason?: string;
  replyTo?: { id: string; body: string | null } | null;
  onClearReply?: () => void;
  onSent?: () => void;
  operatorEmail?: string;
  onRequestSchedule?: () => void;
  onRequestTemplate?: () => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<ChatTemplate[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAISuggest() {
    setAiLoading(true);
    try {
      const r = await aiSuggest(phone);
      if (r.suggestion) {
        setText(r.suggestion);
        textareaRef.current?.focus();
      } else {
        alert("Nessun suggerimento disponibile");
      }
    } catch (e) {
      alert(`Errore AI: ${(e as Error).message}`);
    } finally {
      setAiLoading(false);
    }
  }

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
    if (sending) return;
    if (!text.trim() && !file) return;
    setSending(true);
    try {
      if (noteMode) {
        // Salva come nota interna
        await addInternalNote({
          phone,
          body: text.trim(),
          operator_email: operatorEmail,
        });
        setText("");
        setNoteMode(false);
        onSent?.();
        return;
      }
      if (disabled) return;
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

  // Se fuori 24h e NON in note mode, mostra pulsante Invia template + nota interna
  if (disabled && !noteMode) {
    return (
      <div className="border-t border-gray-200 bg-amber-50 p-3 flex flex-col gap-2">
        <div className="text-xs text-amber-800 flex items-center gap-2">
          <span>ℹ️</span>
          <span>
            <strong>Fuori dalla finestra 24h Meta.</strong>{" "}
            Puoi inviare un <strong>template approvato</strong> oppure aggiungere una nota interna.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRequestTemplate}
            disabled={!onRequestTemplate}
            className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2 shadow-sm"
          >
            <MessageSquare className="w-4 h-4" /> Invia template
          </button>
          <button
            onClick={() => setNoteMode(true)}
            className="px-3 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 flex items-center gap-1.5"
            title="Nota interna"
          >
            <StickyNote className="w-4 h-4" /> Nota
          </button>
        </div>
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

      {noteMode && (
        <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-800 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" />
            Modalità nota interna — solo staff vedrà questo testo
          </span>
          <button
            onClick={() => setNoteMode(false)}
            className="text-yellow-900 hover:underline"
          >
            Annulla
          </button>
        </div>
      )}

      <div className="flex items-end gap-1 p-3">
        <button
          onClick={() => setShowTemplates((v) => !v)}
          className={`p-2 rounded-full hover:bg-gray-100 text-gray-500 ${showTemplates ? "bg-emerald-50 text-emerald-600" : ""}`}
          title="Template rapidi"
        >
          <Zap className="w-5 h-5" />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={noteMode}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500 disabled:opacity-30"
          title="Allega file"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <button
          onClick={handleAISuggest}
          disabled={aiLoading}
          className="p-2 rounded-full hover:bg-purple-50 text-purple-600"
          title="Suggerisci risposta AI"
        >
          <Sparkles className={`w-5 h-5 ${aiLoading ? "animate-pulse" : ""}`} />
        </button>
        <button
          onClick={() => setNoteMode((v) => !v)}
          className={`p-2 rounded-full hover:bg-yellow-50 text-gray-500 ${noteMode ? "bg-yellow-100 text-yellow-700" : ""}`}
          title="Nota interna (non inviata al cliente)"
        >
          <StickyNote className="w-5 h-5" />
        </button>
        <button
          onClick={onRequestSchedule}
          disabled={noteMode}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500 disabled:opacity-30"
          title="Invio programmato"
        >
          <Clock className="w-5 h-5" />
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
          placeholder={
            noteMode
              ? "Nota interna (solo staff)..."
              : file
                ? "Aggiungi una didascalia..."
                : "Scrivi un messaggio..."
          }
          rows={1}
          className={`flex-1 resize-none rounded-2xl px-4 py-2 text-sm outline-none border max-h-40 ${
            noteMode
              ? "bg-yellow-50 border-yellow-300 focus:border-yellow-400"
              : "bg-gray-50 border-transparent focus:border-gray-300 focus:bg-white"
          }`}
        />
        <button
          onClick={handleSend}
          disabled={sending || (!text.trim() && !file)}
          className={`p-2 rounded-full text-white disabled:bg-gray-300 transition ${
            noteMode ? "bg-yellow-500 hover:bg-yellow-600" : "bg-emerald-500 hover:bg-emerald-600"
          }`}
          title={noteMode ? "Salva nota" : "Invia (Enter)"}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
