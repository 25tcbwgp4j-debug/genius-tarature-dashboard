"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listSessions } from "@/lib/api";
import { ClipboardList, Wrench, Package, AlertTriangle } from "lucide-react";
import Link from "next/link";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  registrazione: { label: "Registrazione", color: "bg-yellow-100 text-yellow-800" },
  in_lavorazione: { label: "In lavorazione", color: "bg-blue-100 text-blue-800" },
  pronto_ritiro: { label: "Pronto ritiro", color: "bg-green-100 text-green-800" },
  attesa_pagamento: { label: "Attesa pagamento", color: "bg-orange-100 text-orange-800" },
  completata: { label: "Completata", color: "bg-gray-100 text-gray-800" },
};

export default function Home() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ oggi: 0, attive: 0, pronti: 0, scadenze: 0 });

  useEffect(() => {
    setLoading(true);
    setError(null);
    listSessions({ limit: 20 })
      .then((data) => {
        const all = data.sessions || [];
        setSessions(all);
        const today = new Date().toISOString().split("T")[0];
        setStats({
          oggi: all.filter((s: any) => s.session_date === today).length,
          attive: all.filter((s: any) => s.status !== "completata").length,
          pronti: all.filter((s: any) => s.status === "pronto_ritiro").length,
          scadenze: 0,
        });
      })
      .catch(() => setError("Errore di connessione al backend. Potrebbe essere in fase di avvio, riprova tra qualche secondo."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Registro giornaliero</h2>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.oggi}</p>
              <p className="text-sm text-gray-500">Sessioni oggi</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Wrench className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.attive}</p>
              <p className="text-sm text-gray-500">Sessioni attive</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Package className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.pronti}</p>
              <p className="text-sm text-gray-500">Pronti per ritiro</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.scadenze}</p>
              <p className="text-sm text-gray-500">Scadenze prossime</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b">
          <h3 className="font-semibold">Sessioni recenti</h3>
        </div>
        <div className="divide-y">
          {loading ? (
            <p className="p-6 text-center text-gray-500">Caricamento sessioni...</p>
          ) : error ? (
            <p className="p-6 text-center text-red-500">{error}</p>
          ) : sessions.length === 0 ? (
            <p className="p-6 text-center text-gray-500">
              Nessuna sessione trovata.
            </p>
          ) : (
            sessions.map((session: any) => (
              <Link
                key={session.id}
                href={`/sessioni/${session.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {session.customers?.company_name || "Cliente N/D"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {session.session_date} - {session.total_instruments || 0} strumenti
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    EUR {parseFloat(session.total_amount || 0).toFixed(2)}
                  </span>
                  <Badge
                    className={
                      STATUS_CONFIG[session.status]?.color || "bg-gray-100"
                    }
                  >
                    {STATUS_CONFIG[session.status]?.label || session.status}
                  </Badge>
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
