"use client";

import { useState } from "react";
import { X, UserPlus, Building2 } from "lucide-react";
import { registerCustomer, formatPhone } from "@/lib/chat-api";

export function RegisterCustomerModal({
  phone,
  prefillName,
  onClose,
  onRegistered,
}: {
  phone: string;
  prefillName?: string | null;
  onClose: () => void;
  onRegistered: (customer: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    company_name: prefillName || "",
    vat_number: "",
    tax_id: "",
    email: "",
    address: "",
    zip_code: "",
    city: "",
    province: "",
  });
  const [saving, setSaving] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.company_name.trim()) {
      alert("Ragione sociale obbligatoria");
      return;
    }
    setSaving(true);
    try {
      const r = await registerCustomer({ phone, ...form });
      if (r.ok) {
        onRegistered(r.customer);
        onClose();
      }
    } catch (e) {
      alert(`Errore: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600" />
            Registra nuovo cliente
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="p-2 bg-emerald-50 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            WhatsApp: <span className="font-semibold">{formatPhone(phone)}</span>
          </div>

          <div>
            <label className="text-xs text-gray-600">
              Ragione sociale <span className="text-red-500">*</span>
            </label>
            <input
              value={form.company_name}
              onChange={(e) => update("company_name", e.target.value)}
              className="mt-1 w-full p-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Es: Mario Rossi S.R.L."
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">P.IVA</label>
              <input
                value={form.vat_number}
                onChange={(e) => update("vat_number", e.target.value.replace(/\s/g, ""))}
                className="mt-1 w-full p-2 bg-gray-50 rounded-lg text-sm outline-none"
                placeholder="12345678901"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Codice fiscale</label>
              <input
                value={form.tax_id}
                onChange={(e) => update("tax_id", e.target.value.toUpperCase())}
                className="mt-1 w-full p-2 bg-gray-50 rounded-lg text-sm outline-none"
                placeholder="RSSMRA80A01H501U"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="mt-1 w-full p-2 bg-gray-50 rounded-lg text-sm outline-none"
              placeholder="info@azienda.it"
            />
          </div>

          <div>
            <label className="text-xs text-gray-600">Indirizzo</label>
            <input
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              className="mt-1 w-full p-2 bg-gray-50 rounded-lg text-sm outline-none"
              placeholder="Via Roma 1"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-600">CAP</label>
              <input
                value={form.zip_code}
                onChange={(e) => update("zip_code", e.target.value)}
                className="mt-1 w-full p-2 bg-gray-50 rounded-lg text-sm outline-none"
                placeholder="00100"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600">Città</label>
              <input
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                className="mt-1 w-full p-2 bg-gray-50 rounded-lg text-sm outline-none"
                placeholder="Roma"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600">Provincia (sigla)</label>
            <input
              value={form.province}
              onChange={(e) => update("province", e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              className="mt-1 w-24 p-2 bg-gray-50 rounded-lg text-sm outline-none"
              placeholder="RM"
            />
          </div>

          <p className="text-xs text-gray-500 italic pt-2 border-t">
            Dopo la registrazione tutti i messaggi esistenti con questo numero saranno collegati al nuovo cliente. Se esiste già un prospect F-GAS/cold con stessa P.IVA verrà promosso automaticamente.
          </p>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Annulla
          </button>
          <button
            onClick={save}
            disabled={!form.company_name.trim() || saving}
            className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? "Registro..." : "Registra cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}
