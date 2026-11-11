"use client";
// 11/11/2026 (Christian): con «Decodifica» la scheda legge da Apple GSX (via ponte sul server) modello, configurazione,
// garanzia e acquisto, e i pezzi del dispositivo con la scheda logica esatta e il suo costo.
// 12/11/2026 (Christian): i dati GSX sono PARTE DELLA SCHEDA (salvati alla Decodifica, si rivedono riaprendola): qui si
// mostrano dispositivo, garanzia, avvisi (sostituito da Apple, «Trova il mio» probabile, DEP/MDM, modalità riparazione),
// riparazioni GSX con i numeri G…, seriali sostituiti e il PREVENTIVO PRONTO con «Inserisci nel preventivo» (1ª + 2ª ipotesi,
// Touch ID abbinato) e il confronto col listino della pagina Prezzi ufficiali.
import { useEffect, useMemo, useState } from "react";
import { Apple, ExternalLink, Loader2, Package, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { gsxRicambi, gsxRiparazioni, type GsxDispositivo, type GsxPrincipale, type GsxRicambi, type GsxRiparazione } from "@/lib/gsx";

const euro = (n?: number | null) => (n == null ? "—" : Number(n).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const data = (s?: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");
const ora = (s?: string | null) => (s ? new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—");
const RIP_TIPI: Record<string, string> = { CIN: "carry-in", CRBR: "carry-in con ricambi", WUMS: "sostituzione integrale", MINS: "mail-in", SVNR: "assistenza senza riparazione" };

export function GsxPannello({ g, errore, autoRicambi, onInserisci, onAggiorna, aggiornando, onTrova, trovaAttivo, serialeNuovoScheda, compatto, onIdoneita, idoneitaBusy, haDifetto, ridotto }: {
  g: GsxDispositivo | null; errore?: string | null; autoRicambi?: boolean;
  /** scheda: mette 1ª + 2ª ipotesi (e Touch ID abbinato) nel preventivo */
  onInserisci?: (p: GsxPrincipale) => void;
  /** scheda: rilegge GSX e lo salva nella scheda */
  onAggiorna?: () => void; aggiornando?: boolean;
  /** scheda: segna «Trova il mio» attivo quando Apple oscura i dati */
  onTrova?: () => void; trovaAttivo?: boolean;
  /** scheda: il «nuovo S/N» scritto nella scheda, da confrontare con quello che dice Apple */
  serialeNuovoScheda?: string | null;
  /** scheda: idoneità e copertura Apple (repair/eligibility) col difetto Apple scelto */
  onIdoneita?: () => void; idoneitaBusy?: boolean; haDifetto?: boolean;
  compatto?: boolean;
  /** scheda: parte chiusa (una riga + avvisi), i dettagli si aprono con un clic — così la scheda non è infinita (Christian 12/11) */
  ridotto?: boolean;
}) {
  const [ricLetti, setRic] = useState<GsxRicambi | null>(null);
  const [ripLetti, setRip] = useState<GsxRiparazione[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [varianti, setVarianti] = useState(false);
  const [tutti, setTutti] = useState(false);
  const [dettagli, setDettagli] = useState<boolean>(() => { try { return localStorage.getItem("gl_gsx_dettagli") === "1"; } catch { return false; } });
  const apertoDettagli = !ridotto || dettagli;
  function toggleDettagli() { setDettagli((x) => { try { localStorage.setItem("gl_gsx_dettagli", x ? "0" : "1"); } catch { /* niente memoria locale */ } return !x; }); }
  // i dati salvati nella scheda vincono; altrimenti quelli letti qui
  const ric = (g?.ricambi && g.ricambi.seriale === g.seriale ? g.ricambi : null) || ricLetti;
  const rip = g?.riparazioni ?? ripLetti;

  async function caricaRicambi() {
    if (!g) return;
    setBusy(true);
    try { setRic(await gsxRicambi(g.seriale)); } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  // pagina GSX: ricambi e riparazioni si caricano da soli (se non sono già nella lettura)
  useEffect(() => {
    if (!autoRicambi || !g) return;
    let vivo = true;
    if (!g.ricambi) {
      setBusy(true);
      gsxRicambi(g.seriale).then((r) => { if (vivo) setRic(r); }).catch(toastErrore).finally(() => { if (vivo) setBusy(false); });
    }
    if (!g.riparazioni) gsxRiparazioni(g.seriale).then((r) => { if (vivo) setRip(r.riparazioni); }).catch(() => { if (vivo) setRip([]); });
    return () => { vivo = false; };
  }, [autoRicambi, g]);

  const righe = useMemo(() => {
    if (!ric) return [];
    const f = filtro.trim().toLowerCase();
    return ric.ricambi.filter((r) => (varianti || !r.variante) && (!f || `${r.codice} ${r.descrizione}`.toLowerCase().includes(f)));
  }, [ric, filtro, varianti]);

  if (errore && !g) return <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs dark:bg-amber-950/30">GSX Apple: {errore}</div>;
  if (!g) return null;
  const garanziaOk = (g.giorni_garanzia ?? 0) > 0;
  const aperte = (rip || []).filter((r) => r.aperta ?? !r.chiusa);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:bg-slate-950">
      {errore && <div className="mb-2 rounded border border-amber-200 bg-amber-50/70 px-2 py-1 text-xs dark:bg-amber-950/30">GSX Apple: {errore}</div>}
      <div className="flex items-start gap-3">
        {g.immagine ? <img src={g.immagine} alt="" className="size-14 shrink-0 object-contain" /> : <Apple className="size-6 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{g.modello || "Modello non indicato da Apple"}</div>
          <div className="text-xs text-muted-foreground">{g.configurazione}{g.imei ? ` · IMEI ${g.imei}` : ""} · letto su GSX il {ora(g.letto_il)}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
            {g.dati_nascosti
              ? <span className="col-span-full text-amber-700">Apple nasconde garanzia e acquisto: quasi sempre «Trova il mio» è attivo</span>
              : <>
                  <span>Garanzia: <b className={garanziaOk ? "text-emerald-700" : ""}>{g.garanzia || "—"}</b>{garanziaOk ? ` (${g.giorni_garanzia} gg)` : ""}</span>
                  <span>Acquisto: <b>{data(g.data_acquisto)}</b>{g.paese_acquisto ? ` · ${g.paese_acquisto}` : ""}</span>
                  {g.fine_copertura && <span>Fine copertura: <b>{data(g.fine_copertura)}</b></span>}
                  {g.applecare === "Y" && <span className="text-emerald-700">AppleCare+ <b>attivo</b>{g.contratto_fine ? ` fino al ${data(g.contratto_fine)}` : ""}</span>}
                </>}
            {g.garanzia_legale && <span>Garanzia legale: <b className={g.garanzia_legale.attiva ? "text-emerald-700" : ""}>{g.garanzia_legale.attiva ? `attiva fino al ${data(g.garanzia_legale.fino)}` : `scaduta il ${data(g.garanzia_legale.fino)}`}</b></span>}
            {g.prima_attivazione && <span>Prima attivazione: <b>{data(g.prima_attivazione)}</b></span>}
            {g.operatore_telefonico && <span>Operatore: <b>{g.operatore_telefonico}</b>{g.sbloccato_operatore === false ? " (bloccato)" : ""}</span>}
            {!!g.codici_cs?.length && <span className="col-span-full text-emerald-800">Codice CS Apple (copertura speciale): {g.codici_cs.map((c) => `${c.codice}${c.nota ? ` · ${c.nota}` : ""}`).join(" · ")}</span>}
            {!!g.consumer_law?.length && <span className="col-span-full">Consumer law: {g.consumer_law.map((c) => c.tipo).filter(Boolean).join(", ")}</span>}
          </div>
          {g.messaggi.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs">{g.messaggi.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          {g.pratiche_apple.length > 0 && (
            <div className="mt-1 text-xs">Pratiche Apple: {g.pratiche_apple.map((c) => `${c.caseId} (${data(c.createdDateTime?.slice(0, 10))}${c.summary ? ` · ${c.summary}` : ""})`).join(" · ")}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {onAggiorna && <Button type="button" variant="outline" className="h-8" disabled={aggiornando} onClick={onAggiorna} title="Rilegge tutto da Apple GSX e lo salva nella scheda">
            {aggiornando ? <Loader2 className="animate-spin" /> : <RefreshCw />}Aggiorna da GSX</Button>}
          {!ric && <Button type="button" variant="outline" className="h-8" disabled={busy} onClick={caricaRicambi} title="Pezzi del dispositivo secondo Apple GSX">
            {busy ? <Loader2 className="animate-spin" /> : <Package />}Ricambi Apple</Button>}
          <a className="inline-flex h-8 items-center justify-center gap-1 rounded-md border px-2 text-xs hover:bg-muted" target="_blank" rel="noreferrer"
            href={`/assistenza/gsx?s=${encodeURIComponent(g.seriale)}`} title="Pagina GSX completa: diagnosi, test Apple, cronologia riparazioni"><ExternalLink className="size-3.5" />Pagina GSX</a>
          {ridotto && <Button type="button" variant={dettagli ? "secondary" : "outline"} className="h-8" onClick={toggleDettagli} title="Prezzi dei ricambi, riparazioni GSX, seriali sostituiti, programmi Apple">
            {dettagli ? "Chiudi dettagli" : `Dettagli GSX${(rip?.length || 0) + (g.articoli ? g.articoli.programmi.length : 0) ? ` (${rip?.length || 0} rip. · ${g.articoli?.programmi.length || 0} progr.)` : ""}`}</Button>}
        </div>
      </div>

      {/* avvisi che cambiano il lavoro */}
      {(g.sostituito || g.trova_il_mio_probabile || g.dep || g.modalita_riparazione || g.prestito || aperte.length > 0 || g.idoneita?.bloccata) && (
        <div className="mt-2 space-y-1 text-xs">
          {g.sostituito && <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-red-950 dark:bg-red-950/30 dark:text-red-100">
            🔁 <b>DISPOSITIVO SOSTITUITO DA APPLE</b>{g.sostituito.data ? ` il ${data(g.sostituito.data)}` : ""}: il seriale nuovo è <span className="font-mono font-semibold">{g.sostituito.seriale_nuovo}</span>{g.sostituito.imei_nuovo ? ` · IMEI ${g.sostituito.imei_nuovo}` : ""}. Nella scheda va come «nuovo S/N».
            {serialeNuovoScheda && serialeNuovoScheda.replace(/[^A-Z0-9]/gi, "").toUpperCase() !== g.sostituito.seriale_nuovo.toUpperCase() && <div className="mt-0.5 font-semibold">⚠️ Nella scheda il nuovo S/N è <span className="font-mono">{serialeNuovoScheda}</span>, Apple dice <span className="font-mono">{g.sostituito.seriale_nuovo}</span>: controllare sul dispositivo e correggere.</div>}</div>}
          {g.idoneita?.bloccata && <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-red-950 dark:bg-red-950/30 dark:text-red-100">
            ⛔ <b>Apple BLOCCA la riparazione</b> ({g.idoneita.copertura || "—"}): {g.idoneita.blocchi.join(" · ")}</div>}
          {aperte.length > 0 && <div className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
            🛠 <b>Riparazione GSX aperta</b>: {aperte.map((r) => `${r.id} (${r.stato})`).join(" · ")}</div>}
          {g.trova_il_mio_probabile && !trovaAttivo && <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            🔒 Apple oscura i dati: <b>«Trova il mio» quasi certamente attivo</b> (si verifica sul dispositivo).
            {onTrova && <Button type="button" size="xs" variant="outline" className="ml-auto" onClick={onTrova}>Segna «Trova il mio» attivo</Button>}</div>}
          {g.dep && <div className="rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-violet-950 dark:bg-violet-950/30 dark:text-violet-100">
            🏢 <b>Iscritto a DEP / Apple Business Manager</b> (gestione aziendale MDM): alla formattazione si riattiva il profilo dell&apos;azienda. Attenzione a vendite e permute.</div>}
          {g.modalita_riparazione && <div className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">
            ✅ <b>Modalità riparazione attiva</b>: il cliente ha abilitato la riparazione da Dov&apos;è, non serve togliere «Trova il mio».</div>}
          {g.prestito && <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-950 dark:bg-amber-950/30">Dispositivo in prestito Apple (loaner).</div>}
        </div>
      )}

      {/* 12/11/2026: IDONEITÀ E COPERTURA Apple (repair/eligibility) — col difetto Apple scelto nella scheda */}
      {(onIdoneita || (g.idoneita && !ridotto)) && (
        <div className={`mt-2 rounded-md border p-2 text-xs ${g.idoneita ? (g.idoneita.bloccata ? "border-red-200 bg-red-50/40 dark:bg-red-950/20" : g.idoneita.coperto ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30" : "border-slate-200") : "border-dashed"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-4" /><b>Idoneità e copertura Apple</b>
            {g.idoneita ? <span>{g.idoneita.copertura || "—"}{g.idoneita.coperto ? " · RICAMBI COPERTI (0 €)" : ""} · {RIP_TIPI[g.idoneita.tipo] || g.idoneita.tipo} · letta il {ora(g.idoneita.letto_il)}</span>
              : <span className="text-muted-foreground">{haDifetto ? "chiedi ad Apple se la riparazione è ammessa e cosa copre" : "scegli prima il «Difetto Apple (codici GSX)» sotto il difetto del cliente"}</span>}
            {onIdoneita && <Button type="button" size="xs" variant="outline" className="ml-auto" disabled={idoneitaBusy || !haDifetto} onClick={onIdoneita}>{idoneitaBusy ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck />}{g.idoneita ? "Rileggi" : "Verifica con Apple"}</Button>}
          </div>
          {g.idoneita && (
            <div className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              <div>Difetto: {g.idoneita.difetti.map((d) => `${d.componentCode} → ${d.issueCode}`).join(" · ")}</div>
              <div>Tecnico certificato obbligatorio: {g.idoneita.tecnico_obbligatorio ? "sì" : "no"}{g.idoneita.trova_il_mio ? <b className="text-red-700"> · «Trova il mio» ATTIVO (lo dice Apple)</b> : ""}{g.idoneita.problema_software ? " · Apple: difetto software, non hardware" : ""}</div>
              <div className="sm:col-span-2">Ricambi: {g.idoneita.parti.map((p) => <span key={p.codice} className={`mr-2 ${p.coperto ? "font-semibold text-emerald-700" : ""}`}>{p.codice} {p.coperto ? "COPERTO" : "a pagamento"}{p.copertura && !p.coperto ? "" : p.copertura ? ` (${p.copertura})` : ""}</span>)}</div>
              {g.idoneita.tipi_riparazione.length > 0 && <div className="sm:col-span-2 text-muted-foreground">Tipi di riparazione ammessi: {g.idoneita.tipi_riparazione.map((t) => t.nome).join(" · ")}</div>}
              {g.idoneita.esiti.filter((e) => !["STOP", "HOLD"].includes(e.azione || "") && e.messaggi.length).map((e, i) => <div key={i} className="sm:col-span-2 text-amber-800">{e.tipo}: {e.messaggi.join(" · ")}</div>)}
            </div>
          )}
        </div>
      )}

      {/* 12/11/2026: PROGRAMMI DI RIPARAZIONE e problemi noti Apple del modello (articoli GSX per seriale) */}
      {apertoDettagli && g.articoli && (g.articoli.programmi.length > 0 || g.articoli.del_modello.length > 0) && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/50 p-2 text-xs dark:bg-amber-950/20">
          <div className="font-semibold">Programmi e problemi noti Apple per questo modello ({g.articoli.programmi.length + g.articoli.del_modello.length})
            <a className="ml-2 font-normal underline" href={`/assistenza/gsx?s=${encodeURIComponent(g.seriale)}&sez=articoli`} target="_blank" rel="noreferrer">tutti gli articoli ({g.articoli.totale})</a></div>
          <ul className="mt-0.5 list-disc pl-4">
            {[...g.articoli.programmi, ...g.articoli.del_modello].slice(0, 12).map((a) => <li key={a.id}>
              <a className="hover:underline" href={`/assistenza/gsx?s=${encodeURIComponent(g.seriale)}&sez=articoli&art=${a.id}`} target="_blank" rel="noreferrer" title={a.sommario || ""}>{a.titolo}</a>
              {a.priorita && a.priorita !== "LOW" ? <span className="ml-1 rounded bg-amber-200 px-1 text-[10px]">{a.priorita}</span> : null}</li>)}
          </ul>
        </div>
      )}

      {/* preventivo pronto */}
      {apertoDettagli && ric && ric.principali.length > 0 && (
        <div className="mt-2 rounded-md border border-sky-200 bg-sky-50/60 p-2 text-xs dark:bg-sky-950/30">
          <div className="mb-1 flex flex-wrap items-center gap-2 font-semibold">Preventivo pronto · prezzi da GSX {ric.letto_il ? `(letti il ${ora(ric.letto_il)})` : ""}
            <span className="font-normal text-muted-foreground">regola del listino: +10% Bagnetti +IVA → proposto → listino · «Listino» = pagina Prezzi ufficiali</span></div>
          <table className="w-full">
            <thead><tr className="text-left">
              <th>Componente</th><th>Codice</th>{ric.costi_visibili && <><th className="text-right">GSX</th><th className="text-right">Ci costa</th></>}
              <th className="text-right">Proposto</th><th className="text-right">Scontato da</th><th className="text-right">Listino</th><th></th>
            </tr></thead>
            <tbody>
              {ric.principali.map((p) => {
                const u = p.ufficiale;
                return (
                  <tr key={p.categoria} className="border-t align-top">
                    <td className="py-0.5 pr-2 font-semibold">{ric.categorie[p.categoria] || p.categoria}</td>
                    <td className="pr-2"><span className="font-mono">{p.codice}</span><div className="text-muted-foreground">{p.descrizione}{p.altri_codici > 0 ? ` · +${p.altri_codici} codici (preso il più caro)` : ""}</div>
                      {p.nota && <div className="text-amber-700">{p.nota}</div>}</td>
                    {ric.costi_visibili && <><td className="text-right">{euro(p.prezzi.gsx)}{u?.costo_diverso && <div className="text-amber-700" title="Il listino è stato costruito su un costo Apple diverso">listino: {euro(u.costo_gsx)}</div>}</td><td className="text-right">{euro(p.prezzi.costo)}</td></>}
                    <td className="text-right font-semibold">{g.idoneita?.parti.find((x) => x.codice === p.codice)?.coperto ? <span className="text-emerald-700" title="Apple copre il ricambio: nel preventivo va a 0 €">0 € <s className="font-normal text-muted-foreground">{euro(p.prezzi.proposto)}</s></span> : euro(p.prezzi.proposto)}</td>
                    <td className="text-right">{euro(p.prezzi.listino)}</td>
                    <td className="text-right">{u?.prezzo != null
                      ? <span className={u.prezzo_diverso ? "font-semibold text-amber-700" : "text-emerald-700"} title={u.prezzo_diverso ? "Il prezzo del listino è diverso da quello calcolato oggi da GSX" : "Uguale al calcolo di oggi"}>
                          {euro(u.prezzo)}<div className="text-[10px] font-normal text-muted-foreground">{u.stato === "convalidato" ? "convalidato" : "proposto"}{u.prezzo_diverso ? " ≠ GSX" : " ✓"}</div></span>
                      : <span className="text-muted-foreground" title="Il modello non è nella pagina Prezzi ufficiali: vale il calcolo da GSX">—</span>}</td>
                    <td className="pl-2">
                      {onInserisci && p.preventivo
                        ? <Button type="button" variant="outline" className="h-6 whitespace-nowrap px-2 text-[11px]" title={`${p.preventivo.uno ? `1ª ${p.preventivo.uno.t} € ${p.preventivo.uno.p} · ` : ""}2ª ${p.preventivo.due.t} € ${p.preventivo.due.p}${p.preventivo.due_touch_id ? ` + Touch ID € ${p.preventivo.due_touch_id.p}` : ""}`}
                            onClick={() => onInserisci(p)}>➕ {p.preventivo.uno ? "Inserisci 1ª + 2ª" : "Inserisci nel preventivo"}</Button>
                        : <Button type="button" variant="outline" className="h-6 px-2 text-[11px]" title={p.ipotesi}
                            onClick={() => { navigator.clipboard?.writeText(`2° IPOTESI: ${p.ipotesi}`); toast.success("Ipotesi copiata"); }}>Copia ipotesi</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* riparazioni GSX e seriali sostituiti */}
      {apertoDettagli && !compatto && rip && rip.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-md border p-2 text-xs">
          <div className="mb-1 font-semibold">Riparazioni GSX su questo seriale ({rip.length})</div>
          <table className="w-full">
            <thead className="text-left text-muted-foreground"><tr><th className="pr-2">Numero G</th><th className="pr-2">Tipo</th><th className="pr-2">Stato</th><th className="pr-2">Creata</th><th className="pr-2">Chiusa</th><th className="pr-2">Difetto</th><th>Ricambi</th></tr></thead>
            <tbody>{rip.map((r) => (
              <tr key={r.id} className={`border-t align-top ${r.aperta ?? !r.chiusa ? "bg-sky-50 dark:bg-sky-950/30" : ""}`}>
                <td className="py-0.5 pr-2 font-mono font-semibold">{r.id}</td><td className="pr-2">{r.tipo}</td><td className="pr-2">{r.stato}</td>
                <td className="pr-2">{data(r.creata)}</td><td className="pr-2">{data(r.chiusa)}</td>
                <td className="pr-2">{r.difetti.join("; ")}{r.applecare_consumato ? " · AppleCare+ usato" : ""}</td>
                <td>{r.ricambi.map((p) => `${p.codice} ${p.descrizione}`).join("; ")}
                  {/* 12/11/2026: dal dettaglio GSX lo stato di ogni ricambio (ordine, consegna, reso) e il seriale nuovo */}
                  {r.dettaglio && !r.dettaglio.errore && (
                    <div className="mt-0.5 text-muted-foreground">
                      {r.dettaglio.notifica && <div>Notifica Apple {r.dettaglio.notifica}{r.dettaglio.copertura ? ` · ${r.dettaglio.copertura}` : ""}{r.dettaglio.totale != null ? ` · totale ${euro(r.dettaglio.totale)}` : ""}</div>}
                      {r.dettaglio.ricambi.map((p, i) => <div key={i}>{p.codice}: {p.stato_ordine || "—"}{p.consegna_tracking ? ` · consegna ${p.corriere || ""} ${p.consegna_tracking}` : ""}{p.consegna_il ? ` (${data(p.consegna_il)})` : ""}{p.reso_stato ? ` · reso: ${p.reso_stato}` : ""}{p.reso_tracking ? ` ${p.reso_tracking}` : ""}{p.seriale_nuovo ? ` · NUOVO S/N ${p.seriale_nuovo}` : ""}</div>)}
                      {r.dettaglio.messaggi.length > 0 && <div className="text-amber-700">{r.dettaglio.messaggi.join(" · ")}</div>}
                    </div>
                  )}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {apertoDettagli && !compatto && g.sostituzioni.length > 0 && (
        <div className="mt-2 rounded-md border p-2 text-xs">
          <div className="mb-1 font-semibold">Seriali sostituiti da Apple ({g.sostituzioni.length})</div>
          {g.sostituzioni.map((x, i) => <div key={i}>{data(x.data)} · {x.stato} · <span className="font-mono">{x.seriale_vecchio}</span> → <span className="font-mono font-semibold">{x.seriale_nuovo}</span>{x.imei_nuovo ? ` · IMEI ${x.imei_nuovo}` : ""}</div>)}
        </div>
      )}

      {apertoDettagli && ric && (
        <div className="mt-2 border-t pt-2">
          {ric.scheda_logica && (
            <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50/70 p-2 text-xs dark:bg-emerald-950/30">
              <div className="font-semibold">Scheda logica di questo dispositivo: {ric.scheda_logica.codice}</div>
              <div>{ric.scheda_logica.descrizione}</div>
              {ric.costi_visibili && <div className="mt-0.5">Costo Apple: stock <b>{euro(ric.scheda_logica.costo_stock)}</b> · sostituzione (rendendo il guasto) <b>{euro(ric.scheda_logica.costo_sostituzione)}</b></div>}
            </div>
          )}
          <button type="button" className="mb-1 text-xs font-semibold text-muted-foreground underline" onClick={() => setTutti((x) => !x)}>
            {tutti ? "Nascondi" : "Mostra"} tutti i pezzi del dispositivo ({ric.ricambi.length})</button>
          {tutti && (
            <>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <input className="h-7 w-56 rounded border px-2" placeholder="Filtra: display, battery, 661-…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
                <label className="flex items-center gap-1"><input type="checkbox" checked={varianti} onChange={(e) => setVarianti(e.target.checked)} />mostra anche le altre configurazioni e lingue</label>
                <span className="text-muted-foreground">{righe.length} pezzi · configurazione {ric.configurazione_riconosciuta.join(", ") || "—"}</span>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white dark:bg-slate-950"><tr className="text-left">
                    <th className="py-1">Tipo</th><th>Codice</th><th>Descrizione</th>{ric.costi_visibili && <><th className="text-right">Stock</th><th className="text-right">Sostituz.</th></>}
                  </tr></thead>
                  <tbody>
                    {righe.map((r) => (
                      <tr key={r.codice} className={`border-t ${r.esatta ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                        <td className="py-0.5 pr-2 text-muted-foreground">{ric.categorie[r.categoria] || r.categoria}</td>
                        <td className="pr-2 font-mono">{r.esatta ? "✅ " : ""}{r.codice}</td>
                        <td className="pr-2">{r.descrizione}{r.sostituito_da ? <span className="text-muted-foreground"> · sostituito da {r.sostituito_da}</span> : null}</td>
                        {ric.costi_visibili && <><td className="text-right">{euro(r.costo_stock)}</td><td className="text-right">{euro(r.costo_sostituzione)}</td></>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ric.costi_visibili && <div className="mt-1 text-[11px] text-muted-foreground">Costi Apple da GSX. Stock = ricambio senza rendere il pezzo guasto · Sostituzione = rendendolo ad Apple.</div>}
            </>
          )}
        </div>
      )}
      {g.errori && <div className="mt-1 text-[11px] text-amber-700">Non letti da Apple: {Object.entries(g.errori).map(([k, v]) => `${k} (${v})`).join(" · ")}</div>}
    </div>
  );
}
