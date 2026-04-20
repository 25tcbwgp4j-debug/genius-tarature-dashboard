"use client";

import { useState } from "react";
import { X, Plus, Trash2, Calculator } from "lucide-react";
import { sendQuote } from "@/lib/chat-api";

const COMMON_INSTRUMENTS = [
  "Manometro",
  "Termometro",
  "Igrometro",
  "Fonometro",
  "Rilevatore fughe",
  "Rilevatore gas",
  "Analizzatore combustione",
  "Pinza amperometrica",
  "Multimetro",
  "Luxmetro",
];

interface QuoteItem {
  type: string;
  qty: number;
}

export function SendQuoteModal({
  phone,
  operatorEmail,
  onClose,
}: {
  phone: string;
  operatorEmail?: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<QuoteItem[]>([{ type: "", qty: 1 }]);
  const [discount, setDiscount] = useState(0);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  function addItem() {
    setItems([...items, { type: "", qty: 1 }]);
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, patch: Partial<QuoteItem>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function send() {
    const valid = items.filter((it) => it.type.trim() && it.qty > 0);
    if (valid.length === 0) return alert("Aggiungi almeno uno strumento");
    setSending(true);
    try {
      const r = await sendQuote({
        phone,
        instruments: valid,
        discount_percent: discount,
        operator_email: operatorEmail,
      });
      setPreview(r.body);
      setTotal(r.total);
      if (r.ok) {
        setTimeout(onClose, 2500);
      }
    } catch (e) {
      alert(`Errore: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-600" />
            Preventivo rapido taratura
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {items.map((it, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                list={`instruments-${idx}`}
                value={it.type}
                onChange={(e) => updateItem(idx, { type: e.target.value })}
                placeholder="Tipo strumento"
                className="flex-1 p-2 bg-gray-50 rounded-lg text-sm outline-none"
              />
              <datalist id={`instruments-${idx}`}>
                {COMMON_INSTRUMENTS.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <input
                type="number"
                min={1}
                value={it.qty}
                onChange={(e) => updateItem(idx, { qty: parseInt(e.target.value) || 1 })}
                className="w-20 p-2 bg-gray-50 rounded-lg text-sm outline-none"
              />
              <button
                onClick={() => removeItem(idx)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            onClick={addItem}
            className="w-full flex items-center justify-center gap-1 p-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600"
          >
            <Plus className="w-4 h-4" /> Aggiungi strumento
          </button>

          <div className="flex items-center gap-2 pt-2 border-t">
            <label className="text-sm text-gray-600">Sconto %</label>
            <input
              type="number"
              min={0}
              max={100}
              value={discount}
              onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
              className="w-20 p-2 bg-gray-50 rounded-lg text-sm outline-none"
            />
          </div>

          {preview && (
            <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="text-xs font-semibold text-emerald-700 mb-1">✓ Preventivo inviato</div>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{preview}</pre>
              {total !== null && (
                <div className="text-sm font-semibold text-emerald-700 mt-1">
                  Totale: €{total.toFixed(2)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Chiudi
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
          >
            {sending ? "Invio..." : "Calcola e invia"}
          </button>
        </div>
      </div>
    </div>
  );
}
