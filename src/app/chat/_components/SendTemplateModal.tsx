"use client";

import { useEffect, useState } from "react";
import { X, Send, AlertCircle } from "lucide-react";
import { listMetaTemplates, sendMetaTemplate, type MetaTemplate } from "@/lib/chat-api";

export function SendTemplateModal({
  phone,
  customerName,
  onClose,
  onSent,
  operatorEmail,
}: {
  phone: string;
  customerName?: string | null;
  onClose: () => void;
  onSent: () => void;
  operatorEmail?: string;
}) {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMetaTemplates()
      .then((r) => {
        setTemplates(r.templates);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  const tpl = templates.find((t) => t.name === selected);

  // Pre-popola il primo parametro con customerName se presente
  useEffect(() => {
    if (tpl && customerName && tpl.params.length > 0 && !params[tpl.params[0]]) {
      setParams((p) => ({ ...p, [tpl.params[0]]: customerName }));
    }
  }, [selected, tpl, customerName, params]);

  async function handleSend() {
    if (!tpl) return;
    setError(null);
    setSending(true);
    try {
      const ordered = tpl.params.map((p) => params[p] || "");
      const res = await sendMetaTemplate({
        phone,
        template_name: tpl.name,
        parameters: ordered,
        language: "it",
        operator_email: operatorEmail,
      });
      if (!res.ok) {
        setError("Invio fallito. Verifica stato template su Meta Business.");
      } else {
        onSent();
        onClose();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">📤 Invia template WhatsApp</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="text-sm text-gray-600">
            I template sono gli unici messaggi che puoi inviare fuori dalla finestra 24h.
            Destinatario: <b>{phone}</b>
            {customerName ? <> — {customerName}</> : null}
          </div>

          {loading && <div className="text-sm text-gray-500">Caricamento template...</div>}

          {!loading && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Seleziona template
                </label>
                <select
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setParams({});
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">— scegli —</option>
                  {templates.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name} ({t.category})
                    </option>
                  ))}
                </select>
                {tpl && (
                  <p className="text-xs text-gray-500 mt-1">{tpl.description}</p>
                )}
              </div>

              {tpl && tpl.params.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Variabili template</div>
                  {tpl.params.map((p, i) => (
                    <div key={p}>
                      <label className="text-xs text-gray-600 mb-0.5 block">
                        {"{{" + (i + 1) + "}}"} — {p}
                      </label>
                      <input
                        type="text"
                        value={params[p] || ""}
                        onChange={(e) =>
                          setParams((prev) => ({ ...prev, [p]: e.target.value }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder={p}
                      />
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Annulla
          </button>
          <button
            onClick={handleSend}
            disabled={!tpl || sending}
            className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? "Invio..." : "Invia"}
          </button>
        </div>
      </div>
    </div>
  );
}
