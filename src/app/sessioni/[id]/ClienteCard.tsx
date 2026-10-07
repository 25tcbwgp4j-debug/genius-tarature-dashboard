"use client";

// «Cliente (chi paga)» — 07/10/2026 (Christian): quando si richiama/sceglie il cliente si VEDONO subito tutti i dati
// anagrafici in un riepilogo leggibile (ragione sociale, P.IVA, CF, SDI, PEC, indirizzo completo, email, telefoni,
// WhatsApp, referente, pagamento). I dati obbligatori per fatturare che mancano (P.IVA o CF · SDI o PEC · indirizzo ·
// CAP · comune) sono in ROSSO, con il pulsante «Completa i dati mancanti» che apre il modulo con quei campi evidenziati.
// Dentro la stessa scheda c'è il flag «Il destinatario del rapporto è diverso da chi paga» (children).

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { EditCustomerDialog } from "./EditCustomerDialog";
import { ChangeCustomerDialog } from "./ChangeCustomerDialog";
import type { TerminiCliente } from "@/lib/api";

type Customer = { id: string; company_name?: string } & Record<string, any>;  // eslint-disable-line @typescript-eslint/no-explicit-any

const pieno = (v: unknown) => !!String(v ?? "").trim();

/** Dati obbligatori per la fattura elettronica che mancano: etichetta da mostrare + campi da evidenziare nel modulo. */
export function datiMancantiFattura(c: Customer): { voce: string; campi: string[] }[] {
  const out: { voce: string; campi: string[] }[] = [];
  if (!pieno(c.vat_number) && !pieno(c.tax_id)) out.push({ voce: "P.IVA o codice fiscale", campi: ["vat_number", "tax_id"] });
  if (!pieno(c.sdi_code) && !pieno(c.pec)) out.push({ voce: "codice SDI o PEC", campi: ["sdi_code", "pec"] });
  if (!pieno(c.address)) out.push({ voce: "indirizzo", campi: ["address"] });
  if (!pieno(c.zip_code)) out.push({ voce: "CAP", campi: ["zip_code"] });
  if (!pieno(c.city)) out.push({ voce: "comune", campi: ["city"] });
  return out;
}

export function ClienteCard({ sessionId, customer, onChanged, termini, children }: {
  sessionId: string; customer: Customer; onChanged: () => void | Promise<void>; termini?: TerminiCliente | null; children?: ReactNode;
}) {
  const mancanti = datiMancantiFattura(customer);
  const campiMancanti = mancanti.flatMap((m) => m.campi);
  const manca = (k: string) => campiMancanti.includes(k);
  const indirizzo = [customer.address, [customer.zip_code, customer.city].filter(Boolean).join(" "), customer.province ? `(${customer.province})` : ""]
    .filter(Boolean).join(", ");
  const indirizzoManca = manca("address") || manca("zip_code") || manca("city");
  const pagamento = `${customer.payment_terms || "non indicato"} · ${termini?.descrizione || "immediato"}`
    + (Number(customer.discount_percent) > 0 ? ` · sconto ${Number(customer.discount_percent).toLocaleString("it-IT")}%` : "");

  // [etichetta, valore, mancante obbligatorio, testo se manca]
  const righe: [string, string | null | undefined, boolean, string?][] = [
    ["P.IVA", customer.vat_number, manca("vat_number"), "manca P.IVA o CF"],
    ["Codice fiscale", customer.tax_id, manca("tax_id"), "manca P.IVA o CF"],
    ["Codice SDI", customer.sdi_code, manca("sdi_code"), "manca SDI o PEC"],
    ["PEC", customer.pec, manca("pec"), "manca SDI o PEC"],
    ["Indirizzo", indirizzo || null, indirizzoManca,
      `manca ${[manca("address") && "indirizzo", manca("zip_code") && "CAP", manca("city") && "comune"].filter(Boolean).join(", ")}`],
    ["Email", customer.email, false],
    ["Cellulare", customer.mobile, false],
    ["WhatsApp", customer.whatsapp_phone, false],
    ["Tel. fisso", customer.phone1, false],
    ["Referente", customer.contact_person, false],
    ["Pagamento", pagamento, false],
  ];

  return (
    <Card className="gap-0 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Cliente (chi paga)</span>
        <span className="text-base font-semibold text-gray-900">{customer.company_name || "—"}</span>
        {mancanti.length === 0
          ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-800">dati per fatturare completi</span>
          : <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">mancano dati per fatturare</span>}
        <div className="grid w-full grid-cols-2 gap-1.5 sm:ml-auto sm:flex sm:w-auto sm:items-center [&>button]:min-w-0 [&>button]:px-2 [&>button]:text-xs">
          <EditCustomerDialog customer={customer} onSaved={onChanged} />
          <ChangeCustomerDialog sessionId={sessionId} currentCustomerId={customer.id} currentCustomerName={customer.company_name || ""} onChanged={onChanged} />
        </div>
      </div>

      {/* Riepilogo anagrafico: sempre visibile, compatto (2 colonne su telefono, 4 su iMac) */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
        {righe.map(([k, v, rosso, testo]) => (
          <div key={k} className={`min-w-0 ${k === "Indirizzo" || k === "Pagamento" ? "col-span-2" : ""}`}>
            <dt className={`text-[11px] uppercase tracking-wide ${rosso ? "font-semibold text-red-600" : "text-gray-500"}`}>{k}</dt>
            <dd className={`break-words ${rosso ? "font-semibold text-red-700" : v ? "text-gray-900" : "text-gray-400"}`}>
              {rosso && !v ? testo : rosso && v ? <>{v} <span className="text-xs">({testo})</span></> : v || "—"}
            </dd>
          </div>
        ))}
      </dl>

      {mancanti.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-red-300 bg-red-50 p-2 sm:flex-row sm:items-center">
          <p className="flex-1 text-xs text-red-800">
            <AlertTriangle className="mr-1 inline size-4 align-text-bottom" />
            Per fatturare mancano: <b>{mancanti.map((m) => m.voce).join(" · ")}</b>
          </p>
          <EditCustomerDialog customer={customer} onSaved={onChanged} etichetta="Completa i dati mancanti" mancanti={campiMancanti}
            className="border-red-400 bg-white text-red-700 hover:bg-red-100" />
        </div>
      )}

      {children && <div className="mt-3 border-t pt-3">{children}</div>}
    </Card>
  );
}
