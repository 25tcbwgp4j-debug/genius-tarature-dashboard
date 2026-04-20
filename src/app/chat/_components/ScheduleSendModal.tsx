"use client";

import { useState } from "react";
import { X, Clock, Calendar } from "lucide-react";
import { scheduleSend } from "@/lib/chat-api";

export function ScheduleSendModal({
  phone,
  operatorEmail,
  onClose,
}: {
  phone: string;
  operatorEmail?: string;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const now = new Date();
  now.setHours(now.getHours() + 1);
  const defaultDate = now.toISOString().slice(0, 16);
  const [when, setWhen] = useState(defaultDate);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await scheduleSend({
        phone,
        body: body.trim(),
        send_at: new Date(when).toISOString(),
        operator_email: operatorEmail,
      });
      onClose();
    } catch (e) {
      alert(`Errore: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            Invio programmato
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Messaggio da inviare..."
            rows={5}
            className="w-full p-3 bg-gray-50 rounded-lg outline-none text-sm"
          />
          <div>
            <label className="text-xs text-gray-600 flex items-center gap-1 mb-1">
              <Calendar className="w-3 h-3" /> Invia il
            </label>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full p-2 bg-gray-50 rounded-lg outline-none text-sm"
            />
          </div>
          <p className="text-xs text-gray-500 italic">
            Il sistema invierà automaticamente il messaggio all'ora indicata (precisione 1 min).
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Annulla
            </button>
            <button
              onClick={save}
              disabled={!body.trim() || saving}
              className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? "Salvo..." : "Programma"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
