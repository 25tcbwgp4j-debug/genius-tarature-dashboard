"use client";

// «SPEDISCI» da un documento (05/10/2026, caso PF 10/2026 Fabrizio Esposito): pro forma (anche convertito), fattura,
// scontrino. Apre la spedizione libera GIÀ COMPILATA con la controparte del documento (nome, via, CAP, città, provincia,
// telefono, email), il riferimento (es. «PF 10/2026») e la DIVISIONE del documento, che decide mittente e firma.
// Riusa esattamente il backend di /spedizioni (POST /api/spedizioni/libera[/anteprima]) e collega la spedizione al
// documento: qui sotto tracking, PDF, stampa al banco e annullo.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Printer, Truck, X, FileText, Ban, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOperatore } from "@/components/Operatore";
import { toastErrore } from "@/lib/errori";
import {
  cancelShipment, getShipmentLabelUrl, spedAnteprimaLibera, spedCreaLibera, spedDelDocumento, spedPrecompila, spedStampaBanco, spedStato,
  type LinkDocumento, type SpedIndirizzo, type SpedPrecompilata, type SpedRiga, type SpedStato,
} from "@/lib/api";

const campo = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const NOMI: Record<keyof SpedIndirizzo, string> = { name: "Destinatario", attention: "Alla c.a.", phone: "Telefono", street: "Indirizzo",
  zip: "CAP", city: "Città", province: "Prov." };

/** Spedizioni già fatte dal documento + pulsante «Spedisci». */
export function SpedisciDocumento({ link, etichetta = "Spedisci", soloPulsante = false }: { link: LinkDocumento; etichetta?: string; soloPulsante?: boolean }) {
  const [righe, setRighe] = useState<SpedRiga[] | null>(null);
  const [aperto, setAperto] = useState(false);
  const chiave = JSON.stringify(link);
  const carica = useCallback(() => {
    if (soloPulsante) return;   // negli elenchi (scontrini della cassa) niente lettura per ogni riga
    spedDelDocumento(JSON.parse(chiave)).then((r) => setRighe(r.spedizioni)).catch(() => setRighe([]));
  }, [chiave, soloPulsante]);
  useEffect(() => { carica(); }, [carica]);
  if (soloPulsante) return (
    <>
      <Button size="xs" variant="ghost" title="Spedisci (UPS / DHL) con i dati del cliente" onClick={() => setAperto(true)}><Truck /> Spedisci</Button>
      {aperto && <FinestraSpedisci link={link} onChiudi={() => setAperto(false)} onFatta={() => setAperto(false)} />}
    </>
  );

  async function annulla(r: SpedRiga) {
    if (!confirm(`Annullare con ${r.carrier} la spedizione ${r.tracking}${r.pickup_prn ? ` e il ritiro ${r.pickup_prn}` : ""}${r.test_mode ? " (prova)" : ""}?`)) return;
    try { await cancelShipment(r.id); toast.success("Spedizione annullata"); carica(); } catch (e) { toastErrore(e); }
  }
  async function banco(r: SpedRiga) {
    try { const s = await spedStampaBanco(r.id); toast.success(s.agente_attivo ? `Etichetta in stampa al banco (${s.copie} copie)` : "In coda: l'agente di stampa non risponde, apri il PDF"); }
    catch (e) { toastErrore(e); }
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" className="border-sky-500 text-sky-800 dark:text-sky-300" onClick={() => setAperto(true)}>
        <Truck className="mr-1 size-4" />{etichetta} (UPS / DHL)</Button>
      {!!righe?.length && (
        <div className="space-y-1 rounded-md border p-2 text-sm" data-testid="spedizioni-documento">
          <div className="text-xs font-medium uppercase text-muted-foreground">Spedizioni</div>
          {righe.map((r) => (
            <div key={r.id} className={`flex flex-wrap items-center gap-2 ${r.status === "annullata" ? "opacity-50 line-through" : ""}`}>
              <span className="font-medium">{r.carrier}</span>
              {r.tracking_url ? <a className="text-primary underline" href={r.tracking_url} target="_blank" rel="noreferrer">{r.tracking}</a> : <span>{r.tracking}</span>}
              {r.test_mode && <span className="rounded bg-orange-500/15 px-1.5 text-xs text-orange-700">PROVA</span>}
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {r.pickup_prn ? ` · ritiro ${r.pickup_prn}` : ""}{r.email_sent_at ? ` · mail a ${r.email_to}` : ""}</span>
              {r.status !== "annullata" && <span className="ml-auto flex gap-1">
                <Button size="xs" variant="ghost" onClick={() => window.open(getShipmentLabelUrl(r.id), "_blank")}><FileText className="size-3" />PDF</Button>
                {!r.test_mode && <Button size="xs" variant="ghost" onClick={() => banco(r)}><Printer className="size-3" />Stampa</Button>}
                <Button size="xs" variant="ghost" className="text-red-600" onClick={() => annulla(r)}><Ban className="size-3" />Annulla</Button>
              </span>}
            </div>
          ))}
        </div>
      )}
      {aperto && <FinestraSpedisci link={link} onChiudi={() => setAperto(false)} onFatta={() => { setAperto(false); carica(); }} />}
    </div>
  );
}

function FinestraSpedisci({ link, onChiudi, onFatta }: { link: LinkDocumento; onChiudi: () => void; onFatta: () => void }) {
  const [pre, setPre] = useState<SpedPrecompilata | null>(null);
  const [stato, setStato] = useState<SpedStato | null>(null);
  const [ind, setInd] = useState<SpedIndirizzo | null>(null);
  const [email, setEmail] = useState("");
  const [rif, setRif] = useState("");
  const [contenuto, setContenuto] = useState("");
  const [corriere, setCorriere] = useState<"UPS" | "DHL">("UPS");
  const [ritiro, setRitiro] = useState(false);
  const [colli, setColli] = useState(1);
  const [peso, setPeso] = useState("1");
  const [mail, setMail] = useState(true);
  const [stampa, setStampa] = useState(true);
  const [prova, setProva] = useState(false);
  const [ante, setAnte] = useState<Awaited<ReturnType<typeof spedAnteprimaLibera>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [operatore] = useOperatore();

  const chiave = JSON.stringify(link);
  const chiudiRef = useRef(onChiudi);
  useEffect(() => { chiudiRef.current = onChiudi; });
  useEffect(() => {
    spedPrecompila(JSON.parse(chiave)).then((p) => { setPre(p); setInd(p.controparte); setEmail(p.email); setRif(p.riferimento); setContenuto(p.contenuto); })
      .catch((e) => { toastErrore(e); chiudiRef.current(); });
    spedStato().then(setStato).catch(() => undefined);
  }, [chiave]);
  useEffect(() => {
    // Esc chiude solo questa finestra (il pannello del documento sotto resta aperto)
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); chiudiRef.current(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);

  const corpo = () => ({
    attivita: pre?.attivita, corriere, tipo: ritiro ? "spedizione_ritiro" : "spedizione", controparte: ind, email, riferimento: rif,
    contenuto, colli, peso_kg: Number(String(peso).replace(",", ".")) || 1, test: prova, piva: pre?.piva || undefined, ...pre?.link,
  });
  useEffect(() => { setAnte(null); }, [corriere, ritiro, ind, email, rif, contenuto, colli, peso, prova]);

  async function anteprima() {
    setBusy(true);
    try { setAnte(await spedAnteprimaLibera(corpo())); } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  async function crea() {
    // 08/10/2026: un clic solo — se l'anteprima non c'è la si calcola qui e, con i dati completi, si va avanti
    let a = ante;
    if (!a) {
      setBusy(true);
      try { a = await spedAnteprimaLibera(corpo()); setAnte(a); } catch (e) { toastErrore(e); return; } finally { setBusy(false); }
    }
    if (a.mancanti.length) { toast.error(`Mancano: ${a.mancanti.join(", ")}`); return; }
    const dest = a.email || email;
    if (!prova && !confirm(`Creare l'etichetta ${corriere} VERA (a pagamento sul conto ${corriere}) per ${a.indirizzo?.name || ind?.name}?${mail && dest ? `\nMail con l'etichetta a ${dest}` : mail ? "\nNessuna email: la mail non parte" : ""}`)) return;
    setBusy(true);
    try {
      const r = await spedCreaLibera({ ...corpo(), operatore: operatore || undefined, invia_mail: mail, stampa: !prova && stampa });
      toast.success(`${corriere} ${prova ? "(PROVA) " : ""}${r.tracking}${r.prn ? ` · ritiro ${r.prn}` : ""} · mail: ${r.mail}`, { duration: 12000 });
      if (prova || !stampa) window.open(getShipmentLabelUrl(r.id), "_blank");
      onFatta();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  const dhlBloccato = corriere === "DHL" && !!stato && (!stato.dhl_configurato || (!prova && !stato.dhl_produzione));
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Spedisci" onClick={onChiudi}>
      <div className="max-h-[95vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-t-xl bg-background p-4 shadow-2xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Truck className="size-5" />Spedisci {pre?.riferimento || ""}</h2>
            {pre && <div className="text-xs text-muted-foreground">Divisione {pre.attivita === "apple" ? "Apple" : "Tarature"} · mittente e firma: {pre.mittente}</div>}
            {!!pre?.fonti?.length && <div className="text-xs text-emerald-700">Dati completati da: {pre.fonti.join(", ")}</div>}
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onChiudi} aria-label="Chiudi"><X /></Button>
        </div>
        {!pre || !ind ? <Loader2 className="animate-spin" /> : <>
          {/* 09/10/2026: la proposta parte dall'intestazione del documento (es. sede legale in fattura), che può NON essere
              l'indirizzo di consegna. Gli altri indirizzi noti dello stesso cliente si scelgono con un clic. */}
          <div className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            Proposto: <b>{pre.controparte.street}, {pre.controparte.zip} {pre.controparte.city}</b> (dati del documento{pre.fonti?.length ? ` + ${pre.fonti.join(", ")}` : ""}).
            Controlla che sia l&apos;indirizzo dove consegnare.
            {!!pre.altri_indirizzi?.length && (
              <div className="mt-2 space-y-1">
                <div className="text-xs font-semibold uppercase">Altri indirizzi noti di questo cliente — clic per usarlo</div>
                {pre.altri_indirizzi.map((a, i) => (
                  <button key={i} type="button" className="block w-full rounded border border-amber-300 bg-background px-2 py-1 text-left text-xs hover:bg-amber-100 dark:hover:bg-amber-900/40"
                    onClick={() => setInd({ ...ind, street: a.street, zip: a.zip, city: a.city, province: a.province,
                      attention: a.attention || ind.attention, phone: ind.phone || a.phone })}>
                    <b>{a.street}, {a.zip} {a.city} {a.province}</b>{a.attention ? ` · c.a. ${a.attention}` : ""} <span className="text-muted-foreground">({a.fonte})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            {(["name", "phone", "street", "zip", "city", "province"] as const).map((k) => (
              <label key={k} className={`text-xs text-muted-foreground ${k === "street" || k === "name" ? "col-span-2 sm:col-span-3" : k === "province" || k === "zip" ? "sm:col-span-1" : "col-span-2 sm:col-span-2"}`}>{NOMI[k]}
                <Input className={`h-9 ${!ind[k] ? "border-red-500" : ""}`} value={ind[k] || ""} onChange={(e) => setInd({ ...ind, [k]: e.target.value })} /></label>
            ))}
            <label className="col-span-2 text-xs text-muted-foreground sm:col-span-3">Email (tracking)
              <Input className="h-9" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="col-span-2 text-xs text-muted-foreground sm:col-span-3">Riferimento
              <Input className="h-9" maxLength={35} value={rif} onChange={(e) => setRif(e.target.value)} /></label>
            <label className="col-span-2 text-xs text-muted-foreground sm:col-span-6">Contenuto
              <Input className="h-9" maxLength={35} value={contenuto} onChange={(e) => setContenuto(e.target.value)} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select className={campo} value={corriere} onChange={(e) => { const c = e.target.value as "UPS" | "DHL"; setCorriere(c); setRitiro(c === "DHL"); }}>
              <option value="UPS">UPS</option><option value="DHL">DHL</option></select>
            <label className="flex items-center gap-1">Colli <Input className="h-9 w-16" type="number" min={1} max={20} value={colli} onChange={(e) => setColli(Math.max(1, Number(e.target.value) || 1))} /></label>
            <label className="flex items-center gap-1">Peso kg <Input className="h-9 w-20" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={ritiro} onChange={(e) => setRitiro(e.target.checked)} />
              ritiro da noi (corriere prenotato in Viale Somalia){corriere === "UPS" ? " — UPS passa comunque alle 16:30" : ""}</label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} />mail col tracking al cliente</label>
            {!prova && <label className="flex items-center gap-1"><input type="checkbox" checked={stampa} onChange={(e) => setStampa(e.target.checked)} />stampa al banco</label>}
            <label className="flex items-center gap-1"><input type="checkbox" checked={prova} onChange={(e) => setProva(e.target.checked)} />
              PROVA ({corriere} test: gratis, nessun corriere, mail solo a {stato?.email_test || "info@avantifiori.it"})</label>
          </div>
          {dhlBloccato && <p className="text-sm text-amber-800">DHL produzione non ancora attiva sul server: per ora solo in prova (sandpit).</p>}
          {ante && (
            <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-sm" data-testid="anteprima-spedizione">
              {ante.mancanti.length ? <div className="text-red-700">Mancano: {ante.mancanti.join(", ")}</div> : <div className="text-emerald-700">Indirizzo completo</div>}
              <div>Mittente: {ante.mittente_lab?.name} · {ante.mittente_lab?.street} {ante.mittente_lab?.zip} {ante.mittente_lab?.city}</div>
              <div>Mail a: {ante.email || "nessuna"} · «{ante.oggetto}»</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">{ante.corpo}</pre>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={anteprima}><Eye className="mr-1 size-4" />Anteprima</Button>
            <Button disabled={busy || dhlBloccato} onClick={crea}>{busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Truck className="mr-1 size-4" />}
              Crea etichetta {corriere}{prova ? " (prova)" : ""}</Button>
          </div>
        </>}
      </div>
    </div>
  );
}
