"use client";
// 20/11/2026 (G-14, Christian): «APRI RIPARAZIONE APPLE» — procedura guidata in passi come GSX:
// 1 prodotto + cliente · 2 diagnostica (difetti CUST/TECH) · 3 dettagli riparazione (tipo, copertura, opzioni, idoneità Apple)
// 4 parti + domande Apple · 5 note e allegati · 6 riepilogo come il pop-up Apple → «Invia ad Apple» · «Lascia in bozza» · «Annulla bozza».
// Scorciatoie «Batteria iPhone» e «Display iPhone» (precompilano con i codici LETTI da Apple). Nessun codice Apple scritto a mano.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BatteryCharging, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Paperclip, Send, ShieldCheck, Smartphone, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toastErrore } from "@/lib/errori";
import { area, campo, Campo, Pill } from "../scheda/ui";
import {
  ripAggiorna, ripAllegato, ripBozza, ripComponenti, ripDettaglio, ripDomande, ripIdoneita, ripInvia, ripModalitaRiparazione, ripProdotto,
  ripProposta, ripRicambi, ripScheda, ripTecnici, risposteAlbero, domandeMancanti,
  type Ambiente, type Componente, type Dettaglio, type Difetto, type DomandeApple, type Esito, type Idoneita, type InfoAmbiente,
  type Pratica, type Prodotto, type Ricambio, type Riepilogo, type Risposte, type Tecnico,
} from "@/lib/gsxRip";
import { AlberoDomande, MessaggiApple, euro, dataOra, fileInBase64, tonoStato } from "./comuni";

const PASSI = ["Prodotto e cliente", "Diagnostica", "Dettagli riparazione", "Parti", "Note", "Riepilogo e invio"];
const RIPROD: [string, string][] = [["A", "Non applicabile"], ["B", "Continuo"], ["C", "Intermittente"], ["D", "Dopo un po' (a caldo)"], ["E", "In certe condizioni"], ["F", "Non riprodotto"], ["G", "Danneggiato"]];
const TESTI: Record<string, [string, string]> = {
  batteria: ["Il cliente riferisce che la batteria dura poco e si scarica rapidamente.", "Verificato stato della batteria degradato. Sostituzione della batteria."],
  display_rotto: ["Il cliente riferisce lo schermo rotto dopo una caduta.", "Vetro dello schermo incrinato. Danno accidentale: sostituzione del display."],
  display_guasto: ["Il cliente riferisce un malfunzionamento dello schermo senza cadute.", "Difetto del display verificato, nessun danno visibile. Sostituzione del display."],
};

function oraLocale(d = new Date()) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); }

const praticaVuota = (): Pratica => ({
  seriale: "", tipo: "CIN", tecnico: "", po: "", ricevuta_il: oraLocale(new Date(Date.now() - 10 * 60000)), difetti: [], parti: [],
  nota_cliente: "", nota_tecnico: "", richiedi_verifica_apple: false, completa_subito: false,
  cliente: { nome: "", cognome: "", email: "", telefono: "", indirizzo: { via: "", citta: "", cap: "", provincia: "", paese: "ITA" } },
});

export function Procedura({ amb, info, sid, serialeIniziale, operatore, scorciatoia, onChiudi, onFatto }: {
  amb: Ambiente; info: InfoAmbiente | null; sid?: string; serialeIniziale?: string; operatore?: string; scorciatoia?: string;
  onChiudi?: () => void; onFatto?: (rid: string) => void;
}) {
  const [passo, setPasso] = useState(0);
  const [p, setP] = useState<Pratica>(praticaVuota);
  const [busy, setBusy] = useState("");
  const [prodotto, setProdotto] = useState<Prodotto | null>(null);
  const [tecnici, setTecnici] = useState<Tecnico[]>([]);
  const [componenti, setComponenti] = useState<Componente[]>([]);
  const [ricambi, setRicambi] = useState<Ricambio[]>([]);
  const [idon, setIdon] = useState<Idoneita | null>(null);
  const [domande, setDomande] = useState<DomandeApple | null>(null);
  const [risposte, setRisposte] = useState<Risposte>({});
  const [riep, setRiep] = useState<Riepilogo | null>(null);
  const [rid, setRid] = useState<string>("");
  const [esitoInvio, setEsitoInvio] = useState<Esito | null>(null);
  const [conferme, setConferme] = useState<Record<string, boolean>>({});
  const [inviata, setInviata] = useState<string>("");
  const [dett, setDett] = useState<Dettaglio | null>(null);
  const [scelte, setScelte] = useState<{ codice: string; nome: string }[]>([]);
  const [compSel, setCompSel] = useState("");
  const avviata = useRef(false);
  const set = (k: Partial<Pratica>) => setP((x) => ({ ...x, ...k }));
  const setCli = (k: Partial<Pratica["cliente"]>) => setP((x) => ({ ...x, cliente: { ...x.cliente, ...k } }));
  const setInd = (k: Partial<Pratica["cliente"]["indirizzo"]>) => setP((x) => ({ ...x, cliente: { ...x.cliente, indirizzo: { ...x.cliente.indirizzo, ...k } } }));
  const ro = amb === "prod" && !!info?.produzione_bloccata;

  // tecnici dal GSX (predefinito: Christian in produzione, l'unico tecnico in PROVA)
  useEffect(() => {
    ripTecnici(amb).then((t) => { setTecnici(t.tecnici); setP((x) => ({ ...x, tecnico: t.tecnici.some((y) => y.id === x.tecnico) ? x.tecnico : t.predefinito })); })
      .catch(toastErrore);
  }, [amb]);

  // dalla scheda: cliente, PO = numero scheda, seriale, difetto, difetti Apple già scelti
  useEffect(() => {
    if (!sid) { if (serialeIniziale) Promise.resolve().then(() => set({ seriale: serialeIniziale })); return; }
    ripScheda(sid).then((d) => {
      const dif: Difetto[] = (d.difetti_apple || []).flatMap((x) => (["CUST", "TECH"] as const).map((t) => ({
        componentCode: x.componentCode, componentDescription: x.componentDescription, issueCode: x.issueCode, issueDescription: x.issueDescription,
        type: t, reproducibility: x.reproducibility || "A" })));
      setP((x) => ({ ...x, seriale: d.scheda.seriale || serialeIniziale || "", po: d.po, cliente: d.cliente, difetti: dif,
        nota_cliente: x.nota_cliente || (d.scheda.difetto || "").slice(0, 900),
        ricevuta_il: d.scheda.ricevuta_il ? oraLocale(new Date(d.scheda.ricevuta_il)) : x.ricevuta_il }));
    }).catch(toastErrore);
  }, [sid, serialeIniziale]);

  const leggiProdotto = useCallback(async (s: string) => {
    if (s.replace(/\W/g, "").length < 8) return;
    setBusy("prodotto");
    try {
      const [pr, co] = await Promise.all([ripProdotto(s, amb), ripComponenti(s, amb)]);
      setProdotto(pr); setComponenti(co.componenti);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }, [amb]);
  useEffect(() => { if (p.seriale) Promise.resolve().then(() => leggiProdotto(p.seriale)); }, [p.seriale, amb]); // eslint-disable-line react-hooks/exhaustive-deps

  async function applica(chiave: string, variante = "") {
    if (!p.seriale) { toast.error("Prima il seriale"); return; }
    setBusy("scorciatoia");
    try {
      const x = await ripProposta({ amb, s: p.seriale, scorciatoia: chiave, variante });
      if (!x.componente || !x.difetto) { toast.error("Apple non ha il componente/difetto atteso per questo modello: scegli a mano nel passo 2"); return; }
      const d = { componentCode: x.componente.codice, componentDescription: x.componente.nome, issueCode: x.difetto.codice, issueDescription: x.difetto.nome, reproducibility: "A" };
      setScelte(chiave === "display_guasto" ? x.difetti_componente : []);
      setP((y) => ({ ...y, tipo: "CIN", difetti: [{ ...d, type: "CUST" }, { ...d, type: "TECH" }],
        parti: x.ricambio ? [{ number: x.ricambio.codice, descrizione: x.ricambio.descrizione, prezzo: x.ricambio.prezzo_sostituzione,
          serializzato: x.ricambio.serializzato, ...(x.copertura ? { coverageOption: x.copertura } : {}) }] : [],
        nota_cliente: y.nota_cliente || TESTI[chiave][0], nota_tecnico: y.nota_tecnico || TESTI[chiave][1] }));
      if (x.ricambio) setRicambi((r) => [x.ricambio!, ...x.alternative, ...r.filter((z) => z.codice !== x.ricambio!.codice)]);
      setIdon(null); setDomande(null); setRiep(null);
      toast.success(`${x.titolo}: ${x.difetto.nome}${x.ricambio ? ` · ricambio ${x.ricambio.codice}` : " · nessun ricambio trovato"}${x.copertura ? ` · copertura ${x.copertura}` : ""}`);
      setPasso(chiave === "display_guasto" ? 1 : 2);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  useEffect(() => { if (scorciatoia && p.seriale && !avviata.current && tecnici.length) { avviata.current = true; Promise.resolve().then(() => applica(scorciatoia)); } });

  const questionDetails = useMemo(() => (domande || []).map((t) => ({ templateId: t.templateId,
    trees: t.trees.map((tr) => ({ treeId: tr.treeId, questions: risposteAlbero(tr.questions, risposte) })).filter((tr) => tr.questions.length) }))
    .filter((t) => t.trees.length), [domande, risposte]);
  const mancanti = useMemo(() => (domande || []).flatMap((t) => t.trees.flatMap((tr) => domandeMancanti(tr.questions, risposte))), [domande, risposte]);
  const pratica = (): Pratica => ({ ...p, ricevuta_il: new Date(p.ricevuta_il).toISOString(), domande: questionDetails });

  async function verifica() {
    setBusy("idoneita");
    try {
      const r = await ripIdoneita(amb, pratica(), sid, operatore);
      setIdon(r);
      if (r.stop) toast.error("Apple BLOCCA questa riparazione (STOP): leggi i messaggi");
      else toast.success(`Idoneità: ${r.copertura || r.codice_copertura || "ok"}`);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function caricaDomande() {
    setBusy("domande");
    try { const d = await ripDomande(amb, pratica()); setDomande(d.domande); if (!d.domande.length) toast.success("Apple: nessuna domanda per questa riparazione"); }
    catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function cercaRicambi() {
    setBusy("ricambi");
    try { const r = await ripRicambi({ amb, s: p.seriale, tipo: p.tipo, difetti: p.difetti.filter((d) => d.type === "TECH") }); setRicambi(r.ricambi); }
    catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function allega(f: File | undefined, tipo: string) {
    if (!f) return;
    setBusy("allegato");
    try {
      const r = await ripAllegato({ amb, nome: f.name, contenuto_b64: await fileInBase64(f), s: p.seriale, sid });
      set({ allegati: [...(p.allegati || []), { id: r.id, type: tipo, nome: f.name }] });
      toast.success(`Allegato caricato su Apple (${f.name})`);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function salvaBozza() {
    if (mancanti.length) { toast.error(`Domande Apple obbligatorie senza risposta: ${mancanti.join(" · ")}`); return; }
    setBusy("bozza");
    try {
      const tec = tecnici.find((t) => t.id === p.tecnico);
      const r = await ripBozza({ amb, pratica: pratica(), sid, operatore, repairId: rid || undefined, prodotto, tecnico_nome: tec?.nome });
      setIdon(r.idoneita);
      if (!r.salvata) { toast.error(r.messaggio || "Apple blocca la riparazione"); return; }
      setRid(r.repairId!); setRiep(r.riepilogo!);
      toast.success(`Bozza ${r.repairId} salvata in GSX («Salvata per dopo»)`);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function invia() {
    setBusy("invio");
    try {
      const r = await ripInvia({ amb, repairId: rid, sid, operatore, conferme: Object.entries(conferme).filter(([, v]) => v).map(([id]) => ({ id, value: "Y" })) });
      setEsitoInvio(r.esito);
      if (!r.creata) { toast.error(r.messaggio); return; }
      setInviata(r.repairId!); toast.success(r.messaggio); onFatto?.(r.repairId!);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function annullaBozza() {
    if (!rid || !window.confirm(`Eliminare la bozza ${rid} da GSX (DELR)?`)) return;
    setBusy("annulla");
    try { await ripAggiorna({ amb, repairId: rid, stato: "DELR", confermato: true, sid, operatore }); toast.success(`Bozza ${rid} eliminata`); setRid(""); setRiep(null); onChiudi?.(); }
    catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  // dopo l'invio: lettura ogni 15 s finché Apple non la rilascia (NEWO → RLSD); POCR = blocco credito
  useEffect(() => {
    if (!inviata) return;
    let fermo = false, giri = 0;
    const leggi = async () => {
      try { const d = await ripDettaglio(inviata, amb, sid || ""); if (fermo) return; setDett(d); if (d.stato === "NEWO" && giri++ < 40) setTimeout(leggi, 15000); }
      catch { if (!fermo && giri++ < 40) setTimeout(leggi, 15000); }
    };
    leggi();
    return () => { fermo = true; };
  }, [inviata, amb, sid]);

  const difetti = (t: "CUST" | "TECH") => p.difetti.filter((d) => d.type === t);
  const cambiaDifetti = (t: "CUST" | "TECH", lista: Difetto[]) => set({ difetti: [...p.difetti.filter((d) => d.type !== t), ...lista] });
  const tecSel = tecnici.find((t) => t.id === p.tecnico);
  const certOk = amb === "uat" || !tecSel || !prodotto || (prodotto.iphone ? tecSel.certificati.includes("iPhone") : prodotto.mac ? tecSel.certificati.includes("Mac") : true);

  return (
    <div className="space-y-3" data-testid="gsx-procedura">
      {/* barra dei passi */}
      <ol className="flex flex-wrap gap-1">
        {PASSI.map((n, i) => (
          <li key={n}><button type="button" onClick={() => setPasso(i)} className={cn("rounded-md border px-2 py-1 text-xs font-medium",
            passo === i ? "border-primary bg-primary text-primary-foreground" : i < passo ? "bg-muted" : "text-muted-foreground")}>{i + 1}. {n}</button></li>))}
      </ol>
      {ro && <div className="rounded-lg border-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100">
        🏭 PRODUZIONE bloccata: puoi leggere e preparare, ma bozza e invio sono fermi finché Christian non dà l&apos;ok. Usa 🧪 PROVA Apple.</div>}
      {idon && <MessaggiApple esito={idon} />}

      {passo === 0 && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Campo label="Seriale / IMEI"><input className={campo} value={p.seriale} onChange={(e) => set({ seriale: e.target.value.toUpperCase().trim() })} onBlur={() => leggiProdotto(p.seriale)} /></Campo>
            <div className="flex items-end gap-1.5">
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => applica("batteria")}><BatteryCharging />Batteria iPhone</Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => applica("display_rotto")}><Smartphone />Display rotto</Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => applica("display_rotto", "singola")} title="Singola incrinatura">1 crepa</Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => applica("display_guasto")}>Display guasto</Button>
            </div>
          </div>
          {busy === "prodotto" && <p className="text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin" /> Leggo il dispositivo da Apple…</p>}
          {prodotto && (
            <div className="flex gap-3 rounded-lg border bg-muted/30 p-2 text-sm">
              {prodotto.immagine && <img src={prodotto.immagine} alt="" className="size-16 object-contain" />}
              <div className="min-w-0">
                <div className="font-semibold">{prodotto.descrizione} <span className="font-normal text-muted-foreground">{prodotto.configurazione}</span></div>
                <div>Garanzia: <b>{prodotto.garanzia || "—"}</b>{prodotto.fine_copertura ? ` fino al ${prodotto.fine_copertura.split("-").reverse().join("/")}` : ""}
                  {prodotto.acquisto ? ` · acquisto ${prodotto.acquisto.split("-").reverse().join("/")}` : ""}</div>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {prodotto.modalita_riparazione && <Pill tono="verde">Modalità riparazione attiva</Pill>}
                  {prodotto.applecare && <Pill tono="blu">{prodotto.applecare}</Pill>}
                  {prodotto.messaggi.map((m, i) => <Pill key={i} tono="ambra">{m}</Pill>)}
                </div>
              </div>
            </div>)}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Campo label="Nome"><input className={campo} value={p.cliente.nome} onChange={(e) => setCli({ nome: e.target.value })} /></Campo>
            <Campo label="Cognome"><input className={campo} value={p.cliente.cognome} onChange={(e) => setCli({ cognome: e.target.value })} /></Campo>
            <Campo label="E-mail"><input className={campo} value={p.cliente.email} onChange={(e) => setCli({ email: e.target.value })} /></Campo>
            <Campo label="Telefono"><input className={campo} value={p.cliente.telefono} onChange={(e) => setCli({ telefono: e.target.value })} /></Campo>
            <Campo label="Indirizzo" className="sm:col-span-2"><input className={campo} value={p.cliente.indirizzo.via} onChange={(e) => setInd({ via: e.target.value })} /></Campo>
            <Campo label="Città"><input className={campo} value={p.cliente.indirizzo.citta} onChange={(e) => setInd({ citta: e.target.value })} /></Campo>
            <div className="grid grid-cols-3 gap-2">
              <Campo label="CAP"><input className={campo} value={p.cliente.indirizzo.cap} onChange={(e) => setInd({ cap: e.target.value })} /></Campo>
              <Campo label="Prov."><input className={campo} maxLength={3} value={p.cliente.indirizzo.provincia} onChange={(e) => setInd({ provincia: e.target.value.toUpperCase() })} /></Campo>
              <Campo label="Paese"><input className={campo} maxLength={3} value={p.cliente.indirizzo.paese} onChange={(e) => setInd({ paese: e.target.value.toUpperCase() })} /></Campo>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Apple non accetta i caratteri &lt; &gt; &amp; ! ¿: vengono tolti da soli.</p>
        </div>)}

      {passo === 1 && (
        <div className="space-y-3">
          {scelte.length > 0 && (
            <Campo label="Difetto del display (senza danno) — scegli quello giusto">
              <select className={campo} value={p.difetti[0]?.issueCode || ""} onChange={(e) => {
                const x = scelte.find((y) => y.codice === e.target.value); if (!x) return;
                set({ difetti: p.difetti.map((d) => ({ ...d, issueCode: x.codice, issueDescription: x.nome })), parti: p.parti.map((pt) => ({ ...pt })) });
              }}>{scelte.map((x) => <option key={x.codice} value={x.codice}>{x.nome} ({x.codice})</option>)}</select>
            </Campo>)}
          {(["CUST", "TECH"] as const).map((t) => (
            <div key={t} className="rounded-lg border p-2">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
                {t === "CUST" ? "Riferito dal CLIENTE (CUST)" : "Verificato dal TECNICO (TECH)"}
                <span className="text-xs font-normal text-muted-foreground">max 3 · il primo è il principale</span>
                {t === "TECH" && <Button size="sm" variant="ghost" onClick={() => cambiaDifetti("TECH", difetti("CUST").map((d) => ({ ...d, type: "TECH" })))}>Copia dal cliente</Button>}
              </div>
              {difetti(t).map((d, i) => (
                <div key={i} className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                  <Pill tono={i === 0 ? "blu" : "grigio"}>{i === 0 ? "principale" : `${i + 1}°`}</Pill>
                  <span className="min-w-0 flex-1">{d.componentDescription || d.componentCode} → <b>{d.issueDescription || d.issueCode}</b> <span className="text-xs text-muted-foreground">{d.componentCode}/{d.issueCode}</span></span>
                  <select className={cn(campo, "w-44")} value={d.reproducibility} onChange={(e) => cambiaDifetti(t, difetti(t).map((x, j) => j === i ? { ...x, reproducibility: e.target.value } : x))}>
                    {RIPROD.map(([k, n]) => <option key={k} value={k}>{k} · {n}</option>)}
                  </select>
                  <Button size="icon" variant="ghost" onClick={() => cambiaDifetti(t, difetti(t).filter((_, j) => j !== i))}><Trash2 /></Button>
                </div>))}
              {difetti(t).length < 3 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <select className={campo} value={compSel} onChange={(e) => setCompSel(e.target.value)}>
                    <option value="">— componente Apple ({componenti.length}) —</option>
                    {componenti.map((c) => <option key={c.codice} value={c.codice}>{c.nome} ({c.codice})</option>)}
                  </select>
                  <select className={campo} value="" disabled={!compSel} onChange={(e) => {
                    const c = componenti.find((x) => x.codice === compSel); const i = c?.difetti.find((x) => x.codice === e.target.value);
                    if (c && i) cambiaDifetti(t, [...difetti(t), { componentCode: c.codice, componentDescription: c.nome, issueCode: i.codice, issueDescription: i.nome, type: t, reproducibility: "A" }]);
                  }}>
                    <option value="">— aggiungi difetto —</option>
                    {(componenti.find((x) => x.codice === compSel)?.difetti || []).map((i) => <option key={i.codice} value={i.codice}>{i.nome} ({i.codice})</option>)}
                  </select>
                </div>)}
            </div>))}
          <p className="text-xs text-muted-foreground">Diagnostica Apple (AST 2): i test si lanciano e si leggono dalla pagina <a className="underline" href={`/assistenza/gsx?s=${encodeURIComponent(p.seriale)}&sez=diagnosi`} target="_blank">GSX del seriale → Diagnosi</a>.</p>
        </div>)}

      {passo === 2 && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Campo label="Tipo di riparazione">
              <select className={campo} value={p.tipo} onChange={(e) => set({ tipo: e.target.value })}>
                {Object.entries(info?.tipi || { CIN: "Carry-In" }).map(([k, n]) => <option key={k} value={k}>{k} · {n}</option>)}
              </select>
            </Campo>
            <Campo label="Tecnico GSX" aiuto={!certOk ? "⚠️ non risulta certificato per questo prodotto" : tecSel?.certificati.length ? `Certificato: ${tecSel.certificati.join(", ")}` : undefined}>
              <select className={campo} value={p.tecnico} onChange={(e) => set({ tecnico: e.target.value })}>
                {tecnici.map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.id}){t.certificati.length ? ` · ${t.certificati.join("+")}` : ""}</option>)}
              </select>
            </Campo>
            <Campo label="Ricevuta il (passato)"><input type="datetime-local" className={campo} value={p.ricevuta_il} max={oraLocale()} onChange={(e) => set({ ricevuta_il: e.target.value })} /></Campo>
            <Campo label="PO (numero scheda, max 15)"><input className={campo} maxLength={15} value={p.po} onChange={(e) => set({ po: e.target.value })} /></Campo>
            {p.tipo === "SVNR" && <Campo label="Motivo senza riparazione (SVNR)">
              <select className={campo} value={p.non_riparazione || ""} onChange={(e) => set({ non_riparazione: e.target.value })}>
                <option value="">— scegli —</option>{Object.entries(info?.non_riparazione || {}).map(([k, n]) => <option key={k} value={k}>{k} · {n}</option>)}
              </select></Campo>}
            {["MINS", "MINC", "WUMS", "WUMC"].includes(p.tipo) && <Campo label="Copertura (mail-in)">
              <select className={campo} value={p.copertura || ""} onChange={(e) => set({ copertura: e.target.value || undefined })}>
                <option value="">— nessuna —</option>{Object.entries(info?.coperture || {}).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select></Campo>}
            {prodotto?.consumer_law?.length ? <Campo label="Garanzia legale (consumer law)">
              <select className={campo} value={p.consumer_law || ""} onChange={(e) => set({ consumer_law: e.target.value || undefined })}>
                <option value="">— no —</option>{["SVC", "RPL", "RFD", "OPT_IN", "OPT_OUT"].map((k) => <option key={k} value={k}>{k}</option>)}
              </select></Campo> : null}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={p.completa_subito} onChange={(e) => set({ completa_subito: e.target.checked })} />Contrassegna automaticamente come completata</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={p.richiedi_verifica_apple} onChange={(e) => set({ richiedi_verifica_apple: e.target.checked })} />Richiedi verifica da parte di Apple</label>
            {["MINS", "MINC", "WUMS", "WUMC"].includes(p.tipo) && <>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!p.scatola} onChange={(e) => set({ scatola: e.target.checked })} />Scatola di spedizione</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!p.ricontatta_per_preventivo} onChange={(e) => set({ ricontatta_per_preventivo: e.target.checked })} />Ricontatta il cliente per nuovo preventivo</label></>}
          </div>
          {p.richiedi_verifica_apple && <Campo label="Nota per la verifica Apple (HOLD_REVIEW)"><textarea className={area} rows={2} value={p.nota_revisione || ""} onChange={(e) => set({ nota_revisione: e.target.value })} /></Campo>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!!busy || !p.seriale} onClick={verifica}>{busy === "idoneita" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Verifica idoneità con Apple</Button>
            {idon?.modalita_riparazione && <Button size="sm" variant="outline" disabled={!!busy || ro} onClick={async () => {
              try { const r = await ripModalitaRiparazione(amb, p.seriale, sid); toast.success(r.messaggio); } catch (e) { toastErrore(e); } }}>📲 Manda al cliente la «Modalità riparazione»</Button>}
          </div>
          {idon && (
            <div className="rounded-lg border p-2 text-sm">
              <div>Copertura Apple: <b>{idon.copertura || "—"}</b> {idon.codice_copertura && <Pill tono={idon.codice_copertura === "OO" ? "ambra" : "verde"}>{idon.codice_copertura}</Pill>}
                {idon.tecnico_obbligatorio && <span className="ml-2 text-xs">· tecnico obbligatorio</span>}{idon.ricalcolo_prezzo && <span className="ml-2 text-xs">· nuovo preventivo possibile</span>}</div>
              {idon.parti.map((x) => <div key={x.codice} className="text-xs">Parte {x.codice}: {x.a_pagamento ? "A PAGAMENTO" : "coperta"} · {x.copertura || x.codice_copertura}</div>)}
              {idon.tipi_riparazione.length > 0 && <div className="mt-1 flex flex-wrap gap-1 text-xs">Tipi ammessi da Apple: {idon.tipi_riparazione.map((t) =>
                <button key={`${t.codice}${t.sotto}`} className="rounded border px-1.5 hover:bg-muted" onClick={() => set({ tipo: t.codice, ...(t.sotto ? { non_riparazione: t.sotto } : {}) })}>
                  {t.codice}{t.sotto ? `/${t.sotto}` : ""} {t.sotto_nome || t.nome}</button>)}</div>}
              {idon.riparazione_aperta && <div className="mt-1 text-xs text-amber-800 dark:text-amber-300">C&apos;è già una riparazione aperta: {idon.riparazione_aperta} ({idon.stato_riparazione_aperta})</div>}
            </div>)}
        </div>)}

      {passo === 3 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={!!busy || !p.seriale} onClick={cercaRicambi}>{busy === "ricambi" ? <Loader2 className="animate-spin" /> : null}Ricambi Apple per i difetti TECH</Button>
            <span className="text-xs text-muted-foreground">{ricambi.length} ricambi</span>
          </div>
          {p.parti.map((pt, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2 text-sm">
              <b>{pt.number}</b><span className="min-w-0 flex-1">{pt.descrizione}{pt.serializzato ? " · serializzato (KGB/KBB)" : ""}</span>
              <span>{euro(pt.prezzo)}</span>
              <select className={cn(campo, "w-56")} value={pt.coverageOption || ""} onChange={(e) => set({ parti: p.parti.map((x, j) => j === i ? { ...x, coverageOption: e.target.value || undefined } : x) })}>
                <option value="">Copertura: nessuna (garanzia/OO)</option>
                {["VMI_GREEN", "VMI_YELLOW", "VMI_RED", "APPLECARE_PLUS", "DAMAGE_NOT_COVERED"].map((k) => <option key={k} value={k}>{info?.coperture?.[k] || k}</option>)}
              </select>
              {(ricambi.find((r) => r.codice === pt.number)?.opzioni_prezzo || []).length > 0 && (
                <select className={cn(campo, "w-44")} value={pt.pricingOption || ""} onChange={(e) => set({ parti: p.parti.map((x, j) => j === i ? { ...x, pricingOption: e.target.value || undefined } : x) })}>
                  <option value="">Prezzo standard</option>
                  {ricambi.find((r) => r.codice === pt.number)!.opzioni_prezzo.map((o) => <option key={o.codice} value={o.codice}>{o.nome} {euro(o.prezzo)}</option>)}
                </select>)}
              <Button size="icon" variant="ghost" onClick={() => set({ parti: p.parti.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>))}
          <p className="text-[11px] text-muted-foreground">Display con danno: copertura VMI_YELLOW (prezzo di assistenza) o VMI_RED, altrimenti Apple dà STOP. BATTERY/DISPLAY solo per i mail-in.</p>
          <div className="max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted"><tr><th className="p-1 text-left">Codice</th><th className="p-1 text-left">Descrizione</th><th className="p-1">Tipo</th><th className="p-1 text-right">Sostituzione</th><th className="p-1 text-right">Stock</th><th /></tr></thead>
              <tbody>{ricambi.slice(0, 200).map((r) => (
                <tr key={r.codice} className="border-t">
                  <td className="p-1 font-mono">{r.codice}{r.consigliato ? " ⭐" : ""}</td><td className="p-1">{r.descrizione}</td><td className="p-1 text-center">{r.tipo}</td>
                  <td className="p-1 text-right">{euro(r.prezzo_sostituzione)}</td><td className="p-1 text-right">{euro(r.prezzo_stock)}</td>
                  <td className="p-1"><Button size="sm" variant="ghost" disabled={p.parti.some((x) => x.number === r.codice)}
                    onClick={() => set({ parti: [...p.parti, { number: r.codice, descrizione: r.descrizione, prezzo: r.prezzo_sostituzione, serializzato: r.serializzato }] })}>Aggiungi</Button></td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="rounded-lg border p-2">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">Domande Apple
              <Button size="sm" variant="outline" disabled={!!busy} onClick={caricaDomande}>{busy === "domande" ? <Loader2 className="animate-spin" /> : null}Leggi le domande</Button>
              {domande && !domande.length && <Pill tono="verde">nessuna domanda</Pill>}
              {mancanti.length > 0 && <Pill tono="rosso">{mancanti.length} obbligatorie senza risposta</Pill>}
            </div>
            {(domande || []).flatMap((t) => t.trees.map((tr) => <AlberoDomande key={`${t.templateId}${tr.treeId}`} domande={tr.questions} risposte={risposte} onChange={setRisposte} />))}
          </div>
        </div>)}

      {passo === 4 && (
        <div className="space-y-3">
          <Campo label="Nota del cliente — cosa riferisce (CUSTOMER_INTAKE_NOTES)"><textarea className={area} rows={3} value={p.nota_cliente} onChange={(e) => set({ nota_cliente: e.target.value })} /></Campo>
          <Campo label="Nota del tecnico (TECHNICIAN)"><textarea className={area} rows={3} value={p.nota_tecnico} onChange={(e) => set({ nota_tecnico: e.target.value })} /></Campo>
          <div className="rounded-lg border p-2 text-sm">
            <div className="mb-1 font-semibold">Allegati (max 10 MB)</div>
            <div className="flex flex-wrap gap-2">
              {[["POP", "Prova d'acquisto (POP)"], ["REPAIR", "Foto/documento riparazione"], ["ADDITIONAL_REVIEW", "Per la verifica Apple"]].map(([t, n]) => (
                <label key={t} className="flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"><Paperclip className="size-3.5" />{n}
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.txt,.zip" disabled={!!busy || ro} onChange={(e) => allega(e.target.files?.[0], t)} /></label>))}
              {busy === "allegato" && <Loader2 className="size-4 animate-spin" />}
            </div>
            {(p.allegati || []).map((a, i) => <div key={a.id} className="mt-1 text-xs">📎 {a.nome || a.id} · {a.type}
              <button className="ml-2 underline" onClick={() => set({ allegati: (p.allegati || []).filter((_, j) => j !== i) })}>togli</button></div>)}
          </div>
        </div>)}

      {passo === 5 && (
        <div className="space-y-3">
          {!riep && (
            <div className="rounded-lg border-2 border-dashed p-3 text-sm">
              <p>Si salva prima la <b>bozza in GSX</b> (stato GX03 «Salvata per dopo», controllabile anche da GSX web), poi compare il riepilogo di Apple con i pulsanti per l&apos;invio.</p>
              <Button className="mt-2" disabled={!!busy || ro} onClick={salvaBozza}>{busy === "bozza" ? <Loader2 className="animate-spin" /> : <Save />}Verifica e salva la bozza</Button>
            </div>)}
          {riep && <RiepilogoApple r={riep} rid={rid} amb={amb} prezzi={Object.fromEntries(p.parti.map((x) => [x.number, x.prezzo ?? null]))} />}
          {esitoInvio && <MessaggiApple esito={esitoInvio} conferme={conferme} onConferma={(id, v) => setConferme((c) => ({ ...c, [id]: v }))} />}
          {riep && !inviata && (
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background/95 py-2 backdrop-blur">
              <Button variant="destructive" disabled={!!busy} onClick={annullaBozza}>{busy === "annulla" ? <Loader2 className="animate-spin" /> : <Trash2 />}Annulla bozza</Button>
              <Button variant="outline" disabled={!!busy} onClick={salvaBozza} title="Ri-salva la bozza con le modifiche">Aggiorna bozza</Button>
              <Button variant="outline" disabled={!!busy} onClick={() => { toast.success(`Bozza ${rid} lasciata in GSX: controllala in «Salvate per dopo»`); onFatto?.(rid); onChiudi?.(); }}>Lascia in bozza (controllo su GSX)</Button>
              <Button disabled={!!busy || (esitoInvio?.da_confermare.length ? esitoInvio.da_confermare.some((m) => !conferme[m.id!]) : false)} onClick={invia}>
                {busy === "invio" ? <Loader2 className="animate-spin" /> : <Send />}Invia ad Apple</Button>
            </div>)}
          {inviata && (
            <div className={cn("rounded-lg border-2 p-3 text-sm", dett?.blocco_credito ? "border-red-500 bg-red-50 dark:bg-red-950/40" : "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30")}>
              <div className="text-base font-bold"><CheckCircle2 className="mr-1 inline size-5" />Riparazione {inviata} inviata ad Apple</div>
              <div className="mt-1">Stato GSX: <Pill tono={tonoStato(dett?.stato)}>{dett?.stato || "…"}</Pill> {dett?.stato_descrizione}
                {dett?.stato === "NEWO" && <span className="ml-1 text-xs"><Loader2 className="inline size-3 animate-spin" /> Apple la sta rilasciando (30-90 s), ricontrollo ogni 15 s</span>}</div>
              {dett?.blocco_credito && <div className="mt-1 font-bold text-red-800 dark:text-red-200">⚠️ BLOCCO CREDITO Apple (POCR): la riparazione è ferma finché l&apos;ufficio crediti Apple non la sblocca. Avvisa Christian/Bagnetti.</div>}
              {dett?.messaggi?.map((m, i) => <div key={i} className="text-xs">{m.livello} {m.codice}: {m.testo}</div>)}
              {onChiudi && <Button className="mt-2" size="sm" variant="outline" onClick={onChiudi}>Chiudi</Button>}
            </div>)}
        </div>)}

      <div className="flex justify-between gap-2 border-t pt-2">
        <Button variant="ghost" disabled={passo === 0} onClick={() => setPasso(passo - 1)}><ChevronLeft />Indietro</Button>
        {passo < PASSI.length - 1 && <Button variant="outline" onClick={() => setPasso(passo + 1)}>Avanti<ChevronRight /></Button>}
      </div>
    </div>);
}

function Blocco({ t, children }: { t: string; children: React.ReactNode }) {
  return <div className="border-b py-2 last:border-0"><div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t}</div>{children}</div>;
}
function Riga({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="grid grid-cols-[170px_1fr] gap-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="min-w-0 break-words">{v || "—"}</span></div>;
}

/** Il riepilogo come il pop-up «Riepilogo» di GSX: dispositivo, riparazione, parti e prezzi con copertura, note, opzioni. */
export function RiepilogoApple({ r, rid, amb, prezzi }: { r: Riepilogo; rid?: string; amb: Ambiente; prezzi?: Record<string, number | null> }) {
  const d = r.dettaglio_apple;
  // UAT 20/11: la BOZZA (GX03) non ha ancora prezzi né «a pagamento»: si usano l'idoneità Apple e il prezzo di sostituzione del ricambio
  const idp = (c: string) => r.idoneita?.parti.find((y) => y.codice === c);
  const parti = d?.parti?.length ? d.parti.map((x) => ({ codice: x.codice, descrizione: x.descrizione,
    prezzo: x.prezzo ?? (idp(x.codice)?.a_pagamento ? prezzi?.[x.codice] ?? null : idp(x.codice) ? 0 : null),
    pagamento: d.bozza ? (idp(x.codice)?.a_pagamento ?? x.a_pagamento) : x.a_pagamento,
    copertura: x.copertura_opzione || x.copertura || idp(x.codice)?.copertura || null })) : r.parti.map((x) => { const id = r.idoneita?.parti.find((y) => y.codice === x.number);
    return { codice: x.number, descrizione: "", prezzo: null, pagamento: id?.a_pagamento ?? null, copertura: x.coverageOption || id?.copertura || null }; });
  const nota = (t: string) => r.note.find((n) => n.type === t)?.content;
  return (
    <div className="rounded-xl border-2 border-gray-300 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-950" data-testid="gsx-riepilogo">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold"> Riepilogo riparazione</span>
        {rid && <Pill tono="ambra">Bozza {rid}</Pill>}
        <Pill tono={amb === "uat" ? "blu" : "rosso"}>{amb === "uat" ? "PROVA Apple" : "PRODUZIONE"}</Pill>
        {d?.stato && <Pill tono={tonoStato(d.stato)}>{d.stato} {d.stato_descrizione}</Pill>}
      </div>
      <Blocco t="Informazioni sul dispositivo">
        <Riga k="Prodotto" v={r.dispositivo.descrizione || d?.dispositivo?.nome} />
        <Riga k="Seriale / IMEI" v={[r.dispositivo.seriale || d?.dispositivo?.seriale, r.dispositivo.imei || d?.dispositivo?.imei].filter(Boolean).join(" · ")} />
        <Riga k="Copertura" v={d?.copertura || r.idoneita?.copertura || r.dispositivo.garanzia} />
        <Riga k="Cliente" v={`${r.cliente.firstName} ${r.cliente.lastName} · ${r.cliente.emailAddress} · ${r.cliente.primaryPhone} · ${r.cliente.address?.[0]?.line1 || ""} ${r.cliente.address?.[0]?.city || ""}`} />
      </Blocco>
      <Blocco t="Informazioni sulla riparazione">
        <Riga k="Tipo" v={`${r.riparazione.tipo} · ${r.riparazione.tipo_nome || ""}${r.riparazione.non_riparazione ? ` · ${r.riparazione.non_riparazione}` : ""}`} />
        <Riga k="Difetti" v={<ul className="space-y-0.5">{(d?.difetti?.length ? d.difetti.map((x, i) => <li key={i}><Pill tono={x.tipo === "CUST" ? "grigio" : "blu"}>{x.tipo}</Pill> {x.componente} → {x.difetto} <span className="text-xs text-muted-foreground">{x.codici}</span></li>)
          : r.riparazione.difetti.map((x, i) => <li key={i}><Pill>{x.type}</Pill> {x.componentCode}/{x.issueCode}</li>))}</ul>} />
        <Riga k="Tecnico" v={`${r.riparazione.tecnico_nome || d?.tecnico || ""} (${r.riparazione.tecnico})`} />
        <Riga k="Ricezione dell'unità" v={dataOra(r.riparazione.ricevuta_il)} />
        <Riga k="N. ordine (PO)" v={r.riparazione.po} />
        <Riga k="Riferimento" v={r.riparazione.riferimento} />
      </Blocco>
      <Blocco t="Parti e prezzi">
        {parti.length ? parti.map((x, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm"><b className="font-mono">{x.codice}</b><span className="min-w-0 flex-1">{x.descrizione}</span>
            <span className="text-xs">{x.copertura}</span><Pill tono={x.pagamento ? "ambra" : "verde"}>{x.pagamento === null ? "—" : x.pagamento ? "a pagamento" : "coperta"}</Pill>
            <b>{x.prezzo !== null && x.prezzo !== undefined ? euro(x.prezzo) : ""}</b></div>)) : <span className="text-sm">Nessuna parte</span>}
        {d?.bozza ? <div className="mt-1 text-right text-sm">Stima Apple (prezzo di sostituzione delle parti a pagamento): <b>{euro(parti.reduce((t, x) => t + (x.pagamento ? Number(x.prezzo) || 0 : 0), 0))}</b>
          <span className="block text-[11px] text-muted-foreground">Il totale definitivo lo calcola Apple all&apos;invio.</span></div>
          : d?.totale && <div className="mt-1 text-right text-sm">Totale Apple: <b>{euro(d.totale)}</b>{d.iva && d.iva !== "0.00" ? ` (IVA ${euro(d.iva)})` : ""}</div>}
      </Blocco>
      <Blocco t="Note">
        <Riga k="Cliente" v={nota("CUSTOMER_INTAKE_NOTES")} />
        <Riga k="Tecnico" v={nota("TECHNICIAN")} />
        {nota("HOLD_REVIEW") && <Riga k="Per la verifica Apple" v={nota("HOLD_REVIEW")} />}
      </Blocco>
      <Blocco t="Opzioni di invio">
        <div className="flex flex-wrap gap-4 text-sm">
          <span>{r.opzioni.completa_subito ? "☑" : "☐"} Contrassegna automaticamente come completata</span>
          <span>{r.opzioni.verifica_apple ? "☑" : "☐"} Richiedi verifica da parte di Apple</span>
        </div>
      </Blocco>
      {r.idoneita && <MessaggiApple esito={r.idoneita} />}
    </div>);
}
