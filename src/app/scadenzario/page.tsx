"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getExpiringCalibrations,
  getScheduleStats,
  sendScheduleNotification,
  sendCustomerNotification,
} from "@/lib/api";
import {
  CalendarClock,
  Loader2,
  Send,
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

interface ScheduleEntry {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  instrument_type: string;
  rdt_number: string;
  calibration_date: string;
  expiry_date: string;
  renewed: boolean;
  source: string;
}

interface GroupedCustomer {
  name: string;
  email: string;
  phone: string;
  instruments: ScheduleEntry[];
  minExpiry: string;
  daysLeft: number;
}

export default function ScadenzarioPage() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "scadute" | "30gg" | "90gg">("all");

  useEffect(() => {
    Promise.all([
      getExpiringCalibrations(90),
      getScheduleStats(),
    ])
      .then(([expData, statsData]) => {
        setEntries(expData.expiring || []);
        setStats(statsData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getDaysLeft = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // Raggruppa per cliente
  const grouped: GroupedCustomer[] = (() => {
    const map = new Map<string, GroupedCustomer>();
    for (const e of entries) {
      const name = (e.customer_name || "Sconosciuto").split(" P.IVA")[0].split(" P-IVA")[0].replace(/\u00a0/g, " ").trim();
      if (!map.has(name)) {
        map.set(name, {
          name,
          email: e.customer_email || "",
          phone: e.customer_phone || "",
          instruments: [],
          minExpiry: e.expiry_date,
          daysLeft: getDaysLeft(e.expiry_date),
        });
      }
      const g = map.get(name)!;
      g.instruments.push(e);
      if (e.expiry_date < g.minExpiry) {
        g.minExpiry = e.expiry_date;
        g.daysLeft = getDaysLeft(e.expiry_date);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.daysLeft - b.daysLeft);
  })();

  // Filtra
  const filtered = grouped.filter((g) => {
    if (filter === "scadute") return g.daysLeft < 0;
    if (filter === "30gg") return g.daysLeft >= 0 && g.daysLeft <= 30;
    if (filter === "90gg") return g.daysLeft > 30 && g.daysLeft <= 90;
    return true;
  });

  const handleNotifyCustomer = async (customerName: string) => {
    setSending(customerName);
    try {
      const result = await sendCustomerNotification(customerName);
      toast.success(`Notifica inviata a ${customerName}`, {
        description: `WA: ${result.results?.whatsapp ? "OK" : "NO"} | Email: ${result.results?.email ? "OK" : "NO"} | ${result.results?.count} strumenti`,
      });
    } catch (error) {
      toast.error(`Errore invio notifica a ${customerName}`);
    }
    setSending(null);
  };

  const handleNotifySingle = async (entry: ScheduleEntry) => {
    setSending(entry.id);
    try {
      const result = await sendScheduleNotification(entry.id);
      toast.success("Notifica inviata", {
        description: `${entry.instrument_type} — WA: ${result.results?.whatsapp ? "OK" : "NO"} | Email: ${result.results?.email ? "OK" : "NO"}`,
      });
    } catch (error) {
      toast.error("Errore invio notifica");
    }
    setSending(null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Scadenzario tarature</h2>

      {/* Statistiche */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.scadute}</p>
                <p className="text-sm text-gray-500">Scadute</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.entro_30_giorni}</p>
                <p className="text-sm text-gray-500">Entro 30gg</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <CalendarClock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.entro_90_giorni}</p>
                <p className="text-sm text-gray-500">Entro 90gg</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.valide}</p>
                <p className="text-sm text-gray-500">Valide</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filtri */}
      <div className="flex gap-2">
        {[
          { key: "all", label: "Tutti" },
          { key: "scadute", label: "Scadute" },
          { key: "30gg", label: "Entro 30gg" },
          { key: "90gg", label: "Entro 90gg" },
        ].map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.key as any)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Lista clienti */}
      <Card>
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold flex items-center gap-2">
            <CalendarClock className="w-5 h-5" />
            {filtered.length} clienti con tarature {filter === "scadute" ? "scadute" : filter === "all" ? "scadute/in scadenza" : `in scadenza (${filter})`}
          </h3>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-gray-500">
              Nessuna taratura trovata per questo filtro
            </p>
          ) : (
            filtered.map((customer) => (
              <div key={customer.name} className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-lg">{customer.name}</p>
                    <p className="text-sm text-gray-500">
                      {customer.email && <span className="mr-3">{customer.email}</span>}
                      {customer.phone && <span>{customer.phone}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      className={
                        customer.daysLeft < 0
                          ? "bg-red-100 text-red-800"
                          : customer.daysLeft <= 30
                          ? "bg-orange-100 text-orange-800"
                          : "bg-yellow-100 text-yellow-800"
                      }
                    >
                      {customer.daysLeft < 0
                        ? `SCADUTA da ${Math.abs(customer.daysLeft)}gg`
                        : `${customer.daysLeft}gg`}
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => handleNotifyCustomer(customer.name)}
                      disabled={sending === customer.name || (!customer.phone && !customer.email)}
                      title={!customer.phone && !customer.email ? "Nessun contatto disponibile" : "Invia notifica WhatsApp + Email"}
                    >
                      {sending === customer.name ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Send className="w-4 h-4 mr-1" />
                      )}
                      Notifica ({customer.instruments.length})
                    </Button>
                  </div>
                </div>
                {/* Lista strumenti */}
                <div className="ml-4 space-y-1">
                  {customer.instruments.map((inst) => {
                    const days = getDaysLeft(inst.expiry_date);
                    return (
                      <div
                        key={inst.id}
                        className="flex justify-between items-center text-sm py-1 border-b border-gray-100 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">{inst.instrument_type}</span>
                          <span className="text-gray-400">RDT {inst.rdt_number}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-xs">
                            Scad. {new Date(inst.expiry_date).toLocaleDateString("it-IT")}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleNotifySingle(inst)}
                            disabled={sending === inst.id}
                          >
                            {sending === inst.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Bell className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
