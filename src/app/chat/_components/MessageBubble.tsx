"use client";

import { Check, CheckCheck, AlertTriangle, FileText, Download } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-api";

function StatusTicks({ msg }: { msg: ChatMessage }) {
  if (msg.direction !== "outbound") return null;
  if (msg.status === "failed")
    return <AlertTriangle className="w-3.5 h-3.5 text-red-500" aria-label="Fallito" />;
  if (msg.status === "read")
    return <CheckCheck className="w-3.5 h-3.5 text-blue-500" aria-label="Letto" />;
  if (msg.status === "delivered")
    return <CheckCheck className="w-3.5 h-3.5 text-gray-400" aria-label="Consegnato" />;
  return <Check className="w-3.5 h-3.5 text-gray-400" aria-label="Inviato" />;
}

export function MessageBubble({ msg, onImageClick }: { msg: ChatMessage; onImageClick?: (url: string) => void }) {
  const isOut = msg.direction === "outbound";
  const time = new Date(msg.created_at).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-1`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 shadow-sm ${
          isOut
            ? "bg-emerald-100 text-gray-900 rounded-br-sm"
            : "bg-white text-gray-900 rounded-bl-sm"
        }`}
      >
        {msg.operator_email && isOut && (
          <div className="text-[10px] text-emerald-700 font-medium mb-0.5">
            {msg.operator_email}
          </div>
        )}

        {msg.message_type === "image" && msg.media_url && (
          <button
            onClick={() => onImageClick?.(msg.media_url!)}
            className="block mb-1 rounded-lg overflow-hidden max-w-xs"
          >
            <img
              src={msg.media_url}
              alt={msg.body || "immagine"}
              className="w-full h-auto hover:opacity-95 transition"
            />
          </button>
        )}

        {msg.message_type === "document" && msg.media_url && (
          <a
            href={msg.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 mb-1 rounded-lg bg-white/60 hover:bg-white transition"
          >
            <FileText className="w-5 h-5 text-gray-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-900 truncate">
                {msg.media_filename || "Documento"}
              </div>
              {msg.media_size_bytes && (
                <div className="text-[10px] text-gray-500">
                  {(msg.media_size_bytes / 1024).toFixed(0)} KB
                </div>
              )}
            </div>
            <Download className="w-4 h-4 text-gray-500" />
          </a>
        )}

        {msg.message_type === "audio" && msg.media_url && (
          <audio controls src={msg.media_url} className="max-w-full" />
        )}

        {msg.message_type === "video" && msg.media_url && (
          <video controls src={msg.media_url} className="max-w-xs rounded-lg" />
        )}

        {msg.body && (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {msg.body}
          </div>
        )}

        <div
          className={`flex items-center gap-1 justify-end mt-1 text-[10px] ${
            isOut ? "text-gray-500" : "text-gray-400"
          }`}
        >
          <span>{time}</span>
          <StatusTicks msg={msg} />
        </div>
      </div>
    </div>
  );
}
