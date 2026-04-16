"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  searchCustomers,
  listCustomers,
  updateCustomer,
  deleteCustomer,
  getCustomerStats,
} from "@/lib/api";
import {
  Search,
  Loader2,
  Phone,
  Mail,
  MapPin,
  Pencil,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  AlertCircle,
  Filter,
  Trash2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { ParseCustomerModal } from "./ParseCustomerModal";
import { ReconcileModal } from "./ReconcileModal";
import { GitMerge } from "lucide-react";

export default function ClientiPage() {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"search" | "list">("list");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [stats, setStats] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [parseOpen, setParseOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("riconciliazione") === "1") {
      setReconcileOpen(true);
    }
  }, [searchParams]);

  // Carica lista paginata
  const loadList = async (p: number, f: string) => {
    setLoading(true);
    try {
      const filterParam = f === "all" ? undefined : f;
      const data = await listCustomers(p, 30, filterParam);
      setCustomers(data.customers || []);
      setTotalPages(data.pages || 0);
      setTotal(data.total || 0);
      setMode("list");
    } catch {
    } finally {
      setLoading(false);
    }
  };

  // Carica stats
  useEffect(() => {
    getCustomerStats().then(setStats).catch(() => {});
    loadList(1, "all");
  }, []);

  const handleSearch = async () => {
    if (query.length < 2) return;
    setLoading(true);
    setMode("search");
    try {
      const data = await searchCustomers(query, 50);
      setCustomers(data.customers || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = (f: string) => {
    setFilter(f);
    setPage(1);
    loadList(1, f);
  };

  const handlePage = (p: number) => {
    setPage(p);
    loadList(p, filter);
  };

  const startEdit = (customer: any) => {
    setEditingId(customer.id);
    setEditData({ ...customer });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editData) return;
    setSaving(true);
    try {
      await updateCustomer(editingId, editData);
      // Aggiorna nella lista locale
      setCustomers((prev) =>
        prev.map((c) => (c.id === editingId ? { ...c, ...editData } : c))
      );
      setEditingId(null);
      setEditData(null);
      toast.success("Cliente aggiornato");
    } catch {
      toast.error("Errore aggiornamento");
    }
    setSaving(false);
  };

  const clearSearch = () => {
    setQuery("");
    setMode("list");
    loadList(page, filter);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Clienti</h2>
        <div className="flex gap-2">
          <Button
            onClick={() => setReconcileOpen(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <GitMerge className="w-4 h-4 mr-2" />
            Riconciliazione clienti
          </Button>
          <Button
            onClick={() => setParseOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Incolla dati (AI)
          </Button>
        </div>
      </div>
      <ParseCustomerModal
        open={parseOpen}
        onClose={() => setParseOpen(false)}
        onCreated={() => loadList(page, filter)}
        onUpdated={() => loadList(page, filter)}
      />
      <ReconcileModal
        open={reconcileOpen}
        onClose={() => setReconcileOpen(false)}
        onMerged={() => loadList(page, filter)}
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{stats.totale}</p>
                <p className="text-sm text-gray-500">Totale clienti</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{stats.con_email}</p>
                <p className="text-sm text-gray-500">Con email</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{stats.senza_email}</p>
                <p className="text-sm text-gray-500">Senza email</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Ricerca */}
      <div className="flex gap-2 max-w-lg">
        <Input
          placeholder="Cerca per nome, P.IVA..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
        {mode === "search" && (
          <Button variant="outline" onClick={clearSearch}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Filtri */}
      {mode === "list" && (
        <div className="flex gap-2 items-center">
          <Filter className="w-4 h-4 text-gray-500" />
          {[
            { key: "all", label: "Tutti" },
            { key: "no_email", label: "Senza email" },
            { key: "no_phone", label: "Senza telefono" },
            { key: "incomplete", label: "Dati incompleti" },
          ].map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => handleFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      )}

      {/* Lista */}
      <Card>
        <div className="p-3 border-b flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {mode === "search"
              ? `${customers.length} risultati per "${query}"`
              : `${total} clienti — Pagina ${page}/${totalPages}`}
          </span>
          {mode === "list" && totalPages > 1 && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => handlePage(page - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => handlePage(page + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : customers.length === 0 ? (
            <p className="p-8 text-center text-gray-500">Nessun cliente trovato</p>
          ) : (
            customers.map((c) => (
              <div key={c.id} className="p-4">
                {editingId === c.id ? (
                  // Modalita modifica
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Ragione sociale</label>
                        <Input
                          value={editData?.company_name || ""}
                          onChange={(e) => setEditData({ ...editData, company_name: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">P.IVA</label>
                        <Input
                          value={editData?.vat_number || ""}
                          onChange={(e) => setEditData({ ...editData, vat_number: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Codice Fiscale</label>
                        <Input
                          value={editData?.tax_id || ""}
                          onChange={(e) => setEditData({ ...editData, tax_id: e.target.value })}
                          className="h-8 text-sm"
                          placeholder="Se diverso dalla P.IVA"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Codice SDI</label>
                        <Input
                          value={editData?.sdi_code || ""}
                          onChange={(e) => setEditData({ ...editData, sdi_code: e.target.value.toUpperCase() })}
                          className="h-8 text-sm font-mono"
                          placeholder="7 caratteri (es. WP7SE2Q)"
                          maxLength={7}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">PEC</label>
                        <Input
                          value={editData?.pec || ""}
                          onChange={(e) => setEditData({ ...editData, pec: e.target.value })}
                          className="h-8 text-sm"
                          placeholder="esempio@pec.it"
                          type="email"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Indirizzo</label>
                        <Input
                          value={editData?.address || ""}
                          onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="w-24">
                          <label className="text-xs text-gray-500">CAP</label>
                          <Input
                            value={editData?.zip_code || ""}
                            onChange={(e) => setEditData({ ...editData, zip_code: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500">Citta</label>
                          <Input
                            value={editData?.city || ""}
                            onChange={(e) => setEditData({ ...editData, city: e.target.value })}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Email</label>
                        <Input
                          value={editData?.email || ""}
                          onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Cellulare</label>
                        <Input
                          value={editData?.mobile || ""}
                          onChange={(e) => setEditData({ ...editData, mobile: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Telefono</label>
                        <Input
                          value={editData?.phone1 || ""}
                          onChange={(e) => setEditData({ ...editData, phone1: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">WhatsApp</label>
                        <Input
                          value={editData?.whatsapp_phone || ""}
                          onChange={(e) => setEditData({ ...editData, whatsapp_phone: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={cancelEdit}>
                        <X className="w-4 h-4 mr-1" /> Annulla
                      </Button>
                      <Button size="sm" onClick={saveEdit} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                        Salva
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Modalita visualizzazione
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">{c.company_name}</p>
                      <p className="text-sm text-gray-500">
                        Cod. {c.legacy_code} | P.IVA: {c.vat_number || "N/D"}
                      </p>
                      <div className="flex gap-4 mt-1 text-sm text-gray-600 flex-wrap">
                        {c.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {c.address}, {c.zip_code} {c.city}
                          </span>
                        )}
                        {(c.mobile || c.phone1) && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            {c.mobile || c.phone1}
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {c.email}
                          </span>
                        )}
                        {!c.email && (
                          <Badge variant="outline" className="text-red-500 border-red-300 text-xs">
                            No email
                          </Badge>
                        )}
                        {!c.mobile && !c.phone1 && (
                          <Badge variant="outline" className="text-orange-500 border-orange-300 text-xs">
                            No telefono
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Eliminare il cliente "${c.company_name}"?\nQuesta azione non puo essere annullata.`)) return;
                          try {
                            await deleteCustomer(c.id);
                            setCustomers((prev) => prev.filter((x) => x.id !== c.id));
                            toast.success("Cliente eliminato");
                          } catch (e: any) {
                            toast.error(e.message || "Errore eliminazione cliente");
                          }
                        }}
                        className="text-red-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                        title="Elimina cliente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
