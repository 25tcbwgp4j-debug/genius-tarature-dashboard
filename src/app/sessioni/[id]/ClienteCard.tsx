"use client";

// «Cliente (chi paga)» compatto (Christian, 02/10/2026): una riga con ragione sociale, P.IVA, email e cellulare,
// più i pulsanti Modifica/Cambia; i dettagli fiscali e gli indirizzi si aprono con «Dettagli». Prima era una
// griglia a tre colonne alta mezza pagina, con molto bianco.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";
import { EditCustomerDialog } from "./EditCustomerDialog";
import { ChangeCustomerDialog } from "./ChangeCustomerDialog";
import type { TerminiCliente } from "@/lib/api";

type Customer = { id: string; company_name?: string } & Record<string, any>;  // eslint-disable-line @typescript-eslint/no-explicit-any

export function ClienteCard({ sessionId, customer, onChanged, termini }: {
  sessionId: string; customer: Customer; onChanged: () => void | Promise<void>; termini?: TerminiCliente | null;
}) {
  const [aperto, setAperto] = useState(false);
  const indirizzo = [customer.address, [customer.zip_code, customer.city].filter(Boolean).join(" "), customer.province ? `(${customer.province})` : ""]
    .filter(Boolean).join(", ");
  const dettagli: [string, string | null | undefined][] = [
    ["Codice fiscale", customer.tax_id],
    ["Codice SDI", customer.sdi_code],
    ["PEC", customer.pec],
    ["Indirizzo", indirizzo],
    ["Tel. fisso", customer.phone1],
    ["WhatsApp", customer.whatsapp_phone],
    ["Referente", customer.contact_person],
  ];
  return (
    <Card className="gap-0 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Cliente (chi paga)</span>
        <span className="text-base font-semibold text-gray-900">{customer.company_name || "—"}</span>
        {customer.vat_number && <span className="text-xs text-gray-600">P.IVA {customer.vat_number}</span>}
        {customer.email && <span className="hidden truncate text-xs text-gray-600 sm:inline">{customer.email}</span>}
        {customer.mobile && <span className="hidden text-xs text-gray-600 sm:inline">{customer.mobile}</span>}
        {/* termini di pagamento concordati e sconto (03/10/2026): danno modalità e scadenza della fattura */}
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${termini?.differito ? "bg-sky-100 text-sky-800" : "bg-gray-100 text-gray-700"}`}
          title="Termini di pagamento del cliente (Modifica cliente per cambiarli)">
          Pagamento: {customer.payment_terms || "non indicato"} · {termini?.descrizione || "immediato"}
          {Number(customer.discount_percent) > 0 ? ` · sconto ${Number(customer.discount_percent).toLocaleString("it-IT")}%` : ""}
        </span>
        <div className="grid w-full grid-cols-3 gap-1.5 sm:ml-auto sm:flex sm:w-auto sm:items-center [&>button]:min-w-0 [&>button]:px-2 [&>button]:text-xs">
          <EditCustomerDialog customer={customer} onSaved={onChanged} />
          <ChangeCustomerDialog sessionId={sessionId} currentCustomerId={customer.id} currentCustomerName={customer.company_name || ""} onChanged={onChanged} />
          <button type="button" onClick={() => setAperto((v) => !v)}
            className="flex h-11 items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs text-gray-700 hover:bg-gray-50"
            aria-expanded={aperto}>
            Dettagli {aperto ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>
      {/* su telefono email e cellulare vanno in una seconda riga, non spariscono */}
      {(customer.email || customer.mobile) && (
        <p className="mt-1 truncate text-xs text-gray-600 sm:hidden">{[customer.email, customer.mobile].filter(Boolean).join(" · ")}</p>
      )}
      {aperto && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {dettagli.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-gray-500">{k}</dt>
              <dd className={`break-words ${v ? "text-gray-900" : "text-gray-400"}`}>{v || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
