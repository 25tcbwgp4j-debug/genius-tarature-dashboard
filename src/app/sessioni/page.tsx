"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSessions, searchCustomers, createSession } from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Search, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  registrazione: { label: "Registrazione", color: "bg-yellow-100 text-yellow-800" },
  in_lavorazione: { label: "In lavorazione", color: "bg-blue-100 text-blue-800" },
  pronto_ritiro: { label: "Pronto ritiro", color: "bg-green-100 text-green-800" },
  attesa_pagamento: { label: "Attesa pagamento", color: "bg-orange-100 text-orange-800" },
  completata: { label: "Completata", color: "bg-gray-100 text-gray-800" },
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    listSessions({ limit: 50 })
      .then((data) => setSessions(data.sessions || []))
      .catch(() => toast.error("Errore caricamento sessioni"))
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = async () => {
    if (customerQuery.length < 2) return;
    setSearching(true);
    try {
      const data = await searchCustomers(customerQuery);
      setCustomerResults(data.customers || []);
    } catch {
      toast.error("Errore ricerca");
    } finally {
      setSearching(false);
    }
  };

  const handleCreateSession = async (customerId: string) => {
    try {
      const session = await createSession(customerId);
      toast.success("Sessione creata!");
      setDialogOpen(false);
      window.location.assign(`/sessioni/${session.id}`);
    } catch (err: any) {
      toast.error(err.message);
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
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    className="w-full text-left p-3 hover:bg-gray-50 transition-colors"
                    onClick={() => handleCreateSession(c.id)}
                  >
                    <p className="font-medium">{c.company_name}</p>
                    <p className="text-sm text-gray-500">
                      P.IVA: {c.vat_number || "N/D"} - {c.city || ""}
                    </p>
                  </button>
                ))}
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
    </div>
  );
}
