"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  getSession,
  registerComplete,
  notifyReady,
  sendProforma,
  markDelivered,
} from "@/lib/api";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Bell,
  FileText,
  PackageCheck,
  ArrowLeft,
  Loader2,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; step: number }> = {
  registrazione: { label: "Registrazione in corso", color: "bg-yellow-100 text-yellow-800", step: 0 },
  in_lavorazione: { label: "In lavorazione", color: "bg-blue-100 text-blue-800", step: 1 },
  pronto_ritiro: { label: "Pronto per ritiro", color: "bg-green-100 text-green-800", step: 2 },
  attesa_pagamento: { label: "Attesa pagamento", color: "bg-orange-100 text-orange-800", step: 3 },
  completata: { label: "Completata", color: "bg-gray-100 text-gray-800", step: 4 },
};

export default function SessionDetail() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

      {/* Strumenti */}
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
            <div key={inst.id} className="py-3 flex justify-between items-center">
              <div>
                <p className="font-medium">
                  {i + 1}. {inst.instrument_name}
                </p>
                <p className="text-sm text-gray-500">
                  {inst.manufacturer} {inst.model}
                  {inst.serial_number && ` - Matr. ${inst.serial_number}`}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">EUR {parseFloat(inst.price || 0).toFixed(2)}</p>
                {inst.rdt_number && (
                  <Badge variant="outline" className="text-xs">
                    RDT {inst.rdt_number}
                  </Badge>
                )}
              </div>
            </div>
          ))}
          {instruments.length === 0 && (
            <p className="py-4 text-center text-gray-500">Nessuno strumento registrato</p>
          )}
        </div>
      </Card>

      {/* 4 PULSANTI AZIONE */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">Azioni</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* PULSANTE 1: Registrazione completata */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-blue-600 hover:bg-blue-700"
            disabled={currentStep !== 0 || actionLoading !== null}
            onClick={() =>
              handleAction(
                "register",
                () => registerComplete(sessionId),
                "Registrazione completata! Ricevuta inviata al cliente."
              )
            }
          >
            {actionLoading === "register" ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <ClipboardCheck className="w-6 h-6" />
            )}
            <span className="text-sm">REGISTRAZIONE COMPLETATA</span>
          </Button>

          {/* PULSANTE 2: Notifica pronti per ritiro */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-green-600 hover:bg-green-700"
            disabled={currentStep !== 1 || actionLoading !== null}
            onClick={() =>
              handleAction(
                "ready",
                () => notifyReady(sessionId),
                "Cliente notificato: strumenti pronti per il ritiro!"
              )
            }
          >
            {actionLoading === "ready" ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Bell className="w-6 h-6" />
            )}
            <span className="text-sm">NOTIFICA PRONTI PER RITIRO</span>
          </Button>

          {/* PULSANTE 3: Invia proforma */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-orange-600 hover:bg-orange-700"
            disabled={(currentStep !== 1 && currentStep !== 2) || actionLoading !== null}
            onClick={() =>
              handleAction(
                "proforma",
                () => sendProforma(sessionId),
                "Proforma inviata al cliente!"
              )
            }
          >
            {actionLoading === "proforma" ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <FileText className="w-6 h-6" />
            )}
            <span className="text-sm">INVIA PROFORMA</span>
          </Button>

          {/* PULSANTE 4: Strumenti riconsegnati */}
          <Button
            size="lg"
            className="h-20 flex flex-col gap-1 bg-gray-700 hover:bg-gray-800"
            disabled={currentStep === 4 || currentStep === 0 || actionLoading !== null}
            onClick={() =>
              handleAction(
                "delivered",
                () => markDelivered(sessionId),
                "Sessione completata! Strumenti riconsegnati."
              )
            }
          >
            {actionLoading === "delivered" ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <PackageCheck className="w-6 h-6" />
            )}
            <span className="text-sm">STRUMENTI RICONSEGNATI</span>
          </Button>
        </div>

        {/* Timeline stato */}
        <Separator className="my-4" />
        <div className="flex justify-between text-xs text-gray-500">
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
    </div>
  );
}
