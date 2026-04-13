"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Save, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { parseCustomerText } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (customerId: string) => void;
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
}

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

export function ParseCustomerModal({ open, onClose, onCreated }: Props) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<ParsedFields | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);

  if (!open) return null;

  const handleParse = async () => {
    if (!text.trim()) { toast.error("Incolla prima i dati"); return; }
    setParsing(true);
    setFields(null);
    setDuplicate(null);
    try {
      const res = await parseCustomerText(text, false);
      setFields(res.customer_fields || {});
      setDuplicate(res.duplicate || null);
      if (res.duplicate) {
        toast.warning(`Gia' presente: ${res.duplicate.company_name}`);
      } else {
        toast.success("Dati estratti, verifica e salva");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore estrazione");
    } finally { setParsing(false); }
  };

  const handleSave = async () => {
    if (!fields?.company_name) { toast.error("Ragione sociale obbligatoria"); return; }
    setSaving(true);
    try {
      // Re-invia con create=true usando i fields eventualmente modificati
      // come testo strutturato (piu' semplice: invia JSON diretto via /parse-text
      // con testo "ricostruito" non funziona). Usiamo l'endpoint nativo customers
      // creando manualmente: facciamo un nuovo parse-text con create=true, passando
      // i campi gia' estratti come testo strutturato per massima fedelta'.
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

  const handleClose = () => {
    setText(""); setFields(null); setDuplicate(null);
    onClose();
  };

  const updateField = (k: keyof ParsedFields, v: string) => {
    setFields({ ...fields, [k]: v });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="bg-white max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
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

        {/* Textarea input */}
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

        {/* Duplicate warning */}
        {duplicate && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-amber-900">Cliente gia&apos; presente in anagrafica</div>
                <div className="text-amber-700 text-xs mt-1">
                  {duplicate.company_name}
                  {duplicate.vat_number && ` · P.IVA ${duplicate.vat_number}`}
                  {duplicate.email && ` · ${duplicate.email}`}
                </div>
                <div className="text-amber-600 text-xs mt-1">
                  Il salvataggio verra&apos; bloccato per evitare duplicati. Apri il cliente esistente per aggiornarlo.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Parsed fields (editable) */}
        {fields && (
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
              <Button onClick={handleSave} disabled={saving || !!duplicate || !fields.company_name}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salva cliente
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
