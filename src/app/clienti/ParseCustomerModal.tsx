"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Save, X, AlertCircle, Check, Plus, GitMerge, FileText, Image as ImageIcon, Upload } from "lucide-react";
import { toast } from "sonner";
import { parseCustomerText, parseCustomerImage, applyCustomerParsedUpdate } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (customerId: string) => void;
  onUpdated?: (customerId: string) => void;
}

interface ParsedFields {
  company_name?: string;
  vat_number?: string;
  tax_id?: string;
  sdi_code?: string;
  pec?: string;
  address?: string;
  zip_code?: string;
  city?: string;
  province?: string;
  phone1?: string;
  mobile?: string;
  whatsapp_phone?: string;
  email?: string;
  contact_person?: string;
}

interface Duplicate {
  id: string;
  company_name: string;
  vat_number?: string;
  email?: string;
  [k: string]: unknown;
}

type DiffStatus = "missing" | "same" | "conflict";
interface DiffEntry { status: DiffStatus; new: string; existing: string | null }
type DiffMap = Record<string, DiffEntry>;

const FIELD_LABELS: Record<keyof ParsedFields, string> = {
  company_name: "Ragione sociale",
  vat_number: "P.IVA",
  tax_id: "Codice fiscale",
  sdi_code: "Codice SDI",
  pec: "PEC",
  address: "Indirizzo",
  zip_code: "CAP",
  city: "Citta'",
  province: "Provincia",
  phone1: "Telefono fisso",
  mobile: "Cellulare",
  whatsapp_phone: "WhatsApp",
  email: "Email",
  contact_person: "Referente",
};

const STATUS_LABEL: Record<DiffStatus, string> = {
  missing: "Nuovo campo",
  same: "Invariato",
  conflict: "Diverso",
};

export function ParseCustomerModal({ open, onClose, onCreated, onUpdated }: Props) {
  const [mode, setMode] = useState<"text" | "image">("text");
  const [text, setText] = useState("");
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<ParsedFields | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [diff, setDiff] = useState<DiffMap | null>(null);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cattura paste di immagine da clipboard (Ctrl/Cmd+V) quando il modal e' aperto in tab immagine
  useEffect(() => {
    if (!open || mode !== "image") return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          const blob = it.getAsFile();
          if (blob) {
            loadImageFile(blob);
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, mode]);

  const loadImageFile = (file: File | Blob) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setImagePreview(result);
      // Estraggo il base64 puro senza prefisso data:
      const comma = result.indexOf(",");
      setImageB64(comma >= 0 ? result.slice(comma + 1) : result);
      setFields(null); setDuplicate(null); setDiff(null); setSelection({});
    };
    reader.readAsDataURL(file);
  };

  if (!open) return null;

  const handleParse = async () => {
    if (mode === "text" && !text.trim()) { toast.error("Incolla prima i dati"); return; }
    if (mode === "image" && !imageB64) { toast.error("Carica prima un'immagine"); return; }
    setParsing(true);
    setFields(null); setDuplicate(null); setDiff(null); setSelection({});
    try {
      const res = mode === "text"
        ? await parseCustomerText(text, false)
        : await parseCustomerImage(imageB64!, false);
      setFields(res.customer_fields || {});
      setDuplicate(res.duplicate || null);
      setDiff(res.diff || null);
      if (res.duplicate) {
        const sel: Record<string, boolean> = {};
        Object.entries(res.diff || {}).forEach(([k, d]) => {
          const entry = d as DiffEntry;
          sel[k] = entry.status === "missing";
        });
        setSelection(sel);
        toast.warning(`Cliente gia' presente: ${res.duplicate.company_name}`);
      } else {
        toast.success("Dati estratti, verifica e salva");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore estrazione");
    } finally { setParsing(false); }
  };

  const handleCreateNew = async () => {
    if (!fields?.company_name) { toast.error("Ragione sociale obbligatoria"); return; }
    setSaving(true);
    try {
      const structured = [
        fields.company_name && `Ragione sociale: ${fields.company_name}`,
        fields.vat_number && `P.IVA: ${fields.vat_number}`,
        fields.tax_id && fields.tax_id !== fields.vat_number && `CF: ${fields.tax_id}`,
        fields.sdi_code && `Codice SDI: ${fields.sdi_code}`,
        fields.pec && `PEC: ${fields.pec}`,
        fields.address && `Indirizzo: ${fields.address}`,
        fields.zip_code && `CAP: ${fields.zip_code}`,
        fields.city && `Citta': ${fields.city}`,
        fields.province && `Provincia: ${fields.province}`,
        fields.phone1 && `Tel: ${fields.phone1}`,
        fields.mobile && `Cell: ${fields.mobile}`,
        fields.email && `Email: ${fields.email}`,
        fields.contact_person && `Referente: ${fields.contact_person}`,
      ].filter(Boolean).join("\n");
      const res = await parseCustomerText(structured, true);
      if (res.duplicate) {
        toast.warning(`Non salvato: duplicato su ${res.duplicate.company_name}`);
      } else if (res.created?.id) {
        toast.success(`Cliente creato: ${res.created.company_name}`);
        onCreated?.(res.created.id);
        handleClose();
      } else {
        toast.error("Creazione fallita");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio");
    } finally { setSaving(false); }
  };

  const handleApplyUpdate = async () => {
    if (!duplicate || !diff) return;
    const toUpdate: Record<string, string> = {};
    Object.entries(diff).forEach(([k, d]) => {
      if (selection[k] && d.status !== "same") {
        toUpdate[k] = d.new;
      }
    });
    if (Object.keys(toUpdate).length === 0) {
      toast.info("Nessun campo selezionato: niente da aggiornare");
      return;
    }
    setSaving(true);
    try {
      const res = await applyCustomerParsedUpdate(duplicate.id, toUpdate);
      toast.success(`Aggiornati ${res.fields_applied.length} campi su ${duplicate.company_name}`);
      onUpdated?.(duplicate.id);
      handleClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore aggiornamento");
    } finally { setSaving(false); }
  };

  const handleClose = () => {
    setText(""); setImageB64(null); setImagePreview(null);
    setFields(null); setDuplicate(null); setDiff(null); setSelection({});
    onClose();
  };

  const handleCreateFromImage = async () => {
    if (!imageB64 || !fields?.company_name) {
      toast.error("Ragione sociale obbligatoria"); return;
    }
    setSaving(true);
    try {
      const res = await parseCustomerImage(imageB64, true);
      if (res.duplicate) {
        toast.warning(`Non salvato: duplicato su ${res.duplicate.company_name}`);
      } else if (res.created?.id) {
        toast.success(`Cliente creato: ${res.created.company_name}`);
        onCreated?.(res.created.id);
        handleClose();
      } else {
        toast.error("Creazione fallita");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio");
    } finally { setSaving(false); }
  };

  const updateField = (k: keyof ParsedFields, v: string) => {
    setFields({ ...fields, [k]: v });
  };

  const toggleAllOfStatus = (status: DiffStatus, checked: boolean) => {
    if (!diff) return;
    const newSel = { ...selection };
    Object.entries(diff).forEach(([k, d]) => {
      if (d.status === status) newSel[k] = checked;
    });
    setSelection(newSel);
  };

  const missingCount = diff ? Object.values(diff).filter((d) => d.status === "missing").length : 0;
  const conflictCount = diff ? Object.values(diff).filter((d) => d.status === "conflict").length : 0;
  const selectedCount = Object.values(selection).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="bg-white max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Nuovo cliente da testo incollato
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Incolla firma email, visura, biglietto da visita: l&apos;AI estrae i campi automaticamente.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tab selector Testo / Immagine */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setMode("text")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "text" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <FileText className="w-4 h-4" /> Testo
          </button>
          <button
            type="button"
            onClick={() => setMode("image")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "image" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <ImageIcon className="w-4 h-4" /> Immagine
          </button>
        </div>

        {mode === "text" ? (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Testo da analizzare</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={`Esempio:\nROSSI IMPIANTI S.R.L.\nVia Roma 12 - 00100 ROMA (RM)\nP.IVA 01234567890\nCod. Dest. M5UXCR1\nPEC: rossi@legalmail.it\nTel. 06 1234567 - Cell. 333 1234567\nEmail: info@rossiimpianti.it`}
              className="w-full border rounded p-3 text-sm font-mono resize-y"
            />
            <div className="flex justify-end gap-2 mt-2">
              <Button onClick={handleParse} disabled={parsing || !text.trim()}>
                {parsing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Estrai campi con AI
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Incolla (Ctrl/Cmd+V) o carica un&apos;immagine: biglietto da visita, visura, timbro, screenshot
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f && f.type.startsWith("image/")) loadImageFile(f);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-colors"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="preview" className="max-h-64 mx-auto rounded" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <Upload className="w-8 h-8" />
                  <div className="text-sm font-medium">Trascina qui un&apos;immagine, oppure clicca per selezionarla</div>
                  <div className="text-xs">Oppure premi <kbd className="px-1.5 py-0.5 bg-gray-200 rounded">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 bg-gray-200 rounded">V</kbd> per incollare dalla clipboard</div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadImageFile(f);
                }}
              />
            </div>
            <div className="flex justify-between items-center gap-2 mt-2">
              {imagePreview && (
                <Button variant="outline" size="sm" onClick={() => { setImageB64(null); setImagePreview(null); setFields(null); setDuplicate(null); setDiff(null); }}>
                  <X className="w-3 h-3 mr-1" /> Rimuovi immagine
                </Button>
              )}
              <div className="flex-1" />
              <Button onClick={handleParse} disabled={parsing || !imageB64}>
                {parsing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Estrai dati dall&apos;immagine
              </Button>
            </div>
          </div>
        )}

        {/* === CASO 1: DUPLICATO -> UI DIFF === */}
        {duplicate && diff && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-amber-900">Cliente gia&apos; presente in anagrafica</div>
                  <div className="text-sm text-amber-800 mt-1">
                    <strong>{duplicate.company_name}</strong>
                    {duplicate.vat_number && ` · P.IVA ${duplicate.vat_number}`}
                  </div>
                  <div className="text-xs text-amber-700 mt-2">
                    <span className="inline-flex items-center gap-1 bg-amber-100 px-2 py-0.5 rounded mr-2">
                      <Plus className="w-3 h-3" /> {missingCount} campi mancanti
                    </span>
                    <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2 py-0.5 rounded">
                      <GitMerge className="w-3 h-3" /> {conflictCount} valori diversi
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Seleziona cosa aggiornare</h3>
                <div className="flex gap-2">
                  {missingCount > 0 && (
                    <button onClick={() => toggleAllOfStatus("missing", true)} className="text-xs text-emerald-700 hover:underline">
                      Tutti i mancanti
                    </button>
                  )}
                  {conflictCount > 0 && (
                    <button onClick={() => toggleAllOfStatus("conflict", true)} className="text-xs text-red-700 hover:underline">
                      Tutti i diversi
                    </button>
                  )}
                  <button
                    onClick={() => { toggleAllOfStatus("missing", false); toggleAllOfStatus("conflict", false); }}
                    className="text-xs text-gray-600 hover:underline"
                  >
                    Nessuno
                  </button>
                </div>
              </div>

              <div className="border rounded overflow-hidden text-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-2 py-2 w-8"></th>
                      <th className="text-left px-2 py-2">Campo</th>
                      <th className="text-left px-2 py-2">Valore esistente</th>
                      <th className="text-left px-2 py-2">Nuovo valore (dal testo)</th>
                      <th className="text-left px-2 py-2 w-24">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(FIELD_LABELS) as (keyof ParsedFields)[]).map((k) => {
                      const d = diff[k as string];
                      if (!d) return null;
                      const isSame = d.status === "same";
                      return (
                        <tr key={k} className={`border-t ${isSame ? "bg-gray-50/50" : ""}`}>
                          <td className="px-2 py-2">
                            {!isSame ? (
                              <input
                                type="checkbox"
                                checked={!!selection[k]}
                                onChange={(e) => setSelection({ ...selection, [k]: e.target.checked })}
                                className="w-4 h-4"
                              />
                            ) : (
                              <Check className="w-4 h-4 text-gray-400" />
                            )}
                          </td>
                          <td className="px-2 py-2 font-medium text-gray-700">{FIELD_LABELS[k]}</td>
                          <td className="px-2 py-2 text-gray-600">
                            {d.existing ? <span>{d.existing}</span> : <span className="text-gray-300 italic">vuoto</span>}
                          </td>
                          <td className="px-2 py-2">
                            <span className={d.status === "conflict" ? "font-semibold text-red-700" : "text-emerald-700"}>
                              {d.new}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-xs ${
                              d.status === "missing" ? "bg-emerald-100 text-emerald-800" :
                              d.status === "conflict" ? "bg-red-100 text-red-800" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {STATUS_LABEL[d.status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t">
              <div className="text-xs text-gray-500">
                {selectedCount} {selectedCount === 1 ? "campo selezionato" : "campi selezionati"} per l&apos;aggiornamento
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>Annulla</Button>
                <Button
                  onClick={handleApplyUpdate}
                  disabled={saving || selectedCount === 0}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <GitMerge className="w-4 h-4 mr-1" />}
                  Applica aggiornamento
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* === CASO 2: NUOVO CLIENTE -> UI semplice === */}
        {fields && !duplicate && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Campi estratti (verifica e modifica se necessario)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(FIELD_LABELS) as (keyof ParsedFields)[]).map((k) => (
                <div key={k} className={k === "company_name" ? "md:col-span-2" : ""}>
                  <label className="text-xs text-gray-500">{FIELD_LABELS[k]}</label>
                  <Input
                    value={fields[k] || ""}
                    onChange={(e) => updateField(k, e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={handleClose}>Annulla</Button>
              <Button
                onClick={mode === "image" ? handleCreateFromImage : handleCreateNew}
                disabled={saving || !fields.company_name}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salva nuovo cliente
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
