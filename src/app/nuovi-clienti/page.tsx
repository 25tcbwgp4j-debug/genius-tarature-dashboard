"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search, Mail, Phone, Globe, Send, UserCheck, RefreshCw,
  ChevronLeft, ChevronRight, Calendar, Users, ArrowRight, Loader2,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://tarature-api-production.up.railway.app";

interface Prospect {
  id: string;
  ragione_sociale: string;
  data_iscrizione_fgas: string;
  provincia: string;
  comune: string;
  email: string | null;
  telefono: string | null;
  cellulare: string | null;
  sito_web: string | null;
  status: string;
  email_sent: boolean;
  email_sent_at: string | null;
}

interface Stats {
  totale: number;
  con_email: number;
  con_telefono: number;
  email_inviate: number;
  per_stato: Record<string, number>;
  per_provincia: Record<string, number>;
}

type Tab = "nuovi" | "email_inviate";

export default function NuoviClientiPage() {
  const [tab, setTab] = useState<Tab>("nuovi");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterProv, setFilterProv] = useState("");
  const [filterEmail, setFilterEmail] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Prospect>>({});
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveResult, setMoveResult] = useState<string | null>(null);

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const status = tab === "nuovi" ? "nuovo" : "contattato";
      let url = `${API_URL}/api/prospects?page=${page}&per_page=30&status=${status}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (filterProv) url += `&provincia=${filterProv}`;
      if (tab === "nuovi") {
        if (filterEmail === "yes") url += `&has_email=true`;
        if (filterEmail === "no") url += `&has_email=false`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setProspects(data.prospects || []);
      setTotalPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [page, search, filterProv, filterEmail, tab]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/prospects/stats`);
      setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchProspects();
    fetchStats();
  }, [fetchProspects]);

  // Reset pagina quando cambia tab
  useEffect(() => {
    setPage(1);
    setSendResult(null);
    setMoveResult(null);
  }, [tab]);

  const saveEdit = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/prospects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      setEditingId(null);
      setEditData({});
      fetchProspects();
      fetchStats();
    } catch (e) {
      console.error(e);
    }
  };

  const sendEmailToProspect = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/prospects/${id}/send-email`, { method: "POST" });
      const data = await res.json();
      if (data.result?.success) {
        fetchProspects();
        fetchStats();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sendBatchEmails = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(`${API_URL}/api/prospects/send-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20, provincia: filterProv || undefined }),
      });
      const data = await res.json();
      setSendResult(`Inviate: ${data.sent}, Errori: ${data.errors}, Trovati: ${data.total_found}`);
      fetchProspects();
      fetchStats();
    } catch (e) {
      setSendResult("Errore invio batch");
    }
    setSending(false);
  };

  const moveToClients = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/prospects/${id}/move-to-customers`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        alert(data.detail || data.error);
      } else {
        fetchProspects();
        fetchStats();
      }
    } catch (e: any) {
      alert(e.message || "Errore spostamento");
    }
  };

  const moveBatchToClients = async () => {
    if (!confirm("Trasferire TUTTI i prospect con email inviata a Clienti ordinari?")) return;
    setMoving(true);
    setMoveResult(null);
    try {
      const res = await fetch(`${API_URL}/api/prospects/move-batch-to-customers`, { method: "POST" });
      const data = await res.json();
      setMoveResult(`Spostati: ${data.moved}, Gia presenti: ${data.skipped}, Errori: ${data.errors}`);
      fetchProspects();
      fetchStats();
    } catch (e) {
      setMoveResult("Errore trasferimento");
    }
    setMoving(false);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleDateString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuovi Clienti da Contattare</h1>
          <p className="text-sm text-gray-500 mt-1">Prospect FGAS — aziende certificate nel Lazio</p>
        </div>
        {tab === "nuovi" && (
          <button
            onClick={sendBatchEmails}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Invio in corso..." : "Invia email a tutti i nuovi con email"}
          </button>
        )}
        {tab === "email_inviate" && (
          <button
            onClick={moveBatchToClients}
            disabled={moving}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            {moving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {moving ? "Trasferimento..." : "Trasferisci tutti a Clienti ordinari"}
          </button>
        )}
      </div>

      {/* Risultati operazioni */}
      {sendResult && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          {sendResult}
        </div>
      )}
      {moveResult && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
          {moveResult}
        </div>
      )}

      {/* Statistiche */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-sm text-gray-500">Totale prospect</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totale}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-sm text-gray-500">Con email</p>
            <p className="text-2xl font-bold text-blue-600">{stats.con_email}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-sm text-gray-500">Con telefono</p>
            <p className="text-2xl font-bold text-green-600">{stats.con_telefono}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-sm text-gray-500">Email inviate</p>
            <p className="text-2xl font-bold text-purple-600">{stats.email_inviate}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-sm text-gray-500">Da contattare</p>
            <p className="text-2xl font-bold text-orange-600">{stats.per_stato?.nuovo || 0}</p>
          </div>
        </div>
      )}

      {/* TAB: Nuovi / Email Inviate */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("nuovi")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "nuovi" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Users className="w-4 h-4" />
          Nuovi ({stats?.per_stato?.nuovo || 0})
        </button>
        <button
          onClick={() => setTab("email_inviate")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "email_inviate" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Mail className="w-4 h-4" />
          Email Inviate ({stats?.per_stato?.contattato || 0})
        </button>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cerca per ragione sociale..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <select
          value={filterProv}
          onChange={(e) => { setFilterProv(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">Tutte le province</option>
          <option value="RM">Roma</option>
          <option value="LT">Latina</option>
          <option value="FR">Frosinone</option>
          <option value="VT">Viterbo</option>
          <option value="RI">Rieti</option>
        </select>
        {tab === "nuovi" && (
          <select
            value={filterEmail}
            onChange={(e) => { setFilterEmail(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">Tutti</option>
            <option value="yes">Con email</option>
            <option value="no">Senza email</option>
          </select>
        )}
        <button onClick={() => { fetchProspects(); fetchStats(); }} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" />
        </button>
        <span className="text-sm text-gray-500">{total} risultati</span>
      </div>

      {/* Tabella */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ragione Sociale</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Comune</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Telefono</th>
                {tab === "email_inviate" && (
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data Invio</th>
                )}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={tab === "email_inviate" ? 7 : 6} className="px-4 py-8 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td></tr>
              ) : prospects.length === 0 ? (
                <tr><td colSpan={tab === "email_inviate" ? 7 : 6} className="px-4 py-8 text-center text-gray-400">
                  {tab === "nuovi" ? "Nessun prospect nuovo trovato" : "Nessun prospect contattato"}
                </td></tr>
              ) : prospects.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[250px] truncate">
                    {p.ragione_sociale}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.comune}</td>
                  <td className="px-4 py-3">
                    {editingId === p.id ? (
                      <input
                        type="email"
                        value={editData.email ?? p.email ?? ""}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="email@azienda.it"
                      />
                    ) : p.email ? (
                      <span className="flex items-center gap-1 text-blue-600 text-xs">
                        <Mail className="w-3 h-3" /> {p.email}
                      </span>
                    ) : (
                      <span className="text-red-400 text-xs">Mancante</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === p.id ? (
                      <input
                        type="text"
                        value={editData.telefono ?? p.telefono ?? ""}
                        onChange={(e) => setEditData({ ...editData, telefono: e.target.value })}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="06 12345678"
                      />
                    ) : p.telefono ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <Phone className="w-3 h-3" /> {p.telefono}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                  {tab === "email_inviate" && (
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-xs text-gray-600">
                        <Calendar className="w-3 h-3" />
                        {formatDate(p.email_sent_at)}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {p.email_sent ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                        <Mail className="w-3 h-3" /> Inviata
                      </span>
                    ) : p.email ? (
                      <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        Pronta
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                        Incompleta
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {editingId === p.id ? (
                        <>
                          <button onClick={() => saveEdit(p.id)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Salva</button>
                          <button onClick={() => { setEditingId(null); setEditData({}); }} className="px-2 py-1 bg-gray-200 rounded text-xs">Annulla</button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditingId(p.id); setEditData({ email: p.email || "", telefono: p.telefono || "" }); }}
                            className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
                            title="Modifica"
                          >
                            Modifica
                          </button>
                          {/* Tab Nuovi: pulsante invia email singola */}
                          {tab === "nuovi" && p.email && !p.email_sent && (
                            <button
                              onClick={() => sendEmailToProspect(p.id)}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                              title="Invia email"
                            >
                              <Send className="w-3 h-3" />
                            </button>
                          )}
                          {/* Tab Email Inviate: pulsante sposta a clienti */}
                          {tab === "email_inviate" && (
                            <button
                              onClick={() => moveToClients(p.id)}
                              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 flex items-center gap-1"
                              title="Sposta a Clienti ordinari"
                            >
                              <UserCheck className="w-3 h-3" /> Clienti
                            </button>
                          )}
                          {p.sito_web && (
                            <a
                              href={p.sito_web.startsWith("http") ? p.sito_web : `https://${p.sito_web}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 text-xs text-gray-400 hover:text-blue-600"
                              title="Sito web"
                            >
                              <Globe className="w-3 h-3" />
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginazione */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-500">Pagina {page} di {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-1 border rounded disabled:opacity-30 hover:bg-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1 border rounded disabled:opacity-30 hover:bg-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
