"use client";

import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getExpiringCalibrations,
  getScheduleStats,
  sendScheduleNotification,
  sendCustomerNotification,
  markScheduleRenewed,
} from "@/lib/api";
import {
  CalendarClock,
  Loader2,
  Send,
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle,
  Search,
  X,
  CheckCheck,
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

const RANGE_OPTIONS = [
  { key: "scadute", label: "Scadute", days: -99999 },
  { key: "30gg", label: "30 giorni", days: 30 },
  { key: "90gg", label: "90 giorni", days: 90 },
  { key: "3mesi", label: "3 mesi", days: 90 },
  { key: "6mesi", label: "6 mesi", days: 183 },
  { key: "12mesi", label: "12 mesi", days: 365 },
  { key: "custom", label: "Personalizzato", days: 0 },
];

export default function ScadenzarioPage() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [maxDays, setMaxDays] = useState(365);

  // Carica dati con range ampio (12 mesi) per avere tutto
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getExpiringCalibrations(maxDays),
      getScheduleStats(),
    ])
      .then(([expData, statsData]) => {
        setEntries(expData.expiring || []);
        setStats(statsData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [maxDays]);

  const getDaysLeft = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // Raggruppa per cliente
  const grouped: GroupedCustomer[] = useMemo(() => {
    const map = new Map<string, GroupedCustomer>();
    for (const e of entries) {
      const name = (e.customer_name || "Sconosciuto")
        .split(" P.IVA")[0].split(" P-IVA")[0]
        .replace(/\u00a0/g, " ").trim();
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
  }, [entries]);

  // Filtra per stato temporale
  const filteredByTime = useMemo(() => {
    return grouped.filter((g) => {
      if (filter === "all") return true;
      if (filter === "scadute") return g.daysLeft < 0;
      if (filter === "30gg") return g.daysLeft >= 0 && g.daysLeft <= 30;
      if (filter === "90gg") return g.daysLeft >= 0 && g.daysLeft <= 90;
      if (filter === "3mesi") return g.daysLeft >= 0 && g.daysLeft <= 90;
      if (filter === "6mesi") return g.daysLeft >= 0 && g.daysLeft <= 183;
      if (filter === "12mesi") return g.daysLeft >= 0 && g.daysLeft <= 365;
      if (filter === "custom") {
        // Filtra per range date personalizzato
        for (const inst of g.instruments) {
          const expiry = inst.expiry_date;
          if (customFrom && expiry < customFrom) continue;
          if (customTo && expiry > customTo) continue;
          return true;
        }
        return false;
      }
      return true;
    });
  }, [grouped, filter, customFrom, customTo]);

  // Filtra per ricerca testuale (nome azienda, numero seriale, RDT)
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return filteredByTime;
    const q = searchQuery.trim().toLowerCase();
    return filteredByTime.filter((g) => {
      // Cerca nel nome cliente
      if (g.name.toLowerCase().includes(q)) return true;
      // Cerca negli strumenti (tipo, RDT, seriale)
      for (const inst of g.instruments) {
        if ((inst.instrument_type || "").toLowerCase().includes(q)) return true;
        if ((inst.rdt_number || "").toLowerCase().includes(q)) return true;
        // Il seriale non e' nella tabella schedule ma cerchiamo comunque nel nome
      }
      return false;
    });
  }, [filteredByTime, searchQuery]);

  const handleNotifyCustomer = async (customerName: string) => {
    setSending(customerName);
    try {
      const result = await sendCustomerNotification(customerName);
      toast.success(`Notifica inviata a ${customerName}`, {
        description: `WA: ${result.results?.whatsapp ? "OK" : "NO"} | Email: ${result.results?.email ? "OK" : "NO"} | ${result.results?.count} strumenti`,
      });
    } catch {
      toast.error(`Errore invio notifica a ${customerName}`);
    }
    setSending(null);
  };

  const handleMarkRenewed = async (entry: ScheduleEntry) => {
    if (!confirm(`Marcare come rinnovato RDT ${entry.rdt_number} (${entry.instrument_type})?\nNon apparira piu nello scadenzario.`)) return;
    setSending(entry.id + "_renew");
    try {
      await markScheduleRenewed(entry.id);
      // Rimuovi dalla lista locale
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      toast.success(`RDT ${entry.rdt_number} marcato come rinnovato`);
    } catch {
      toast.error("Errore nel marcare come rinnovato");
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
    } catch {
      toast.error("Errore invio notifica");
    }
    setSending(null);
  };

  const handleFilterChange = (f: string) => {
    setFilter(f);
    // Se seleziona range grandi, aumenta il maxDays per caricare piu dati
    if (f === "6mesi" && maxDays < 183) setMaxDays(183);
    if (f === "12mesi" && maxDays < 365) setMaxDays(365);
  };

  // Conteggi rapidi per i badge dei filtri
  const counts = useMemo(() => {
    const scadute = grouped.filter((g) => g.daysLeft < 0).length;
    const e30 = grouped.filter((g) => g.daysLeft >= 0 && g.daysLeft <= 30).length;
    const e90 = grouped.filter((g) => g.daysLeft >= 0 && g.daysLeft <= 90).length;
    const e6m = grouped.filter((g) => g.daysLeft >= 0 && g.daysLeft <= 183).length;
    const e12m = grouped.filter((g) => g.daysLeft >= 0 && g.daysLeft <= 365).length;
    return { scadute, e30, e90, e6m, e12m, all: grouped.length };
  }, [grouped]);

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

      {/* Barra ricerca */}
      <div className="flex gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Cerca per nome azienda, RDT, tipo strumento..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {searchQuery && (
          <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Filtri temporali */}
      <div className="flex gap-2 flex-wrap items-center">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("all")}
        >
          Tutti ({counts.all})
        </Button>
        <Button
          variant={filter === "scadute" ? "default" : "outline"}
          size="sm"
          className={filter === "scadute" ? "" : "border-red-300 text-red-600 hover:bg-red-50"}
          onClick={() => handleFilterChange("scadute")}
        >
          Scadute ({counts.scadute})
        </Button>
        <Button
          variant={filter === "30gg" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("30gg")}
        >
          30 giorni ({counts.e30})
        </Button>
        <Button
          variant={filter === "90gg" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("90gg")}
        >
          90 giorni ({counts.e90})
        </Button>
        <Button
          variant={filter === "6mesi" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("6mesi")}
        >
          6 mesi ({counts.e6m})
        </Button>
        <Button
          variant={filter === "12mesi" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("12mesi")}
        >
          12 mesi ({counts.e12m})
        </Button>
        <Button
          variant={filter === "custom" ? "default" : "outline"}
          size="sm"
          onClick={() => handleFilterChange("custom")}
        >
          Personalizzato
        </Button>
      </div>

      {/* Range personalizzato */}
      {filter === "custom" && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex gap-4 items-end">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Da (scadenza)</label>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 w-44"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">A (scadenza)</label>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 w-44"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setCustomFrom(""); setCustomTo(""); }}
            >
              Reset
            </Button>
          </div>
        </Card>
      )}

      {/* Lista clienti */}
      <Card>
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold flex items-center gap-2">
            <CalendarClock className="w-5 h-5" />
            {filtered.length} clienti
            {searchQuery && ` per "${searchQuery}"`}
          </h3>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-gray-500">
              Nessuna taratura trovata per questi filtri
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
                      {!customer.email && !customer.phone && <span className="text-red-400">Nessun contatto</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      className={
                        customer.daysLeft < 0
                          ? "bg-red-100 text-red-800"
                          : customer.daysLeft <= 30
                          ? "bg-orange-100 text-orange-800"
                          : customer.daysLeft <= 90
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
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
                  {customer.instruments.map((inst) => (
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
                          className="h-6 px-2 text-xs text-green-600 hover:text-green-800 hover:bg-green-50"
                          onClick={() => handleMarkRenewed(inst)}
                          disabled={sending === inst.id + "_renew"}
                          title="Marca come rinnovato (rimuovi dallo scadenzario)"
                        >
                          {sending === inst.id + "_renew" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCheck className="w-3 h-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleNotifySingle(inst)}
                          disabled={sending === inst.id}
                          title="Invia notifica per questo strumento"
                        >
                          {sending === inst.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Bell className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
