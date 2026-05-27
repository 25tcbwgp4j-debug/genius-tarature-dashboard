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
  sendLatCertificates,
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
  getReviewStatus,
  sendReviewRequest,
  markReviewReceived,
} from "@/lib/api";
import { toast } from "sonner";
import {
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
  ShieldCheck,
  History,
  ChevronDown,
  ChevronUp,
  Mail,
  MessageCircle,
  Star,
  Send,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { STATUS_CONFIG } from "@/lib/constants";
import { RecipientPanel } from "./RecipientPanel";
import { ChangeCustomerDialog } from "./ChangeCustomerDialog";
import { EditCustomerDialog } from "./EditCustomerDialog";

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

// Formatta ISO date string in "DD/MM/YYYY HH:MM" per timestamp UI
function formatItDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return null; }
}

function ActionTimestamp({ ts, prefix }: { ts: string | null | undefined; prefix?: string }) {
  const f = formatItDateTime(ts);
  return (
    <p className="text-[10px] text-center text-gray-500 h-3">
      {f
        ? <>{prefix ? `${prefix} ` : ""}Inviato: <span className="font-medium text-gray-700">{f}</span></>
        : <span className="text-gray-300">{prefix ? `${prefix} —` : "—"}</span>}
    </p>
  );
}

export default function SessionDetail() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Suffix proforma SimplyFatt (1-2 cifre): completa la causale come 'PF-AAAA-00XX'
  const [proformaSuffix, setProformaSuffix] = useState<string>("");
  // Spese di spedizione (porto IVA), default 36.60 EUR lordo, modificabile
  const [shippingIncluded, setShippingIncluded] = useState<boolean>(false);
  const [shippingAmount, setShippingAmount] = useState<string>("36.60");
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
      const res = await fn();
      // Estrai il canale WhatsApp usato (template Meta vs free text) dalla
      // risposta del backend per dare feedback chiaro all'operatore.
      const wa = res?.notifications?.whatsapp;
      let detail = successMsg;
      if (wa && typeof wa === "object") {
        if (wa.ok) {
          if (wa.mode === "template") {
            detail = wa.forced
              ? `${successMsg} — template Meta inviato (apertura conversazione)`
              : `${successMsg} — template Meta inviato (cliente fuori finestra 24h)`;
          } else if (wa.mode === "free_text") {
            detail = `${successMsg} — messaggio diretto (finestra 24h aperta)`;
          }
        } else if (wa.error) {
          toast.error(`WhatsApp: ${String(wa.error).slice(0, 200)}`);
          await loadSession();
          return;
        }
      }
      toast.success(detail);
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
          {/* 22/05 ripristino logica 7c053b9: se la sessione e' in
              "attesa_pagamento" (proforma inviata, lavoro gia' finito) e il
              cliente HA PAGATO, il badge workflow mostra "Pronto al ritiro"
              perche' manca solo il ritiro fisico. Backend invariato: la
              transizione di stato resta manuale (attesa_pagamento -> completata
              via "Strumenti riconsegnati"). Per status diversi da
              attesa_pagamento (es. in_lavorazione + pagato in anticipo) il
              badge resta quello reale: il pagamento NON implica fine lavoro. */}
          {(() => {
            const isPaidWaiting =
              session.payment_status === "pagato" &&
              session.status === "attesa_pagamento";
            const effective = isPaidWaiting ? "pronto_ritiro" : session.status;
            return (
              <Badge className={STATUS_CONFIG[effective]?.color || ""}>
                {STATUS_CONFIG[effective]?.label || effective}
              </Badge>
            );
          })()}
          {/* Badge pagamento: verde se pagato, arancio se attesa, grigio altrimenti */}
          {session.payment_status === "pagato" ? (
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
              PAGATO{session.payment_method ? ` · ${session.payment_method}` : ""}
            </Badge>
          ) : session.payment_status === "in_attesa" ? (
            <Badge className="bg-orange-100 text-orange-800 border-orange-300">
              Da pagare
            </Badge>
          ) : null}
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
            title="Genera PDF etichette di taratura 50x22mm per ogni strumento"
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
            variant="outline"
            size="sm"
            disabled={actionLoading === "lat_cert"}
            onClick={async () => {
              if (!confirm(
                "Inviare via email al cliente tutti i certificati LAT/ACCREDIA dei nostri campioni di riferimento?\n\n" +
                "Saranno allegati tutti i PDF archiviati (~7MB totali)."
              )) return;
              try {
                setActionLoading("lat_cert");
                const r = await sendLatCertificates(sessionId);
                toast.success(`${r.attachments_count} certificati LAT inviati a ${r.recipient}`);
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Errore invio";
                toast.error(msg);
              } finally { setActionLoading(null); }
            }}
            className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
            title="Invia al cliente via email tutti i certificati LAT/ACCREDIA dei campioni di riferimento"
          >
            {actionLoading === "lat_cert" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
            Invia certificati LAT
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg">Cliente (chi paga)</h3>
        </div>
        <div className="flex justify-end mb-2 gap-2">
          <EditCustomerDialog
            customer={customer}
            onSaved={loadSession}
          />
          <ChangeCustomerDialog
            sessionId={sessionId}
            currentCustomerId={customer.id}
            currentCustomerName={customer.company_name}
            onChanged={loadSession}
          />
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-gray-500">Ragione sociale:</span>
            <p className="font-medium">{customer.company_name}</p>
          </div>
          <div>
            <span className="text-gray-500">P.IVA:</span>
            <p className="font-medium">{customer.vat_number || "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">Codice fiscale:</span>
            <p>{customer.tax_id || "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">Codice SDI:</span>
            <p>{customer.sdi_code || "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">PEC:</span>
            <p>{customer.pec || "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">Email:</span>
            <p>{customer.email || "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">Indirizzo:</span>
            <p>{customer.address || "N/D"}{customer.zip_code ? `, ${customer.zip_code}` : ""} {customer.city || ""}{customer.province ? ` (${customer.province})` : ""}</p>
          </div>
          <div>
            <span className="text-gray-500">Tel. fisso:</span>
            <p>{customer.phone1 || "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">Cellulare:</span>
            <p>{customer.mobile || "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">WhatsApp:</span>
            <p>{customer.whatsapp_phone || "N/D"}</p>
          </div>
          <div>
            <span className="text-gray-500">Referente:</span>
            <p>{customer.contact_person || "N/D"}</p>
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
                /* Modifica strumento — 20/05 ora include conversione TIPO */
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500">
                        Tipo strumento <span className="text-purple-600 font-semibold">(conversione)</span>
                      </label>
                      <select
                        value={editInstrumentData?.instrument_type_id || ""}
                        onChange={(e) => {
                          const newTypeId = e.target.value;
                          const t = instrumentTypes.find((x: InstrumentType) => x.id === newTypeId);
                          setEditInstrumentData({
                            ...editInstrumentData,
                            instrument_type_id: newTypeId || null,
                            instrument_name: t?.name || editInstrumentData?.instrument_name || "",
                            price: t ? parseFloat(String(t.price)) : (editInstrumentData?.price || 0),
                          });
                        }}
                        className="h-8 text-sm w-full border rounded px-2"
                        title="Cambia tipo strumento (es. CERCAFUGHE -> BILANCIA): aggiorna nome+prezzo automaticamente"
                      >
                        <option value="">— Nessuno —</option>
                        {instrumentTypes.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} (EUR {parseFloat(String(t.price)).toFixed(2)})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Nome (override)</label>
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
                          instrument_type_id: inst.instrument_type_id || inst.instrument_types?.id || "",
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
        {/* Audit P1.13: responsive — 1 col su mobile, 2 su tablet, 3 su desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* PULSANTE 1: Registrazione completata — split Email/WhatsApp + timestamp per canale */}
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex flex-col gap-0.5">
                <Button
                  size="lg"
                  className="h-20 flex flex-col gap-1 bg-sky-600 hover:bg-sky-700"
                  disabled={actionLoading !== null}
                  title="Invia SOLO email registrazione (retry indipendente)"
                  onClick={() => {
                    if (!confirm("Inviare SOLO l'email di registrazione completata al cliente?")) return;
                    handleAction("register_email", () => registerComplete(sessionId, "email"),
                      "Email registrazione completata inviata");
                  }}
                >
                  {actionLoading === "register_email" ? <Loader2 className="w-6 h-6 animate-spin" /> : <Mail className="w-6 h-6" />}
                  <span className="text-xs leading-tight">REGISTRAZ.<br/>EMAIL</span>
                </Button>
                <ActionTimestamp ts={session.receipt_email_at} prefix="📧" />
              </div>
              <div className="flex flex-col gap-0.5">
                <Button
                  size="lg"
                  className="h-20 flex flex-col gap-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={actionLoading !== null}
                  title="Invia SOLO template Meta WhatsApp (retry indipendente)"
                  onClick={() => {
                    if (!confirm("Inviare SOLO il template WhatsApp di registrazione completata al cliente?")) return;
                    handleAction("register_wa", () => registerComplete(sessionId, "whatsapp"),
                      "Template WhatsApp registrazione completata inviato");
                  }}
                >
                  {actionLoading === "register_wa" ? <Loader2 className="w-6 h-6 animate-spin" /> : <MessageCircle className="w-6 h-6" />}
                  <span className="text-xs leading-tight">REGISTRAZ.<br/>WHATSAPP</span>
                </Button>
                <ActionTimestamp ts={session.receipt_whatsapp_at} prefix="💬" />
              </div>
            </div>
          </div>

          {/* PULSANTE 2: Notifica pronti per ritiro — split Email/WhatsApp + timestamp per canale */}
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex flex-col gap-0.5">
                <Button
                  size="lg"
                  className="h-20 flex flex-col gap-1 bg-green-600 hover:bg-green-700"
                  disabled={actionLoading !== null}
                  title="Invia SOLO email pronti al ritiro (retry indipendente)"
                  onClick={() => {
                    if (!confirm("Inviare SOLO l'email pronti al ritiro al cliente?")) return;
                    handleAction("ready_email", () => notifyReady(sessionId, "email"),
                      "Email pronti al ritiro inviata");
                  }}
                >
                  {actionLoading === "ready_email" ? <Loader2 className="w-6 h-6 animate-spin" /> : <Mail className="w-6 h-6" />}
                  <span className="text-xs leading-tight">PRONTI<br/>EMAIL</span>
                </Button>
                <ActionTimestamp ts={session.ready_email_at} prefix="📧" />
              </div>
              <div className="flex flex-col gap-0.5">
                <Button
                  size="lg"
                  className="h-20 flex flex-col gap-1 bg-green-700 hover:bg-green-800"
                  disabled={actionLoading !== null}
                  title="Invia SOLO template WhatsApp pronti al ritiro (retry indipendente)"
                  onClick={() => {
                    if (!confirm("Inviare SOLO il template WhatsApp pronti al ritiro al cliente?")) return;
                    handleAction("ready_wa", () => notifyReady(sessionId, "whatsapp"),
                      "Template WhatsApp pronti al ritiro inviato");
                  }}
                >
                  {actionLoading === "ready_wa" ? <Loader2 className="w-6 h-6 animate-spin" /> : <MessageCircle className="w-6 h-6" />}
                  <span className="text-xs leading-tight">PRONTI<br/>WHATSAPP</span>
                </Button>
                <ActionTimestamp ts={session.ready_whatsapp_at} prefix="💬" />
              </div>
            </div>
          </div>

          {/* PULSANTE 3: Invia proforma — split Email/WhatsApp + timestamp + input causale/spedizione condivisi */}
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex flex-col gap-0.5">
                <Button
                  size="lg"
                  className="h-16 flex flex-col gap-0.5 bg-orange-600 hover:bg-orange-700"
                  disabled={actionLoading !== null}
                  title="Invia SOLO email proforma (retry indipendente)"
                  onClick={() => {
                    const suffix = proformaSuffix.trim();
                    const shipAmt = parseFloat(shippingAmount.replace(",", ".")) || 0;
                    if (!confirm("Inviare SOLO l'email proforma al cliente?")) return;
                    handleAction(
                      "proforma_email",
                      () => sendProforma(sessionId, suffix, {
                        included: shippingIncluded,
                        amount: shippingIncluded ? shipAmt : undefined,
                      }, "email"),
                      "Email proforma inviata"
                    );
                  }}
                >
                  {actionLoading === "proforma_email" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
                  <span className="text-xs leading-tight">PROFORMA<br/>EMAIL</span>
                </Button>
                <ActionTimestamp ts={session.proforma_email_at} prefix="📧" />
              </div>
              <div className="flex flex-col gap-0.5">
                <Button
                  size="lg"
                  className="h-16 flex flex-col gap-0.5 bg-orange-700 hover:bg-orange-800"
                  disabled={actionLoading !== null}
                  title="Invia SOLO template WhatsApp proforma (retry indipendente)"
                  onClick={() => {
                    const suffix = proformaSuffix.trim();
                    const shipAmt = parseFloat(shippingAmount.replace(",", ".")) || 0;
                    if (!confirm("Inviare SOLO il template WhatsApp proforma al cliente?")) return;
                    handleAction(
                      "proforma_wa",
                      () => sendProforma(sessionId, suffix, {
                        included: shippingIncluded,
                        amount: shippingIncluded ? shipAmt : undefined,
                      }, "whatsapp"),
                      "Template WhatsApp proforma inviato"
                    );
                  }}
                >
                  {actionLoading === "proforma_wa" ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                  <span className="text-xs leading-tight">PROFORMA<br/>WHATSAPP</span>
                </Button>
                <ActionTimestamp ts={session.proforma_whatsapp_at} prefix="💬" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <label className="text-[10px] text-gray-500 whitespace-nowrap">N° SimplyFatt:</label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={2}
                placeholder="es. 03"
                value={proformaSuffix}
                onChange={(e) => setProformaSuffix(e.target.value.replace(/\D/g, "").slice(0, 2))}
                className="h-7 text-xs text-center font-mono"
              />
            </div>
            {/* Spedizione opzionale: checkbox + importo modificabile (default 36.60 lordo) */}
            <label className="flex items-center gap-1 mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={shippingIncluded}
                onChange={(e) => setShippingIncluded(e.target.checked)}
                className="h-3 w-3"
              />
              <span className="text-[10px] text-gray-700 leading-tight">
                + Spedizione (porto IVA)
              </span>
            </label>
            <div className="flex items-center gap-1">
              <Input
                type="text"
                inputMode="decimal"
                placeholder="36.60"
                value={shippingAmount}
                onChange={(e) => setShippingAmount(e.target.value.replace(/[^\d,.]/g, ""))}
                disabled={!shippingIncluded}
                className="h-7 text-xs text-right font-mono disabled:bg-gray-100 disabled:text-gray-400"
                title="Importo lordo spedizione (IVA inclusa). Default 36,60 EUR."
              />
              <span className="text-[10px] text-gray-500">EUR</span>
            </div>
          </div>

          {/* PULSANTE 4: Genera rapporti RDT */}
          <div className="flex flex-col gap-1">
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
            {/* Ultimo RDT generato: max rdt_generated_at fra gli strumenti della sessione */}
            <ActionTimestamp ts={
              (instruments || [])
                .map((i: { rdt_generated_at?: string | null }) => i.rdt_generated_at || "")
                .filter((v: string) => !!v)
                .sort()
                .pop()
            } />
          </div>

          {/* PULSANTE 5: Strumenti riconsegnati — operazione INTERNA staff.
               Christian 06/05: NESSUNA comunicazione al cliente (ne' WA ne' email).
               Solo cambio status a 'completata' + creazione voci scadenzario
               +365gg per ogni strumento. */}
          <div className="flex flex-col gap-1">
            <Button
              size="lg"
              className="h-20 flex flex-col gap-1 bg-gray-700 hover:bg-gray-800"
              disabled={actionLoading !== null}
              onClick={() => {
                if (!confirm("Chiudere la sessione e marcare gli strumenti come riconsegnati? (operazione interna, nessuna comunicazione al cliente)")) return;
                handleAction("delivered", () => markDelivered(sessionId),
                  "Sessione completata! Strumenti riconsegnati.");
              }}
            >
              {actionLoading === "delivered" ? <Loader2 className="w-6 h-6 animate-spin" /> : <PackageCheck className="w-6 h-6" />}
              <span className="text-xs">STRUMENTI RICONSEGNATI</span>
            </Button>
            <ActionTimestamp ts={session.delivered_at} />
          </div>

          {/* PULSANTE 6: Pagamento — 3 mini-pulsanti SEMPRE visibili.
               Il metodo attualmente registrato è evidenziato (bordo emerald-700
               + check); cliccando su uno diverso si modifica la modalità. */}
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-3 gap-1">
              {([
                { method: "bonifico", label: "BONIFICO" },
                { method: "contanti", label: "CONTANTI" },
                { method: "pos", label: "POS" },
              ] as const).map(({ method, label }) => {
                const loadingKey = `mark_paid_${method}`;
                const isActive = session.payment_status === "pagato" && session.payment_method === method;
                const isPaid = session.payment_status === "pagato";
                return (
                  <Button
                    key={method}
                    size="lg"
                    className={`h-20 flex flex-col gap-0.5 px-1 transition-all ${
                      isActive
                        ? "bg-emerald-700 hover:bg-emerald-800 ring-2 ring-emerald-900 ring-offset-1"
                        : isPaid
                        ? "bg-emerald-400 hover:bg-emerald-500 opacity-70"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                    disabled={actionLoading !== null || isActive}
                    title={
                      isActive
                        ? `Pagato via ${label} (attuale)`
                        : isPaid
                        ? `Modificare il metodo a ${label}`
                        : `Marca come pagato — ${label}`
                    }
                    onClick={() => {
                      const confirmMsg = isPaid
                        ? `Modificare il metodo di pagamento da "${session.payment_method?.toUpperCase() || "—"}" a "${label}"?`
                        : `Confermare pagamento ricevuto via ${label}?`;
                      if (!confirm(confirmMsg)) return;
                      handleAction(
                        loadingKey,
                        () => markSessionPaid(sessionId, { payment_method: method }),
                        isPaid ? `Metodo aggiornato a ${label}!` : `Pagamento registrato (${label})!`,
                      );
                    }}
                  >
                    {actionLoading === loadingKey ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Euro className="w-5 h-5" />
                    )}
                    <span className="text-[10px] leading-tight font-bold">
                      {isActive ? `✓ ${label}` : label}
                    </span>
                  </Button>
                );
              })}
            </div>
            <ActionTimestamp ts={session.payment_date} />
            {/* Stripe Checkout link — round 5 max-power 10/05.
                Se non ancora pagata, mostra bottone per generare link condivisibile. */}
            {session.payment_status !== "pagato" && (
              <Button
                size="sm"
                variant="outline"
                className="mt-1 h-7 text-[11px] border-purple-300 text-purple-700 hover:bg-purple-50"
                disabled={actionLoading !== null}
                title="Genera link Stripe Checkout — il cliente paga in 1 click via carta"
                onClick={async () => {
                  if (!confirm("Generare un link Stripe Checkout? Il cliente potrà pagare con carta in 1 click. Riceverai notifica Telegram al pagamento.")) return;
                  setActionLoading("stripe_link");
                  try {
                    const r = await fetch(
                      `${process.env.NEXT_PUBLIC_API_URL || ""}/api/backend/sessions/${sessionId}/checkout-link`,
                      { method: "POST" }
                    );
                    if (!r.ok) throw new Error(`Backend ${r.status}`);
                    const data = await r.json();
                    // Copia URL in clipboard + apri nuova tab + toast persistente
                    if (data.url) {
                      try { await navigator.clipboard.writeText(data.url); } catch { /* noop */ }
                      window.open(data.url, "_blank");
                      toast.success("Link Stripe generato e copiato in clipboard", {
                        description: `EUR ${data.amount_eur?.toFixed(2)} — Condividi via WhatsApp/email`,
                        duration: 10000,
                      });
                    } else {
                      toast.error("Errore: nessun URL ricevuto");
                    }
                  } catch (e: unknown) {
                    toast.error(`Errore generazione link: ${(e as Error).message}`);
                  } finally {
                    setActionLoading(null);
                  }
                }}
              >
                {actionLoading === "stripe_link" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                💳 Genera link Stripe (paga online)
              </Button>
            )}
          </div>
        </div>

        {/* Timeline stato */}
        <Separator className="my-4" />
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-gray-500">
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

      {/* === SEZIONE RICHIESTA RECENSIONE ===
           Visibile per sessioni completate o con review già inviata. */}
      {(session.delivered_at || session.review_request_sent_at) && (
        <ReviewRequestSection sessionId={sessionId} delivered={!!session.delivered_at} />
      )}

      {/* Info aggiuntive */}
      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
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


// === Componente sezione richiesta recensione ===
function ReviewRequestSection({ sessionId, delivered }: { sessionId: string; delivered: boolean }) {
  const [status, setStatus] = useState<{
    review_request_due_at: string | null;
    review_request_sent_at: string | null;
    review_received: boolean;
    review_score: number | null;
    review_received_at: string | null;
    email: { sent_at: string | null; status: string | null; recipient: string | null; error: string | null };
    whatsapp: { sent_at: string | null; status: string | null; recipient: string | null; error: string | null };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getReviewStatus(sessionId);
      setStatus(data);
    } catch {
      // ignora errori (probabilmente sessione senza review)
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [sessionId]);

  const handleSend = async () => {
    if (!confirm("Inviare richiesta recensione via Email e WhatsApp al cliente?")) return;
    setSending(true);
    try {
      await sendReviewRequest(sessionId);
      toast.success("Richiesta recensione inviata!");
      await load();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err?.message || "Errore invio richiesta recensione");
    } finally {
      setSending(false);
    }
  };

  const handleMarkReceived = async (score: number) => {
    setSending(true);
    try {
      await markReviewReceived(sessionId, true, score);
      toast.success(`Recensione ${score}⭐ registrata`);
      await load();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err?.message || "Errore registrazione recensione");
    } finally {
      setSending(false);
    }
  };

  const handleClearReceived = async () => {
    if (!confirm("Rimuovere la conferma di recensione ricevuta?")) return;
    setSending(true);
    try {
      await markReviewReceived(sessionId, false);
      toast.success("Recensione rimossa");
      await load();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err?.message || "Errore");
    } finally {
      setSending(false);
    }
  };

  const sentAtAny = status?.review_request_sent_at || status?.email.sent_at || status?.whatsapp.sent_at;
  const dueAt = status?.review_request_due_at;
  const emailOk = status?.email.status === "inviata";
  const waOk = status?.whatsapp.status === "inviata";

  return (
    <Card className="p-4 border-l-4 border-l-yellow-400 bg-yellow-50/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          <h3 className="font-semibold text-base">Richiesta recensione Google</h3>
        </div>
        {status?.review_received ? (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
            ✅ Recensione ricevuta {status.review_score ? `${status.review_score}⭐` : ""}
          </Badge>
        ) : sentAtAny ? (
          <Badge className="bg-blue-100 text-blue-800">Inviata</Badge>
        ) : dueAt ? (
          <Badge className="bg-gray-100 text-gray-700">
            Programmata: {new Date(dueAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </Badge>
        ) : (
          <Badge className="bg-gray-100 text-gray-600">Non ancora richiesta</Badge>
        )}
      </div>

      {loading && <p className="text-xs text-gray-500">Caricamento...</p>}

      {!loading && status && (
        <>
          {/* Timeline canali */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {/* Email */}
            <div className="flex items-start gap-2 p-2 rounded bg-white border">
              <Mail className="w-4 h-4 text-blue-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">Email</div>
                {status.email.sent_at ? (
                  <>
                    <div className="text-xs text-gray-600">
                      {emailOk ? <CheckCircle2 className="w-3 h-3 inline text-emerald-600 mr-1" /> : <AlertCircle className="w-3 h-3 inline text-red-600 mr-1" />}
                      {new Date(status.email.sent_at).toLocaleString("it-IT")}
                    </div>
                    {status.email.recipient && <div className="text-xs text-gray-500 truncate">{status.email.recipient}</div>}
                    {status.email.error && <div className="text-xs text-red-600">{status.email.error}</div>}
                  </>
                ) : (
                  <div className="text-xs text-gray-400">Non inviata</div>
                )}
              </div>
            </div>
            {/* WhatsApp */}
            <div className="flex items-start gap-2 p-2 rounded bg-white border">
              <MessageCircle className="w-4 h-4 text-green-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">WhatsApp</div>
                {status.whatsapp.sent_at ? (
                  <>
                    <div className="text-xs text-gray-600">
                      {waOk ? <CheckCircle2 className="w-3 h-3 inline text-emerald-600 mr-1" /> : <AlertCircle className="w-3 h-3 inline text-red-600 mr-1" />}
                      {new Date(status.whatsapp.sent_at).toLocaleString("it-IT")}
                    </div>
                    {status.whatsapp.recipient && <div className="text-xs text-gray-500 truncate">{status.whatsapp.recipient}</div>}
                    {status.whatsapp.error && <div className="text-xs text-red-600">{status.whatsapp.error}</div>}
                  </>
                ) : (
                  <div className="text-xs text-gray-400">Non inviato</div>
                )}
              </div>
            </div>
          </div>

          {/* Azioni */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={sending || !delivered}
              onClick={handleSend}
              title={!delivered ? "Disponibile dopo 'Strumenti riconsegnati'" : "Invia richiesta recensione ora (email + WA)"}
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
              {sentAtAny ? "Re-invia richiesta" : "Richiedi recensione"}
            </Button>

            {/* Score selector */}
            {!status.review_received ? (
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-xs text-gray-500 mr-1">Recensione ricevuta?</span>
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={sending}
                    onClick={() => handleMarkReceived(s)}
                    className="text-yellow-400 hover:text-yellow-500 disabled:opacity-50"
                    title={`Marca ${s} stelle`}
                  >
                    <Star className="w-5 h-5" />
                  </button>
                ))}
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={handleClearReceived} disabled={sending} className="ml-auto text-xs">
                Annulla recensione
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
