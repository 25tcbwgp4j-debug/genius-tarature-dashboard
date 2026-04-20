"use client";

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Megaphone, Users, FileText, Check, Send } from "lucide-react";
import { createBroadcast, sendBroadcast, type Broadcast } from "@/lib/chat-api";

type Step = 1 | 2 | 3 | 4;

export function BroadcastWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("customer");
  const [city, setCity] = useState("");
  const [body, setBody] = useState("");
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [preview, setPreview] = useState<{ count: number; sample: Array<Record<string, unknown>> } | null>(null);
  const [sending, setSending] = useState(false);

  async function goToPreview() {
    if (!title.trim() || !body.trim()) return;
    try {
      const r = await createBroadcast({
        title,
        segment: { source, ...(city.trim() ? { city } : {}) },
        body,
      });
      setBroadcast(r.broadcast);
      setPreview({ count: r.preview_count, sample: r.preview_sample });
      setStep(4);
    } catch (e) {
      alert(`Errore: ${(e as Error).message}`);
    }
  }

  async function confirmSend() {
    if (!broadcast) return;
    setSending(true);
    try {
      const r = await sendBroadcast(broadcast.id);
      alert(`Programmati ${r.scheduled} messaggi su ${r.total} target. Verranno spediti scaglionati.`);
      onClose();
    } catch (e) {
      alert(`Errore: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  const steps = [
    { n: 1, label: "Titolo", icon: Megaphone },
    { n: 2, label: "Segment", icon: Users },
    { n: 3, label: "Messaggio", icon: FileText },
    { n: 4, label: "Conferma", icon: Check },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-purple-600" />
            Nuovo Broadcast
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50 overflow-x-auto">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2 text-xs">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  step >= s.n ? "bg-purple-500 text-white" : "bg-gray-200 text-gray-400"
                }`}
              >
                <s.icon className="w-3.5 h-3.5" />
              </div>
              <span className={step >= s.n ? "font-medium" : "text-gray-400"}>{s.label}</span>
              {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-3">
              <h4 className="font-medium">Titolo campagna</h4>
              <p className="text-sm text-gray-500">
                Un nome interno per ritrovare la campagna (non visibile ai destinatari).
              </p>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es: Reminder scadenze aprile 2026"
                className="w-full p-3 bg-gray-50 rounded-lg outline-none"
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h4 className="font-medium">Segmento destinatari</h4>
              <p className="text-sm text-gray-500">A chi inviare il messaggio.</p>
              <div className="space-y-2">
                {[
                  { v: "customer", l: "Clienti registrati (customers)", icon: "🟢" },
                  { v: "fgas", l: "Prospect F-GAS (albo pubblico)", icon: "🔵" },
                  { v: "cold", l: "Cold leads (Places)", icon: "🟣" },
                ].map((s) => (
                  <label
                    key={s.v}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
                      source === s.v ? "border-purple-500 bg-purple-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={source === s.v}
                      onChange={() => setSource(s.v)}
                    />
                    <span className="text-xl">{s.icon}</span>
                    <span className="text-sm font-medium">{s.l}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="text-xs text-gray-600">Filtro città (opzionale)</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Es: Roma"
                  className="mt-1 w-full p-2 bg-gray-50 rounded-lg text-sm outline-none"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h4 className="font-medium">Messaggio</h4>
              <p className="text-sm text-gray-500">
                Solo testo. Ricorda: regola 24h Meta — questo broadcast funziona per contatti che hanno scritto nelle ultime 24h oppure richiede template approvato.
              </p>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="Gentile cliente, La informiamo che..."
                className="w-full p-3 bg-gray-50 rounded-lg outline-none text-sm"
              />
              <div className="text-xs text-gray-400">{body.length} caratteri</div>
            </div>
          )}

          {step === 4 && preview && (
            <div className="space-y-4">
              <h4 className="font-medium">Anteprima campagna</h4>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="text-sm">
                  <strong>{preview.count}</strong> destinatari trovati
                </div>
                <div className="text-xs text-gray-500 mt-1">Segment: {source}{city && ` · ${city}`}</div>
              </div>
              <div>
                <h5 className="text-xs font-semibold text-gray-600 mb-2">Campione (primi 5)</h5>
                <ul className="text-xs space-y-1">
                  {preview.sample.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-gray-400">{i + 1}.</span>
                      <span>{String(s.name || "-")}</span>
                      <span className="text-gray-400">· {String(s.phone_number)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <h5 className="text-xs font-semibold text-gray-600 mb-1">Messaggio</h5>
                <pre className="text-xs whitespace-pre-wrap font-sans">{body}</pre>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                ⚠️ Cliccando &quot;Invia&quot; i messaggi verranno programmati scaglionati (2s per target) per evitare throttling Meta. Puoi monitorare l&apos;avanzamento dalla lista broadcasts.
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t gap-2">
          <button
            onClick={() => (step > 1 ? setStep((step - 1) as Step) : onClose())}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? "Annulla" : "Indietro"}
          </button>
          {step < 3 && (
            <button
              onClick={() => setStep((step + 1) as Step)}
              disabled={step === 1 && !title.trim()}
              className="px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1"
            >
              Avanti <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 3 && (
            <button
              onClick={goToPreview}
              disabled={!body.trim()}
              className="px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1"
            >
              Calcola destinatari <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 4 && (
            <button
              onClick={confirmSend}
              disabled={sending}
              className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1"
            >
              <Send className="w-4 h-4" />
              {sending ? "Invio..." : "Avvia broadcast"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
