"use client";

// «PRONTO PER LA SPEDIZIONE – CHIEDI ETICHETTA» (08/10/2026, Christian).
// Quando il RITORNO è a carico del cliente (flag in «Spedizione e corriere»), a lavoro finito si chiede al cliente
// l'etichetta del suo corriere in PDF da attaccare al collo. Pulsante grigio finché il flag non è scelto.
// Al clic: anteprima con testi mail e WhatsApp modificabili + colli (default 1), peso indicativo, misure.
// Invio solo dopo «Invia»; se non è pagata o mancano rapporti chiede conferma. Mail dalla casella tarature (CCN
// d'archivio, firma tarature), WhatsApp sulla linea staff tarature (saltato se il cliente ha solo il fisso).

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, MessageCircle, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEtichettaRitorno, inviaEtichettaRitorno, type ApiError, type EtichettaRitorno as Dati } from "@/lib/api";

type Sess = Record<string, any>;  // eslint-disable-line @typescript-eslint/no-explicit-any

function quando(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  } catch { return iso; }
}

export function EtichettaRitorno({ sessionId, session, onFatto }: { sessionId: string; session: Sess; onFatto?: () => void }) {
  const abilitato = !!(session.return_by_customer || session.shipping_by_customer);
  const [dati, setDati] = useState<Dati | null>(null);
  const [colli, setColli] = useState("1");
  const [peso, setPeso] = useState("");
  const [misure, setMisure] = useState("");
  const [oggetto, setOggetto] = useState("");
  const [testoMail, setTestoMail] = useState("");
  const [testoWa, setTestoWa] = useState("");
  const [canali, setCanali] = useState({ email: true, whatsapp: true });
  const [toccato, setToccato] = useState(false);   // testi modificati a mano: non si rigenerano cambiando colli/peso
  const [carico, setCarico] = useState(false);
  const [invio, setInvio] = useState(false);

  async function apri() {
    setCarico(true);
    try {
      const d = await getEtichettaRitorno(sessionId);
      riempi(d, true);
    } catch (e) { toast.error("Anteprima non disponibile: " + (e as Error).message); }
    finally { setCarico(false); }
  }
  function riempi(d: Dati, prima = false) {
    setDati(d);
    if (prima) {
      setColli(String(d.colli || 1)); setPeso(d.peso ? String(d.peso).replace(".", ",") : ""); setMisure(d.misure || "");
      setCanali({ email: !!d.destinatari.email, whatsapp: !!d.destinatari.whatsapp });
      setToccato(false);
    }
    setOggetto(d.oggetto); setTestoMail(d.testo_email); setTestoWa(d.testo_whatsapp);
  }
  async function rigenera() {
    if (toccato && !confirm("Hai modificato i testi a mano: rigenerarli con colli, peso e misure? Le modifiche si perdono.")) return;
    try {
      riempi(await getEtichettaRitorno(sessionId, { colli, peso, misure }));
      setToccato(false);
    } catch (e) { toast.error((e as Error).message); }
  }

  async function invia(conferma = false) {
    if (!dati) return;
    const scelti = (["email", "whatsapp"] as const).filter((c) => canali[c]);
    if (!scelti.length) { toast.error("Scegli almeno un canale"); return; }
    if (!conferma) {
      const avv = dati.avvisi.length ? `\n\n⚠️ ${dati.avvisi.join("\n⚠️ ")}` : "";
      const a = scelti.map((c) => c === "email" ? `mail a ${dati.destinatari.email}` : `WhatsApp a ${dati.destinatari.whatsapp}`).join(" e ");
      if (!confirm(`Inviare la richiesta dell'etichetta di ritorno via ${a}?${avv}`)) return;
    }
    setInvio(true);
    try {
      const r = await inviaEtichettaRitorno(sessionId, { canali: [...scelti], oggetto, testo_email: testoMail, testo_whatsapp: testoWa,
        colli, peso, misure, conferma: conferma || dati.avvisi.length > 0 });
      const parti = Object.entries(r.esito).map(([c, e]) => `${c === "email" ? "Mail" : "WhatsApp"}: ${e?.saltato ? `saltato (${e.errore})` : e?.ok ? `inviata a ${e.a}` : `ERRORE ${e?.errore || ""}`}`);
      (r.ok ? toast.success : toast.error)(`Etichetta di ritorno ${r.ok ? "richiesta" : "NON richiesta"} — ${parti.join(" · ")}`, { duration: 10000 });
      if (r.ok) { setDati(null); onFatto?.(); }
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.detail?.richiede_conferma && confirm(`${(err.detail.avvisi || []).join("\n")}`)) {
        setInvio(false);
        return invia(true);
      }
      toast.error(err.message, { duration: 10000 });
    } finally { setInvio(false); }
  }

  const richiesta = session.return_label_requested_at as string | undefined;
  const inp = "h-8 rounded-md border px-2 text-sm";
  return (
    <span className="flex flex-col items-start gap-0.5 sm:items-end">
      <Button size="sm" variant={abilitato ? "default" : "outline"} disabled={!abilitato || carico}
        className={abilitato ? "h-8 bg-amber-700 px-2 text-[11px] font-semibold text-white hover:bg-amber-800" : "h-8 px-2 text-[11px] text-gray-400"}
        title={abilitato ? "Comunica che gli strumenti sono pronti e chiedi l'etichetta del corriere del cliente (vedi l'anteprima prima dell'invio)"
          : "Si attiva quando in «Spedizione e corriere» è scelto «Ritorno a carico del cliente (ci manda l'etichetta)»"}
        onClick={apri}>
        {carico ? <Loader2 className="size-3.5 animate-spin" /> : <Package className="size-3.5" />} Pronto per la spedizione – chiedi etichetta
      </Button>
      {richiesta && (
        <span className="text-[11px] text-amber-800">Etichetta richiesta il {quando(richiesta)}{session.return_label_requested_via ? ` via ${session.return_label_requested_via}` : ""} — in attesa</span>
      )}

      {dati && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !invio && setDati(null)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg bg-white text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-start gap-2 border-b bg-white px-5 py-3">
              <div className="flex-1">
                <h3 className="text-base font-semibold">Pronto per la spedizione – chiedi etichetta</h3>
                <p className="text-xs text-gray-500">Anteprima: controlla e modifica i testi. Non parte nulla finché non premi «Invia».</p>
              </div>
              <button type="button" title="Chiudi" onClick={() => setDati(null)} disabled={invio}><X className="size-5" /></button>
            </div>
            <div className="space-y-3 px-5 py-3 text-sm">
              {dati.avvisi.map((a) => <p key={a} className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">⚠️ {a}</p>)}
              {dati.richiesta && <p className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs">Già richiesta il {quando(dati.richiesta.il)} via {dati.richiesta.via}: stai per rimandarla.</p>}
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col text-xs text-gray-600">Colli<input className={`${inp} w-16`} inputMode="numeric" value={colli} onChange={(e) => setColli(e.target.value.replace(/\D/g, ""))} /></label>
                <label className="flex flex-col text-xs text-gray-600">Peso indicativo (kg)<input className={`${inp} w-24`} inputMode="decimal" placeholder="es. 5" value={peso} onChange={(e) => setPeso(e.target.value.replace(/[^\d,.]/g, ""))} /></label>
                <label className="flex flex-col text-xs text-gray-600">Misure (cm, facoltative)<input className={`${inp} w-36`} placeholder="40x30x20" value={misure} onChange={(e) => setMisure(e.target.value)} /></label>
                <Button size="sm" variant="outline" className="h-8" onClick={rigenera}>Aggiorna i testi</Button>
              </div>
              <div className="space-y-1 rounded-md border p-2">
                <label className="flex items-center gap-1.5 font-medium">
                  <input type="checkbox" checked={canali.email} disabled={!dati.destinatari.email} onChange={(e) => setCanali({ ...canali, email: e.target.checked })} />
                  <Mail className="size-4" /> Mail {dati.destinatari.email ? <span className="font-normal text-gray-600">a {dati.destinatari.email} (da tarature@avatech.info, CCN archivio)</span> : <span className="font-normal text-red-600">— il cliente non ha un&apos;email</span>}
                </label>
                <input className={`${inp} w-full`} value={oggetto} onChange={(e) => { setOggetto(e.target.value); setToccato(true); }} />
                <textarea className="h-64 w-full rounded-md border p-2 font-mono text-xs" value={testoMail} onChange={(e) => { setTestoMail(e.target.value); setToccato(true); }} />
                <p className="text-[11px] text-gray-500">In coda si aggiungono «Distinti saluti» e la firma tarature.</p>
              </div>
              <div className="space-y-1 rounded-md border p-2">
                <label className="flex items-center gap-1.5 font-medium">
                  <input type="checkbox" checked={canali.whatsapp} disabled={!dati.destinatari.whatsapp} onChange={(e) => setCanali({ ...canali, whatsapp: e.target.checked })} />
                  <MessageCircle className="size-4" /> WhatsApp {dati.destinatari.whatsapp ? <span className="font-normal text-gray-600">a {dati.destinatari.whatsapp} (linea staff tarature)</span>
                    : <span className="font-normal text-red-600">— non si invia: {dati.destinatari.motivo_no_whatsapp}</span>}
                </label>
                <textarea className="h-28 w-full rounded-md border p-2 font-mono text-xs" value={testoWa} disabled={!dati.destinatari.whatsapp} onChange={(e) => { setTestoWa(e.target.value); setToccato(true); }} />
              </div>
            </div>
            <div className="sticky bottom-0 flex gap-2 border-t bg-gray-50 px-5 py-3">
              <Button variant="outline" className="flex-1" disabled={invio} onClick={() => setDati(null)}>Annulla</Button>
              <Button className="flex-1 bg-amber-700 text-white hover:bg-amber-800" disabled={invio || (!canali.email && !canali.whatsapp)} onClick={() => invia()}>
                {invio ? <Loader2 className="size-4 animate-spin" /> : <Package className="size-4" />} Invia
              </Button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
