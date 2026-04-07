"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getExpiringCalibrations } from "@/lib/api";
import { CalendarClock, Loader2 } from "lucide-react";

export default function ScadenzarioPage() {
  const [expiring, setExpiring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getExpiringCalibrations(90)
      .then((data) => setExpiring(data.expiring || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getDaysLeft = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Scadenzario tarature</h2>

      <Card>
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <CalendarClock className="w-5 h-5" />
            Tarature in scadenza (prossimi 90 giorni)
          </h3>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : expiring.length === 0 ? (
            <p className="p-8 text-center text-gray-500">
              Nessuna taratura in scadenza nei prossimi 90 giorni
            </p>
          ) : (
            expiring.map((item) => {
              const days = getDaysLeft(item.expiry_date);
              const urgency =
                days <= 0 ? "bg-red-100 text-red-800" :
                days <= 7 ? "bg-orange-100 text-orange-800" :
                "bg-yellow-100 text-yellow-800";

              return (
                <div key={item.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">
                      {item.customers?.company_name || "N/D"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {item.instruments?.instrument_name} {item.instruments?.manufacturer} {item.instruments?.model}
                      {item.instruments?.serial_number && ` (${item.instruments.serial_number})`}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge className={urgency}>
                      {days <= 0 ? "SCADUTA" : `${days} giorni`}
                    </Badge>
                    <p className="text-xs text-gray-500 mt-1">
                      Scade: {new Date(item.expiry_date).toLocaleDateString("it-IT")}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
