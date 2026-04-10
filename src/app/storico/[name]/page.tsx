"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCustomerHistory, markScheduleRenewed } from "@/lib/api";
import {
  ArrowLeft,
  Loader2,
  FileText,
  CheckCheck,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

export default function StoricoClientePage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  // Validazione parametro: rimuovi caratteri path/script, limita lunghezza (F9)
  const rawName = decodeURIComponent((params.name as string) || "");
  const customerName = rawName.replace(/[<>/\\]/g, "").slice(0, 200).trim();

  useEffect(() => {
    if (!customerName) {
      toast.error("Nome cliente non valido");
      router.push("/");
      return;
    }
    getCustomerHistory(customerName)
      .then(setData)
      .catch(() => toast.error("Errore nel caricamento"))
      .finally(() => setLoading(false));
  }, [customerName, router]);

  const getDaysLeft = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const handleMarkRenewed = async (id: string, rdt: string) => {
    if (!confirm(`Marcare RDT ${rdt} come rinnovato?`)) return;
    setActionId(id);
    try {
      await markScheduleRenewed(id);
      setData((prev: any) => ({
        ...prev,
        history: prev.history.map((h: any) =>
          h.id === id ? { ...h, renewed: true } : h
        ),
      }));
      toast.success(`RDT ${rdt} marcato come rinnovato`);
    } catch {
      toast.error("Errore");
    }
    setActionId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-center text-gray-500 mt-10">Nessun dato trovato</p>;
  }

  const active = data.history.filter((h: any) => !h.renewed);
  const renewed = data.history.filter((h: any) => h.renewed);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Indietro
        </Button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{customerName}</h2>
          <p className="text-sm text-gray-500">
            {data.total} rapporti totali — {data.active} attivi, {data.renewed} rinnovati
          </p>
        </div>
      </div>

      {/* Tarature attive */}
      <Card>
        <div className="p-4 border-b flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold">Tarature attive ({active.length})</h3>
        </div>
        <div className="divide-y">
          {active.length === 0 ? (
            <p className="p-6 text-center text-gray-500">Nessuna taratura attiva</p>
          ) : (
            active.map((h: any) => {
              const days = getDaysLeft(h.expiry_date);
              return (
                <div key={h.id} className="p-3 flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{h.instrument_type}</span>
                      {h.manufacturer && <span className="text-gray-500 text-sm">{h.manufacturer}</span>}
                      {h.model && <span className="text-gray-500 text-sm">{h.model}</span>}
                      {h.serial_number && (
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                          S/N {h.serial_number}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">
                      RDT {h.rdt_number} — Tarato: {new Date(h.calibration_date).toLocaleDateString("it-IT")}
                      {" "} — Scade: {new Date(h.expiry_date).toLocaleDateString("it-IT")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        days < 0
                          ? "bg-red-100 text-red-800"
                          : days <= 60
                          ? "bg-orange-100 text-orange-800"
                          : "bg-green-100 text-green-800"
                      }
                    >
                      {days < 0 ? `Scaduta ${Math.abs(days)}gg` : `${days}gg`}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-green-600 hover:text-green-800"
                      onClick={() => handleMarkRenewed(h.id, h.rdt_number)}
                      disabled={actionId === h.id}
                      title="Marca come rinnovato"
                    >
                      {actionId === h.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCheck className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Tarature rinnovate */}
      {renewed.length > 0 && (
        <Card>
          <div className="p-4 border-b flex items-center gap-2">
            <CheckCheck className="w-5 h-5 text-green-500" />
            <h3 className="font-semibold text-gray-600">
              Tarature rinnovate / archiviate ({renewed.length})
            </h3>
          </div>
          <div className="divide-y">
            {renewed.map((h: any) => (
              <div key={h.id} className="p-3 flex justify-between items-center opacity-60">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium line-through">{h.instrument_type}</span>
                    {h.manufacturer && <span className="text-gray-500 text-sm">{h.manufacturer}</span>}
                    {h.model && <span className="text-gray-500 text-sm">{h.model}</span>}
                    {h.serial_number && (
                      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        S/N {h.serial_number}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">
                    RDT {h.rdt_number} — Tarato: {new Date(h.calibration_date).toLocaleDateString("it-IT")}
                    {" "} — Scadeva: {new Date(h.expiry_date).toLocaleDateString("it-IT")}
                  </p>
                </div>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  Rinnovata
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
