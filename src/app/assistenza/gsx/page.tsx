"use client";

// GSX (11/11/2026, Christian) — tutto quello che Apple sa di un seriale, letto via ponte sul server (backend/gsx_api.py):
// generale e garanzia (anche legale), ricambi con il preventivo pronto, riparazioni GSX con cronologia, seriali sostituiti,
// diagnosi Apple e test disponibili. Si apre dal menu o dal tasto «GSX» accanto al seriale nella scheda (/assistenza/gsx?s=…).
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Apple, ExternalLink, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { toastErrore } from "@/lib/errori";
import {
  gsxAvviaTest, gsxStatoTest, type GsxStatoTest,
  gsxArticoli, gsxArticolo, gsxDiagnosi, gsxDifetti, gsxDispositivo, gsxIdoneita, gsxReport, gsxRiparazione, gsxRiparazioni,
  type GsxArticoli, type GsxDiagnosi, type GsxDifetti, type GsxDispositivo, type GsxIdoneita, type GsxRiparazione,
} from "@/lib/gsx";
import { GsxPannello } from "../scheda/GsxPannello";
import { CatalogoGsx } from "./Catalogo";

const SEZIONI = [
  { id: "generale", nome: "Generale e garanzia" }, { id: "ricambi", nome: "Ricambi e preventivo" },
  { id: "riparazioni", nome: "Riparazioni GSX" }, { id: "sostituzioni", nome: "Seriali sostituiti" },
  { id: "diagnosi", nome: "Diagnosi" }, { id: "difetti", nome: "Difetti e idoneità" }, { id: "articoli", nome: "Articoli e programmi" }, { id: "grezzi", nome: "Tutti i dati" },
] as const;
type Sez = (typeof SEZIONI)[number]["id"];

const data = (s?: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");
const ora = (s?: string | null) => (s ? new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—");

function Riga({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="grid grid-cols-[180px_1fr] gap-2 border-b py-1 text-sm last:border-0"><span className="text-muted-foreground">{k}</span><span>{v ?? "—"}</span></div>;
}

function PaginaGsx() {
  const sp = useSearchParams();
  const router = useRouter();
  const [input, setInput] = useState(sp.get("s") || "");
  const [ser, setSer] = useState(sp.get("s") || "");
  const [sez, setSez] = useState<Sez>((SEZIONI.some((x) => x.id === sp.get("sez")) ? sp.get("sez") : "generale") as Sez);
  const [modo, setModo] = useState<"seriale" | "catalogo">(sp.get("catalogo") ? "catalogo" : "seriale");
  const [g, setG] = useState<GsxDispositivo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rip, setRip] = useState<GsxRiparazione[] | null>(null);
  const [diag, setDiag] = useState<GsxDiagnosi | null>(null);
  const [avvio, setAvvio] = useState<string | null>(null);
  const [statoTest, setStatoTest] = useState<GsxStatoTest | null>(null);
  // 12/11/2026: codici componente → difetto che Apple accetta per il dispositivo (si leggono quando si apre la sezione)
  const [difetti, setDifetti] = useState<GsxDifetti | null>(null);
  const [filtroDif, setFiltroDif] = useState("");
  useEffect(() => { if (sez === "difetti" && ser && (!difetti || difetti.seriale !== ser)) gsxDifetti(ser).then(setDifetti).catch(toastErrore); }, [sez, ser, difetti]);
  // 12/11/2026: idoneità e copertura con un difetto scelto qui (repair/eligibility) · articoli e programmi Apple del modello
  const [idon, setIdon] = useState<GsxIdoneita | null>(null);
  const [idonBusy, setIdonBusy] = useState<string | null>(null);
  async function verificaIdoneita(componentCode: string, issueCode: string) {
    setIdonBusy(`${componentCode}:${issueCode}`);
    try { setIdon(await gsxIdoneita({ s: ser, difetti: [{ componentCode, issueCode, reproducibility: "A" }] })); } catch (e) { toastErrore(e); } finally { setIdonBusy(null); }
  }
  const [arts, setArts] = useState<GsxArticoli | null>(null);
  const [art, setArt] = useState<{ id: string; html: string } | null>(null);
  const [artBusy, setArtBusy] = useState(false);
  useEffect(() => { if (sez === "articoli" && ser && (!arts || arts.seriale !== ser)) gsxArticoli(ser, g?.modello || "").then(setArts).catch(toastErrore); }, [sez, ser, arts, g]);
  const artLink = sp.get("art");
  useEffect(() => { if (sez === "articoli" && artLink && art?.id !== artLink) apriArticolo(artLink); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sez, artLink]);
  async function apriArticolo(id: string) {
    setArtBusy(true);
    try { setArt(await gsxArticolo(id)); } catch (e) { toastErrore(e); } finally { setArtBusy(false); }
  }
  async function aggiornaStato() {
    try { const st = await gsxStatoTest(ser); setStatoTest(st); return st; } catch (e) { toastErrore(e); return null; }
  }
  async function avviaTest(id: string, nome: string) {
    setAvvio(id);
    try {
      const r = await gsxAvviaTest(ser, id);
      if (!r.avviato) { toast.error(`Apple non ha avviato «${nome}»: il dispositivo è acceso, online e in modalità diagnosi?`); return; }
      toast.success(`Test «${nome}» avviato sul dispositivo`);
      // segue l'avanzamento ogni 15 s fino a fine test (max 30 min)
      for (let i = 0; i < 120; i++) {
        const st = await aggiornaStato();
        if (!st || st.stato === "COMPLETED" || st.stato === "NO_DIAGNOSTIC_SESSION") break;
        await new Promise((ok) => setTimeout(ok, 15000));
      }
      gsxDiagnosi(ser).then(setDiag).catch(() => {});
    } catch (e) { toastErrore(e); } finally { setAvvio(null); }
  }
  const [aperta, setAperta] = useState<{ id: string; dettaglio: Record<string, unknown>; cronologia: unknown } | null>(null);

  const carica = useCallback(async (s: string) => {
    if (!s) return;
    setBusy(true); setErr(null); setG(null); setRip(null); setDiag(null); setAperta(null); setDifetti(null); setIdon(null); setArts(null); setArt(null);
    try { setG(await gsxDispositivo(s)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
    gsxRiparazioni(s).then((r) => setRip(r.riparazioni)).catch(() => setRip([]));
    gsxDiagnosi(s).then(setDiag).catch(() => setDiag(null));
  }, []);

  useEffect(() => { if (ser) carica(ser); }, [ser, carica]);

  function cerca() {
    const s = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!s) return;
    router.replace(`/assistenza/gsx?s=${s}`);
    setSer(s);
  }

  async function apriRiparazione(id: string) {
    try { setAperta(await gsxRiparazione(id)); } catch (e) { toastErrore(e); }
  }
  async function apriReport(ev: string) {
    try { const r = await gsxReport(ev); if (r.customerReportUrl) window.open(r.customerReportUrl, "_blank"); } catch (e) { toastErrore(e); }
  }

  return (
    <div className="max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Apple className="h-5 w-5" /> GSX Apple</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tutto quello che Apple sa di un seriale: letto dal GSX di Bagnetti attraverso il nostro server (solo lettura).</p>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant={modo === "seriale" ? "default" : "outline"} onClick={() => setModo("seriale")}>Cerca per seriale</Button>
        <Button size="sm" variant={modo === "catalogo" ? "default" : "outline"} onClick={() => setModo("catalogo")}>Catalogo ricambi completo</Button>
      </div>
      {modo === "catalogo" ? <CatalogoGsx /> : <>
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") cerca(); }}
            placeholder="Seriale o IMEI (es. C02D72RBMD6T)" className="w-full rounded-md border py-1.5 pl-8 pr-2 font-mono text-sm uppercase" autoFocus />
        </div>
        <Button onClick={cerca} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Search />}Cerca su GSX</Button>
        {ser && <a className="inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted" target="_blank" rel="noreferrer"
          href={`https://gsx2.apple.com/product-details/${encodeURIComponent(ser)}`}><ExternalLink className="size-3.5" />Apri su gsx2.apple.com</a>}
      </Card>

      {err && <Card className="p-3 text-sm text-red-600">{err}</Card>}

      {g && (
        <>
          <div className="flex flex-wrap gap-1">
            {SEZIONI.map((x) => (
              <Button key={x.id} size="sm" variant={sez === x.id ? "default" : "outline"} onClick={() => setSez(x.id)}>
                {x.nome}{x.id === "riparazioni" && rip ? ` (${rip.length})` : ""}{x.id === "sostituzioni" ? ` (${g.sostituzioni.length})` : ""}{x.id === "diagnosi" && diag ? ` (${diag.eventi.length})` : ""}
              </Button>
            ))}
          </div>

          {sez === "generale" && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-3">
                <div className="mb-2 flex items-center gap-3">
                  {g.immagine && <img src={g.immagine} alt="" className="size-16 object-contain" />}
                  <div><div className="font-semibold">{g.modello}</div><div className="text-xs text-muted-foreground">{g.configurazione}</div></div>
                </div>
                <Riga k="Seriale" v={<span className="font-mono">{g.seriale}</span>} />
                {g.imei && <Riga k="IMEI" v={<span className="font-mono">{g.imei}{g.imei2 ? ` · ${g.imei2}` : ""}</span>} />}
                <Riga k="Famiglia Apple" v={g.famiglia_apple} />
                <Riga k="Prima attivazione" v={data(g.prima_attivazione)} />
                <Riga k="Operatore telefonico" v={g.operatore_telefonico ? `${g.operatore_telefonico}${g.sbloccato_operatore === false ? " (bloccato)" : g.sbloccato_operatore ? " (sbloccato)" : ""}` : "—"} />
                <Riga k="Dispositivo in prestito" v={g.prestito ? "sì" : "no"} />
                <Riga k="Letto su GSX" v={ora(g.letto_il)} />
                {/* 12/11/2026: dalla pagina GSX si apre la scheda del gestionale con questo seriale */}
                {!!g.schede_gestionale?.length && <Riga k="Schede del gestionale" v={<span className="flex flex-wrap gap-1">{g.schede_gestionale.map((x) => (
                  <a key={x.id} href={`/assistenza?id=${x.id}`} className="rounded border px-1.5 py-0.5 font-mono text-xs hover:bg-muted" title={`${x.prodotto || ""} ${x.modello || ""} · ${x.creata}`}>{x.sigla} <span className="font-sans text-muted-foreground">{x.stato}</span></a>))}</span>} />}
                {g.dep && <Riga k="DEP / MDM aziendale" v={<b className="text-violet-700">sì</b>} />}
                {g.modalita_riparazione != null && <Riga k="Modalità riparazione" v={g.modalita_riparazione ? <b className="text-emerald-700">attiva</b> : "no"} />}
                {g.sostituito && <Riga k="Sostituito da Apple" v={<b className="text-red-700">sì → nuovo S/N {g.sostituito.seriale_nuovo}</b>} />}
                {g.configurazione_completa && <details className="mt-2 text-xs"><summary className="cursor-pointer">Configurazione completa</summary><pre className="whitespace-pre-wrap">{g.configurazione_completa}</pre></details>}
              </Card>
              <Card className="p-3">
                <div className="mb-2 font-semibold">Garanzia</div>
                {g.dati_nascosti && <div className="mb-2 text-sm text-amber-700">Apple nasconde garanzia e acquisto: di solito «Trova il mio» è attivo.</div>}
                <Riga k="Garanzia Apple" v={g.garanzia} />
                <Riga k="Giorni rimasti" v={g.giorni_garanzia} />
                <Riga k="Fine copertura" v={data(g.fine_copertura)} />
                <Riga k="Data e paese acquisto" v={`${data(g.data_acquisto)}${g.paese_acquisto ? ` · ${g.paese_acquisto}` : ""}`} />
                <Riga k="Ricambi / manodopera" v={`${g.ricambi_coperti ? "coperti" : "non coperti"} / ${g.manodopera_coperta ? "coperta" : "non coperta"}`} />
                <Riga k="AppleCare+" v={g.applecare === "Y" ? "sì" : g.applecare === "N" ? "no" : "—"} />
                {g.tipo_contratto && <Riga k="Contratto" v={`${g.tipo_contratto}${g.contratto_fine ? ` · fino al ${data(g.contratto_fine)}` : ""}`} />}
                {g.registrato_il && <Riga k="Registrato il" v={data(g.registrato_il)} />}
                {!!g.codici_cs?.length && <Riga k="Codici CS Apple" v={g.codici_cs.map((c) => `${c.codice}${c.nota ? ` · ${c.nota}` : ""}`).join(" · ")} />}
                {!!g.consumer_law?.length && <Riga k="Consumer law" v={g.consumer_law.map((c) => `${c.tipo || ""}${c.pop_obbligatoria ? " (serve la prova d'acquisto)" : ""}`).join(" · ")} />}
                {g.garanzia_legale && (
                  <Riga k="Garanzia legale (24 mesi)" v={<span className={g.garanzia_legale.attiva ? "font-semibold text-emerald-700" : ""}>
                    {g.garanzia_legale.attiva ? `ATTIVA fino al ${data(g.garanzia_legale.fino)} (${g.garanzia_legale.giorni} gg)` : `scaduta il ${data(g.garanzia_legale.fino)}`}
                    <span className="block text-xs font-normal text-muted-foreground">dal {data(g.garanzia_legale.dal)} ({g.garanzia_legale.fonte}). {g.garanzia_legale.nota}</span></span>} />
                )}
                {g.coperture.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs">{g.coperture.map((c, i) => <li key={i}>{c}</li>)}</ul>}
                {g.messaggi.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs">{g.messaggi.map((c, i) => <li key={i}>{c}</li>)}</ul>}
                {g.pratiche_apple.length > 0 && <div className="mt-2 text-xs">Pratiche Apple: {g.pratiche_apple.map((c) => `${c.caseId} (${data(c.createdDateTime)}${c.summary ? ` · ${c.summary}` : ""})`).join(" · ")}</div>}
              </Card>
            </div>
          )}

          {sez === "ricambi" && <GsxPannello g={g} autoRicambi compatto />}

          {sez === "riparazioni" && (
            <Card className="overflow-x-auto p-3">
              {!rip ? <Loader2 className="animate-spin" /> : rip.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna riparazione GSX su questo seriale dall&apos;account Bagnetti.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground"><tr><th className="p-1">Riparazione</th><th>Tipo</th><th>Stato</th><th>Creata</th><th>Chiusa</th><th>PO</th><th>Difetto</th><th>Ricambi</th></tr></thead>
                  <tbody>{rip.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="p-1"><button className="font-mono font-semibold underline" onClick={() => apriRiparazione(r.id)}>{r.id}</button></td>
                      <td>{r.tipo}</td><td>{r.stato}</td><td>{data(r.creata)}</td><td>{data(r.chiusa)}</td><td>{r.po}</td>
                      <td className="text-xs">{r.difetti.join("; ")}{r.applecare_consumato ? " · AppleCare+ usato" : ""}</td>
                      <td className="text-xs">{r.ricambi.map((p) => `${p.codice} ${p.descrizione}`).join("; ")}</td>
                    </tr>))}</tbody>
                </table>)}
              {aperta && (
                <div className="mt-3 border-t pt-2 text-xs">
                  <div className="mb-1 font-semibold">Riparazione {aperta.id} — dettaglio e cronologia</div>
                  {Array.isArray(aperta.cronologia) && (
                    <table className="mb-2 w-full"><tbody>{(aperta.cronologia as { action?: string; timeStamp?: string; modifiedBy?: { firstName?: string; lastName?: string }; record?: { name?: string; newValue?: string; oldValue?: string; record?: { name?: string; newValue?: string } } }[]).map((a, i) => (
                      <tr key={i} className="border-t"><td className="py-0.5 pr-2">{ora(a.timeStamp)}</td><td className="pr-2">{a.action}</td>
                        <td className="pr-2">{a.record?.name}{a.record?.oldValue ? ` ${a.record.oldValue}` : ""}{a.record?.newValue ? ` → ${a.record.newValue}` : ""}{a.record?.record ? ` (${a.record.record.name} → ${a.record.record.newValue})` : ""}</td>
                        <td>{[a.modifiedBy?.firstName, a.modifiedBy?.lastName].filter(Boolean).join(" ")}</td></tr>))}</tbody></table>
                  )}
                  <details><summary className="cursor-pointer">Dettaglio completo Apple</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap">{JSON.stringify(aperta.dettaglio, null, 2)}</pre></details>
                </div>
              )}
            </Card>
          )}

          {sez === "sostituzioni" && (
            <Card className="p-3">
              {g.sostituzioni.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna sostituzione: è il dispositivo originale.</p> : (
                <table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr><th>Data</th><th>Stato</th><th>Seriale vecchio</th><th>Seriale nuovo</th><th>IMEI</th></tr></thead>
                  <tbody>{g.sostituzioni.map((x, i) => <tr key={i} className="border-t"><td>{data(x.data)}</td><td>{x.stato}</td><td className="font-mono">{x.seriale_vecchio}</td><td className="font-mono">{x.seriale_nuovo}</td><td className="font-mono text-xs">{x.imei_vecchio}{x.imei_nuovo ? ` → ${x.imei_nuovo}` : ""}</td></tr>)}</tbody></table>)}
            </Card>
          )}

          {sez === "diagnosi" && (
            <div className="space-y-3">
              {!diag ? <Loader2 className="animate-spin" /> : (
                <>
                  <Card className="p-3 text-sm">
                    <div className="mb-1 font-semibold">Test che Apple permette di lanciare su questo dispositivo</div>
                    {diag.test_disponibili.length === 0 ? <div className="text-muted-foreground">{diag.errore_test || "nessuno"}</div> : (
                      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">{diag.test_disponibili.map((t) => <li key={t.id} className="flex items-center gap-2">
                        <button disabled={!!avvio} onClick={() => avviaTest(t.id, t.nome)} className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-50">{avvio === t.id ? <Loader2 className="size-3 animate-spin" /> : "▶"} Avvia</button>
                        {t.nome} <span className="text-muted-foreground">({t.minuti.minimum}-{t.minuti.maximum} min)</span></li>)}</ul>)}
                    {statoTest && <div className="mt-2 rounded-md bg-muted p-2 text-xs">Stato test: <b>{statoTest.stato_it}</b>{statoTest.test ? ` · ${statoTest.test}` : ""}{statoTest.stato === "IN_PROGRESS" ? ` · ${statoTest.percento}%` : ""}
                      <button className="ml-2 underline" onClick={aggiornaStato}>aggiorna</button></div>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {diag.console && <a className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted" href={diag.console} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" />Apri Apple Service Toolkit (AST 2)</a>}
                      <span className="text-xs text-muted-foreground">Lanciare i test da qui: {diag.lanciare_test}</span>
                    </div>
                  </Card>
                  <Card className="overflow-x-auto p-3">
                    <div className="mb-1 text-sm font-semibold">Diagnosi fatte negli ultimi 12 mesi</div>
                    {diag.eventi.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna diagnosi Apple registrata.</p> : diag.eventi.map((e) => (
                      <details key={e.evento} className="border-t py-1 text-sm">
                        <summary className="cursor-pointer"><b className={e.esito === "SUPERATO" ? "text-emerald-700" : "text-amber-700"}>{e.esito}</b> · {e.suite} · {ora(e.inizio)} · {e.canale}
                          {e.report_cliente && <button className="ml-2 text-xs underline" onClick={(ev) => { ev.preventDefault(); apriReport(e.evento); }}>report cliente</button>}</summary>
                        <ul className="pl-4 text-xs">{e.test.map((t, i) => <li key={i}>{t.esito} — {t.nome}</li>)}</ul>
                      </details>))}
                  </Card>
                </>)}
            </div>
          )}

          {sez === "difetti" && (
            <Card className="p-3 text-sm">
              {idon && (
                <div className={`mb-3 rounded-md border p-2 text-xs ${idon.bloccata ? "border-red-300 bg-red-50 dark:bg-red-950/30" : idon.coperto ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200"}`}>
                  <div className="font-semibold">Idoneità Apple con il difetto {idon.difetti.map((d) => `${d.componentCode} → ${d.issueCode}`).join(", ")}: {idon.copertura || "—"}{idon.bloccata ? " · BLOCCATA" : ""}</div>
                  {idon.blocchi.length > 0 && <ul className="list-disc pl-4 text-red-800">{idon.blocchi.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                  <div>Ricambi: {idon.parti.map((p) => <span key={p.codice} className={`mr-2 ${p.coperto ? "font-semibold text-emerald-700" : ""}`}>{p.codice} {p.coperto ? "COPERTO" : "a pagamento"}</span>)}</div>
                  {idon.tipi_riparazione.length > 0 && <div className="text-muted-foreground">Tipi ammessi: {idon.tipi_riparazione.map((t) => t.nome).join(" · ")}</div>}
                  <div className="text-muted-foreground">Tecnico certificato obbligatorio: {idon.tecnico_obbligatorio ? "sì" : "no"}{idon.trova_il_mio ? " · «Trova il mio» ATTIVO (lo dice Apple)" : ""}</div>
                </div>
              )}
              <div className="mb-2 flex flex-wrap items-center gap-2"><b>Codici componente → difetto ammessi da Apple per questo dispositivo</b>
                <span className="text-xs text-muted-foreground">servono per aprire una riparazione GSX e per le sezioni «per difetto» della scheda · con «idoneità» Apple dice copertura e blocchi per quel difetto</span>
                <input value={filtroDif} onChange={(e) => setFiltroDif(e.target.value)} placeholder="Filtra: display, battery, logic…" className="ml-auto h-8 w-56 rounded-md border px-2 text-xs" /></div>
              {!difetti ? <Loader2 className="animate-spin" /> : difetti.componenti.length === 0 ? <p className="text-muted-foreground">Apple non restituisce codici per questo dispositivo.</p> : (
                <div className="grid gap-2 md:grid-cols-2">{difetti.componenti.filter((c) => !filtroDif || `${c.codice} ${c.componente} ${c.difetti.map((d) => d.descrizione).join(" ")}`.toLowerCase().includes(filtroDif.toLowerCase())).map((c) => (
                  <div key={c.codice} className="rounded-md border p-2 text-xs"><div className="font-semibold"><span className="font-mono">{c.codice}</span> {c.componente}</div>
                    <ul className="mt-1 pl-3">{c.difetti.map((d) => <li key={d.codice} className="flex items-center gap-1"><span className="font-mono text-muted-foreground">{d.codice}</span> {d.descrizione}
                      <button type="button" disabled={!!idonBusy} className="ml-auto rounded border px-1 text-[10px] hover:bg-muted disabled:opacity-50" title="Idoneità e copertura Apple con questo difetto (sui componenti principali)" onClick={() => verificaIdoneita(c.codice, d.codice)}>{idonBusy === `${c.codice}:${d.codice}` ? "…" : "idoneità"}</button></li>)}</ul></div>))}</div>)}
            </Card>
          )}

          {sez === "articoli" && (
            <div className="grid gap-3 lg:grid-cols-[380px_1fr]">
              <Card className="max-h-[75vh] overflow-y-auto p-3 text-sm">
                {!arts ? <Loader2 className="animate-spin" /> : (
                  <>
                    <div className="mb-1 font-semibold text-amber-800">Programmi e problemi noti del modello ({arts.programmi.length + arts.del_modello.length})</div>
                    {[...arts.programmi, ...arts.del_modello].length === 0 && <p className="text-xs text-muted-foreground">Nessun articolo che citi questo modello.</p>}
                    <ul className="space-y-1 text-xs">{[...arts.programmi, ...arts.del_modello].map((a) => <li key={a.id}><button type="button" className={`text-left hover:underline ${art?.id === a.id ? "font-semibold" : ""}`} onClick={() => apriArticolo(a.id)}>{a.titolo}</button></li>)}</ul>
                    <div className="mb-1 mt-3 font-semibold">Altri articoli Apple per questo dispositivo ({arts.altri.length})</div>
                    <ul className="space-y-1 text-xs">{arts.altri.map((a) => <li key={a.id}><button type="button" className={`text-left hover:underline ${art?.id === a.id ? "font-semibold" : ""}`} onClick={() => apriArticolo(a.id)}>{a.titolo}</button></li>)}</ul>
                  </>)}
              </Card>
              <Card className="min-h-[300px] p-3">
                {artBusy ? <Loader2 className="animate-spin" /> : art ? (
                  <iframe title={`Articolo Apple ${art.id}`} sandbox="" className="h-[75vh] w-full rounded border bg-white" srcDoc={art.html} />
                ) : <p className="text-sm text-muted-foreground">Scegli un articolo a sinistra: si legge qui, com&apos;è su GSX.</p>}
              </Card>
            </div>
          )}

          {sez === "grezzi" && <Card className="p-3"><pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ dispositivo: g, riparazioni: rip, diagnosi: diag, difetti, idoneita: idon, articoli: arts }, null, 2)}</pre></Card>}
        </>
      )}
      </>}
    </div>
  );
}

export default function GsxPage() {
  return <Suspense fallback={<div className="p-6"><Loader2 className="animate-spin" /></div>}><PaginaGsx /></Suspense>;
}
