"use client";

import Link from "next/link";
import { X, Building2, Phone, Mail, MapPin, Wrench, FileText } from "lucide-react";
import type { ConversationContext } from "@/lib/chat-api";
import { sourceBadge } from "@/lib/chat-api";

export function CustomerSidebar({
  context,
  onClose,
}: {
  context: ConversationContext;
  onClose?: () => void;
}) {
  const badge = sourceBadge(context.lead_source);
  const customer = context.customer as
    | {
        id: string;
        company_name?: string;
        legacy_code?: string;
        vat_number?: string;
        address?: string;
        zip_code?: string;
        city?: string;
        province?: string;
        email?: string;
        mobile?: string;
        phone1?: string;
      }
    | null;

  const session = context.session as
    | {
        id?: string;
        status?: string;
        pickup_date?: string;
        created_at?: string;
      }
    | null;

  return (
    <aside className="w-80 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Dettaglio contatto</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100"
          aria-label="Chiudi pannello"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {/* Badge tipo */}
        <div>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        </div>

        {/* Cliente */}
        {customer && (
          <section>
            <div className="flex items-center gap-2 font-semibold text-gray-900 mb-2">
              <Building2 className="w-4 h-4 text-emerald-600" /> Azienda
            </div>
            <div className="space-y-1">
              <div className="font-medium text-gray-900">{customer.company_name}</div>
              {customer.legacy_code && (
                <div className="text-xs text-gray-500">Cod. {customer.legacy_code}</div>
              )}
              {customer.vat_number && (
                <div className="text-xs text-gray-500">P.IVA {customer.vat_number}</div>
              )}
              {(customer.address || customer.city) && (
                <div className="flex items-start gap-1.5 text-xs text-gray-600 mt-1">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                  <span>
                    {customer.address}
                    {customer.zip_code && `, ${customer.zip_code}`}
                    {customer.city && ` ${customer.city}`}
                    {customer.province && ` (${customer.province})`}
                  </span>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <a href={`mailto:${customer.email}`} className="hover:text-emerald-600">
                    {customer.email}
                  </a>
                </div>
              )}
              {(customer.mobile || customer.phone1) && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <span>{customer.mobile || customer.phone1}</span>
                </div>
              )}
            </div>
            <Link
              href={`/clienti?highlight=${customer.id}`}
              className="mt-3 block text-center text-xs px-3 py-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium"
            >
              Apri scheda cliente
            </Link>
          </section>
        )}

        {!customer && context.lead_source !== "staff" && (
          <section className="p-3 bg-amber-50 rounded-lg text-xs text-amber-800">
            Contatto non ancora registrato come cliente.
            {context.lead_id && (
              <Link
                href="/nuovi-clienti"
                className="block mt-2 text-center px-3 py-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600 font-medium"
              >
                Promuovi a cliente
              </Link>
            )}
          </section>
        )}

        {/* Sessione */}
        {session?.id && (
          <section>
            <div className="flex items-center gap-2 font-semibold text-gray-900 mb-2">
              <Wrench className="w-4 h-4 text-emerald-600" /> Sessione corrente
            </div>
            <div className="space-y-1 text-xs text-gray-600">
              <div>
                Stato:{" "}
                <span className="font-medium text-gray-900">
                  {session.status || "attiva"}
                </span>
              </div>
              {session.pickup_date && (
                <div>
                  Ritiro: <span className="font-medium">{session.pickup_date}</span>
                </div>
              )}
              <Link
                href={`/sessioni/${session.id}`}
                className="mt-2 block text-center text-xs px-3 py-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium"
              >
                Apri sessione
              </Link>
            </div>
          </section>
        )}

        {/* Ultimi rapporti */}
        {context.recent_rdts.length > 0 && (
          <section>
            <div className="flex items-center gap-2 font-semibold text-gray-900 mb-2">
              <FileText className="w-4 h-4 text-emerald-600" /> Ultimi rapporti
            </div>
            <ul className="space-y-1 text-xs">
              {context.recent_rdts.slice(0, 5).map((r, i) => {
                const rdt = r as Record<string, string>;
                return (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {rdt.rdt_number}
                      {rdt.instrument_type && ` — ${rdt.instrument_type}`}
                    </span>
                    <span className="text-gray-400 flex-shrink-0">
                      {rdt.issued_at?.slice(0, 10)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
