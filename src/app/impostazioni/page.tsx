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
  listTemplates,
  updateTemplate,
} from "@/lib/api";
import { Settings, Loader2, Pencil, Save, X, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface SettingField {
  key: string;
  label: string;
  sensitive?: boolean;
}

const FIELDS: SettingField[] = [
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
  { key: "iban", label: "IBAN", sensitive: true },
  { key: "bic", label: "BIC/SWIFT", sensitive: true },
  { key: "bank_name", label: "Banca" },
  { key: "paypal_email", label: "PayPal", sensitive: true },
  { key: "staff_whatsapp", label: "WhatsApp staff" },
];

// Maschera dato sensibile lasciando visibili ultimi 4 caratteri (F12)
function maskSensitive(value: string): string {
  if (!value || value.length <= 4) return "••••";
  return "•".repeat(Math.min(value.length - 4, 12)) + value.slice(-4);
}

interface InstrumentType {
  id: string;
  code: string;
  name: string;
  price: number | string;
  template_type?: string | null;
  category?: string | null;
  measurement_unit?: string | null;
  calibration_validity_months?: number | null;
  notes?: string | null;
  active?: boolean;
}

// Valori iniziali per il form "Nuovo tipo strumento"
const EMPTY_NEW_TYPE: Partial<InstrumentType> = {
  code: "",
  name: "",
  price: 0,
  template_type: "",
  category: "",
  measurement_unit: "",
  calibration_validity_months: 12,
  notes: "",
};

export default function ImpostazioniPage() {
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [editData, setEditData] = useState<Record<string, string> | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [types, setTypes] = useState<InstrumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSensitive, setShowSensitive] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Stato editing listino tipi strumento
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeEditData, setTypeEditData] = useState<Partial<InstrumentType>>({});
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState<Partial<InstrumentType>>({ ...EMPTY_NEW_TYPE });
  const [savingType, setSavingType] = useState(false);

  const loadTypes = async () => {
    try {
      const t = await getInstrumentTypes();
      setTypes(t?.types || []);
    } catch (err) {
      // NON svuotare la lista esistente: errore di ricaricamento non distruttivo
      const msg = err instanceof Error ? err.message : "errore server";
      toast.error("Errore ricaricamento listino: " + msg);
    }
  };

  useEffect(() => {
    Promise.all([
      getSettings().catch((err: Error) => {
        setSettingsError(
          "Impossibile caricare le impostazioni: " + (err?.message || "errore server")
        );
        return null;
      }),
      getInstrumentTypes().catch((err: Error) => {
        toast.error(
          "Errore caricamento listino: " + (err?.message || "errore server")
        );
        return { types: [] };
      }),
    ])
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
    // Validazione campi aziendali (client-side)
    if (editData.vat_number && !/^\d{11}$/.test(editData.vat_number.trim())) {
      toast.error("P.IVA deve essere 11 cifre numeriche");
      return;
    }
    if (editData.sdi_code && !/^[A-Z0-9]{7}$/i.test(editData.sdi_code.trim())) {
      toast.error("Codice SDI deve essere 7 caratteri alfanumerici");
      return;
    }
    if (editData.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i.test(editData.iban.trim())) {
      toast.error("IBAN formato non valido (es. IT60X0542811101000000123456)");
      return;
    }
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
    // Il prezzo deve essere maggiore di zero (blocco client-side)
    if (!typeEditData.price || parseFloat(String(typeEditData.price)) <= 0) {
      toast.error("Il prezzo deve essere maggiore di zero");
      return;
    }
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
    // Il prezzo deve essere maggiore di zero (blocco client-side)
    if (!newType.price || parseFloat(String(newType.price)) <= 0) {
      toast.error("Il prezzo deve essere maggiore di zero");
      return;
    }
    setSavingType(true);
    try {
      await createInstrumentType({
        code: String(newType.code),
        name: String(newType.name),
        price: Number(newType.price),
        template_type: (newType.template_type as string) || undefined,
        category: (newType.category as string) || undefined,
        measurement_unit: (newType.measurement_unit as string) || undefined,
        calibration_validity_months:
          newType.calibration_validity_months != null
            ? Number(newType.calibration_validity_months)
            : undefined,
        notes: (newType.notes as string) || undefined,
      });
      await loadTypes();
      setAddingType(false);
      setNewType({ ...EMPTY_NEW_TYPE });
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

      {settingsError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          ⚠️ {settingsError}
        </div>
      )}

      {settings && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Dati aziendali
            </h3>
            {!editing ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSensitive((v) => !v)}
                  title="Mostra/nascondi dati sensibili (IBAN, BIC, PayPal)"
                >
                  {showSensitive ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                  {showSensitive ? "Nascondi" : "Mostra"} dati sensibili
                </Button>
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <Pencil className="w-4 h-4 mr-1" /> Modifica
                </Button>
              </div>
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
            {FIELDS.map((f) => {
              const rawValue = settings?.[f.key];
              const displayValue = rawValue
                ? (f.sensitive && !showSensitive ? maskSensitive(String(rawValue)) : rawValue)
                : "—";
              return (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-gray-500 text-xs">{f.label}</label>
                  {editing ? (
                    <Input
                      value={editData?.[f.key] || ""}
                      onChange={(e) => setEditData({ ...(editData || {}), [f.key]: e.target.value })}
                      className="h-8 text-sm"
                    />
                  ) : (
                    <span className="font-medium font-mono">{displayValue}</span>
                  )}
                </div>
              );
            })}
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
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-600">Categoria (opz.)</label>
                <Input
                  value={String(newType.category || "")}
                  onChange={(e) => setNewType({ ...newType, category: e.target.value })}
                  placeholder="elettrico, fluidico…"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Unità di misura (opz.)</label>
                <Input
                  value={String(newType.measurement_unit || "")}
                  onChange={(e) => setNewType({ ...newType, measurement_unit: e.target.value })}
                  placeholder="bar, °C, A…"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Validità taratura (mesi)</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={String(newType.calibration_validity_months ?? 12)}
                  onChange={(e) =>
                    setNewType({
                      ...newType,
                      calibration_validity_months: parseInt(e.target.value, 10) || 12,
                    })
                  }
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Note (opz.)</label>
                <Input
                  value={String(newType.notes || "")}
                  onChange={(e) => setNewType({ ...newType, notes: e.target.value })}
                  placeholder="Note interne"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setAddingType(false); setNewType({ ...EMPTY_NEW_TYPE }); }}>
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
                  <span className={`text-gray-500 w-32 font-mono text-xs ${t.active === false ? "opacity-40" : ""}`}>{t.code}</span>
                  <span className={`flex-1 ${t.active === false ? "line-through text-gray-400" : ""}`}>{t.name}</span>
                  <span className="w-24 text-right font-medium">EUR {parseFloat(String(t.price)).toFixed(2)}</span>
                  <Button
                    size="sm" variant="ghost"
                    title={t.active === false ? "Attiva" : "Disattiva"}
                    onClick={async () => {
                      try {
                        await updateInstrumentType(t.id, { active: t.active === false });
                        setTypes(types.map(x => x.id === t.id ? { ...x, active: t.active === false } : x));
                      } catch { toast.error("Errore aggiornamento stato"); }
                    }}
                  >
                    {t.active === false
                      ? <EyeOff className="w-4 h-4 text-gray-400" />
                      : <Eye className="w-4 h-4 text-green-600" />}
                  </Button>
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

      {/* === TEMPLATE MESSAGGI === */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-1">Template messaggi</h3>
        <p className="text-sm text-gray-500 mb-4">
          Personalizza i messaggi inviati automaticamente ai clienti. Placeholder validi:{" "}
          <code className="bg-gray-100 px-1 rounded">{"{{cliente}}"}</code>,{" "}
          <code className="bg-gray-100 px-1 rounded">{"{{elenco_strumenti}}"}</code>,{" "}
          <code className="bg-gray-100 px-1 rounded">{"{{importo}}"}</code>,{" "}
          <code className="bg-gray-100 px-1 rounded">{"{{sessione_id}}"}</code>.
        </p>
        <TemplatesSection />
      </Card>
    </div>
  );
}

// === Sezione Template messaggi (CRUD su message_templates) ===
interface MessageTemplate {
  template_key: string;
  subject?: string | null;
  body?: string | null;
  notes?: string | null;
}

function TemplatesSection() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(true);
  const [tplError, setTplError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [tplEdit, setTplEdit] = useState<{ subject: string; body: string }>({
    subject: "",
    body: "",
  });
  const [savingTpl, setSavingTpl] = useState(false);

  useEffect(() => {
    listTemplates()
      .then((r) => setTemplates(r?.templates || []))
      .catch((err: Error) => {
        setTplError(
          "Impossibile caricare i template: " + (err?.message || "errore server")
        );
      })
      .finally(() => setLoadingTpl(false));
  }, []);

  const startEditTpl = (t: MessageTemplate) => {
    setEditingKey(t.template_key);
    setExpandedKey(t.template_key);
    setTplEdit({ subject: t.subject || "", body: t.body || "" });
  };

  const cancelEditTpl = () => {
    setEditingKey(null);
    setTplEdit({ subject: "", body: "" });
  };

  const saveTpl = async (templateKey: string) => {
    if (!tplEdit.body.trim()) {
      toast.error("Il corpo del messaggio non può essere vuoto");
      return;
    }
    setSavingTpl(true);
    try {
      const updated = await updateTemplate(templateKey, {
        subject: tplEdit.subject,
        body: tplEdit.body,
      });
      setTemplates((prev) =>
        prev.map((t) => (t.template_key === templateKey ? { ...t, ...updated } : t))
      );
      setEditingKey(null);
      toast.success("Template aggiornato");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore salvataggio";
      toast.error(msg);
    }
    setSavingTpl(false);
  };

  if (loadingTpl) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (tplError) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
        ⚠️ {tplError}
      </div>
    );
  }

  if (templates.length === 0) {
    return <p className="text-sm text-gray-500">Nessun template configurato.</p>;
  }

  return (
    <div className="space-y-2">
      {templates.map((t) => {
        const expanded = expandedKey === t.template_key;
        const isEditing = editingKey === t.template_key;
        return (
          <div key={t.template_key} className="border rounded-lg">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() =>
                setExpandedKey(expanded ? null : t.template_key)
              }
            >
              <span className="font-mono text-sm font-medium">{t.template_key}</span>
              <span className="text-xs text-gray-400">
                {expanded ? "Chiudi" : "Apri"}
              </span>
            </button>

            {expanded && (
              <div className="px-4 pb-4 space-y-3 border-t pt-3">
                {isEditing ? (
                  <>
                    <div>
                      <label className="text-xs text-gray-600">Oggetto (subject)</label>
                      <Input
                        value={tplEdit.subject}
                        onChange={(e) =>
                          setTplEdit({ ...tplEdit, subject: e.target.value })
                        }
                        placeholder="Oggetto email (vuoto per WhatsApp)"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Corpo messaggio (body)</label>
                      <textarea
                        value={tplEdit.body}
                        onChange={(e) =>
                          setTplEdit({ ...tplEdit, body: e.target.value })
                        }
                        rows={8}
                        className="w-full border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Placeholder: {"{{cliente}}"}, {"{{elenco_strumenti}}"},{" "}
                      {"{{importo}}"}, {"{{sessione_id}}"}
                    </p>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={cancelEditTpl}>
                        <X className="w-4 h-4 mr-1" /> Annulla
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveTpl(t.template_key)}
                        disabled={savingTpl}
                      >
                        {savingTpl ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <Save className="w-4 h-4 mr-1" />
                        )}
                        Salva
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {t.subject && (
                      <div className="text-sm">
                        <span className="text-gray-500 text-xs">Oggetto: </span>
                        <span className="font-medium">{t.subject}</span>
                      </div>
                    )}
                    <pre className="text-sm bg-gray-50 rounded-md p-3 whitespace-pre-wrap font-mono text-gray-700">
                      {t.body || "—"}
                    </pre>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => startEditTpl(t)}>
                        <Pencil className="w-4 h-4 mr-1" /> Modifica
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
