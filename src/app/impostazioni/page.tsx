"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSettings, updateSettings, getInstrumentTypes } from "@/lib/api";
import { Settings, Loader2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [
  { key: "company_name", label: "Ragione sociale" },
  { key: "vat_number", label: "P.IVA" },
  { key: "tax_id", label: "Codice Fiscale" },
  { key: "address", label: "Indirizzo" },
  { key: "zip_code", label: "CAP" },
  { key: "city", label: "Citta" },
  { key: "province", label: "Provincia" },
  { key: "phone", label: "Telefono" },
  { key: "email", label: "Email" },
  { key: "calibration_email", label: "Email tarature" },
  { key: "pec", label: "PEC" },
  { key: "sdi_code", label: "Codice SDI" },
  { key: "iban", label: "IBAN" },
  { key: "bic", label: "BIC/SWIFT" },
  { key: "bank_name", label: "Banca" },
  { key: "paypal_email", label: "PayPal" },
  { key: "staff_whatsapp", label: "WhatsApp staff" },
];

export default function ImpostazioniPage() {
  const [settings, setSettings] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getSettings().catch(() => null),
      getInstrumentTypes().catch(() => ({ types: [] })),
    ])
      .then(([s, t]) => {
        setSettings(s);
        setTypes(t?.types || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const startEdit = () => {
    setEditData({ ...settings });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditData(null);
    setEditing(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings(editData);
      setSettings(updated);
      setEditing(false);
      setEditData(null);
      toast.success("Impostazioni salvate");
    } catch {
      toast.error("Errore nel salvataggio");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Impostazioni</h2>

      {settings && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Dati aziendali
            </h3>
            {!editing ? (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="w-4 h-4 mr-1" /> Modifica
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelEdit}>
                  <X className="w-4 h-4 mr-1" /> Annulla
                </Button>
                <Button size="sm" onClick={saveSettings} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                  Salva
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-gray-500 text-xs">{f.label}</label>
                {editing ? (
                  <Input
                    value={editData?.[f.key] || ""}
                    onChange={(e) => setEditData({ ...editData, [f.key]: e.target.value })}
                    className="h-8 text-sm"
                  />
                ) : (
                  <span className="font-medium">{settings[f.key] || "—"}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-3">Listino strumenti ({types.length} tipi)</h3>
        <div className="divide-y">
          {types.map((t) => (
            <div key={t.id} className="py-2 flex justify-between text-sm">
              <span>{t.code} - {t.name}</span>
              <span className="font-medium">EUR {parseFloat(t.price).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
