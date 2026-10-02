"use client";

// Spedizioni UPS o DHL della sessione (02/10/2026: una società, due divisioni, stessi corrieri): ritiro dal cliente (etichetta + corriere prenotato)
// e riconsegna degli strumenti tarati. Mail al cliente e WhatsApp dalla linea staff
// partono in automatico dopo la conferma (il WhatsApp lo manda il worker sul VPS).

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ExternalLink, FileText, Loader2, Package, Printer, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { COSTO_AR, COSTO_SOLA, CostoSpedizione, ETICHETTA_AR, ETICHETTA_SOLA, costoDaSessione, eur, type Costo, type SessioneSpedizione } from "./SpedizioneSessione";
import {
  updateSession,
  cancelShipment,
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
  carrier: "UPS" | "DHL" | null;
  pickup_location: string | null;
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
  status: string;
  created_at: string;
}

interface Preview {
  address: ShipmentAddress;
  missing: string[];
  /** riconsegna senza pagamento (e senza differito concordato): avviso, si può forzare alla conferma */
  payment_block?: string | null;
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

// Stampa l'etichetta dalla dashboard: il PDF si carica in un riquadro nascosto e si apre
// la finestra di stampa del browser (niente download, niente popup bloccati).
async function stampaEtichetta(shipmentId: string) {
  try {
    const res = await fetch(getShipmentLabelUrl(shipmentId));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, "_blank");
      }
      setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
    };
    document.body.appendChild(frame);
  } catch (e: unknown) {
    toast.error(`Etichetta non stampabile: ${(e as Error).message}`);
  }
}

export function ShipmentsPanel({ sessionId, session, onSessioneAggiornata }: {
  sessionId: string; session?: SessioneSpedizione; onSessioneAggiornata?: () => void;
}) {
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  // costo della spedizione da addebitare al cliente (va in fattura/pro forma): modificabile qui
  const [costo, setCosto] = useState<Costo | null>(null);
  const aCaricoCliente = !!session?.shipping_by_customer;
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
      carrier: "UPS",
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
    // proposta: quello già scritto in sessione, altrimenti A/R (ritiro) o sola riconsegna (metà)
    const salvato = session ? costoDaSessione(session) : null;
    setCosto(salvato?.incluso ? salvato : dir === "ritiro"
      ? { incluso: true, importo: COSTO_AR, etichetta: ETICHETTA_AR }
      : { incluso: true, importo: COSTO_SOLA, etichetta: ETICHETTA_SOLA });
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
    setCosto(null);
  };

  // salva in sessione il costo scelto (se diverso da quello già salvato)
  const salvaCosto = async () => {
    if (!costo || aCaricoCliente || !session) return;
    const s = costoDaSessione(session);
    if (s.incluso === costo.incluso && Math.abs(s.importo - costo.importo) < 0.005 && (!costo.incluso || s.etichetta === costo.etichetta)) return;
    try {
      await updateSession(sessionId, {
        shipping_included: costo.incluso, shipping_amount_gross: costo.incluso ? costo.importo : 0, shipping_label: costo.etichetta,
        ...(form?.direction === "riconsegna" ? { return_by_courier: true } : { arrived_by_courier: true, return_by_courier: true }),
      });
      toast.success(costo.incluso ? `Spedizione in fattura: ${eur(costo.importo)}` : "Nessun costo di spedizione in fattura");
      onSessioneAggiornata?.();
    } catch (e: unknown) {
      toast.error(`Costo spedizione non salvato: ${(e as Error).message}`);
    }
  };

  const conferma = async () => {
    if (!form) return;
    const cor = form.carrier || "UPS";
    const cosa = form.direction === "ritiro"
      ? `RITIRO ${cor} dal cliente${form.book_pickup ? ` con corriere il ${form.pickup_date}` : " senza prenotazione"}`
      : `RICONSEGNA ${cor} al cliente${form.book_pickup ? ` con ritiro da noi il ${form.pickup_date}` : ""}`;
    const avvisi = [
      form.test ? `PROVA: ambiente di test ${cor}, nessun costo, niente mail né WhatsApp.` : `Etichetta VERA a pagamento sul conto ${cor}.`,
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
      if (!form.test) await salvaCosto();
      chiudi();
      await load();
      // Niente stampa automatica (dava due fogli bianchi): si usa «Stampa etichetta» o «Apri PDF»
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore spedizione", { duration: 12000 });
    } finally {
      setBusy(false);
    }
  };

  const annulla = async (r: ShipmentRow) => {
    const cor = r.carrier || "UPS";
    if (!confirm(`Annullare con ${cor} la spedizione ${r.tracking}?\n\n` +
      (r.pickup_prn ? "Viene annullato anche il ritiro prenotato: il corriere non passa.\n" : "") +
      "L'etichetta non sarà addebitata. Mail e WhatsApp già inviati NON si possono ritirare.")) return;
    setBusy(true);
    try {
      await cancelShipment(r.id);
      toast.success(`Spedizione annullata con ${cor}`);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Annullamento non riuscito", { duration: 12000 });
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
          <h3 className="font-semibold text-base">Spedizioni UPS / DHL</h3>
          {session && (
            <span className="text-xs text-muted-foreground">
              · in fattura: {aCaricoCliente ? "a carico del cliente (0 €)" : costoDaSessione(session).incluso ? eur(costoDaSessione(session).importo) : "nessun costo"}
            </span>
          )}
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

          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground mr-1">Corriere</span>
            {(["UPS", "DHL"] as const).map((c) => (
              <Button key={c} size="sm" variant={(form.carrier || "UPS") === c ? "default" : "outline"} className="h-7"
                onClick={() => setForm({
                  ...form, carrier: c,
                  // riconsegna: con DHL il ritiro da noi va prenotato, con UPS no (passa ogni pomeriggio)
                  ...(direction === "riconsegna" ? { book_pickup: c === "DHL", pickup_date: c === "DHL" ? (form.pickup_date || prossimoGiornoLavorativo()) : null } : {}),
                })}>{c}</Button>
            ))}
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
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!form.book_pickup}
                  onChange={(e) => setForm({ ...form, book_pickup: e.target.checked, pickup_date: e.target.checked ? (form.pickup_date || prossimoGiornoLavorativo()) : null })} />
                Prenota il ritiro del corriere da noi (Viale Somalia)
              </label>
              {form.book_pickup && (
                <label className="flex items-center gap-1">
                  Giorno
                  <Input type="date" className="h-8 w-40" value={form.pickup_date || ""}
                    onChange={(e) => setForm({ ...form, pickup_date: e.target.value })} />
                </label>
              )}
              {(form.carrier || "UPS") === "UPS" && !form.book_pickup && <span className="text-muted-foreground">UPS passa da noi ogni pomeriggio alle 16:30.</span>}
            </div>
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
          {preview?.payment_block && !form.test ? (
            <p className="rounded-md border border-red-500/50 bg-red-500/10 p-2 text-sm font-medium text-red-700">
              ⚠️ {preview.payment_block}</p>
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

          {session && (
            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50/60 p-2 text-sm dark:bg-amber-950/20">
              <div className="font-medium">Costo della spedizione da addebitare al cliente (in fattura / pro forma)</div>
              {aCaricoCliente ? (
                <p className="text-muted-foreground">La sessione è segnata «spedizione a carico del cliente»: nessun costo in fattura.</p>
              ) : costo && (
                <>
                  <CostoSpedizione valore={costo} onChange={setCosto} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    Solo riconsegna = metà dell&apos;andata e ritorno. Si salva in sessione alla conferma, oppure ora:
                    <Button size="sm" variant="outline" className="h-7" onClick={salvaCosto}>Salva costo</Button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={!!form.test} onChange={(e) => setForm({ ...form, test: e.target.checked })} />
              Prova (ambiente di test {form.carrier || "UPS"}, gratis)
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
              <b>{r.carrier || "UPS"}</b>
              <Badge className={r.direction === "ritiro" ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"}>
                {r.direction === "ritiro" ? "Ritiro" : "Riconsegna"}
              </Badge>
              {r.test_mode && <Badge className="bg-gray-200 text-gray-700">PROVA</Badge>}
              {r.status === "annullata" && <Badge className="bg-red-100 text-red-700">ANNULLATA</Badge>}
              {r.tracking_url ? (
                <a href={r.tracking_url} target="_blank" rel="noreferrer" className="font-mono text-blue-700 inline-flex items-center gap-1">
                  {r.tracking} <ExternalLink className="w-3 h-3" />
                </a>
              ) : <span className="font-mono">{r.tracking}</span>}
              {r.packages > 1 && <span>{r.packages} colli</span>}
              {r.direction === "riconsegna" && r.pickup_prn && (
                <span>ritiro da noi {r.pickup_date ? new Date(r.pickup_date).toLocaleDateString("it-IT") : ""} ({r.pickup_prn})</span>
              )}
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
              <Button size="sm" variant="outline" className="h-7" onClick={() => stampaEtichetta(r.id)}>
                <Printer className="w-3 h-3 mr-1" /> Stampa etichetta
              </Button>
              <a href={getShipmentLabelUrl(r.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700">
                <FileText className="w-3 h-3" /> Apri PDF
              </a>
              {r.status !== "annullata" && (
                <Button size="sm" variant="ghost" className="h-7 text-red-700" disabled={busy} onClick={() => annulla(r)}>
                  <X className="w-3 h-3 mr-1" /> Annulla
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
