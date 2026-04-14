"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Loader2,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
  Building2,
  Sparkles,
} from "lucide-react";
import { listReports, deleteReport } from "@/lib/api";
import { toast } from "sonner";

interface ReportRow {
  id: string;
  session_id: string;
  customer_id: string;
  instrument_id: string;
  rdt_number: string;
  issue_date: string;
  request_date: string | null;
  storage_url: string | null;
  file_name: string | null;
  created_at: string;
  customers?: {
    company_name?: string;
    vat_number?: string;
  } | null;
  instruments?: {
    instrument_name?: string;
    manufacturer?: string;
    model?: string;
    serial_number?: string;
  } | null;
}

const PAGE_SIZE = 100;

// Parsing numero RDT "26-10400" → 2610400 per ordinamento desc
function rdtNumericValue(rdt: string | null | undefined): number {
  if (!rdt) return 0;
  const digits = rdt.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function sortByRdtDesc(a: ReportRow, b: ReportRow): number {
  return rdtNumericValue(b.rdt_number) - rdtNumericValue(a.rdt_number);
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isTodayDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  // issue_date è tipicamente YYYY-MM-DD; gestisco anche ISO timestamp
  return dateStr.slice(0, 10) === todayISO();
}

export default function RapportiPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listReports({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        search: search || undefined,
      });
      setReports(data.reports || []);
      setTotal(data.total ?? data.count ?? 0);
    } catch {
      toast.error("Errore caricamento rapporti");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Split: rapporti di oggi vs precedenti. Ricerca attiva bypassa split.
  const { todayReports, previousReports, todayByCustomer } = useMemo(() => {
    if (search) {
      // In modalità ricerca: lista piatta ordinata per RDT desc
      const flat = [...reports].sort(sortByRdtDesc);
      return { todayReports: [] as ReportRow[], previousReports: flat, todayByCustomer: new Map<string, ReportRow[]>() };
    }
    const today: ReportRow[] = [];
    const prev: ReportRow[] = [];
    for (const r of reports) {
      if (isTodayDate(r.issue_date) || isTodayDate(r.created_at)) {
        today.push(r);
      } else {
        prev.push(r);
      }
    }
    today.sort(sortByRdtDesc);
    prev.sort(sortByRdtDesc);

    // Raggruppa oggi per cliente (preservando ordine di prima occorrenza)
    const byCustomer = new Map<string, ReportRow[]>();
    for (const r of today) {
      const key = r.customer_id || "sconosciuto";
      const arr = byCustomer.get(key) || [];
      arr.push(r);
      byCustomer.set(key, arr);
    }
    return { todayReports: today, previousReports: prev, todayByCustomer: byCustomer };
  }, [reports, search]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "rapporto.xlsx";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = async (report: ReportRow) => {
    const rdt = report.rdt_number || "N/D";
    const instr = report.instruments?.instrument_name || "strumento";
    if (
      !confirm(
        `Eliminare il rapporto RDT ${rdt} (${instr})?\n\n` +
          `Verranno cancellati:\n` +
          `- Il file Excel dallo storage\n` +
          `- Il record del rapporto\n` +
          `- Il numero RDT assegnato allo strumento (potrai rigenerarlo)\n\n` +
          `Operazione irreversibile.`
      )
    )
      return;
    setDeletingId(report.id);
    try {
      await deleteReport(report.id);
      toast.success(`Rapporto RDT ${rdt} eliminato`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore eliminazione";
      toast.error(`Errore eliminazione rapporto`, { description: msg });
    } finally {
      setDeletingId(null);
    }
  };

  const renderReportRow = (r: ReportRow) => (
    <div
      key={r.id}
      className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex-shrink-0">
        <div className="w-10 h-10 rounded bg-blue-50 flex items-center justify-center">
          <FileText className="w-5 h-5 text-blue-600" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-blue-700">
            RDT {r.rdt_number || "N/D"}
          </span>
          <span className="text-sm text-gray-600">
            {r.instruments?.instrument_name || "—"}
          </span>
          {r.instruments?.manufacturer && (
            <span className="text-sm text-gray-500">
              {r.instruments.manufacturer} {r.instruments.model || ""}
            </span>
          )}
          {r.instruments?.serial_number && (
            <span className="text-xs text-gray-400">
              Matr. {r.instruments.serial_number}
            </span>
          )}
        </div>
        <div className="text-sm text-gray-600 mt-0.5">
          <span className="font-medium">
            {r.customers?.company_name || "Cliente N/D"}
          </span>
          {r.customers?.vat_number && (
            <span className="text-gray-400 ml-2">
              P.IVA {r.customers.vat_number}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          Emesso: {r.issue_date ? new Date(r.issue_date).toLocaleDateString("it-IT") : "—"}
          {r.file_name && <span className="ml-2">• {r.file_name}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {r.storage_url ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(r.storage_url!, "_blank")}
              title="Apri in nuova scheda"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              onClick={() =>
                handleDownload(r.storage_url!, r.file_name || `RDT_${r.rdt_number}.xlsx`)
              }
              title="Scarica Excel"
            >
              <Download className="w-4 h-4 mr-1" /> Scarica
            </Button>
          </>
        ) : (
          <span className="text-xs text-gray-400 italic">File non disponibile</span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleDelete(r)}
          disabled={deletingId === r.id}
          className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
          title="Elimina rapporto"
        >
          {deletingId === r.id ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6" /> Rapporti di taratura
        </h2>
        <div className="text-sm text-gray-500">
          {total > 0 && <>Totale: <span className="font-semibold">{total}</span> rapporti</>}
        </div>
      </div>

      {/* Barra ricerca */}
      <Card className="p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Cerca per numero RDT (es. 26-10400)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
          />
          <Button onClick={handleSearch}>
            <Search className="w-4 h-4 mr-1" /> Cerca
          </Button>
          {search && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setPage(1);
              }}
            >
              Azzera
            </Button>
          )}
        </div>
      </Card>

      {loading ? (
        <Card>
          <div className="p-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
          </div>
        </Card>
      ) : reports.length === 0 ? (
        <Card>
          <div className="p-12 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p>Nessun rapporto trovato</p>
            {search && (
              <p className="text-sm mt-1">Prova a modificare i criteri di ricerca</p>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* SEZIONE RAPPORTI DI OGGI (solo se ci sono e non in modalità ricerca) */}
          {!search && todayReports.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-emerald-700">
                  Rapporti di oggi
                </h3>
                <span className="text-sm text-gray-500">
                  ({todayReports.length} rapport{todayReports.length === 1 ? "o" : "i"} su{" "}
                  {todayByCustomer.size} client{todayByCustomer.size === 1 ? "e" : "i"})
                </span>
              </div>

              {Array.from(todayByCustomer.entries()).map(([customerId, items]) => {
                const firstCustomer = items[0].customers;
                return (
                  <Card
                    key={customerId}
                    className="border-emerald-200 bg-emerald-50/30 overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border-b border-emerald-200">
                      <Building2 className="w-5 h-5 text-emerald-700" />
                      <div className="flex-1">
                        <div className="font-semibold text-emerald-900">
                          {firstCustomer?.company_name || "Cliente N/D"}
                        </div>
                        {firstCustomer?.vat_number && (
                          <div className="text-xs text-emerald-700">
                            P.IVA {firstCustomer.vat_number}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-emerald-700 font-medium">
                        {items.length} rapport{items.length === 1 ? "o" : "i"}
                      </div>
                    </div>
                    <div className="divide-y divide-emerald-100 bg-white">
                      {items.map(renderReportRow)}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* SEZIONE RAPPORTI PRECEDENTI */}
          {previousReports.length > 0 && (
            <div className="space-y-3">
              {!search && todayReports.length > 0 && (
                <div className="flex items-center gap-2 pt-2">
                  <h3 className="text-lg font-bold text-gray-700">
                    Rapporti precedenti
                  </h3>
                  <span className="text-sm text-gray-500">
                    ({previousReports.length} in questa pagina)
                  </span>
                </div>
              )}
              <Card>
                <div className="divide-y">
                  {previousReports.map(renderReportRow)}
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Paginazione (solo sezione precedenti / ricerca) */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>
            {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} di {total}
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
