"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listSessions, getReconciliationToday, getStatistics } from "@/lib/api";
import { ClipboardList, Wrench, Package, AlertTriangle, Users } from "lucide-react";
import Link from "next/link";
import { STATUS_CONFIG, getStatusConfig } from "@/lib/constants";

interface ReconciliationSnapshot {
  total_groups?: number;
  total_records_to_merge?: number;
  snapshot_date?: string | null;
}

export default function Home() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ oggi: 0, attive: 0, pronti: 0, scadenze: 0 });
  const [reconciliation, setReconciliation] = useState<ReconciliationSnapshot | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      listSessions({ limit: 20 }).catch(() => null),
      getReconciliationToday().catch(() => null),
      getStatistics().catch(() => null),
    ])
      .then(([data, recon, statistics]) => {
        if (data) {
          const all = data.sessions || [];
          setSessions(all);
          // Data di OGGI in ora italiana. toISOString() da' la data UTC: tra
          // mezzanotte e le 02:00 (ora legale) restituiva IERI e "Sessioni oggi"
          // contava il giorno sbagliato. Audit 16/07.
          const today = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Rome",
          }).format(new Date());
          setStats({
            oggi: all.filter((s: any) => s.session_date === today).length,
            attive: all.filter((s: any) => s.status !== "completata").length,
            pronti: all.filter((s: any) => s.status === "pronto_ritiro").length,
            // Prima era cablato a 0: la card mostrava "0 Scadenze prossime" anche
            // con centinaia di tarature in scadenza. Ora dal backend. Audit 16/07.
            scadenze: statistics?.scadenze_prossime_30gg ?? 0,
          });
        } else {
          setError("Errore di connessione al backend. Potrebbe essere in fase di avvio, riprova tra qualche secondo.");
        }
        if (recon) setReconciliation(recon);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Registro giornaliero</h2>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
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

      {reconciliation && (reconciliation.total_groups ?? 0) > 0 && (
        <Link href="/clienti?riconciliazione=1">
          <Card className="p-4 border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-200 rounded-lg">
                <Users className="w-5 h-5 text-amber-800" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-amber-900">
                  Riconciliazione clienti: {reconciliation.total_groups} gruppi duplicati
                </p>
                <p className="text-sm text-amber-800">
                  {reconciliation.total_records_to_merge} record da mergere
                  {reconciliation.snapshot_date && ` · snapshot del ${reconciliation.snapshot_date}`}
                  · clicca per aprire
                </p>
              </div>
              <div className="text-amber-700 font-bold">→</div>
            </div>
          </Card>
        </Link>
      )}

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
                  {(() => {
                    const cfg = getStatusConfig(session.status, { shippingIncluded: !!session.shipping_included });
                    return (
                      <Badge className={cfg.color}>
                        {cfg.label}
                      </Badge>
                    );
                  })()}
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
