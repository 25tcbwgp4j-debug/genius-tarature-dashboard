"use client";

// Sezione «Azioni» della sessione, compattata il 02/10/2026 su richiesta di Christian: prima erano sei pulsanti
// alti 80 px con molto bianco intorno; ora ogni azione è un riquadro con titolo, data dell'ultimo invio e
// pulsanti alti 44 px (bersaglio minimo per il dito su iPad e iPhone). Le funzioni sono le stesse di prima:
// registrazione (email/WhatsApp), pronti al ritiro, pro forma, genera rapporti, riconsegna, pagamento, Stripe.

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Euro, FileOutput, Loader2, Mail, MessageCircle, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { generateRdts, markDelivered, markSessionPaid, notifyReady, registerComplete } from "@/lib/api";

type Sess = Record<string, any>;  // eslint-disable-line @typescript-eslint/no-explicit-any

interface Props {
  sessionId: string;
  session: Sess;
  instruments: { rdt_generated_at?: string | null }[];
  actionLoading: string | null;
  setActionLoading: (v: string | null) => void;
  handleAction: (action: string, fn: () => Promise<unknown>, successMsg: string) => Promise<void>;
  previewLoading: boolean;
  apriAnteprimaProforma: (ch: "email" | "whatsapp") => void;
  apriDialogProforma: () => void;
  currentStep: number;
}

function breve(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return null; }
}

/** Data dell'ultimo invio sotto al pulsante: «✓ 02/10 11:16» oppure «—». */
function Quando({ ts }: { ts: string | null | undefined }) {
  const f = breve(ts);
  return <p className={`h-3.5 text-center text-[10px] leading-none ${f ? "text-gray-600" : "text-gray-300"}`}>{f ? `✓ ${f}` : "—"}</p>;
}

function Gruppo({ titolo, sotto, children }: { titolo: string; sotto?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white p-2.5">
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
        <Button className={`h-11 w-full text-xs font-bold text-white ${email.cls}`} disabled={disabled} onClick={email.onClick}>
          {busy === "email" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} EMAIL
        </Button>
        <Quando ts={email.ts} />
      </div>
      <div>
        <Button className={`h-11 w-full text-xs font-bold text-white ${whatsapp.cls}`} disabled={disabled} onClick={whatsapp.onClick}>
          {busy === "whatsapp" ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />} WHATSAPP
        </Button>
        <Quando ts={whatsapp.ts} />
      </div>
    </div>
  );
}

export function AzioniSessione({ sessionId, session, instruments, actionLoading, setActionLoading, handleAction,
  previewLoading, apriAnteprimaProforma, apriDialogProforma, currentStep }: Props) {
  const occupato = actionLoading !== null;
  const ultimoRdt = instruments.map((i) => i.rdt_generated_at || "").filter(Boolean).sort().pop();
  const isPaid = session.payment_status === "pagato";
  const spedizione = session.shipping_by_customer
    ? "a carico del cliente (0 €)"
    : session.shipping_included && Number(session.shipping_amount_gross) > 0
      ? `${Number(session.shipping_amount_gross).toFixed(2).replace(".", ",")} €`
      : "nessuna";

  return (
    <Card className="p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-base font-semibold">Azioni</h3>
        <span className="text-[11px] text-gray-500">comunicazioni al cliente · rapporti · pagamento · chiusura</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Gruppo titolo="Registrazione completata" sotto="Ricevuta di ingresso al cliente">
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

        <Gruppo titolo="Pronti al ritiro" sotto="Avviso al cliente che gli strumenti sono pronti">
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

        <Gruppo titolo="Pro forma" sotto={<>
          Spedizione: {spedizione} ·{" "}
          <button type="button" className="underline" onClick={() => document.getElementById("spedizioni")?.scrollIntoView({ behavior: "smooth" })}>modifica</button>
          {" · "}
          <button type="button" className="underline" onClick={apriDialogProforma}>anteprima pro forma</button>
        </>}>
          <Canali disabled={occupato || previewLoading}
            busy={previewLoading ? null : actionLoading === "proforma_email" ? "email" : actionLoading === "proforma_wa" ? "whatsapp" : null}
            email={{ ts: session.proforma_email_at, cls: "bg-orange-600 hover:bg-orange-700", onClick: () => apriAnteprimaProforma("email") }}
            whatsapp={{ ts: session.proforma_whatsapp_at, cls: "bg-orange-700 hover:bg-orange-800", onClick: () => apriAnteprimaProforma("whatsapp") }}
          />
        </Gruppo>

        <Gruppo titolo="Rapporti di taratura" sotto="Vanno generati prima delle etichette e del pronto">
          <Button className="h-11 w-full bg-purple-600 text-xs font-bold text-white hover:bg-purple-700" disabled={occupato}
            onClick={() => handleAction("rdts", () => generateRdts(sessionId), "Rapporti di taratura generati!")}>
            {actionLoading === "rdts" ? <Loader2 className="size-4 animate-spin" /> : <FileOutput className="size-4" />} GENERA RAPPORTI
          </Button>
          <Quando ts={ultimoRdt} />
        </Gruppo>

        <Gruppo titolo="Pagamento" sotto={!isPaid && (
          <button type="button" className="mt-0.5 flex h-10 w-full items-center justify-center rounded-md border border-purple-300 px-2 text-[11px] text-purple-700 hover:bg-purple-50 disabled:opacity-50" disabled={occupato}
            title="Genera link Stripe Checkout — il cliente paga in 1 clic con la carta"
            onClick={async () => {
              if (!confirm("Generare un link Stripe Checkout? Il cliente potrà pagare con carta in 1 click. Riceverai notifica Telegram al pagamento.")) return;
              setActionLoading("stripe_link");
              try {
                const r = await fetch(`/api/backend/api/sessions/${sessionId}/checkout-link`, { method: "POST" });
                if (!r.ok) throw new Error(`Backend ${r.status}`);
                const data = await r.json();
                if (data.url) {
                  try { await navigator.clipboard.writeText(data.url); } catch { /* noop */ }
                  window.open(data.url, "_blank");
                  toast.success("Link Stripe generato e copiato", { description: `EUR ${data.amount_eur?.toFixed(2)} — condividilo via WhatsApp/email`, duration: 10000 });
                } else toast.error("Errore: nessun URL ricevuto");
              } catch (e: unknown) {
                toast.error(`Errore generazione link: ${(e as Error).message}`);
              } finally { setActionLoading(null); }
            }}>
            {actionLoading === "stripe_link" ? "Genero il link Stripe…" : "💳 Link Stripe (paga online con carta)"}
          </button>
        )}>
          <div className="grid grid-cols-3 gap-1.5">
            {([["bonifico", "BONIFICO"], ["contanti", "CONTANTI"], ["pos", "POS"]] as const).map(([method, label]) => {
              const isActive = isPaid && session.payment_method === method;
              const key = `mark_paid_${method}`;
              return (
                <Button key={method} disabled={occupato || isActive}
                  className={`h-11 px-1 text-[11px] font-bold text-white ${isActive ? "bg-emerald-700 ring-2 ring-emerald-900 ring-offset-1" : isPaid ? "bg-emerald-400 opacity-70 hover:bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-700"}`}
                  title={isActive ? `Pagato via ${label} (attuale)` : isPaid ? `Modificare il metodo a ${label}` : `Marca come pagato — ${label}`}
                  onClick={() => {
                    const msg = isPaid
                      ? `Modificare il metodo di pagamento da "${session.payment_method?.toUpperCase() || "—"}" a "${label}"?`
                      : `Confermare pagamento ricevuto via ${label}?`;
                    if (!confirm(msg)) return;
                    handleAction(key, () => markSessionPaid(sessionId, { payment_method: method }), isPaid ? `Metodo aggiornato a ${label}!` : `Pagamento registrato (${label})!`);
                  }}>
                  {actionLoading === key ? <Loader2 className="size-4 animate-spin" /> : <Euro className="size-3.5" />}
                  {isActive ? `✓ ${label}` : label}
                </Button>
              );
            })}
          </div>
          <Quando ts={session.payment_date} />
        </Gruppo>

        <Gruppo titolo="Chiusura" sotto="Operazione interna: nessun messaggio al cliente, scadenzario +365 gg">
          <Button className="h-11 w-full bg-gray-700 text-xs font-bold text-white hover:bg-gray-800" disabled={occupato}
            onClick={() => {
              if (!confirm("Chiudere la sessione e marcare gli strumenti come riconsegnati? (operazione interna, nessuna comunicazione al cliente)")) return;
              handleAction("delivered", () => markDelivered(sessionId), "Sessione completata! Strumenti riconsegnati.");
            }}>
            {actionLoading === "delivered" ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />} STRUMENTI RICONSEGNATI
          </Button>
          <Quando ts={session.delivered_at} />
        </Gruppo>
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
