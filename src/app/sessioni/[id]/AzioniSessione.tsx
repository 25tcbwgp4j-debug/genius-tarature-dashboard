"use client";

// Sezione «Azioni» della sessione, compattata il 02/10/2026 su richiesta di Christian: prima erano sei pulsanti
// alti 80 px con molto bianco intorno; ora ogni azione è un riquadro con titolo, data dell'ultimo invio e
// pulsanti alti 44 px (bersaglio minimo per il dito su iPad e iPhone). Le funzioni sono le stesse di prima:
// registrazione (email/WhatsApp), pronti al ritiro, pro forma, genera rapporti, riconsegna, pagamento, Stripe.
// 07/10/2026 (Christian, 3° giro): riga 1 Registrazione · Pronti al ritiro · Rapporti (stato) · Chi sta facendo
// l'operazione (Christian/Dumy); riga 2 GENERA RAPPORTI | STRUMENTI RICONSEGNATI; poi il blocco unico
// Pro forma · fattura · pagamento (BloccoProforma). Il riquadro «Pagamento» separato non c'è più.

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileOutput, Loader2, Mail, MessageCircle, PackageCheck } from "lucide-react";
import { NOMI_OPERATORI, OPERATORI_TARATURE, SceltaOperatore, useOperatore, type Operatore } from "@/components/Operatore";
import { toast } from "sonner";
import { generateRdts, markDelivered, notifyReady, registerComplete, updateSession, type ProformaSessioneStato, type StatoPagamentoSessione } from "@/lib/api";
import { BloccoProforma } from "./BloccoProforma";

type Sess = Record<string, any>;  // eslint-disable-line @typescript-eslint/no-explicit-any

interface Props {
  sessionId: string;
  session: Sess;
  instruments: { rdt_generated_at?: string | null; rdt_number?: string | null; external_processing?: boolean | null }[];
  actionLoading: string | null;
  setActionLoading: (v: string | null) => void;
  handleAction: (action: string, fn: () => Promise<unknown>, successMsg: string) => Promise<void>;
  previewLoading: boolean;
  apriAnteprimaProforma: (ch: "email" | "whatsapp") => void;
  apriDialogProforma: () => void;
  /** pro forma (documento PF) della sessione: c'è → «Vedi» attivo, «Prepara» spento */
  pfDoc?: ProformaSessioneStato["documento"];
  /** avviso bloccante se la registrazione non è stata completata: poi() parte solo dopo la scelta */
  controllaRegistrazione?: (azione: string, poi: () => void) => void;
  currentStep: number;
  /** stato del pagamento dalla fattura collegata (fonte di verità, 03/10/2026) */
  statoPag?: StatoPagamentoSessione | null;
  /** dopo un incasso (anche parziale): ricarica sessione e stato del pagamento */
  onRicarica?: () => void;
}

function breve(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    // solo la data (es. «2026-10-02», pagamento della fattura): niente ora inventata («02:00» = mezzanotte UTC)
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  } catch { return null; }
}

/** Data dell'ultimo invio sotto al pulsante: «✓ 02/10 11:16» oppure «—». */
function Quando({ ts }: { ts: string | null | undefined }) {
  const f = breve(ts);
  return <p className={`h-3.5 text-center text-[10px] leading-none ${f ? "text-gray-600" : "text-gray-300"}`}>{f ? `✓ ${f}` : "—"}</p>;
}

function Gruppo({ titolo, sotto, children }: { titolo: string; sotto?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{titolo}</p>
      {children}
      {sotto && <div className="text-[10px] leading-tight text-gray-500">{sotto}</div>}
    </div>
  );
}

/** Coppia Email / WhatsApp con la data sotto a ciascuno. */
function Canali({ email, whatsapp, disabled, busy }: {
  email: { ts?: string | null; onClick: () => void; cls: string };
  whatsapp: { ts?: string | null; onClick: () => void; cls: string };
  disabled: boolean; busy: "email" | "whatsapp" | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <div>
        <Button className={`h-10 w-full text-xs font-bold text-white ${email.cls}`} disabled={disabled} onClick={email.onClick}>
          {busy === "email" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} EMAIL
        </Button>
        <Quando ts={email.ts} />
      </div>
      <div>
        <Button className={`h-10 w-full text-xs font-bold text-white ${whatsapp.cls}`} disabled={disabled} onClick={whatsapp.onClick}>
          {busy === "whatsapp" ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />} WHATSAPP
        </Button>
        <Quando ts={whatsapp.ts} />
      </div>
    </div>
  );
}

export function AzioniSessione({ sessionId, session, instruments, actionLoading, setActionLoading, handleAction,
  previewLoading, apriAnteprimaProforma, apriDialogProforma, pfDoc, controllaRegistrazione = (_a, poi) => poi(), currentStep, statoPag, onRicarica }: Props) {
  const occupato = actionLoading !== null;
  // chi sta facendo l'operazione: sulla pagina sessione solo Christian (CHR) o Dumy (DUMY), ricordato sul dispositivo
  const [opDispositivo, setOperatore] = useOperatore();
  const operatore = (OPERATORI_TARATURE as readonly Operatore[]).includes(opDispositivo as Operatore) ? (opDispositivo as Operatore) : "";
  const ultimoRdt = instruments.map((i) => i.rdt_generated_at || "").filter(Boolean).sort().pop();
  // con la fattura vale la fattura: è lei che dice se è pagata (la sessione si allinea da sola)
  const fattura = statoPag?.fattura || null;
  const isPaid = statoPag?.pagamento ? statoPag.pagamento.pagata : session.payment_status === "pagato";
  const differito = statoPag?.pagamento?.termine === "differito";
  // stato rapporti: quanti strumenti da tarare (esclusi «NON lo tariamo noi») hanno già il numero RDT
  const daTarare = instruments.filter((i) => !i.external_processing);
  const conRdt = daTarare.filter((i) => !!i.rdt_number).length;

  return (
    <Card className="p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-base font-semibold">Azioni</h3>
        <span className="text-[11px] text-gray-500">comunicazioni al cliente · rapporti · pro forma, fattura e pagamento · chiusura</span>
      </div>
      {/* Layout 07/10/2026 (Christian, 3° giro): riquadri BASSI e larghi.
          Riga 1: Registrazione · Pronti al ritiro · Rapporti (stato) · Chi sta facendo l'operazione.
          Riga 2: GENERA RAPPORTI a sinistra · STRUMENTI RICONSEGNATI a destra.
          Poi il blocco unico Pro forma · fattura · pagamento. Su telefono le righe vanno a capo una sotto l'altra. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Gruppo titolo="Registrazione completata">
          <Canali disabled={occupato}
            busy={actionLoading === "register_email" ? "email" : actionLoading === "register_wa" ? "whatsapp" : null}
            email={{ ts: session.receipt_email_at, cls: "bg-sky-600 hover:bg-sky-700", onClick: () => {
              if (!confirm("Inviare SOLO l'email di registrazione completata al cliente?")) return;
              handleAction("register_email", () => registerComplete(sessionId, "email"), "Email registrazione completata inviata");
            } }}
            whatsapp={{ ts: session.receipt_whatsapp_at, cls: "bg-emerald-600 hover:bg-emerald-700", onClick: () => {
              if (!confirm("Inviare SOLO il template WhatsApp di registrazione completata al cliente?")) return;
              handleAction("register_wa", () => registerComplete(sessionId, "whatsapp"), "Template WhatsApp registrazione completata inviato");
            } }}
          />
        </Gruppo>

        <Gruppo titolo="Pronti al ritiro">
          <Canali disabled={occupato}
            busy={actionLoading === "ready_email" ? "email" : actionLoading === "ready_wa" ? "whatsapp" : null}
            email={{ ts: session.ready_email_at, cls: "bg-green-600 hover:bg-green-700", onClick: () => {
              if (!confirm("Inviare SOLO l'email pronti al ritiro al cliente?")) return;
              handleAction("ready_email", () => notifyReady(sessionId, "email"), "Email pronti al ritiro inviata");
            } }}
            whatsapp={{ ts: session.ready_whatsapp_at, cls: "bg-green-700 hover:bg-green-800", onClick: () => {
              if (!confirm("Inviare SOLO il template WhatsApp pronti al ritiro al cliente?")) return;
              handleAction("ready_wa", () => notifyReady(sessionId, "whatsapp"), "Template WhatsApp pronti al ritiro inviato");
            } }}
          />
        </Gruppo>

        <Gruppo titolo="Rapporti di taratura">
          <div className={`flex h-10 items-center rounded-md border px-2 text-xs ${daTarare.length && conRdt === daTarare.length
            ? "border-emerald-300 bg-emerald-50 text-emerald-800" : conRdt ? "border-amber-300 bg-amber-50 text-amber-900" : "border-gray-200 bg-gray-50 text-gray-600"}`}>
            {daTarare.length === 0 ? "Nessuno strumento da tarare"
              : conRdt === daTarare.length ? `✓ Generati: ${conRdt} su ${daTarare.length}`
              : conRdt ? `Generati ${conRdt} su ${daTarare.length}: mancano ${daTarare.length - conRdt}` : `Da generare (${daTarare.length})`}
          </div>
          <Quando ts={ultimoRdt} />
        </Gruppo>

        <Gruppo titolo="Chi sta facendo l'operazione">
          <SceltaOperatore value={operatore} onChange={setOperatore} compatto opzioni={OPERATORI_TARATURE} nomi={NOMI_OPERATORI}
            className="border-0 bg-transparent p-0 dark:bg-transparent [&>div:first-child]:hidden [&_button]:h-10" />
          <p className={`h-3.5 text-center text-[10px] leading-none ${operatore ? "text-emerald-700" : "font-semibold text-red-600"}`}>
            {operatore ? `Operatore: ${NOMI_OPERATORI[operatore] || operatore}` : "Scegli chi sta lavorando"}
          </p>
        </Gruppo>
      </div>

      {/* Riga 2: le due azioni interne, larghe e basse */}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button className="h-11 w-full bg-purple-600 text-xs font-bold text-white hover:bg-purple-700" disabled={occupato}
          title="Genera i rapporti di taratura; l'operatore scelto sopra viene salvato sulla sessione"
          onClick={() => {
            if (!operatore) { toast.error("Scegli chi sta generando i rapporti: Christian o Dumy"); return; }
            controllaRegistrazione("generare i rapporti di taratura", () => handleAction("rdts", async () => {
              if (session.operator !== operatore) await updateSession(sessionId, { operator: operatore });
              return generateRdts(sessionId);
            }, `Rapporti di taratura generati (${NOMI_OPERATORI[operatore] || operatore})!`));
          }}>
          {actionLoading === "rdts" ? <Loader2 className="size-4 animate-spin" /> : <FileOutput className="size-4" />} GENERA RAPPORTI
          {operatore ? <span className="font-normal opacity-90">· {NOMI_OPERATORI[operatore] || operatore}</span> : null}
        </Button>
        <Button className="h-11 w-full bg-gray-700 text-xs font-bold text-white hover:bg-gray-800" disabled={occupato}
          title="Operazione interna: nessun messaggio al cliente, scadenzario +365 gg"
          onClick={() => {
            // riconsegna senza pagamento (immediato): di solito pagano e poi ritirano (03/10/2026)
            if (!isPaid && !differito && session.payment_status !== "non_richiesto"
              && !confirm(`⚠️ Il pagamento non risulta arrivato${fattura?.numero ? ` (fattura ${fattura.numero} da pagare)` : ""}.\nDi solito pagano e poi ritirano.\n\nOK = riconsegno lo stesso`)) return;
            if (!confirm("Chiudere la sessione e marcare gli strumenti come riconsegnati? (operazione interna, nessuna comunicazione al cliente)")) return;
            handleAction("delivered", () => markDelivered(sessionId), "Sessione completata! Strumenti riconsegnati.");
          }}>
          {actionLoading === "delivered" ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />} STRUMENTI RICONSEGNATI
          {session.delivered_at ? <span className="font-normal opacity-90">· ✓ {breve(session.delivered_at)}</span> : null}
        </Button>
      </div>

      {/* Poi il blocco unico pro forma + fattura + pagamento (con scontrino) */}
      <div className="mt-2">
        <BloccoProforma sessionId={sessionId} session={session} pfDoc={pfDoc} statoPag={statoPag}
          actionLoading={actionLoading} setActionLoading={setActionLoading} handleAction={handleAction}
          previewLoading={previewLoading} apriAnteprimaProforma={apriAnteprimaProforma} apriDialogProforma={apriDialogProforma}
          onRicarica={onRicarica} controllaRegistrazione={controllaRegistrazione} />
      </div>

      {/* Linea del tempo, in una riga */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-[11px] text-gray-500">
        <span className={currentStep >= 1 ? "font-medium text-blue-600" : ""}>
          {session.registered_at ? `Registrato ${breve(session.registered_at)}` : "Non registrato"}
        </span>
        <span className={currentStep >= 2 ? "font-medium text-green-600" : ""}>
          {session.ready_at ? `Pronto ${breve(session.ready_at)}` : "Pronto non inviato"}
          {session.pronto_prog_stato === "programmato" && session.pronto_prog_at && ` · ⏰ programmato ${breve(session.pronto_prog_at)}`}
          {session.pronto_prog_stato === "eseguito" && " · ⏰ in automatico"}
          {session.pronto_prog_stato === "errore" && <span className="text-red-600"> · ⏰ invio automatico in errore</span>}
        </span>
        <span className={currentStep >= 3 ? "font-medium text-orange-600" : ""}>
          {session.proforma_sent_at ? `Pro forma ${breve(session.proforma_sent_at)}` : "Pro forma non inviato"}
        </span>
        <span className={currentStep >= 4 ? "font-medium text-gray-700" : ""}>
          {session.delivered_at ? `Consegnato ${breve(session.delivered_at)}` : "Non consegnato"}
        </span>
      </div>
    </Card>
  );
}
