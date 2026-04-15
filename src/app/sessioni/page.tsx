"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSessions, searchLeads, promoteLead, createSession } from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STATUS_CONFIG } from "@/lib/constants";

const PAGE_SIZE = 50;

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  // Anti-double-submit sul pulsante "Crea sessione": indica il customer_id in
  // corso di creazione. Blocca ulteriori click sui risultati finche' la POST
  // non si risolve (risolve bug sessioni duplicate create entro 200ms).
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    listSessions({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((data) => {
        setSessions(data.sessions || []);
        setTotal(data.total ?? data.count ?? 0);
      })
      .catch(() => toast.error("Errore caricamento sessioni"))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearch = async () => {
    if (customerQuery.length < 2) return;
    setSearching(true);
    try {
      const data = await searchLeads(customerQuery);
      setCustomerResults(data.results || []);
    } catch {
      toast.error("Errore ricerca");
    } finally {
      setSearching(false);
    }
  };

  // Crea sessione a partire da un risultato unificato. Se il lead non e'
  // ancora un customer (fgas_prospect / cold_lead), prima lo promuove.
  const handleCreateSession = async (lead: {
    id: string | null;
    lead_id: string | number;
    source: 'customer' | 'fgas_prospect' | 'cold_lead';
    company_name: string;
  }) => {
    // Anti-double-submit: se gia' in corso una creazione, ignora i click.
    const key = String(lead.id || lead.lead_id);
    if (creatingFor) return;
    setCreatingFor(key);
    try {
      let customerId = lead.id as string | null;
      if (!customerId || lead.source !== 'customer') {
        // Promuovi il lead a customer (idempotente)
        const prom = await promoteLead(
          lead.source as 'fgas_prospect' | 'cold_lead',
          lead.lead_id,
        );
        customerId = prom.customer_id;
        toast.success(`${lead.company_name} promosso a cliente`);
      }
      if (!customerId) throw new Error("customer_id mancante");
      const session = await createSession(customerId);
      toast.success("Sessione creata!");
      setDialogOpen(false);
      window.location.assign(`/sessioni/${session.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore creazione sessione");
      setCreatingFor(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Sessioni taratura</h2>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuova sessione
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuova sessione di taratura</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Cerca cliente per nome..."
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={searching}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              <div className="max-h-60 overflow-auto divide-y">
                {customerResults.map((c) => {
                  const key = String(c.id || c.lead_id);
                  const isCreating = creatingFor === key;
                  const disabled = !!creatingFor;
                  const badge = c.source === 'customer'
                    ? { label: 'Cliente', cls: 'bg-green-100 text-green-800' }
                    : c.source === 'fgas_prospect'
                      ? { label: 'Prospect F-GAS', cls: 'bg-blue-100 text-blue-800' }
                      : { label: 'Nuovo lead', cls: 'bg-purple-100 text-purple-800' };
                  return (
                    <button
                      key={`${c.source}-${key}`}
                      disabled={disabled}
                      className={`w-full text-left p-3 transition-colors ${
                        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"
                      }`}
                      onClick={() => handleCreateSession(c)}
                    >
                      <p className="font-medium flex items-center gap-2">
                        {c.company_name}
                        <span className={`text-xs px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                        {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                      </p>
                      <p className="text-sm text-gray-500">
                        {c.email ? `${c.email} - ` : ''}{c.city || ""}{c.province ? ` (${c.province})` : ''}
                      </p>
                    </button>
                  );
                })}
                {customerResults.length === 0 && customerQuery.length >= 2 && !searching && (
                  <p className="p-3 text-gray-500 text-center">Nessun risultato</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="p-8 text-center text-gray-500">Nessuna sessione</p>
          ) : (
            sessions.map((s) => (
              <Link
                key={s.id}
                href={`/sessioni/${s.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium">{s.customers?.company_name || "N/D"}</p>
                  <p className="text-sm text-gray-500">
                    {s.session_date} - {s.total_instruments || 0} strumenti - {s.operator || ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    EUR {parseFloat(s.total_amount || 0).toFixed(2)}
                  </span>
                  <Badge className={STATUS_CONFIG[s.status]?.color || ""}>
                    {STATUS_CONFIG[s.status]?.label || s.status}
                  </Badge>
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>

      {/* Paginazione - fix F11 */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>
            {(page - 1) * PAGE_SIZE + 1}-
            {Math.min(page * PAGE_SIZE, total)} di {total} sessioni
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Precedente
            </Button>
            <span className="flex items-center px-3">
              Pag. {page} di {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Successiva <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
