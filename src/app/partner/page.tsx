"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Handshake, Mail, Phone, Globe, RefreshCw,
  ChevronLeft, ChevronRight, Search, Loader2, Users,
  TrendingUp, Star, Send, CheckCircle, XCircle,
  AlertTriangle, Percent, Building2, FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import {
  listPartners, getPartnersStats, triggerPartnerDiscovery,
  triggerPartnerEnrich, triggerPartnerSendBatch, updatePartner,
  type Partner,
} from "@/lib/api";

type PartnerType = "rivenditore" | "centro_fgas";

interface Stats {
  rivenditore: Record<string, number>;
  centro_fgas: Record<string, number>;
  totale: Record<string, number>;
}

const PARTNERSHIP_STATUS_LABELS: Record<string, string> = {
  prospect: "Trovato",
  contacted: "Contattato",
  interested: "Interessato",
  active: "Attivo",
  declined: "Rifiutato",
};

const PARTNERSHIP_STATUS_COLORS: Record<string, string> = {
  prospect: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  interested: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  declined: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const ENRICH_STATUS_COLORS: Record<string, string> = {
  pending: "text-gray-400",
  enriched: "text-green-500",
  partial: "text-yellow-500",
  not_found: "text-red-400",
};

export default function PartnerPage() {
  const [tab, setTab] = useState<PartnerType>("rivenditore");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEnrich, setFilterEnrich] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editTier, setEditTier] = useState<number | undefined>();
  const [editStatus, setEditStatus] = useState("");

  const PER_PAGE = 50;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [partnerRes, statsRes] = await Promise.all([
        listPartners({
          partner_type: tab,
          partnership_status: filterStatus || undefined,
          enrichment_status: filterEnrich || undefined,
          city: search || undefined,
          page,
          per_page: PER_PAGE,
        }),
        getPartnersStats(),
      ]);
      setPartners(partnerRes?.partners ?? []);
      setStats(statsRes ?? null);
    } catch {
      toast.error("Errore caricamento partner");
    } finally {
      setLoading(false);
    }
  }, [tab, page, filterStatus, filterEnrich, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDiscover = async () => {
    setActionLoading("discover");
    try {
      await triggerPartnerDiscovery();
      toast.success("Discovery avviata in background — ricarica tra qualche minuto");
    } catch {
      toast.error("Errore avvio discovery");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEnrich = async () => {
    setActionLoading("enrich");
    try {
      await triggerPartnerEnrich();
      toast.success("Enrichment email avviato in background");
    } catch {
      toast.error("Errore avvio enrichment");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendBatch = async () => {
    setActionLoading("send");
    try {
      const res = await triggerPartnerSendBatch();
      if (res?.note) toast.info(res.note);
      else toast.success("Batch email partner avviato");
    } catch {
      toast.error("Errore invio batch");
    } finally {
      setActionLoading(null);
      await loadData();
    }
  };

  const handleSaveEdit = async (id: number) => {
    try {
      await updatePartner(id, {
        notes: editNotes || undefined,
        commission_tier: editTier,
        partnership_status: editStatus || undefined,
      });
      toast.success("Partner aggiornato");
      setEditingId(null);
      await loadData();
    } catch {
      toast.error("Errore aggiornamento partner");
    }
  };

  const handleDNC = async (id: number) => {
    if (!confirm("Marcare questo partner come do-not-contact?")) return;
    try {
      await updatePartner(id, {
        do_not_contact: true,
        do_not_contact_reason: "richiesta staff",
      });
      toast.success("Partner marcato DNC");
      await loadData();
    } catch {
      toast.error("Errore DNC");
    }
  };

  const typeStats = stats?.[tab] ?? {};
  const totaleType = typeStats["totale"] ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Handshake className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Partner B2B</h1>
            <p className="text-sm text-muted-foreground">
              Rivenditori termoidraulica · Centri certificazione F-Gas
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleDiscover}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {actionLoading === "discover" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Cerca nuovi
          </button>
          <button
            onClick={handleEnrich}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {actionLoading === "enrich" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )}
            Trova email
          </button>
          <button
            onClick={handleSendBatch}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {actionLoading === "send" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Invia email
          </button>
        </div>
      </div>

      {/* Stato invii — dinamico: verde se già inviato, giallo se mai inviato */}
      {stats && (() => {
        const contacted = (stats.rivenditore?.contacted ?? 0) + (stats.centro_fgas?.contacted ?? 0);
        const active = (stats.rivenditore?.active ?? 0) + (stats.centro_fgas?.active ?? 0);
        if (contacted > 0 || active > 0) {
          return (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
              <CheckCircle className="mr-1.5 inline h-4 w-4" />
              <strong>Invii attivi</strong> — {contacted} partner contattati
              {active > 0 ? `, ${active} attivi` : ""}.
              Il cron invia automaticamente ogni giorno lun-ven alle 10:30.
            </div>
          );
        }
        return (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
            <AlertTriangle className="mr-1.5 inline h-4 w-4" />
            <strong>Invii disabilitati</strong> — Per abilitare: Railway → Tarature API →
            variabile <code>PARTNER_EMAIL_ENABLED=true</code>.
          </div>
        );
      })()}

      {/* KPI */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Totale trovati", value: stats.totale?.totale ?? 0, icon: Users, color: "text-blue-500" },
            { label: "Con email", value: stats.totale?.con_email ?? 0, icon: Mail, color: "text-green-500" },
            { label: "Contattati", value: (stats.rivenditore?.contacted ?? 0) + (stats.centro_fgas?.contacted ?? 0), icon: Send, color: "text-purple-500" },
            { label: "Attivi", value: (stats.rivenditore?.active ?? 0) + (stats.centro_fgas?.active ?? 0), icon: CheckCircle, color: "text-emerald-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-xs">{label}</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {(["rivenditore", "centro_fgas"] as PartnerType[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); }}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "rivenditore" ? (
              <Building2 className="h-4 w-4" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            {t === "rivenditore" ? `Rivenditori (${stats?.rivenditore?.totale ?? 0})` : `Centri F-Gas (${stats?.centro_fgas?.totale ?? 0})`}
          </button>
        ))}
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Filtra per città..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="rounded-md border px-3 py-1.5 text-sm bg-background w-44"
        />
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
        >
          <option value="">Tutti gli stati</option>
          {Object.entries(PARTNERSHIP_STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          value={filterEnrich}
          onChange={(e) => { setFilterEnrich(e.target.value); setPage(1); }}
          className="rounded-md border px-3 py-1.5 text-sm bg-background"
        >
          <option value="">Tutti enrichment</option>
          <option value="enriched">Con email</option>
          <option value="pending">Senza email</option>
          <option value="not_found">Non trovati</option>
        </select>
        <button
          onClick={loadData}
          className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Aggiorna
        </button>
      </div>

      {/* Tabella */}
      <div className="rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Caricamento...
          </div>
        ) : partners.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Handshake className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p>Nessun partner trovato. Clicca <strong>Cerca nuovi</strong> per avviare la discovery.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Nome</th>
                  <th className="px-4 py-3 text-left font-medium">Città</th>
                  <th className="px-4 py-3 text-left font-medium">Contatti</th>
                  {tab === "rivenditore" && (
                    <th className="px-4 py-3 text-left font-medium">Tier</th>
                  )}
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Stato</th>
                  <th className="px-4 py-3 text-left font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {partners.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      {p.notes && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{p.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.city || "—"}
                      {p.province && <span className="text-xs ml-1">({p.province})</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {p.phone && (
                          <a href={`tel:${p.phone}`} className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                            <Phone className="h-3 w-3" /> {p.phone}
                          </a>
                        )}
                        {p.email ? (
                          <a href={`mailto:${p.email}`} className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                            <Mail className="h-3 w-3" /> {p.email}
                          </a>
                        ) : (
                          <span className={`flex items-center gap-1 text-xs ${ENRICH_STATUS_COLORS[p.enrichment_status ?? "pending"]}`}>
                            <Mail className="h-3 w-3" />
                            {p.enrichment_status === "not_found" ? "non trovata" : "in attesa"}
                          </span>
                        )}
                        {p.website && (
                          <a href={p.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                            <Globe className="h-3 w-3" /> sito
                          </a>
                        )}
                      </div>
                    </td>
                    {tab === "rivenditore" && (
                      <td className="px-4 py-3">
                        {p.commission_tier ? (
                          <span className="flex items-center gap-1 font-semibold text-green-600">
                            <Percent className="h-3.5 w-3.5" />
                            {p.commission_tier}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {p.email_status === "sent" ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Inviata
                        </span>
                      ) : p.email_status === "declined" ? (
                        <span className="flex items-center gap-1 text-xs text-red-500">
                          <XCircle className="h-3.5 w-3.5" />
                          Rifiutata
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PARTNERSHIP_STATUS_COLORS[p.partnership_status ?? "prospect"]}`}>
                        {PARTNERSHIP_STATUS_LABELS[p.partnership_status ?? "prospect"]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === p.id ? (
                        <div className="flex flex-col gap-1.5 min-w-[180px]">
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            className="rounded border px-2 py-1 text-xs bg-background"
                          >
                            <option value="">— stato —</option>
                            {Object.entries(PARTNERSHIP_STATUS_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                          {tab === "rivenditore" && (
                            <select
                              value={editTier ?? ""}
                              onChange={(e) => setEditTier(e.target.value ? Number(e.target.value) : undefined)}
                              className="rounded border px-2 py-1 text-xs bg-background"
                            >
                              <option value="">— tier % —</option>
                              <option value="10">10%</option>
                              <option value="15">15%</option>
                              <option value="20">20%</option>
                            </select>
                          )}
                          <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Note..."
                            rows={2}
                            className="rounded border px-2 py-1 text-xs bg-background resize-none"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSaveEdit(p.id)}
                              className="flex-1 rounded bg-green-600 py-1 text-xs text-white hover:bg-green-700"
                            >
                              Salva
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="flex-1 rounded bg-gray-300 py-1 text-xs hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditingId(p.id);
                              setEditNotes(p.notes ?? "");
                              setEditTier(p.commission_tier);
                              setEditStatus(p.partnership_status ?? "");
                            }}
                            className="rounded border px-2 py-1 text-xs hover:bg-muted"
                          >
                            Modifica
                          </button>
                          {!p.do_not_contact && (
                            <button
                              onClick={() => handleDNC(p.id)}
                              className="rounded border px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                              title="Do not contact"
                            >
                              DNC
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginazione */}
      {!loading && partners.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Pagina {page} · {totaleType} partner nel tipo corrente
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex items-center gap-1 rounded border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Prec
            </button>
            <button
              disabled={partners.length < PER_PAGE}
              onClick={() => setPage((p) => p + 1)}
              className="flex items-center gap-1 rounded border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
            >
              Succ <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
