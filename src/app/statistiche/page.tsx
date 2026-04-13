"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  BarChart3, Euro, Users, FileText, CalendarClock,
  TrendingUp, Wrench, Loader2, Clock, CheckCircle2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getStatistics } from "@/lib/api";

interface Stats {
  sessioni: {
    totali: number; oggi: number; mese: number;
    by_status: Record<string, number>;
    by_payment: Record<string, number>;
  };
  fatturato: {
    totale: number; pagato: number; in_attesa: number; mese_corrente: number;
  };
  clienti: { totali: number; nuovi_mese: number };
  rdt: { totali: number; mese: number };
  scadenze_prossime_30gg: number;
  top_strumenti: { name: string; count: number; revenue: number }[];
  top_clienti: { customer_id: string; company_name: string; revenue: number; sessions: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  registrazione: "Registrazione",
  in_lavorazione: "In lavorazione",
  pronto_ritiro: "Pronto ritiro",
  attesa_pagamento: "Attesa pagamento",
  completata: "Completata",
};

const PAYMENT_LABELS: Record<string, string> = {
  non_richiesto: "Non richiesto",
  in_attesa: "In attesa",
  pagato: "Pagato",
  parziale: "Parziale",
};

const fmtEur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

export default function StatistichePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setStats(await getStatistics());
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Errore caricamento statistiche");
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!stats) return null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-600" /> Statistiche
        </h1>
        <p className="text-sm text-gray-500 mt-1">Dashboard KPI sistema tarature</p>
      </div>

      {/* KPI principali */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Euro className="w-4 h-4" /> Fatturato totale
          </div>
          <div className="text-2xl font-bold">{fmtEur(stats.fatturato.totale)}</div>
          <div className="text-xs text-gray-400 mt-1">Mese corrente: {fmtEur(stats.fatturato.mese_corrente)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-emerald-600 text-sm mb-1">
            <CheckCircle2 className="w-4 h-4" /> Incassato
          </div>
          <div className="text-2xl font-bold text-emerald-700">{fmtEur(stats.fatturato.pagato)}</div>
          <div className="text-xs text-gray-400 mt-1">{stats.sessioni.by_payment.pagato || 0} sessioni</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
            <AlertCircle className="w-4 h-4" /> In attesa pagamento
          </div>
          <div className="text-2xl font-bold text-orange-700">{fmtEur(stats.fatturato.in_attesa)}</div>
          <div className="text-xs text-gray-400 mt-1">{stats.sessioni.by_payment.in_attesa || 0} sessioni</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
            <CalendarClock className="w-4 h-4" /> Scadenze 30gg
          </div>
          <div className="text-2xl font-bold text-blue-700">{stats.scadenze_prossime_30gg}</div>
          <div className="text-xs text-gray-400 mt-1">tarature in scadenza</div>
        </Card>
      </div>

      {/* Sessioni e RDT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-purple-600" /> Sessioni
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <div className="text-xs text-gray-500">Totali</div>
              <div className="text-xl font-bold">{stats.sessioni.totali}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Mese</div>
              <div className="text-xl font-bold">{stats.sessioni.mese}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Oggi</div>
              <div className="text-xl font-bold">{stats.sessioni.oggi}</div>
            </div>
          </div>
          <div className="space-y-1">
            {Object.entries(stats.sessioni.by_status).map(([st, n]) => (
              <div key={st} className="flex justify-between text-sm">
                <span className="text-gray-600">{STATUS_LABELS[st] || st}</span>
                <span className="font-medium">{n}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" /> Rapporti & Clienti
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <div className="text-xs text-gray-500">RDT totali</div>
              <div className="text-xl font-bold">{stats.rdt.totali}</div>
              <div className="text-xs text-gray-400">{stats.rdt.mese} questo mese</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Clienti totali</div>
              <div className="text-xl font-bold flex items-center gap-1">
                {stats.clienti.totali}
                <Users className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-xs text-gray-400">{stats.clienti.nuovi_mese} nuovi mese</div>
            </div>
          </div>
          <div className="space-y-1">
            {Object.entries(stats.sessioni.by_payment).map(([ps, n]) => (
              <div key={ps} className="flex justify-between text-sm">
                <span className="text-gray-600">Pagamento: {PAYMENT_LABELS[ps] || ps}</span>
                <span className="font-medium">{n}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Top 5 strumenti e clienti */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-600" /> Top 5 strumenti tarati
          </h3>
          {stats.top_strumenti.length === 0 ? (
            <p className="text-sm text-gray-400">Nessun dato disponibile</p>
          ) : (
            <div className="space-y-2">
              {stats.top_strumenti.map((s, i) => (
                <div key={s.name} className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-xs flex items-center justify-center font-semibold">
                      {i + 1}
                    </span>
                    {s.name}
                  </span>
                  <span className="text-gray-600">
                    <strong>{s.count}</strong> &middot; {fmtEur(s.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-600" /> Top 5 clienti per fatturato
          </h3>
          {stats.top_clienti.length === 0 ? (
            <p className="text-sm text-gray-400">Nessun dato disponibile</p>
          ) : (
            <div className="space-y-2">
              {stats.top_clienti.map((c, i) => (
                <div key={c.customer_id} className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 truncate max-w-[60%]">
                    <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-semibold">
                      {i + 1}
                    </span>
                    <span className="truncate">{c.company_name}</span>
                  </span>
                  <span className="text-gray-600">
                    <strong>{fmtEur(c.revenue)}</strong> &middot; {c.sessions} sess
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Clock className="w-3 h-3" /> Dati aggregati al momento del caricamento. Ricarica per aggiornare.
      </p>
    </div>
  );
}
