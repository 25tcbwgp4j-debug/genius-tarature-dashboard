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
    payment_terms?: string | null;
    discount_percent?: number | string | null;
    scansione_rapporti?: boolean | null;
    scansione_rapporti_email?: string | null;
    scansione_rapporti_note?: string | null;
  };
  onSaved: () => void | Promise<void>;
  /** testo del pulsante (default «Modifica cliente») */
  etichetta?: string;
  /** classi extra del pulsante (es. rosso per «Completa i dati mancanti») */
  className?: string;
  /** campi da evidenziare in rosso nel modulo (dati obbligatori per fatturare che mancano) */
  mancanti?: string[];
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
  // termini concordati: «Bonifico Bancario» = immediato · «Bonifico 30 gg FM» = differito (scadenza in fattura)
  { key: "payment_terms", label: "Termini di pagamento (es. Bonifico 30 gg FM)", colSpan: 2 },
  { key: "discount_percent", label: "Sconto %" },
  // scansione dei rapporti firmati (08/10/2026, migr. 107): email vuota = email del cliente
  { key: "scansione_rapporti_email", label: "Email per i PDF scansionati (vuota = email cliente)", colSpan: 2 },
  { key: "scansione_rapporti_note", label: "Nota scansione rapporti", colSpan: 2 },
];

export function EditCustomerDialog({ customer, onSaved, etichetta = "Modifica cliente", className = "", mancanti = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [scansione, setScansione] = useState(false);

  const handleOpen = () => {
    // Inizializza il form con i valori attuali del cliente
    const init: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = (customer as Record<string, unknown>)[f.key];
      init[f.key] = v === null || v === undefined ? "" : String(v);
    }
    setForm(init);
    setScansione(!!customer.scansione_rapporti);
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
        const newVal = String(form[f.key] ?? "").trim();
        const oldVal = String((customer as Record<string, unknown>)[f.key] ?? "").trim();
        if (f.key === "discount_percent") {
          const n = Number(newVal.replace(",", ".") || 0);
          if (Number.isNaN(n) || n < 0 || n > 100) { toast.error("Sconto: un numero da 0 a 100"); setSaving(false); return; }
          if (n !== Number(oldVal || 0)) updates[f.key] = n;
          continue;
        }
        if (newVal !== oldVal) {
          updates[f.key] = newVal || null;
        }
      }
      if (scansione !== !!customer.scansione_rapporti) updates.scansione_rapporti = scansione;
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
      <Button variant="outline" className={`h-11 ${className}`} onClick={handleOpen}>
        <Pencil className="w-4 h-4 mr-1" /> {etichetta}
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

            {mancanti.length > 0 && (
              <p className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                In rosso i dati che servono per fatturare (P.IVA o CF · SDI o PEC · indirizzo · CAP · comune).
              </p>
            )}
            <label className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm ${scansione
              ? "border-fuchsia-400 bg-fuchsia-50 font-semibold text-fuchsia-900" : "border-gray-200 text-gray-700"}`}>
              <input type="checkbox" className="size-4" checked={scansione} onChange={(e) => setScansione(e.target.checked)} />
              📄 Scansione rapporti richiesta (inviare i PDF firmati via email prima di graffettarli e consegnarli)
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FIELDS.map((f) => {
                const manca = mancanti.includes(f.key) && !String(form[f.key] || "").trim();
                return (
                <div key={f.key} className={f.colSpan === 2 ? "col-span-2" : ""}>
                  <label className={`text-xs ${manca ? "font-semibold text-red-700" : "text-gray-500"}`}>{f.label}{manca ? " — manca" : ""}</label>
                  <Input
                    value={form[f.key] || ""}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className={`h-9 text-sm ${manca ? "border-red-500 bg-red-50" : ""}`}
                    placeholder={f.label}
                  />
                </div>
                );
              })}
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
