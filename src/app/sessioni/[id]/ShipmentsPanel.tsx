"use client";

// Spedizioni UPS della sessione: ritiro dal cliente (etichetta + corriere prenotato)
// e riconsegna degli strumenti tarati. Mail al cliente e WhatsApp dalla linea staff
// partono in automatico dopo la conferma (il WhatsApp lo manda il worker sul VPS).

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ExternalLink, FileText, Loader2, Package, Truck, X } from "lucide-react";
import { toast } from "sonner";
import {
  createShipment,
  getShipmentLabelUrl,
  listShipments,
  previewShipment,
  type ShipmentAddress,
  type ShipmentDirection,
  type ShipmentRequest,
} from "@/lib/api";

interface ShipmentRow {
  id: string;
  direction: ShipmentDirection;
  test_mode: boolean;
  tracking: string | null;
  tracking_packages: string[] | null;
  pickup_prn: string | null;
  pickup_date: string | null;
  pickup_error: string | null;
  packages: number;
  cost: number | null;
  currency: string | null;
  email_to: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  whatsapp: { status: string; sent_at: string | null; error: string | null } | null;
  tracking_url: string | null;
  created_at: string;
}

interface Preview {
  address: ShipmentAddress;
  missing: string[];
  email: string;
  whatsapp_phone: string;
  texts: { oggetto: string; mail: string; wa: string };
}

// Primo giorno lavorativo dopo oggi (UPS non ritira sabato e domenica)
function prossimoGiornoLavorativo(): string {
  const d = new Date();
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}

const CAMPI_INDIRIZZO: { key: keyof ShipmentAddress; label: string }[] = [
  { key: "name", label: "Ragione sociale" },
  { key: "attention", label: "Referente" },
  { key: "phone", label: "Telefono" },
  { key: "street", label: "Indirizzo" },
  { key: "zip", label: "CAP" },
  { key: "city", label: "Città" },
  { key: "province", label: "Prov." },
];

export function ShipmentsPanel({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [direction, setDirection] = useState<ShipmentDirection | null>(null);
  const [form, setForm] = useState<ShipmentRequest | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const d = await listShipments(sessionId);
      setRows(d.shipments || []);
    } catch {
      // tabella vuota o backend non aggiornato: il pannello resta utilizzabile
    }
  };

  useEffect(() => {
    load();
  }, [sessionId]);

  const apri = async (dir: ShipmentDirection) => {
    const base: ShipmentRequest = {
      direction: dir,
      pickup_date: dir === "ritiro" ? prossimoGiornoLavorativo() : null,
      book_pickup: dir === "ritiro",
      packages: 1,
      weight_kg: 2,
      send_email: true,
      send_whatsapp: true,
      test: false,
    };
    setDirection(dir);
    setForm(base);
    await aggiornaAnteprima(base);
  };

  const aggiornaAnteprima = async (f: ShipmentRequest) => {
    setBusy(true);
    try {
      const p = await previewShipment(sessionId, f);
      setPreview(p);
      setForm((cur) => ({
        ...(cur || f),
        address: cur?.address || p.address,
        email: cur?.email ?? p.email,
        whatsapp_phone: cur?.whatsapp_phone ?? p.whatsapp_phone,
      }));
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore anteprima");
    } finally {
      setBusy(false);
    }
  };

  const chiudi = () => {
    setDirection(null);
    setForm(null);
    setPreview(null);
  };

  const conferma = async () => {
    if (!form) return;
    const cosa = form.direction === "ritiro"
      ? `RITIRO dal cliente${form.book_pickup ? ` con corriere il ${form.pickup_date}` : " senza prenotazione"}`
      : "RICONSEGNA al cliente";
    const avvisi = [
      form.test ? "PROVA: ambiente di test UPS, nessun costo, niente mail né WhatsApp." : "Etichetta VERA a pagamento sul conto UPS.",
      !form.test && form.send_email ? `Mail a ${form.email || "(manca l'email)"}` : null,
      !form.test && form.send_whatsapp ? `WhatsApp a ${form.whatsapp_phone || "(manca il numero)"}` : null,
    ].filter(Boolean).join("\n");
    if (!confirm(`Confermi ${cosa}?\n\n${avvisi}`)) return;
    setBusy(true);
    try {
      const r = await createShipment(sessionId, form);
      toast.success(
        `${r.test ? "[PROVA] " : ""}Tracking ${r.tracking}` +
        (r.pickup_prn ? ` · ritiro prenotato (${r.pickup_prn})` : "") +
        ` · mail: ${r.email} · WhatsApp: ${r.whatsapp}`,
        { duration: 10000 },
      );
      if (r.pickup_error) toast.error(`Etichetta creata ma ritiro NON prenotato: ${r.pickup_error}`, { duration: 15000 });
      chiudi();
      await load();
      if (r.id) window.open(getShipmentLabelUrl(r.id), "_blank");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore spedizione", { duration: 12000 });
    } finally {
      setBusy(false);
    }
  };

  const setAddr = (k: keyof ShipmentAddress, v: string) =>
    setForm((f) => (f ? { ...f, address: { ...(f.address || {}), [k]: v } } : f));

  return (
    <Card className="p-4 border-l-4 border-l-amber-700 bg-amber-50/30">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-amber-800" />
          <h3 className="font-semibold text-base">Spedizioni UPS</h3>
        </div>
        {!direction && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => apri("ritiro")} disabled={busy}>
              <Package className="w-4 h-4 mr-1" /> Prenota ritiro dal cliente
            </Button>
            <Button size="sm" variant="outline" onClick={() => apri("riconsegna")} disabled={busy}>
              <Truck className="w-4 h-4 mr-1" /> Spedisci riconsegna
            </Button>
          </div>
        )}
      </div>

      {direction && form && (
        <div className="rounded-md border bg-white p-3 mb-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">
              {direction === "ritiro" ? "Ritiro dal cliente → laboratorio" : "Riconsegna laboratorio → cliente"}
            </p>
            <Button size="sm" variant="ghost" onClick={chiudi}><X className="w-4 h-4" /></Button>
          </div>

          {direction === "ritiro" && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!form.book_pickup}
                  onChange={(e) => setForm({ ...form, book_pickup: e.target.checked })} />
                Prenota il corriere
              </label>
              {form.book_pickup && (
                <label className="flex items-center gap-1">
                  Giorno
                  <Input type="date" className="h-8 w-40" value={form.pickup_date || ""}
                    onChange={(e) => setForm({ ...form, pickup_date: e.target.value })} />
                </label>
              )}
              <span className="text-muted-foreground">(9:00-18:00, lun-ven)</span>
            </div>
          )}
          {direction === "riconsegna" && (
            <p className="text-sm text-muted-foreground">UPS passa da noi ogni pomeriggio alle 16:30: nessuna prenotazione.</p>
          )}

          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1">Colli
              <Input type="number" min={1} className="h-8 w-16" value={form.packages ?? 1}
                onChange={(e) => setForm({ ...form, packages: Number(e.target.value) || 1 })} />
            </label>
            <label className="flex items-center gap-1">Peso totale kg
              <Input type="number" min={0.5} step={0.5} className="h-8 w-20" value={form.weight_kg ?? 2}
                onChange={(e) => setForm({ ...form, weight_kg: Number(e.target.value) || 2 })} />
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {CAMPI_INDIRIZZO.map(({ key, label }) => (
              <label key={key} className="flex flex-col">
                <span className="text-xs text-muted-foreground">{label}</span>
                <Input className="h-8" value={(form.address?.[key] as string) || ""}
                  onChange={(e) => setAddr(key, e.target.value)} />
              </label>
            ))}
          </div>
          {preview?.missing?.length ? (
            <p className="text-sm text-red-600">Mancano: {preview.missing.join(", ")}. Completa i campi prima di confermare.</p>
          ) : null}

          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <label className="flex flex-col">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={!!form.send_email}
                  onChange={(e) => setForm({ ...form, send_email: e.target.checked })} /> Mail al cliente
              </span>
              <Input className="h-8" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="flex flex-col">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={!!form.send_whatsapp}
                  onChange={(e) => setForm({ ...form, send_whatsapp: e.target.checked })} /> WhatsApp dalla linea staff
              </span>
              <Input className="h-8" value={form.whatsapp_phone || ""}
                onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })} />
            </label>
          </div>

          {preview?.texts && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Testi che partono (il tracking vero sostituisce 1Z…)</summary>
              <p className="mt-2 font-medium">Oggetto: {preview.texts.oggetto}</p>
              <pre className="whitespace-pre-wrap bg-muted/40 p-2 rounded mt-1">{preview.texts.mail}</pre>
              <p className="mt-2 font-medium">WhatsApp</p>
              <pre className="whitespace-pre-wrap bg-muted/40 p-2 rounded mt-1">{preview.texts.wa}</pre>
            </details>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={!!form.test} onChange={(e) => setForm({ ...form, test: e.target.checked })} />
              Prova (ambiente di test UPS, gratis)
            </label>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => aggiornaAnteprima(form)}>
                Aggiorna anteprima
              </Button>
              <Button size="sm" disabled={busy || !!preview?.missing?.length} onClick={conferma}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Conferma e crea etichetta"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna spedizione per questa sessione.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded border bg-white p-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge className={r.direction === "ritiro" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}>
                {r.direction === "ritiro" ? "Ritiro" : "Riconsegna"}
              </Badge>
              {r.test_mode && <Badge className="bg-gray-200 text-gray-700">PROVA</Badge>}
              {r.tracking_url ? (
                <a href={r.tracking_url} target="_blank" rel="noreferrer" className="font-mono text-blue-700 inline-flex items-center gap-1">
                  {r.tracking} <ExternalLink className="w-3 h-3" />
                </a>
              ) : <span className="font-mono">{r.tracking}</span>}
              {r.packages > 1 && <span>{r.packages} colli</span>}
              {r.direction === "ritiro" && (
                r.pickup_prn
                  ? <span>ritiro {r.pickup_date ? new Date(r.pickup_date).toLocaleDateString("it-IT") : ""} (PRN {r.pickup_prn})</span>
                  : <span className={r.pickup_error ? "text-red-600" : "text-muted-foreground"}>
                      {r.pickup_error ? `ritiro NON prenotato: ${r.pickup_error}` : "senza prenotazione"}
                    </span>
              )}
              {r.cost != null && <span className="text-muted-foreground">{r.cost} {r.currency}</span>}
              <span className={r.email_error ? "text-red-600" : "text-muted-foreground"}>
                mail: {r.email_sent_at ? "inviata" : r.email_error ? "errore" : "—"}
              </span>
              <span className={r.whatsapp?.status === "failed" ? "text-red-600" : "text-muted-foreground"}>
                WhatsApp: {r.whatsapp ? ({ pending: "in coda", sending: "in invio", sent: "inviato", failed: "non inviato" } as Record<string, string>)[r.whatsapp.status] || r.whatsapp.status : "—"}
              </span>
              <a href={getShipmentLabelUrl(r.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700">
                <FileText className="w-3 h-3" /> Etichetta PDF
              </a>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
