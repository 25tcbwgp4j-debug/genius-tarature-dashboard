"use client";

// Pagamento della sessione = pagamento della FATTURA collegata (Christian, 03/10/2026).
// Nato dal caso CFS 168-170: la sessione diceva «pagato a bonifico» (pulsante BONIFICO premuto per dire «pagherà
// a bonifico»), le fatture 752-754 erano da pagare. Qui un solo modo di dire lo stato, usato in testata,
// nella sezione «Pagamento» delle Azioni e nella sezione «Fattura»: niente testi contraddittori.

import { AlertTriangle } from "lucide-react";
import type { StatoPagamentoSessione } from "@/lib/api";

export const dataIt = (d?: string | null) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT") : "—");

/** «Pagata il 28/09 · carta online» / «Da pagare · bonifico · scade il 29/09» / «Da pagare · differito: 30 gg …». */
export function testoPagamento(st: StatoPagamentoSessione | null): { breve: string; lungo: string; colore: string } | null {
  if (!st?.pagamento) return null;
  const p = st.pagamento;
  const f = st.fattura;
  const doc = f ? (f.numero ? `fattura ${f.numero}` : "bozza di fattura") : null;
  if (p.pagata) {
    const come = p.modalita_label ? ` con ${p.modalita_label}` : "";
    return {
      breve: `Pagata${p.pagato_il ? ` il ${dataIt(p.pagato_il)}` : ""}`,
      lungo: `Pagata${p.pagato_il ? ` il ${dataIt(p.pagato_il)}` : ""}${come}${doc ? ` (${doc})` : " — fattura non ancora fatta"}`,
      colore: "bg-emerald-100 text-emerald-800 border-emerald-300",
    };
  }
  if (st.sessione?.payment_status === "non_richiesto" && !f) {
    return { breve: "Pagamento non richiesto", lungo: "Pagamento non richiesto", colore: "bg-gray-100 text-gray-600 border-gray-300" };
  }
  const termine = p.termine === "differito"
    ? `differito concordato${st.termini?.giorni ? ` (${st.termini.giorni} gg${st.termini.fine_mese ? " FM" : ""})` : ""}`
    : "immediato";
  const scad = p.scadenza ? ` · ${p.scaduta ? "scaduta il" : "scade il"} ${dataIt(p.scadenza)}` : "";
  return {
    breve: p.scaduta ? "Da pagare · scaduta" : "Da pagare",
    lungo: `Da pagare${p.modalita_label ? ` a ${p.modalita_label}` : ""} · ${termine}${scad}${doc ? ` (${doc})` : ""}`,
    colore: p.scaduta ? "bg-red-100 text-red-800 border-red-300" : "bg-amber-100 text-amber-800 border-amber-300",
  };
}

/** Avvisi di coerenza (pronto senza fattura/pro forma, consegnata non pagata, pagata senza fattura…). */
export function AvvisiPagamento({ st }: { st: StatoPagamentoSessione | null }) {
  if (!st?.avvisi?.length) return null;
  return (
    <div className="space-y-1.5">
      {st.avvisi.map((a) => (
        <div key={a.codice}
          className={`flex items-start gap-2 rounded-lg border-2 p-2.5 text-sm font-medium ${a.livello === "errore"
            ? "border-red-500 bg-red-50 text-red-800" : "border-amber-400 bg-amber-50 text-amber-900"}`}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{a.testo}</span>
        </div>
      ))}
    </div>
  );
}
