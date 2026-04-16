"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Zap, Play, RefreshCw, Loader2, Mail, Phone, AlertCircle,
  CheckCircle2, Clock, XCircle, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  getEnrichmentStats, runEnrichmentProspects, runEnrichmentCustomers,
  getColdLeadsStats, runEnrichmentColdLeads,
} from "@/lib/api";

interface Counts {
  pending: number;
  enriched: number;
  partial: number;
  not_found: number;
  error: number;
}

interface Stats {
  prospects: Counts;
  customers: Counts;
}

interface ColdStats extends Counts {
  promoted?: number;
}

const STATUS_CFG: Record<keyof Counts, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Da processare", color: "bg-gray-100 text-gray-700", icon: Clock },
  enriched: { label: "Email trovata", color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  partial: { label: "Solo telefono", color: "bg-blue-100 text-blue-800", icon: Phone },
  not_found: { label: "Non trovato", color: "bg-amber-100 text-amber-800", icon: AlertCircle },
  error: { label: "Errore", color: "bg-red-100 text-red-800", icon: XCircle },
};

export default function EnrichmentPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [coldStats, setColdStats] = useState<ColdStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningProspects, setRunningProspects] = useState(false);
  const [runningCustomers, setRunningCustomers] = useState(false);
  const [runningCold, setRunningCold] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const [s, cs] = await Promise.all([getEnrichmentStats(), getColdLeadsStats()]);
      setStats(s);
      setColdStats(cs);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Errore stats"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 30000);
    return () => clearInterval(id);
  }, [fetchStats]);

  const runProspects = async () => {
    setRunningProspects(true);
    try {
      await runEnrichmentProspects(40);
      toast.success("Batch prospect avviato in background. Le stats si aggiornano automaticamente fra 2-5 min.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore batch prospect");
    } finally { setRunningProspects(false); }
  };

  const runCustomers = async () => {
    setRunningCustomers(true);
    try {
      await runEnrichmentCustomers(30);
      toast.success("Batch clienti avviato in background. Le stats si aggiornano automaticamente fra 2-5 min.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore batch clienti");
    } finally { setRunningCustomers(false); }
  };

  const runCold = async () => {
    setRunningCold(true);
    try {
      await runEnrichmentColdLeads(30);
      toast.success("Batch cold leads avviato in background.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore batch cold leads");
    } finally { setRunningCold(false); }
  };

  if (loading) {
    return <div className="p-6 flex justify-center min-h-[300px]"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }
  if (!stats) return null;

  const totalProspects = Object.values(stats.prospects).reduce((a, b) => a + b, 0);
  const totalCustomers = Object.values(stats.customers).reduce((a, b) => a + b, 0);
  const progressProspects = totalProspects > 0 ? Math.round((1 - stats.prospects.pending / totalProspects) * 100) : 0;
  const progressCustomers = totalCustomers > 0 ? Math.round((1 - stats.customers.pending / totalCustomers) * 100) : 0;
  const coldCountsOnly: Counts | null = coldStats ? {
    pending: coldStats.pending, enriched: coldStats.enriched,
    partial: coldStats.partial, not_found: coldStats.not_found, error: coldStats.error,
  } : null;
  const totalCold = coldCountsOnly ? Object.values(coldCountsOnly).reduce((a, b) => a + b, 0) : 0;
  const progressCold = totalCold > 0 && coldCountsOnly ? Math.round((1 - coldCountsOnly.pending / totalCold) * 100) : 0;

  const renderBlock = (
    title: string,
    counts: Counts,
    total: number,
    progress: number,
    onRun: () => void,
    running: boolean,
    accent: string,
  ) => (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Zap className={`w-5 h-5 ${accent}`} /> {title}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{total.toLocaleString("it-IT")} record totali</p>
        </div>
        <Button onClick={onRun} disabled={running || counts.pending === 0} size="sm">
          {running ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
          Esegui batch
        </Button>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-600">Progresso arricchimento</span>
          <span className="font-semibold">{progress}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className={`${accent.replace("text-", "bg-")} h-2 rounded-full transition-all`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-5 gap-2">
        {(Object.keys(STATUS_CFG) as (keyof Counts)[]).map((k) => {
          const cfg = STATUS_CFG[k];
          const Icon = cfg.icon;
          return (
            <div key={k} className={`${cfg.color} rounded p-2 text-center`}>
              <Icon className="w-4 h-4 mx-auto mb-0.5" />
              <div className="text-xs font-medium">{cfg.label}</div>
              <div className="text-lg font-bold">{counts[k].toLocaleString("it-IT")}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-purple-600" /> Arricchimento contatti
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Ricerca automatica email + scoperta nuovi clienti via Google Places + scraping sito con Serper.
        </p>
      </div>

      {/* Azioni globali */}
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <Mail className="w-5 h-5 text-blue-600" />
        <div className="flex-1 text-sm">
          <div className="font-medium text-blue-900">Scheduler automatico (zero intervento)</div>
          <div className="text-blue-700 text-xs">
            Prospect FGAS: 08/12/16/20 &middot; Clienti: 10/14/18/22 &middot; Cold leads: 11/15/19/23 &middot;
            Discovery nuovi leads Places: ogni 30 min 24/7 (rotazione 15 categorie &times; 50 citt&agrave;)
          </div>
        </div>
        <Button onClick={fetchStats} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-1" /> Aggiorna
        </Button>
      </div>

      {renderBlock(
        "Prospect FGAS",
        stats.prospects,
        totalProspects,
        progressProspects,
        runProspects,
        runningProspects,
        "text-purple-600",
      )}

      {renderBlock(
        "Clienti esistenti",
        stats.customers,
        totalCustomers,
        progressCustomers,
        runCustomers,
        runningCustomers,
        "text-emerald-600",
      )}

      {coldCountsOnly && renderBlock(
        `Nuovi lead (cold, Places)${coldStats?.promoted ? ` - ${coldStats.promoted} gi\u00e0 promossi a cliente` : ''}`,
        coldCountsOnly,
        totalCold,
        progressCold,
        runCold,
        runningCold,
        "text-fuchsia-600",
      )}

      <div className="text-xs text-gray-500 bg-gray-50 rounded p-3">
        <p className="font-medium mb-1">Come funziona</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Se il record ha gia&apos; un sito web, lo script visita home + pagina contatti + about</li>
          <li>Altrimenti cerca l&apos;azienda su DuckDuckGo (nome + comune) per trovare il sito ufficiale</li>
          <li>Estrae email e telefoni con regex, scarta PEC/legalmail (non usabili per marketing)</li>
          <li>Preferisce email aziendali generiche (info@, amministrazione@, commerciale@)</li>
          <li>Rate limit 0.8s per richiesta per evitare blocchi. Ogni batch elabora ~40 record in ~4-5 minuti.</li>
        </ul>
      </div>
    </div>
  );
}
