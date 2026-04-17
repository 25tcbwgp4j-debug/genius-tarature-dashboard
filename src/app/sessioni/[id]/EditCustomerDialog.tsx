"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { updateCustomer } from "@/lib/api";

interface Props {
  customer: {
    id: string;
    company_name?: string;
    vat_number?: string | null;
    tax_id?: string | null;
    sdi_code?: string | null;
    pec?: string | null;
    address?: string | null;
    zip_code?: string | null;
    city?: string | null;
    province?: string | null;
    phone1?: string | null;
    mobile?: string | null;
    whatsapp_phone?: string | null;
    email?: string | null;
    contact_person?: string | null;
  };
  onSaved: () => void | Promise<void>;
}

const FIELDS: Array<{ key: string; label: string; colSpan?: number }> = [
  { key: "company_name", label: "Ragione sociale", colSpan: 2 },
  { key: "vat_number", label: "P.IVA" },
  { key: "tax_id", label: "Codice fiscale" },
  { key: "sdi_code", label: "Codice SDI" },
  { key: "pec", label: "PEC" },
  { key: "address", label: "Indirizzo", colSpan: 2 },
  { key: "zip_code", label: "CAP" },
  { key: "city", label: "Citta'" },
  { key: "province", label: "Provincia" },
  { key: "email", label: "Email" },
  { key: "phone1", label: "Tel. fisso" },
  { key: "mobile", label: "Cellulare" },
  { key: "whatsapp_phone", label: "WhatsApp" },
  { key: "contact_person", label: "Referente" },
];

export function EditCustomerDialog({ customer, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const handleOpen = () => {
    // Inizializza il form con i valori attuali del cliente
    const init: Record<string, string> = {};
    for (const f of FIELDS) {
      init[f.key] = (customer as Record<string, unknown>)[f.key] as string || "";
    }
    setForm(init);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.company_name?.trim()) {
      toast.error("La ragione sociale e' obbligatoria");
      return;
    }
    setSaving(true);
    try {
      // Invia solo i campi modificati
      const updates: Record<string, unknown> = {};
      for (const f of FIELDS) {
        const newVal = (form[f.key] || "").trim();
        const oldVal = ((customer as Record<string, unknown>)[f.key] as string || "").trim();
        if (newVal !== oldVal) {
          updates[f.key] = newVal || null;
        }
      }
      if (Object.keys(updates).length === 0) {
        toast.info("Nessuna modifica rilevata");
        setOpen(false);
        return;
      }
      await updateCustomer(customer.id, updates);
      toast.success("Cliente aggiornato");
      setOpen(false);
      await onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore aggiornamento cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        <Pencil className="w-4 h-4 mr-1" /> Modifica cliente
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="bg-white max-w-3xl w-full max-h-[85vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" /> Modifica cliente
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Le modifiche verranno salvate direttamente nell&apos;anagrafica clienti.
            </p>

            <div className="grid grid-cols-4 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className={f.colSpan === 2 ? "col-span-2" : ""}>
                  <label className="text-xs text-gray-500">{f.label}</label>
                  <Input
                    value={form[f.key] || ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="h-8 text-sm"
                    placeholder={f.label}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Annulla
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salva modifiche
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
