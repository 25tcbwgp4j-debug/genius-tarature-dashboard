"use client";

// SCANSIONE DEI RAPPORTI FIRMATI (08/10/2026, Christian — migrazione 107).
// Alcuni clienti (si parte da SITEF SRL) vogliono ricevere in anticipo via email i PDF dei rapporti FIRMATI:
// dopo la firma vanno scansionati PRIMA di graffettarli e consegnarli.
// - AvvisoScansioneModal: pop-up BLOCCANTE a «Genera rapporti», «Stampa rapporti», «Scarica rapporti»
//   (si prosegue solo spuntando «Ho capito»);
// - PromemoriaScansione: banner in sessione finché non si segna «Scansione fatta» (con chi/quando);
// - «Invia scansione via email»: pulsante DISABILITATO, arriverà col nuovo scanner documentale (nessun invio automatico).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileScan, Loader2, Mail, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { segnaScansioneRapporti, type StatoScansioneRapporti } from "@/lib/api";

function quando(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  } catch { return ""; }
}

function perChi(st: StatoScansioneRapporti) {
  return st.chi.map((c) => `${c.ruolo === "destinatario" ? "destinatario del rapporto" : "cliente"} ${c.nome || ""}`.trim()).join(" e ");
}

/** Pop-up bloccante: «Questo cliente vuole la SCANSIONE dei rapporti firmati…» con spunta «Ho capito». */
export function AvvisoScansioneModal({ stato, azione, onProsegui, onAnnulla }: {
  stato: StatoScansioneRapporti; azione: string; onProsegui: () => void; onAnnulla: () => void;
}) {
  const [capito, setCapito] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border-4 border-fuchsia-600 bg-white p-5 shadow-2xl">
        <p className="flex items-center gap-2 text-lg font-extrabold text-fuchsia-800">
          <FileScan className="size-6 shrink-0" /> 📄 SCANSIONE DEI RAPPORTI RICHIESTA
        </p>
        <p className="mt-3 text-base font-semibold text-gray-900">
          Questo cliente vuole la SCANSIONE dei rapporti firmati: dopo la firma, scansionali PRIMA di graffettarli e consegnarli.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-gray-700">
          {stato.chi.map((c) => (
            <li key={c.ruolo + c.customer_id}>
              <b>{c.nome}</b> ({c.ruolo === "destinatario" ? "destinatario del rapporto" : "cliente"})
              {c.email ? <> · PDF a <b>{c.email}</b></> : null}
              {c.note ? <span className="block text-xs text-gray-500">{c.note}</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-500">Azione: {azione}. Dopo la scansione premi «Scansione fatta» nella sessione.</p>
        <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-md border border-fuchsia-300 bg-fuchsia-50 p-3 text-sm font-semibold text-fuchsia-900">
          <input type="checkbox" className="size-5" checked={capito} onChange={(e) => setCapito(e.target.checked)} />
          Ho capito: scansiono i rapporti firmati prima di graffettarli e consegnarli
        </label>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onAnnulla}>Annulla</Button>
          <Button className="flex-1 bg-fuchsia-700 text-white hover:bg-fuchsia-800" disabled={!capito} onClick={onProsegui}>
            Prosegui
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Banner in sessione: visibile finché la scansione non è segnata come fatta; poi riga verde con chi/quando. */
export function PromemoriaScansione({ sessionId, stato, operatore, onAggiornato }: {
  sessionId: string; stato: StatoScansioneRapporti | null | undefined; operatore?: string; onAggiornato: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!stato?.richiesta) return null;
  const segna = async (fatta: boolean) => {
    if (fatta && stato.rapporti_generati === 0
      && !confirm("Non risultano rapporti generati in questa sessione. Segnare comunque la scansione come fatta?")) return;
    if (!fatta && !confirm("Annullare «Scansione fatta»? Il promemoria torna visibile.")) return;
    setBusy(true);
    try {
      await segnaScansioneRapporti(sessionId, fatta, operatore);
      toast.success(fatta ? "Scansione dei rapporti segnata come fatta" : "Scansione dei rapporti da rifare");
      await onAggiornato();
    } catch (e) {
      toast.error("Non riesco a salvare: " + (e as Error).message);
    } finally { setBusy(false); }
  };
  const emails = stato.chi.map((c) => c.email).filter(Boolean).join(", ");

  if (!stato.manca) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <CheckCircle2 className="size-4" />
        <span>📄 Scansione dei rapporti fatta {quando(stato.fatta_il)}{stato.fatta_da ? ` · ${stato.fatta_da}` : ""}</span>
        <Button size="sm" variant="ghost" className="ml-auto h-8 text-xs" disabled={busy} onClick={() => segna(false)}>
          <Undo2 className="mr-1 size-3.5" /> Annulla
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-fuchsia-600 bg-fuchsia-50 p-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="font-extrabold text-fuchsia-800">📄 Vuole la scansione dei rapporti — non ancora fatta</p>
        <p className="text-sm text-fuchsia-950">
          Richiesta dal {perChi(stato)}: dopo la firma, scansiona i rapporti PRIMA di graffettarli e consegnarli
          {emails ? <> · PDF da mandare a <b>{emails}</b></> : null}.
        </p>
        {stato.chi.some((c) => c.note) && (
          <p className="text-xs text-fuchsia-900/80">{stato.chi.map((c) => c.note).filter(Boolean).join(" · ")}</p>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-1 gap-1.5 sm:w-64">
        <Button className="h-10 bg-fuchsia-700 text-white hover:bg-fuchsia-800" disabled={busy} onClick={() => segna(true)}>
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CheckCircle2 className="mr-1 size-4" />} Scansione fatta
        </Button>
        {/* PREDISPOSTO, NON ATTIVO: col nuovo scanner documentale la dashboard prenderà il PDF dalla cartella di arrivo
            delle scansioni e lo invierà via email (backend: scansione_rapporti.invia_scansione_via_email). */}
        <Button variant="outline" className="h-9 text-xs" disabled title="Arriverà col nuovo scanner documentale: per ora la mail si manda a mano">
          <Mail className="mr-1 size-3.5" /> Invia scansione via email (in arrivo col nuovo scanner)
        </Button>
      </div>
    </div>
  );
}
