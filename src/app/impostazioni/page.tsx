"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { getSettings, getInstrumentTypes } from "@/lib/api";
import { Settings, Loader2 } from "lucide-react";

export default function ImpostazioniPage() {
  const [settings, setSettings] = useState<any>(null);
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
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Dati aziendali
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Ragione sociale:</span> <strong>{settings.company_name}</strong></div>
            <div><span className="text-gray-500">P.IVA:</span> {settings.vat_number}</div>
            <div><span className="text-gray-500">Indirizzo:</span> {settings.address}, {settings.zip_code} {settings.city}</div>
            <div><span className="text-gray-500">Telefono:</span> {settings.phone}</div>
            <div><span className="text-gray-500">Email tarature:</span> <strong>{settings.calibration_email}</strong></div>
            <div><span className="text-gray-500">PEC:</span> {settings.pec}</div>
            <div><span className="text-gray-500">IBAN:</span> {settings.iban}</div>
            <div><span className="text-gray-500">SDI:</span> {settings.sdi_code}</div>
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
