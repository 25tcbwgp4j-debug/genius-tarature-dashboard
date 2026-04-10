"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getSettings,
  updateSettings,
  getInstrumentTypes,
  createInstrumentType,
  updateInstrumentType,
  deleteInstrumentType,
} from "@/lib/api";
import { Settings, Loader2, Pencil, Save, X, Plus, Trash2 } from "lucide-react";
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

interface InstrumentType {
  id: string;
  code: string;
  name: string;
  price: number | string;
  template_type?: string | null;
}

export default function ImpostazioniPage() {
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [editData, setEditData] = useState<Record<string, string> | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [types, setTypes] = useState<InstrumentType[]>([]);
  const [loading, setLoading] = useState(true);

  // Stato editing listino tipi strumento
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeEditData, setTypeEditData] = useState<Partial<InstrumentType>>({});
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState<Partial<InstrumentType>>({
    code: "",
    name: "",
    price: 0,
    template_type: "",
  });
  const [savingType, setSavingType] = useState(false);

  const loadTypes = async () => {
    try {
      const t = await getInstrumentTypes();
      setTypes(t?.types || []);
    } catch {
      setTypes([]);
    }
  };

  useEffect(() => {
    Promise.all([getSettings().catch(() => null), getInstrumentTypes().catch(() => ({ types: [] }))])
      .then(([s, t]) => {
        setSettings(s);
        setTypes(t?.types || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const startEdit = () => {
    setEditData({ ...(settings || {}) });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditData(null);
    setEditing(false);
  };

  const saveSettings = async () => {
    if (!editData) return;
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

  // === Gestione tipi strumento ===
  const startEditType = (t: InstrumentType) => {
    setEditingTypeId(t.id);
    setTypeEditData({
      code: t.code,
      name: t.name,
      price: Number(t.price),
      template_type: t.template_type || "",
    });
  };

  const cancelEditType = () => {
    setEditingTypeId(null);
    setTypeEditData({});
  };

  const saveType = async (id: string) => {
    setSavingType(true);
    try {
      await updateInstrumentType(id, {
        code: typeEditData.code as string,
        name: typeEditData.name as string,
        price: Number(typeEditData.price),
        template_type: (typeEditData.template_type as string) || undefined,
      });
      await loadTypes();
      setEditingTypeId(null);
      setTypeEditData({});
      toast.success("Tipo strumento aggiornato");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore salvataggio";
      toast.error(msg);
    }
    setSavingType(false);
  };

  const removeType = async (t: InstrumentType) => {
    if (!confirm(`Eliminare il tipo "${t.name}"?\n\nOperazione possibile solo se nessuno strumento lo sta usando.`)) return;
    try {
      await deleteInstrumentType(t.id);
      await loadTypes();
      toast.success("Tipo eliminato");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore eliminazione";
      toast.error(msg);
    }
  };

  const saveNewType = async () => {
    if (!newType.code || !newType.name || newType.price === undefined) {
      toast.error("Codice, nome e prezzo obbligatori");
      return;
    }
    setSavingType(true);
    try {
      await createInstrumentType({
        code: String(newType.code),
        name: String(newType.name),
        price: Number(newType.price),
        template_type: (newType.template_type as string) || undefined,
      });
      await loadTypes();
      setAddingType(false);
      setNewType({ code: "", name: "", price: 0, template_type: "" });
      toast.success("Tipo strumento creato");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore creazione";
      toast.error(msg);
    }
    setSavingType(false);
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
                    onChange={(e) => setEditData({ ...(editData || {}), [f.key]: e.target.value })}
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
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">
            Listino tarature ({types.length} tipi)
          </h3>
          {!addingType && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => setAddingType(true)}
            >
              <Plus className="w-4 h-4 mr-1" /> Nuovo tipo
            </Button>
          )}
        </div>

        {/* Form nuovo tipo */}
        {addingType && (
          <div className="mb-4 p-4 border-2 border-green-200 rounded-lg bg-green-50">
            <h4 className="font-medium mb-3">Nuovo tipo strumento</h4>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-600">Codice *</label>
                <Input
                  value={String(newType.code || "")}
                  onChange={(e) => setNewType({ ...newType, code: e.target.value })}
                  placeholder="MULTIMETRO"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Nome *</label>
                <Input
                  value={String(newType.name || "")}
                  onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                  placeholder="MULTIMETRO"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Prezzo EUR *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={String(newType.price ?? 0)}
                  onChange={(e) => setNewType({ ...newType, price: parseFloat(e.target.value) || 0 })}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Template (opz.)</label>
                <Input
                  value={String(newType.template_type || "")}
                  onChange={(e) => setNewType({ ...newType, template_type: e.target.value })}
                  placeholder="multimetro"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setAddingType(false); setNewType({ code: "", name: "", price: 0, template_type: "" }); }}>
                <X className="w-4 h-4 mr-1" /> Annulla
              </Button>
              <Button size="sm" onClick={saveNewType} disabled={savingType} className="bg-green-600 hover:bg-green-700">
                {savingType ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Crea
              </Button>
            </div>
          </div>
        )}

        {/* Lista tipi */}
        <div className="divide-y">
          {types.map((t) => (
            <div key={t.id} className="py-2 flex items-center gap-3 text-sm">
              {editingTypeId === t.id ? (
                <>
                  <Input
                    value={String(typeEditData.code || "")}
                    onChange={(e) => setTypeEditData({ ...typeEditData, code: e.target.value })}
                    className="h-8 text-sm w-32"
                  />
                  <Input
                    value={String(typeEditData.name || "")}
                    onChange={(e) => setTypeEditData({ ...typeEditData, name: e.target.value })}
                    className="h-8 text-sm flex-1"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={String(typeEditData.price ?? 0)}
                    onChange={(e) => setTypeEditData({ ...typeEditData, price: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-sm w-24 text-right"
                  />
                  <Button size="sm" variant="ghost" onClick={cancelEditType}>
                    <X className="w-4 h-4" />
                  </Button>
                  <Button size="sm" onClick={() => saveType(t.id)} disabled={savingType}>
                    {savingType ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-gray-500 w-32 font-mono text-xs">{t.code}</span>
                  <span className="flex-1">{t.name}</span>
                  <span className="w-24 text-right font-medium">EUR {parseFloat(String(t.price)).toFixed(2)}</span>
                  <Button size="sm" variant="ghost" onClick={() => startEditType(t)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeType(t)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
