"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { listReports } from "@/lib/api";
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

const PAGE_SIZE = 50;

export default function RapportiPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

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

      {/* Lista rapporti */}
      <Card>
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
          </div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p>Nessun rapporto trovato</p>
            {search && (
              <p className="text-sm mt-1">Prova a modificare i criteri di ricerca</p>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {reports.map((r) => (
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
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Paginazione */}
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
