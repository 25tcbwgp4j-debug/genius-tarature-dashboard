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
  markSessionPaid,
  updateSession,
  deleteSession,
  updateInstrument,
  deleteInstrument,
  addInstrument,
  getInstrumentTypes,
  getCustomerPastInstruments,
  getReceiptPdfUrl,
  getLabelsPdfUrl,
  getFatturaXmlUrl,
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
  Plus,
  Printer,
  Tag,
  FileDown,
  Euro,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { STATUS_CONFIG } from "@/lib/constants";
import { RecipientPanel } from "./RecipientPanel";

interface InstrumentType {
  id: string;
  name: string;
  price: number;
  code?: string;
}

interface PastInstrument {
  id: string;
  instrument_type_id?: string | null;
  instrument_name?: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  price?: number;
  rdt_number?: string | null;
  calibration_date?: string | null;
  instrument_types?: { id: string; name: string; price: number } | null;
}

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
  const [addingInstrument, setAddingInstrument] = useState(false);
  const [newInstrument, setNewInstrument] = useState<any>({
    instrument_type_id: "",
    instrument_name: "",
    manufacturer: "",
    model: "",
    serial_number: "",
    price: 0,
  });
  const [instrumentTypes, setInstrumentTypes] = useState<InstrumentType[]>([]);

  // Storico strumenti cliente (per riutilizzo senza re-inserimento)
  const [pastInstruments, setPastInstruments] = useState<PastInstrument[]>([]);
  const [showPastInstruments, setShowPastInstruments] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

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
    getInstrumentTypes()
      .then((data: any) => setInstrumentTypes(data.types || data || []))
      .catch(() => {});
  }, [sessionId]);

  // Quando ho il customer_id carico lo storico strumenti del cliente
  useEffect(() => {
    if (!session?.customer_id) return;
    getCustomerPastInstruments(session.customer_id)
      .then((data: { instruments?: PastInstrument[] }) => {
        setPastInstruments(data?.instruments || []);
      })
      .catch(() => setPastInstruments([]));
  }, [session?.customer_id]);

  // Riutilizza uno strumento storico: inserisce nella sessione corrente senza bisogno di reinserirlo
  const reuseInstrument = async (past: PastInstrument) => {
    setActionLoading("reuse_" + past.id);
    try {
      const typeId = past.instrument_type_id || past.instrument_types?.id || "";
      const typeName = past.instrument_types?.name || past.instrument_name || "";
      const price = Number(past.price ?? past.instrument_types?.price ?? 0);
      await addInstrument({
        session_id: sessionId,
        customer_id: session.customer_id,
        instrument_type_id: typeId || undefined,
        instrument_name: typeName,
        manufacturer: past.manufacturer,
        model: past.model,
        serial_number: past.serial_number,
        price,
      });
      await loadSession();
      toast.success(`Strumento "${typeName}" aggiunto dalla storia`);
    } catch {
      toast.error("Errore inserimento strumento");
    } finally {
      setActionLoading(null);
    }
  };

  // Apre il PDF ricevuta in una nuova tab (per stampa/salvataggio/invio)
  const openReceiptPdf = () => {
    setLoadingPdf(true);
    try {
      window.open(getReceiptPdfUrl(sessionId), "_blank");
    } finally {
      setTimeout(() => setLoadingPdf(false), 1000);
    }
  };

  // Apre il PDF etichette (50x30mm per strumento) in una nuova tab per stampa
  const openLabelsPdf = () => {
    window.open(getLabelsPdfUrl(sessionId), "_blank");
  };

  // Scarica il file XML FatturaPA pre-compilato per l'import in SimplyFatt
  const downloadFatturaXml = () => {
    window.location.href = getFatturaXmlUrl(sessionId);
  };

  const handleAddInstrument = async () => {
    if (!newInstrument.instrument_name) {
      toast.error("Seleziona un tipo strumento");
      return;
    }
    setActionLoading("add_inst");
    try {
      await addInstrument({
        session_id: sessionId,
        customer_id: session.customer_id,
        instrument_name: newInstrument.instrument_name,
        manufacturer: newInstrument.manufacturer || undefined,
        model: newInstrument.model || undefined,
        serial_number: newInstrument.serial_number || undefined,
        price: newInstrument.price || undefined,
      });
      toast.success("Strumento aggiunto");
      setAddingInstrument(false);
      setNewInstrument({
        instrument_type_id: "",
        instrument_name: "",
        manufacturer: "",
        model: "",
        serial_number: "",
        price: 0,
      });
      await loadSession();
    } catch (err: any) {
      toast.error(err.message || "Errore aggiunta strumento");
    }
    setActionLoading(null);
  };

  const handleSelectInstrumentType = (typeId: string) => {
    const t = instrumentTypes.find((x: InstrumentType) => x.id === typeId);
    if (t) {
      setNewInstrument({
        ...newInstrument,
        instrument_type_id: t.id,
        instrument_name: t.name,
        price: t.price,
      });
    }
  };

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
            variant="outline"
            size="sm"
            onClick={openReceiptPdf}
            disabled={loadingPdf}
            className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
          >
            {loadingPdf ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Printer className="w-4 h-4 mr-1" />}
            Stampa ricevuta
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openLabelsPdf}
            className="bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
            title="Genera PDF con un'etichetta 50x30mm per ogni strumento"
          >
            <Tag className="w-4 h-4 mr-1" />
            Stampa etichette
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadFatturaXml}
            className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            title="Scarica XML FatturaPA da importare in SimplyFatt"
          >
            <FileDown className="w-4 h-4 mr-1" />
            Fattura XML
          </Button>
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
        <h3 className="font-semibold text-lg mb-3">Cliente (chi paga)</h3>
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

      {/* Destinatario diverso (proprietario strumento) */}
      <RecipientPanel
        sessionId={sessionId}
        session={session}
        customer={customer}
        onSaved={loadSession}
      />


      {/* Storico strumenti cliente - collapsible */}
      {pastInstruments.length > 0 && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <button
            type="button"
            className="w-full flex items-center justify-between text-left"
            onClick={() => setShowPastInstruments(!showPastInstruments)}
          >
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-amber-700" />
              <span className="font-semibold text-amber-900">
                Strumenti gia registrati per questo cliente ({pastInstruments.length})
              </span>
              <span className="text-xs text-amber-700">
                — clicca per riutilizzarli senza reinserirli
              </span>
            </div>
            {showPastInstruments ? (
              <ChevronUp className="w-5 h-5 text-amber-700" />
            ) : (
              <ChevronDown className="w-5 h-5 text-amber-700" />
            )}
          </button>
          {showPastInstruments && (
            <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
              {pastInstruments.map((past: PastInstrument) => {
                const alreadyInSession = instruments.some(
                  (i: { serial_number?: string; model?: string; manufacturer?: string }) =>
                    (i.serial_number || "").toUpperCase() === (past.serial_number || "").toUpperCase() &&
                    (i.model || "").toUpperCase() === (past.model || "").toUpperCase() &&
                    (i.manufacturer || "").toUpperCase() === (past.manufacturer || "").toUpperCase()
                );
                const typeName = past.instrument_types?.name || past.instrument_name || "—";
                const price = Number(past.price ?? past.instrument_types?.price ?? 0);
                return (
                  <div
                    key={past.id}
                    className="flex items-center justify-between bg-white p-2 rounded border border-amber-200 text-sm"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{typeName}</div>
                      <div className="text-xs text-gray-600">
                        {past.manufacturer || "—"} {past.model || ""} - Matr. {past.serial_number || "—"}
                        {past.rdt_number && (
                          <span className="ml-2 text-gray-500">(ultimo RDT: {past.rdt_number})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-700">EUR {price.toFixed(2)}</span>
                      {alreadyInSession ? (
                        <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
                          Gia nella sessione
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700 h-8"
                          onClick={() => reuseInstrument(past)}
                          disabled={actionLoading === "reuse_" + past.id}
                        >
                          {actionLoading === "reuse_" + past.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Plus className="w-3 h-3 mr-1" />
                              Aggiungi
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Strumenti (con aggiunta/modifica/cancella) */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-lg">
            Strumenti ({instruments.length})
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-blue-600">
              EUR {parseFloat(session.total_amount || 0).toFixed(2)}
            </span>
            {!addingInstrument && (
              <Button
                size="sm"
                onClick={() => setAddingInstrument(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-1" /> Aggiungi strumento
              </Button>
            )}
          </div>
        </div>

        {/* Form aggiunta strumento */}
        {addingInstrument && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="font-semibold mb-3 text-green-900">Nuovo strumento</h4>
            <div className="grid grid-cols-6 gap-2 mb-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Tipo strumento *</label>
                <select
                  className="w-full h-9 text-sm border rounded px-2 bg-white"
                  value={newInstrument.instrument_type_id}
                  onChange={(e) => handleSelectInstrumentType(e.target.value)}
                >
                  <option value="">-- Seleziona --</option>
                  {instrumentTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (EUR {t.price})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">Marca</label>
                <Input
                  value={newInstrument.manufacturer}
                  onChange={(e) => setNewInstrument({ ...newInstrument, manufacturer: e.target.value })}
                  className="h-9 text-sm"
                  placeholder="es. Testo"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Modello</label>
                <Input
                  value={newInstrument.model}
                  onChange={(e) => setNewInstrument({ ...newInstrument, model: e.target.value })}
                  className="h-9 text-sm"
                  placeholder="es. 550"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Seriale/Matr.</label>
                <Input
                  value={newInstrument.serial_number}
                  onChange={(e) => setNewInstrument({ ...newInstrument, serial_number: e.target.value })}
                  className="h-9 text-sm"
                  placeholder="es. 12345"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Prezzo EUR</label>
                <Input
                  type="number"
                  step="0.01"
                  value={newInstrument.price}
                  onChange={(e) => setNewInstrument({ ...newInstrument, price: parseFloat(e.target.value) || 0 })}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAddingInstrument(false);
                  setNewInstrument({
                    instrument_type_id: "",
                    instrument_name: "",
                    manufacturer: "",
                    model: "",
                    serial_number: "",
                    price: 0,
                  });
                }}
              >
                <X className="w-4 h-4 mr-1" /> Annulla
              </Button>
              <Button
                size="sm"
                onClick={handleAddInstrument}
                disabled={actionLoading === "add_inst" || !newInstrument.instrument_name}
                className="bg-green-600 hover:bg-green-700"
              >
                {actionLoading === "add_inst" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Save className="w-4 h-4 mr-1" />
                )}
                Salva strumento
              </Button>
            </div>
          </div>
        )}

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
          {/* PULSANTE 1: Registrazione completata — sempre cliccabile (si puo' re-inviare dopo aggiungere strumenti) */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-blue-600 hover:bg-blue-700"
            disabled={actionLoading !== null}
            onClick={() => {
              if (!confirm("Completare la registrazione e inviare ricevuta WhatsApp al cliente?")) return;
              handleAction("register", () => registerComplete(sessionId),
                "Registrazione completata! Ricevuta inviata al cliente.")
            }}
          >
            {actionLoading === "register" ? <Loader2 className="w-6 h-6 animate-spin" /> : <ClipboardCheck className="w-6 h-6" />}
            <span className="text-xs">REGISTRAZIONE COMPLETATA</span>
          </Button>

          {/* PULSANTE 2: Notifica pronti per ritiro — sempre cliccabile */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-green-600 hover:bg-green-700"
            disabled={actionLoading !== null}
            onClick={() => {
              if (!confirm("Inviare notifica pronti al ritiro (WhatsApp + email)?")) return;
              handleAction("ready", () => notifyReady(sessionId),
                "Cliente notificato: strumenti pronti per il ritiro!");
            }}
          >
            {actionLoading === "ready" ? <Loader2 className="w-6 h-6 animate-spin" /> : <Bell className="w-6 h-6" />}
            <span className="text-xs">NOTIFICA PRONTI RITIRO</span>
          </Button>

          {/* PULSANTE 3: Invia proforma — sempre cliccabile */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-orange-600 hover:bg-orange-700"
            disabled={actionLoading !== null}
            onClick={() => {
              if (!confirm("Inviare proforma via WhatsApp e email al cliente?")) return;
              handleAction("proforma", () => sendProforma(sessionId),
                "Proforma inviata al cliente!");
            }}
          >
            {actionLoading === "proforma" ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileText className="w-6 h-6" />}
            <span className="text-xs">INVIA PROFORMA</span>
          </Button>

          {/* PULSANTE 4: Genera rapporti RDT — sempre cliccabile */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-purple-600 hover:bg-purple-700"
            disabled={actionLoading !== null}
            onClick={() =>
              handleAction("rdts", () => generateRdts(sessionId),
                "Rapporti di taratura generati!")
            }
          >
            {actionLoading === "rdts" ? <Loader2 className="w-6 h-6 animate-spin" /> : <FileOutput className="w-6 h-6" />}
            <span className="text-xs">GENERA RAPPORTI</span>
          </Button>

          {/* PULSANTE 5: Strumenti riconsegnati — sempre cliccabile */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-gray-700 hover:bg-gray-800"
            disabled={actionLoading !== null}
            onClick={() => {
              if (!confirm("Chiudere la sessione e marcare gli strumenti come riconsegnati?")) return;
              handleAction("delivered", () => markDelivered(sessionId),
                "Sessione completata! Strumenti riconsegnati.");
            }}
          >
            {actionLoading === "delivered" ? <Loader2 className="w-6 h-6 animate-spin" /> : <PackageCheck className="w-6 h-6" />}
            <span className="text-xs">STRUMENTI RICONSEGNATI</span>
          </Button>

          {/* PULSANTE 6: Segna come pagato — visibile solo se non gia' pagato.
              Utile dopo import fattura su SimplyFatt e ricezione bonifico. */}
          {session.payment_status !== "pagato" && (
            <Button
              size="lg"
              className="h-20 flex flex-col gap-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={actionLoading !== null}
              onClick={async () => {
                const method = prompt(
                  "Metodo pagamento? (bonifico, contanti, pos, paypal, assegno, carta)",
                  "bonifico",
                );
                if (!method) return;
                const notes = prompt("Note opzionali (premi OK per saltare):", "") || undefined;
                handleAction("mark_paid", () => markSessionPaid(sessionId, {
                  payment_method: method.toLowerCase(),
                  payment_notes: notes,
                }), "Pagamento registrato!");
              }}
            >
              {actionLoading === "mark_paid" ? <Loader2 className="w-6 h-6 animate-spin" /> : <Euro className="w-6 h-6" />}
              <span className="text-xs">SEGNA COME PAGATO</span>
            </Button>
          )}
          {session.payment_status === "pagato" && (
            <div className="h-20 flex flex-col items-center justify-center bg-emerald-50 border-2 border-emerald-200 rounded-md text-emerald-700">
              <Euro className="w-6 h-6" />
              <span className="text-xs font-semibold">PAGATO</span>
              {session.payment_method && (
                <span className="text-[10px] text-emerald-600">{session.payment_method}</span>
              )}
            </div>
          )}
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
