"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  getSession,
  registerComplete,
  notifyReady,
  sendProforma,
  markDelivered,
  generateRdts,
  updateSession,
  deleteSession,
  updateInstrument,
  deleteInstrument,
} from "@/lib/api";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Bell,
  FileText,
  PackageCheck,
  ArrowLeft,
  Loader2,
  Pencil,
  Trash2,
  Save,
  X,
  FileOutput,
} from "lucide-react";
import { STATUS_CONFIG } from "@/lib/constants";

export default function SessionDetail() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingInstrument, setEditingInstrument] = useState<string | null>(null);
  const [editInstrumentData, setEditInstrumentData] = useState<any>(null);
  const [editingSession, setEditingSession] = useState(false);
  const [editSessionData, setEditSessionData] = useState<any>(null);

  const sessionId = params.id as string;

  const loadSession = async () => {
    try {
      const data = await getSession(sessionId);
      setSession(data);
    } catch {
      toast.error("Errore nel caricamento della sessione");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const handleAction = async (
    action: string,
    fn: () => Promise<any>,
    successMsg: string
  ) => {
    setActionLoading(action);
    try {
      await fn();
      toast.success(successMsg);
      await loadSession();
    } catch (err: any) {
      toast.error(err.message || "Errore nell'operazione");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteSession = async () => {
    if (!confirm("Sei sicuro di voler eliminare questa sessione e tutti i suoi strumenti?")) return;
    setActionLoading("delete");
    try {
      await deleteSession(sessionId);
      toast.success("Sessione eliminata");
      router.push("/sessioni");
    } catch (err: any) {
      toast.error(err.message || "Errore eliminazione");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveSession = async () => {
    setActionLoading("save_session");
    try {
      await updateSession(sessionId, editSessionData);
      toast.success("Sessione aggiornata");
      setEditingSession(false);
      await loadSession();
    } catch (err: any) {
      toast.error(err.message || "Errore aggiornamento");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveInstrument = async () => {
    if (!editingInstrument || !editInstrumentData) return;
    setActionLoading("save_inst");
    try {
      await updateInstrument(editingInstrument, {
        ...editInstrumentData,
        session_id: sessionId,
      });
      toast.success("Strumento aggiornato");
      setEditingInstrument(null);
      setEditInstrumentData(null);
      await loadSession();
    } catch (err: any) {
      toast.error(err.message || "Errore aggiornamento");
    }
    setActionLoading(null);
  };

  const handleDeleteInstrument = async (instId: string) => {
    if (!confirm("Eliminare questo strumento?")) return;
    try {
      await deleteInstrument(instId, sessionId);
      toast.success("Strumento eliminato");
      await loadSession();
    } catch (err: any) {
      toast.error(err.message || "Errore eliminazione");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session) {
    return <p className="text-center text-gray-500 mt-10">Sessione non trovata</p>;
  }

  const customer = session.customers || {};
  const instruments = session.instruments || [];
  const currentStep = STATUS_CONFIG[session.status]?.step || 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Indietro
          </Button>
          <h2 className="text-2xl font-bold text-gray-900">Dettaglio sessione</h2>
          <Badge className={STATUS_CONFIG[session.status]?.color || ""}>
            {STATUS_CONFIG[session.status]?.label || session.status}
          </Badge>
        </div>
        <div className="flex gap-2">
          {!editingSession ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditSessionData({
                  operator: session.operator || "",
                  notes: session.notes || "",
                  status: session.status,
                });
                setEditingSession(true);
              }}
            >
              <Pencil className="w-4 h-4 mr-1" /> Modifica
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditingSession(false)}>
                <X className="w-4 h-4 mr-1" /> Annulla
              </Button>
              <Button size="sm" onClick={handleSaveSession} disabled={actionLoading === "save_session"}>
                {actionLoading === "save_session" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Salva
              </Button>
            </>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteSession}
            disabled={actionLoading === "delete"}
          >
            {actionLoading === "delete" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
            Elimina
          </Button>
        </div>
      </div>

      {/* Info sessione (editabile) */}
      {editingSession && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <h4 className="font-semibold mb-2">Modifica sessione</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500">Operatore</label>
              <Input
                value={editSessionData?.operator || ""}
                onChange={(e) => setEditSessionData({ ...editSessionData, operator: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Stato</label>
              <select
                className="w-full h-8 text-sm border rounded px-2"
                value={editSessionData?.status || ""}
                onChange={(e) => setEditSessionData({ ...editSessionData, status: e.target.value })}
              >
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Note</label>
              <Input
                value={editSessionData?.notes || ""}
                onChange={(e) => setEditSessionData({ ...editSessionData, notes: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Info cliente */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-3">Cliente</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Ragione sociale:</span>
            <p className="font-medium">{customer.company_name}</p>
          </div>
          <div>
            <span className="text-gray-500">P.IVA:</span>
            <p className="font-medium">{customer.vat_number || "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">Indirizzo:</span>
            <p>{customer.address}, {customer.zip_code} {customer.city}</p>
          </div>
          <div>
            <span className="text-gray-500">Contatti:</span>
            <p>{customer.email || customer.mobile || customer.phone1 || "N/D"}</p>
          </div>
        </div>
      </Card>

      {/* Strumenti (con modifica/cancella) */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-lg">
            Strumenti ({instruments.length})
          </h3>
          <span className="text-lg font-bold text-blue-600">
            EUR {parseFloat(session.total_amount || 0).toFixed(2)}
          </span>
        </div>
        <div className="divide-y">
          {instruments.map((inst: any, i: number) => (
            <div key={inst.id} className="py-3">
              {editingInstrument === inst.id ? (
                /* Modifica strumento */
                <div className="space-y-2">
                  <div className="grid grid-cols-5 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">Tipo</label>
                      <Input
                        value={editInstrumentData?.instrument_name || ""}
                        onChange={(e) => setEditInstrumentData({ ...editInstrumentData, instrument_name: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Marca</label>
                      <Input
                        value={editInstrumentData?.manufacturer || ""}
                        onChange={(e) => setEditInstrumentData({ ...editInstrumentData, manufacturer: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Modello</label>
                      <Input
                        value={editInstrumentData?.model || ""}
                        onChange={(e) => setEditInstrumentData({ ...editInstrumentData, model: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Seriale/Matricola</label>
                      <Input
                        value={editInstrumentData?.serial_number || ""}
                        onChange={(e) => setEditInstrumentData({ ...editInstrumentData, serial_number: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Prezzo EUR</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={editInstrumentData?.price || ""}
                        onChange={(e) => setEditInstrumentData({ ...editInstrumentData, price: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => { setEditingInstrument(null); setEditInstrumentData(null); }}>
                      <X className="w-4 h-4 mr-1" /> Annulla
                    </Button>
                    <Button size="sm" onClick={handleSaveInstrument} disabled={actionLoading === "save_inst"}>
                      {actionLoading === "save_inst" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                      Salva
                    </Button>
                  </div>
                </div>
              ) : (
                /* Visualizzazione strumento */
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">
                      {i + 1}. {inst.instrument_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {inst.manufacturer} {inst.model}
                      {inst.serial_number && ` - Matr. ${inst.serial_number}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right mr-2">
                      <p className="font-medium">EUR {parseFloat(inst.price || 0).toFixed(2)}</p>
                      {inst.rdt_number && (
                        <Badge variant="outline" className="text-xs">
                          RDT {inst.rdt_number}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingInstrument(inst.id);
                        setEditInstrumentData({
                          instrument_name: inst.instrument_name || "",
                          manufacturer: inst.manufacturer || "",
                          model: inst.model || "",
                          serial_number: inst.serial_number || "",
                          price: inst.price || 0,
                        });
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteInstrument(inst.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {instruments.length === 0 && (
            <p className="py-4 text-center text-gray-500">Nessuno strumento registrato</p>
          )}
        </div>
      </Card>

      {/* 5 PULSANTI AZIONE */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">Azioni</h3>
        <div className="grid grid-cols-3 gap-4">
          {/* PULSANTE 1: Registrazione completata */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-blue-600 hover:bg-blue-700"
            disabled={currentStep !== 0 || actionLoading !== null}
            onClick={() =>
              handleAction("register", () => registerComplete(sessionId),
                "Registrazione completata! Ricevuta inviata al cliente.")
            }
          >
            {actionLoading === "register" ? <Loader2 className="w-6 h-6 animate-spin" /> : <ClipboardCheck className="w-6 h-6" />}
            <span className="text-xs">REGISTRAZIONE COMPLETATA</span>
          </Button>

          {/* PULSANTE 2: Notifica pronti per ritiro */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-green-600 hover:bg-green-700"
            disabled={currentStep !== 1 || actionLoading !== null}
            onClick={() => {
              if (!confirm("Inviare notifica WhatsApp al cliente?")) return;
              handleAction("ready", () => notifyReady(sessionId),
                "Cliente notificato: strumenti pronti per il ritiro!")
            }
          >
            {actionLoading === "ready" ? <Loader2 className="w-6 h-6 animate-spin" /> : <Bell className="w-6 h-6" />}
            <span className="text-xs">NOTIFICA PRONTI RITIRO</span>
          </Button>

          {/* PULSANTE 3: Invia proforma */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-orange-600 hover:bg-orange-700"
            disabled={(currentStep !== 1 && currentStep !== 2) || actionLoading !== null}
            onClick={() => {
              if (!confirm("Inviare proforma via WhatsApp e email al cliente?")) return;
              handleAction("proforma", () => sendProforma(sessionId),
                "Proforma inviata al cliente!")
            }
          >
            {actionLoading === "proforma" ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileText className="w-6 h-6" />}
            <span className="text-xs">INVIA PROFORMA</span>
          </Button>

          {/* PULSANTE 4: Genera rapporti RDT */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-purple-600 hover:bg-purple-700"
            disabled={currentStep === 0 || actionLoading !== null}
            onClick={() =>
              handleAction("rdts", () => generateRdts(sessionId),
                "Rapporti di taratura generati!")
            }
          >
            {actionLoading === "rdts" ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileOutput className="w-6 h-6" />}
            <span className="text-xs">GENERA RAPPORTI</span>
          </Button>

          {/* PULSANTE 5: Strumenti riconsegnati */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-gray-700 hover:bg-gray-800"
            disabled={currentStep === 4 || currentStep === 0 || actionLoading !== null}
            onClick={() => {
              if (!confirm("Chiudere la sessione e marcare gli strumenti come riconsegnati?")) return;
              handleAction("delivered", () => markDelivered(sessionId),
                "Sessione completata! Strumenti riconsegnati.")
            }
          >
            {actionLoading === "delivered" ? <Loader2 className="w-6 h-6 animate-spin" /> : <PackageCheck className="w-6 h-6" />}
            <span className="text-xs">STRUMENTI RICONSEGNATI</span>
          </Button>
        </div>

        {/* Timeline stato */}
        <Separator className="my-4" />
        <div className="grid grid-cols-4 gap-2 text-xs text-gray-500">
          <div className={currentStep >= 1 ? "text-blue-600 font-medium" : ""}>
            {session.registered_at
              ? `Registrato: ${new Date(session.registered_at).toLocaleString("it-IT")}`
              : "Non registrato"}
          </div>
          <div className={currentStep >= 2 ? "text-green-600 font-medium" : ""}>
            {session.ready_at
              ? `Pronto: ${new Date(session.ready_at).toLocaleString("it-IT")}`
              : "Non notificato"}
          </div>
          <div className={currentStep >= 3 ? "text-orange-600 font-medium" : ""}>
            {session.proforma_sent_at
              ? `Proforma: ${new Date(session.proforma_sent_at).toLocaleString("it-IT")}`
              : "Non inviata"}
          </div>
          <div className={currentStep >= 4 ? "text-gray-700 font-medium" : ""}>
            {session.delivered_at
              ? `Consegnato: ${new Date(session.delivered_at).toLocaleString("it-IT")}`
              : "Non consegnato"}
          </div>
        </div>
      </Card>

      {/* Info aggiuntive */}
      <Card className="p-4">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">ID:</span>
            <p className="font-mono text-xs">{session.id?.substring(0, 8)}</p>
          </div>
          <div>
            <span className="text-gray-500">Data:</span>
            <p>{session.session_date ? new Date(session.session_date).toLocaleDateString("it-IT") : "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">Operatore:</span>
            <p>{session.operator || "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">Note:</span>
            <p>{session.notes || "—"}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
