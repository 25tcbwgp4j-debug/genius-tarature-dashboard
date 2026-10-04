"use client";

// Pronto al cliente subito o PROGRAMMATO (01/10/2026).
// Dopo la generazione dei rapporti compare il banner «Quando invio il pronto al cliente?»:
// Adesso · oggi all'ora scelta · domani all'ora scelta · prossimo giorno lavorativo alle 9:30 · data e ora a scelta, su Email e/o WhatsApp.
// Il backend (job ogni minuto) invia con la stessa logica dei pulsanti «Pronti» e registra l'esito
// per canale; qui si vede la programmazione (Modifica/Annulla) e poi l'esito («Rimanda pronto»).

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlarmClock, AlertCircle, CheckCircle2, Loader2, Mail, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { oggiRoma, spostaGiorno } from "@/lib/date";
import {
  getProntoProgrammato, programmaPronto, annullaProntoProgrammato, notifyReady,
  type StatoPronto, type CanalePronto,
} from "@/lib/api";

const TZ = "Europe/Rome";

function dataOraRoma(iso: string | null | undefined, conGiorno = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const giorno = d.toLocaleDateString("it-IT", { timeZone: TZ, weekday: conGiorno ? "long" : undefined, day: "2-digit", month: "2-digit" });
  const ora = d.toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${giorno} alle ${ora}`;
}
/** "AAAA-MM-GG" e "HH:MM" di un istante, nel fuso di Roma (per gli input data/ora). */
function partiRoma(iso: string): { data: string; ora: string } {
  const d = new Date(iso);
  const data = d.toLocaleDateString("en-CA", { timeZone: TZ });
  const ora = d.toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  return { data, ora };
}
/** Orari del negozio: lun-ven 9:30-13:30 e 15:00-19:00. */
function inOrarioNegozio(data: string, ora: string): boolean {
  const [y, m, g] = data.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, g)).getUTCDay();
  if (wd === 0 || wd === 6) return false;
  const [h, mi] = ora.split(":").map(Number);
  const t = h * 60 + mi;
  return (t >= 570 && t <= 810) || (t >= 900 && t <= 1140);
}

/** Prossima mezz'ora a Roma come «HH:MM» (default per «Oggi alle…»). */
function prossimaMezzora(): string {
  const p = new Date().toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  let t = p[0] * 60 + p[1] + 30;
  t = Math.min(Math.ceil(t / 30) * 30, 23 * 60 + 30);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

type Scelta = "adesso" | "oggi" | "domani" | "suggerito" | "libero";

interface Props {
  sessionId: string;
  /** Ci sono rapporti generati (almeno uno strumento con RDT). */
  haRapporti: boolean;
  /** Cambia quando la sessione viene ricaricata (per rileggere lo stato). */
  versione: string;
  onAggiornato: () => void;
}

export function ProntoProgrammato({ sessionId, haRapporti, versione, onAggiornato }: Props) {
  const [st, setSt] = useState<StatoPronto | null>(null);
  const [aperto, setAperto] = useState(false);
  const [rimanda, setRimanda] = useState(false);
  const [scelta, setScelta] = useState<Scelta>("suggerito");
  const [data, setData] = useState("");
  const [ora, setOra] = useState("09:30");
  const [oraOggi, setOraOggi] = useState(prossimaMezzora());
  const [oraDomani, setOraDomani] = useState("09:30");
  const [canali, setCanali] = useState<Record<CanalePronto, boolean>>({ email: true, whatsapp: true });
  const [lavoro, setLavoro] = useState(false);
  const [nonOra, setNonOra] = useState(false);

  const carica = useCallback(async () => {
    try {
      const r = await getProntoProgrammato(sessionId);
      setSt(r);
      const p = partiRoma(r.programmazione.stato === "programmato" && r.programmazione.quando ? r.programmazione.quando : r.suggerito);
      setData(p.data); setOra(p.ora);
      setCanali({ email: !!r.destinatari.email, whatsapp: !!r.destinatari.whatsapp });
    } catch { /* il pannello resta nascosto se il backend non risponde */ }
  }, [sessionId]);

  useEffect(() => { carica(); }, [carica, versione]);
  useEffect(() => {
    try { setNonOra(sessionStorage.getItem(`pronto-nonora-${sessionId}`) === "1"); } catch { /* noop */ }
  }, [sessionId]);

  if (!st) return null;
  const prog = st.programmazione;
  const dest = st.destinatari;
  const giaInviato = st.gia_inviato.email || st.gia_inviato.whatsapp;
  const attiva = prog.stato === "programmato" || prog.stato === "in_corso";
  const conEsito = prog.stato === "eseguito" || prog.stato === "errore";
  const mostraBanner = aperto || (haRapporti && !giaInviato && !attiva && !conEsito && !nonOra && !dest.do_not_contact);

  const scelti = (["email", "whatsapp"] as CanalePronto[]).filter((c) => canali[c]);
  // «Domani alle…» = il prossimo giorno di apertura (di venerdì propone lunedì; ferie e chiusure saltate) — 04/10/2026
  const oggi = oggiRoma(), domani = st.prossimo_lavorativo || spostaGiorno(oggiRoma(), 1);
  const domaniVero = domani === spostaGiorno(oggi, 1);
  const nomeDomani = domaniVero ? "Domani" : new Date(`${domani}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", timeZone: "Europe/Rome" }).replace(/^./, (x) => x.toUpperCase());
  const quandoScelto = (): { data: string; ora: string } | null =>
    scelta === "oggi" ? { data: oggi, ora: oraOggi } : scelta === "domani" ? { data: domani, ora: oraDomani }
      : scelta === "libero" ? { data, ora } : scelta === "suggerito" ? partiRoma(st.suggerito) : null;
  const qs = quandoScelto();
  const fuoriOrario = !!qs && scelta !== "suggerito" && !!qs.data && !!qs.ora && !inOrarioNegozio(qs.data, qs.ora);
  const giaPassato = scelta === "oggi" && oraOggi <= new Date().toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

  const apri = (perRimandare: boolean) => {
    setRimanda(perRimandare);
    setScelta(attiva ? "libero" : "suggerito");
    setAperto(true);
  };

  const conferma = async () => {
    if (!scelti.length) { toast.error("Scegli almeno un canale"); return; }
    setLavoro(true);
    try {
      if (scelta === "adesso") {
        if (!confirm(`Inviare ADESSO il pronto al cliente (${scelti.join(" + ")})?`)) return;
        const ch = scelti.length === 2 ? "both" : scelti[0];
        const res = await notifyReady(sessionId, ch);
        const wa = res?.notifications?.whatsapp;
        const em = res?.notifications?.email;
        if (em && typeof em === "object" && em.error) toast.error(`Email NON inviata: ${String(em.error).slice(0, 200)}`);
        if (wa && typeof wa === "object" && wa.error) toast.error(`WhatsApp: ${String(wa.error).slice(0, 200)}`);
        if (!(em?.error || wa?.error)) toast.success("Pronto inviato al cliente");
      } else {
        if (giaPassato) { toast.error("L'orario di oggi è già passato: scegline uno più avanti"); return; }
        const quando = quandoScelto() || { data, ora };
        const r = await programmaPronto(sessionId, { canali: scelti, ...quando, rimanda: rimanda || giaInviato });
        toast.success(`Pronto programmato: ${dataOraRoma(r?.programmazione?.quando)}`);
      }
      setAperto(false);
      await carica();
      onAggiornato();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore");
    } finally {
      setLavoro(false);
    }
  };

  const annulla = async () => {
    if (!confirm("Annullare l'invio programmato del pronto?")) return;
    setLavoro(true);
    try {
      await annullaProntoProgrammato(sessionId);
      toast.success("Invio programmato annullato");
      await carica();
      onAggiornato();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore");
    } finally {
      setLavoro(false);
    }
  };

  const nonOraClick = () => {
    setNonOra(true); setAperto(false);
    try { sessionStorage.setItem(`pronto-nonora-${sessionId}`, "1"); } catch { /* noop */ }
  };

  const etichettaCanale = (c: CanalePronto) => c === "email" ? `Email a ${dest.email}` : `WhatsApp a ${dest.whatsapp}${dest.contatto ? ` (${dest.contatto})` : ""}`;

  // ─── programmazione in attesa ───
  const riquadroAttiva = attiva && !aperto && (
    <Card className="p-4 border-l-4 border-l-blue-500 bg-blue-50/60">
      <div className="flex flex-wrap items-start gap-3">
        <AlarmClock className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">
            {prog.stato === "in_corso" ? "Pronto in invio adesso…" : `Pronto programmato: ${dataOraRoma(prog.quando)}`}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            {prog.canali.map((c) => c === "email" ? `📧 ${dest.email || "—"}` : `💬 ${dest.whatsapp || "—"}`).join(" · ")}
            {prog.da ? ` · da ${prog.da}` : ""}
          </p>
        </div>
        {prog.stato === "programmato" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={lavoro} onClick={() => apri(!!prog.esito?.rimanda)}>Modifica</Button>
            <Button size="sm" variant="outline" className="text-red-700 border-red-300" disabled={lavoro} onClick={annulla}>Annulla</Button>
          </div>
        )}
      </div>
    </Card>
  );

  // ─── esito dell'ultimo invio programmato ───
  const riquadroEsito = conEsito && !aperto && (
    <Card className={`p-4 border-l-4 ${prog.stato === "eseguito" ? "border-l-emerald-500 bg-emerald-50/50" : "border-l-red-500 bg-red-50/50"}`}>
      <div className="flex flex-wrap items-start gap-3">
        {prog.stato === "eseguito" ? <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold">
            {prog.stato === "eseguito" ? "Pronto inviato in automatico" : "Pronto programmato: invio NON riuscito"}
            <span className="font-normal text-gray-600"> · previsto {dataOraRoma(prog.quando, false)}</span>
          </p>
          {prog.esito?.errore && <p className="text-xs text-red-700">{prog.esito.errore}</p>}
          {(["email", "whatsapp"] as CanalePronto[]).filter((c) => prog.esito?.[c]).map((c) => {
            const e = prog.esito![c]!;
            return (
              <p key={c} className="text-xs text-gray-700 flex items-center gap-1">
                {c === "email" ? <Mail className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />}
                {e.ok ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertCircle className="w-3 h-3 text-red-600" />}
                {e.saltato ? `già inviato prima (${e.nota || ""})` : e.ok ? `inviato ${dataOraRoma(e.il, false)}${e.destinatario ? ` a ${e.destinatario}` : ""}` : `errore: ${e.errore}`}
              </p>
            );
          })}
        </div>
        <Button size="sm" variant="outline" disabled={lavoro} onClick={() => apri(true)}>
          <Send className="w-3.5 h-3.5 mr-1" />Rimanda pronto
        </Button>
      </div>
    </Card>
  );

  // ─── banner / modulo di scelta ───
  const modulo = (mostraBanner && !attiva) || aperto ? (
    <Card className="p-4 border-l-4 border-l-amber-500 bg-amber-50/70">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <AlarmClock className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold">{rimanda || giaInviato ? "Quando rimando il pronto al cliente?" : "Quando invio il pronto al cliente?"}</h3>
        </div>
        <button type="button" className="text-gray-500 hover:text-gray-800" title="Non ora" onClick={aperto ? () => setAperto(false) : nonOraClick}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {([
          ["adesso", "Adesso"],
          ["oggi", "Oggi alle…"],
          ["domani", `${nomeDomani} alle…`],
          ["suggerito", `${dataOraRoma(st.suggerito).replace(/^./, (x) => x.toUpperCase())}`],
          ["libero", "Data e ora a scelta"],
        ] as [Scelta, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setScelta(k)}
            className={`px-3 py-1.5 rounded-md border text-sm ${scelta === k ? "bg-amber-600 text-white border-amber-700" : "bg-white hover:bg-amber-100 border-amber-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {(scelta === "oggi" || scelta === "domani") && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-sm">{scelta === "oggi" ? "Oggi" : nomeDomani} ({dataOraRoma(`${scelta === "oggi" ? oggi : domani}T12:00:00`).split(" alle ")[0]}) alle</span>
          <Input type="time" value={scelta === "oggi" ? oraOggi : oraDomani}
            onChange={(e) => (scelta === "oggi" ? setOraOggi : setOraDomani)(e.target.value)} className="w-28 bg-white" />
          <span className="text-xs text-gray-500">ora di Roma</span>
          {giaPassato && <span className="text-xs text-red-700">⚠️ orario già passato</span>}
          {fuoriOrario && <span className="text-xs text-amber-700">⚠️ fuori dall&apos;orario del negozio (lun-ven 9:30-13:30, 15-19)</span>}
        </div>
      )}
      {scelta === "libero" && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-40 bg-white" />
          <Input type="time" value={ora} onChange={(e) => setOra(e.target.value)} className="w-28 bg-white" />
          <span className="text-xs text-gray-500">ora di Roma</span>
          {fuoriOrario && <span className="text-xs text-amber-700">⚠️ fuori dall&apos;orario del negozio (lun-ven 9:30-13:30, 15-19)</span>}
        </div>
      )}

      <div className="flex flex-col gap-1.5 mb-3">
        {(["email", "whatsapp"] as CanalePronto[]).map((c) => {
          const disponibile = c === "email" ? !!dest.email : !!dest.whatsapp;
          return (
            <label key={c} className={`flex items-center gap-2 text-sm ${disponibile ? "" : "text-gray-400"}`}>
              <input type="checkbox" checked={canali[c] && disponibile} disabled={!disponibile}
                onChange={(e) => setCanali({ ...canali, [c]: e.target.checked })} />
              {c === "email" ? <Mail className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
              {disponibile ? etichettaCanale(c) : c === "email" ? "Email: il cliente non ha un indirizzo" : `WhatsApp: ${dest.motivo_no_whatsapp || "nessun numero"}`}
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button className="bg-amber-600 hover:bg-amber-700" disabled={lavoro || !scelti.length} onClick={conferma}>
          {lavoro ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : scelta === "adesso" ? <Send className="w-4 h-4 mr-1" /> : <AlarmClock className="w-4 h-4 mr-1" />}
          {scelta === "adesso" ? "Invia adesso" : "Programma l'invio"}
        </Button>
        {!aperto && <Button variant="ghost" onClick={nonOraClick}>Non ora</Button>}
      </div>
    </Card>
  ) : null;

  // pronto già inviato (a mano) e niente da mostrare: solo il pulsante «Rimanda pronto»
  const soloRimanda = !modulo && !riquadroAttiva && !riquadroEsito && giaInviato && (
    <div className="flex justify-end">
      <Button size="sm" variant="outline" disabled={lavoro} onClick={() => apri(true)}>
        <AlarmClock className="w-3.5 h-3.5 mr-1" />Rimanda pronto (programmato)
      </Button>
    </div>
  );

  return <>{modulo || riquadroAttiva || riquadroEsito || soloRimanda}</>;
}
