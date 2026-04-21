"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Search, MessageSquare, Sparkles, Check, X } from "lucide-react";
import { Contact, listContacts, renameContact, reconcileContacts } from "@/lib/chat-api";

export default function RubricaPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [total, setTotal] = useState(0);
  const [editPhone, setEditPhone] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await listContacts(q || undefined, 200, 0);
      setContacts(r.contacts);
      setTotal(r.total);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function startEdit(c: Contact) {
    const phone = c.whatsapp_phone || c.mobile || c.phone1;
    if (!phone) return;
    setEditPhone(phone);
    setEditValue(c.company_name || "");
  }

  async function saveEdit() {
    if (!editPhone || !editValue.trim()) {
      setEditPhone(null);
      return;
    }
    try {
      await renameContact(editPhone, editValue.trim());
      setEditPhone(null);
      load();
    } catch (e: any) {
      alert("Errore: " + e.message);
    }
  }

  async function runReconcile() {
    setReconciling(true);
    setReconcileMsg("Riconciliazione in corso...");
    try {
      const r = await reconcileContacts(5000);
      setReconcileMsg(
        `✅ Totale ${r.stats.total} · Inviati ${r.stats.ok} · Errori ${r.stats.failed} · Senza telefono ${r.stats.skipped}`
      );
      load();
    } catch (e: any) {
      setReconcileMsg("❌ " + e.message);
    } finally {
      setReconciling(false);
    }
  }

  function bestPhone(c: Contact) {
    return c.whatsapp_phone || c.mobile || c.phone1 || "";
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rubrica</h1>
          <p className="text-sm text-gray-500">
            Sincronizza automaticamente su iPhone staff (+39 375 737 1888) via CardDAV
          </p>
        </div>
        <button
          onClick={runReconcile}
          disabled={reconciling}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
        >
          <Sparkles className="w-4 h-4" />
          {reconciling ? "Riconciliando..." : "🪄 Riconcilia da clienti"}
        </button>
      </div>

      {reconcileMsg && (
        <div className="p-3 rounded-lg bg-indigo-50 text-indigo-900 text-sm">{reconcileMsg}</div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cerca nome, telefono, email, P.IVA..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-xs text-gray-500">
          {loading ? "Caricamento..." : `${contacts.length} di ${total} contatti`}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nome</th>
                <th className="px-4 py-3 text-left font-medium">Telefono</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">P.IVA</th>
                <th className="px-4 py-3 text-left font-medium">WA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {editPhone === bestPhone(c) ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setEditPhone(null);
                          }}
                          className="flex-1 px-2 py-1 text-sm border border-blue-400 rounded"
                        />
                        <button onClick={saveEdit} className="text-green-600 hover:bg-green-50 p-1 rounded">
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditPhone(null)}
                          className="text-gray-400 hover:bg-gray-100 p-1 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(c)}
                        className="text-left font-medium text-gray-900 hover:text-blue-600"
                      >
                        {c.company_name || "—"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {bestPhone(c) ? (
                      <Link
                        href={`/chat?phone=${encodeURIComponent(bestPhone(c))}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {bestPhone(c)}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.vat_number || "—"}</td>
                  <td className="px-4 py-3">
                    {c.whatsapp_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-xs">
                        ● attivo
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && contacts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500 text-sm">
                    Nessun contatto trovato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <details className="bg-amber-50 rounded-lg p-4 text-sm">
        <summary className="font-semibold text-amber-900 cursor-pointer">
          📱 Setup iPhone staff (+39 375 737 1888)
        </summary>
        <div className="mt-3 space-y-1 text-amber-900">
          <p>
            <strong>Impostazioni iOS</strong> → Contatti → Account → Aggiungi account → Altro →
            Account CardDAV
          </p>
          <ul className="list-disc ml-5 text-amber-800 text-xs">
            <li>Server: <code>radicale-tarature-production.up.railway.app</code></li>
            <li>Nome utente: <code>staff</code></li>
            <li>Password: (vedi reference_radicale_credentials.md)</li>
            <li>Descrizione: Clienti Tarature</li>
          </ul>
          <p className="text-xs text-amber-700 mt-2">
            Se chiede &quot;Impossibile connettersi via SSL&quot; tocca &quot;Continua&quot;.
          </p>
        </div>
      </details>
    </div>
  );
}
