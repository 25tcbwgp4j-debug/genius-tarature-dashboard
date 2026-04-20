"use client";

import { useState } from "react";
import { X, FileText } from "lucide-react";
import { sendRdt, type ConversationContext } from "@/lib/chat-api";

export function SendRDTModal({
  phone,
  operatorEmail,
  context,
  onClose,
}: {
  phone: string;
  operatorEmail?: string;
  context: ConversationContext;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(
    (context.recent_rdts?.[0] as Record<string, string>)?.id || "",
  );
  const [caption, setCaption] = useState(
    "Gentile cliente, in allegato il rapporto di taratura. Buona giornata.",
  );
  const [sending, setSending] = useState(false);

  const rdts = (context.recent_rdts || []) as Array<{
    id: string;
    rdt_number: string;
    instrument_type?: string;
    brand?: string;
    model?: string;
    issued_at?: string;
  }>;

  async function send() {
    if (!selectedId) return;
    setSending(true);
    try {
      const r = await sendRdt({ phone, rdt_id: selectedId, caption, operator_email: operatorEmail });
      if (!r.ok) alert("Invio fallito");
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
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            Invia RDT al cliente
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          {rdts.length === 0 ? (
            <div className="text-center p-6 text-sm text-gray-500">
              Nessun RDT trovato per questo cliente.
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-600">Seleziona RDT</label>
              <div className="mt-2 space-y-2">
                {rdts.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
                      selectedId === r.id
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={selectedId === r.id}
                      onChange={() => setSelectedId(r.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{r.rdt_number}</div>
                      <div className="text-xs text-gray-500">
                        {r.instrument_type}
                        {r.brand && ` · ${r.brand}`}
                        {r.model && ` ${r.model}`}
                      </div>
                      {r.issued_at && (
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Emesso: {r.issued_at.slice(0, 10)}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-600">Didascalia (opzionale)</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              className="mt-1 w-full p-2 bg-gray-50 rounded-lg text-sm outline-none"
            />
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Annulla
          </button>
          <button
            onClick={send}
            disabled={!selectedId || sending}
            className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
          >
            {sending ? "Invio..." : "Invia RDT"}
          </button>
        </div>
      </div>
    </div>
  );
}
