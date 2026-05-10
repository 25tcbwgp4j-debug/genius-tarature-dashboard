// Pagina audit log Tarature: visualizza eventi INSERT/UPDATE/DELETE delle 5
// tabelle hot (sessions, customers, instruments, schedule, proforma).
// Admin-only (proxy.ts gating + actions ensureAdmin).
import { ShieldCheck, AlertCircle } from "lucide-react";
import { listAuditEventsAction, auditEventsSummaryAction, type AuditEvent } from "./actions";

export const dynamic = "force-dynamic";

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function opBadge(op: string): string {
  if (op === "INSERT") return "bg-green-100 text-green-800";
  if (op === "UPDATE") return "bg-blue-100 text-blue-800";
  if (op === "DELETE") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; operation?: string; days?: string }>;
}) {
  const sp = await searchParams;
  const days = sp.days ? parseInt(sp.days, 10) : 7;

  let events: AuditEvent[] = [];
  let total = 0;
  let summary: Record<string, Record<string, number>> = {};
  let loadError: string | null = null;

  try {
    const [list, summ] = await Promise.all([
      listAuditEventsAction({
        table: sp.table,
        operation: sp.operation,
        days,
        limit: 200,
      }),
      auditEventsSummaryAction(days),
    ]);
    events = list.events;
    total = list.count;
    summary = summ.summary;
  } catch (e: unknown) {
    loadError = e instanceof Error ? e.message : "Errore caricamento";
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-purple-600" />
          Audit log
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Forensics + compliance: tutti i cambiamenti su sessioni, clienti, strumenti,
          scadenze, proforma negli ultimi {days} giorni. Solo admin.
        </p>
      </div>

      {loadError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-900">Errore caricamento</p>
            <p className="text-sm text-red-700">{loadError}</p>
          </div>
        </div>
      )}

      {/* Summary cards per tabella */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {Object.entries(summary).map(([table, ops]) => {
          const total = Object.values(ops).reduce((a, b) => a + b, 0);
          return (
            <a
              key={table}
              href={`/audit?days=${days}&table=${encodeURIComponent(table)}`}
              className="rounded-xl bg-white p-4 shadow-sm border border-gray-200 hover:shadow-md transition"
            >
              <div className="text-xs uppercase text-gray-500 truncate">{table}</div>
              <div className="text-2xl font-bold text-gray-900">{total}</div>
              <div className="flex gap-2 mt-1 text-xs">
                {ops.INSERT && <span className="text-green-700">+{ops.INSERT}</span>}
                {ops.UPDATE && <span className="text-blue-700">~{ops.UPDATE}</span>}
                {ops.DELETE && <span className="text-red-700">-{ops.DELETE}</span>}
              </div>
            </a>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="rounded-xl bg-white p-3 border border-gray-200 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Filtri:</span>
        {[7, 14, 30, 90].map((d) => (
          <a
            key={d}
            href={`/audit?days=${d}${sp.table ? `&table=${sp.table}` : ""}${sp.operation ? `&operation=${sp.operation}` : ""}`}
            className={`text-xs px-2 py-1 rounded ${days === d ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            {d}gg
          </a>
        ))}
        {(sp.table || sp.operation) && (
          <a href={`/audit?days=${days}`} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">
            ✕ rimuovi filtri
          </a>
        )}
        <span className="ml-auto text-xs text-gray-500">{total} eventi (max 200)</span>
      </div>

      {/* Events table */}
      <div className="rounded-xl bg-white border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2">Data/ora</th>
                <th className="px-3 py-2">Tabella</th>
                <th className="px-3 py-2">Op.</th>
                <th className="px-3 py-2">Operatore</th>
                <th className="px-3 py-2">Row ID</th>
                <th className="px-3 py-2">Campi modificati</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    Nessun evento nel periodo selezionato
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-600">{formatTs(e.created_at)}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-700">{e.table_name}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${opBadge(e.operation)}`}>
                        {e.operation}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {e.user_email || <span className="text-gray-400 italic">system</span>}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-500">
                      {e.row_id ? e.row_id.slice(0, 8) + "…" : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {e.changed_keys && e.changed_keys.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {e.changed_keys.slice(0, 5).map((k) => (
                            <span key={k} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-mono">
                              {k}
                            </span>
                          ))}
                          {e.changed_keys.length > 5 && (
                            <span className="text-[10px] text-gray-400">+{e.changed_keys.length - 5}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Audit popolato da trigger AFTER INSERT/UPDATE/DELETE su 5 tabelle hot
        (calibration_sessions, customers, instruments, calibration_schedule, proforma_invoices).
        Migration 029 (P2.3 round 4 max-power 10/05).
      </p>
    </div>
  );
}
