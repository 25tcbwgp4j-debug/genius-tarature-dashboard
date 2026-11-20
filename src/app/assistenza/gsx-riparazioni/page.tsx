"use client";
// 20/11/2026 (G-14, Christian: «gestione GSX completa»): pagina RIPARAZIONI APPLE GSX — nuova riparazione da seriale,
// riparazioni aperte dal gestionale con la gestione, resi KBB, escalation (albero domande Apple), ordini di stock, fatture,
// ricerca avanzata GSX e (solo titolare) chiamata libera. Selettore ambiente PROVA Apple / PRODUZIONE sempre in alto.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toastErrore } from "@/lib/errori";
import { fetchAPI } from "@/lib/api";
import { area, campo, Campo, Modale, Pill, Sezione } from "../scheda/ui";
import {
  ripCerca, ripDocumento, ripElenco, ripEscAggiorna, ripEscCrea, ripEscDettaglio, ripEscOpzioni, ripFatture, ripOrdine, ripOrdini, ripResi,
  risposteAlbero, type Ambiente, type EscOpzioni, type InfoAmbiente, type Reso, type Risposte, type RigaRiparazione,
} from "@/lib/gsxRip";
import { AlberoDomande, SelettoreAmbiente, dataOra, tonoStato, useAmbiente } from "./comuni";
import { Procedura } from "./Procedura";
import { GestioneRiparazione } from "./Gestione";

const SEZ = [["nuova", "Nuova riparazione"], ["riparazioni", "Riparazioni"], ["resi", "Resi"], ["escalation", "Escalation"],
  ["ordini", "Ordini di stock"], ["fatture", "Fatture"], ["ricerca", "Ricerca GSX"], ["libera", "Chiamata libera"]] as const;
type Sez = (typeof SEZ)[number][0];

export default function PaginaRiparazioniGsx() {
  const [amb, setAmb, info] = useAmbiente();
  const [sez, setSez] = useState<Sez>("nuova");
  return (
    <div className="mx-auto max-w-[1400px] space-y-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold"> Riparazioni Apple GSX</h1>
        <div className="ml-auto"><SelettoreAmbiente amb={amb} onChange={setAmb} info={info} /></div>
      </div>
      <div className="flex flex-wrap gap-1">
        {SEZ.map(([k, n]) => <button key={k} onClick={() => setSez(k)} className={cn("rounded-md border px-3 py-1.5 text-sm font-medium", sez === k ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{n}</button>)}
      </div>
      {sez === "nuova" && <Sezione titolo="Apri riparazione Apple (da seriale, senza scheda)"><Procedura key={amb} amb={amb} info={info} /></Sezione>}
      {sez === "riparazioni" && <Riparazioni amb={amb} info={info} />}
      {sez === "resi" && <Resi amb={amb} />}
      {sez === "escalation" && <Escalation amb={amb} />}
      {sez === "ordini" && <Ordini amb={amb} />}
      {sez === "fatture" && <Fatture amb={amb} />}
      {sez === "ricerca" && <Ricerca amb={amb} />}
      {sez === "libera" && <Libera amb={amb} />}
    </div>);
}

function Riparazioni({ amb, info }: { amb: Ambiente; info: InfoAmbiente | null }) {
  const [righe, setRighe] = useState<RigaRiparazione[] | null>(null);
  const [rid, setRid] = useState("");
  const [apri, setApri] = useState<{ rid: string; amb: Ambiente } | null>(null);
  useEffect(() => { ripElenco(amb).then((x) => setRighe(x.riparazioni)).catch(toastErrore); }, [amb]);
  return (
    <Sezione titolo="Riparazioni aperte dal gestionale" azioni={<div className="flex gap-1"><input className={cn(campo, "w-40")} placeholder="Numero G…" value={rid} onChange={(e) => setRid(e.target.value.toUpperCase())} />
      <Button size="sm" disabled={!rid} onClick={() => setApri({ rid, amb })}>Apri</Button></div>}>
      {!righe ? <Loader2 className="animate-spin" /> : !righe.length ? <p className="text-sm text-muted-foreground">Nessuna riparazione in questo ambiente.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="p-1">Numero</th><th className="p-1">Stato</th><th className="p-1">Seriale</th><th className="p-1">Tipo</th><th className="p-1">PO</th><th className="p-1">Tecnico</th><th className="p-1">Creata</th><th /></tr></thead>
          <tbody>{righe.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-1 font-mono font-semibold">{r.repair_id}</td><td className="p-1"><Pill tono={tonoStato(r.stato)}>{r.stato}</Pill> <span className="text-xs">{r.stato_descrizione}</span></td>
              <td className="p-1">{r.seriale}</td><td className="p-1">{r.tipo}</td><td className="p-1">{r.po}</td><td className="p-1">{r.tecnico_nome}</td><td className="p-1 text-xs">{dataOra(r.created_at)}</td>
              <td className="p-1"><Button size="sm" variant="outline" onClick={() => setApri({ rid: r.repair_id, amb: r.ambiente })}>Gestisci</Button></td>
            </tr>))}</tbody>
        </table></div>)}
      {apri && <Modale largo titolo={`Riparazione ${apri.rid}`} onClose={() => { setApri(null); ripElenco(amb).then((x) => setRighe(x.riparazioni)).catch(() => {}); }}>
        <GestioneRiparazione rid={apri.rid} amb={apri.amb} info={info} /></Modale>}
    </Sezione>);
}

function Resi({ amb }: { amb: Ambiente }) {
  const [tipo, setTipo] = useState("PARTS_PENDING_RETURN");
  const [rid, setRid] = useState("");
  const [parti, setParti] = useState<Reso[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function cerca() { setBusy(true); try { setParti((await ripResi({ amb, tipo, repairId: rid || undefined })).parti); } catch (e) { toastErrore(e); } finally { setBusy(false); } }
  return (
    <Sezione titolo="Resi delle parti ad Apple" sottotitolo="Italia: gratis entro 20 giorni dalla spedizione della parte nuova (dal 21° rischio addebito)">
      <div className="mb-2 flex flex-wrap gap-2">
        <select className={cn(campo, "w-56")} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="PARTS_PENDING_RETURN">Parti da rendere</option><option value="RETURN_REPORT">Report resi</option><option value="REGISTERED">Registrate</option><option value="PENDING">In attesa</option></select>
        <input className={cn(campo, "w-44")} placeholder="Numero G (facoltativo)" value={rid} onChange={(e) => setRid(e.target.value.toUpperCase())} />
        <Button size="sm" onClick={cerca} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Search />}Cerca</Button>
      </div>
      {parti && (parti.length ? parti.map((x) => (
        <div key={`${x.repairId}${x.sequenza}${x.parte}`} className="flex flex-wrap items-center gap-2 border-b py-1 text-sm">
          <b className="font-mono">{x.repairId}</b> #{x.sequenza} <b>{x.parte}</b> {x.descrizione} · {x.motivo} · {x.stato}
          <Pill tono={x.livello === "scaduto" ? "rosso" : x.livello === "urgente" ? "ambra" : "verde"}>{x.scade_il ? `scade ${x.scade_il.split("-").reverse().join("/")} (${x.giorni_rimasti} gg)` : "scadenza ?"}</Pill>
          <Button size="sm" variant="outline" onClick={() => ripDocumento(amb, "returnLabel", [{ repairId: x.repairId, returnType: x.tipo_reso || "CI_ON_REPAIR_RETURN_KBB", sequenceNumber: String(x.sequenza), ...(x.ordine_reso ? { returnOrderNumber: x.ordine_reso } : {}) }]).catch(toastErrore)}><Tag />Etichetta</Button>
        </div>)) : <p className="text-sm text-muted-foreground">Nessuna parte.</p>)}
      <p className="mt-2 text-xs text-muted-foreground">Per registrare il reso (bulk return) e confermare la spedizione apri la riparazione → «Resi ad Apple».</p>
    </Sezione>);
}

function Escalation({ amb }: { amb: Ambiente }) {
  const [o1, setO1] = useState<EscOpzioni | null>(null);
  const [o2, setO2] = useState<EscOpzioni | null>(null);
  const [r, setR] = useState<Risposte>({});
  const [busy, setBusy] = useState("");
  const [id, setId] = useState("");
  const [det, setDet] = useState<Record<string, unknown> | null>(null);
  const [nota, setNota] = useState("");
  const alberi = (o: EscOpzioni | null) => (o?.trees || []).map((t) => ({ escalationTreeId: t.escalationTreeId, questions: risposteAlbero(t.questions, r) })).filter((t) => t.questions.length);
  async function passo1() { setBusy("1"); try { setO1(await ripEscOpzioni(amb, {})); setO2(null); setR({}); } catch (e) { toastErrore(e); } finally { setBusy(""); } }
  async function passo2() {
    setBusy("2");
    try { setO2(await ripEscOpzioni(amb, { correlationId: o1?.correlationId, escalationTemplateId: o1?.escalationTemplateId, trees: alberi(o1) })); }
    catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function crea(tipo: string) {
    setBusy("crea");
    try {
      const x = await ripEscCrea({ amb, corpo: { escalationTypeCode: tipo, correlationId: o2?.correlationId || o1?.correlationId,
        escalationQuestionDetails: [{ escalationTemplateId: o2?.escalationTemplateId || o1?.escalationTemplateId, trees: [...alberi(o1), ...alberi(o2)] }] } });
      toast.success(x.escalationId ? `Escalation ${x.escalationId} creata` : "Inviata: la risposta arriva per e-mail"); if (x.escalationId) setId(x.escalationId);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Sezione titolo="Nuova escalation (GSXHELP / e-mail)" sottotitolo="es. «I need help with a repair» → «GSX Repair Intervention» → «Cancellation Request» (RCR)">
        <Button size="sm" onClick={passo1} disabled={!!busy}>{busy === "1" && <Loader2 className="animate-spin" />}1. Leggi le domande Apple</Button>
        {o1 && <div className="mt-2 space-y-2">{(o1.trees || []).map((t) => <AlberoDomande key={t.escalationTreeId} domande={t.questions} risposte={r} onChange={setR} />)}
          <Button size="sm" onClick={passo2} disabled={!!busy}>{busy === "2" && <Loader2 className="animate-spin" />}2. Continua</Button></div>}
        {o2 && <div className="mt-2 space-y-2">
          {(o2.trees || []).map((t) => <AlberoDomande key={t.escalationTreeId} domande={t.questions} risposte={r} onChange={setR} />)}
          {!(o2.options || []).length && <p className="text-sm">Apple: nessuna escalation disponibile per questa scelta (solo articoli di aiuto).</p>}
          <div className="flex flex-wrap gap-2">{(o2.options || []).map((op) => (
            <Button key={op.optionId} size="sm" variant={op.optionId === "create_help" ? "default" : "outline"} disabled={!!busy || op.optionId === "create_chat"}
              title={op.optionMessage} onClick={() => crea(op.optionId === "create_feedback" ? "EMAIL" : "GSXHELP")}>
              {op.optionDescription || op.optionId}{op.optionId === "create_chat" ? " (solo da GSX web)" : ""}</Button>))}</div></div>}
      </Sezione>
      <Sezione titolo="Escalation esistente">
        <div className="flex gap-2"><input className={campo} placeholder="Numero escalation" value={id} onChange={(e) => setId(e.target.value)} />
          <Button size="sm" onClick={async () => { try { setDet(await ripEscDettaglio(id, amb)); } catch (e) { toastErrore(e); } }}>Leggi</Button></div>
        {det && <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(det, null, 1)}</pre>}
        {id && <div className="mt-2 space-y-1">
          <textarea className={area} rows={2} placeholder="Nota" value={nota} onChange={(e) => setNota(e.target.value)} />
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" disabled={!nota} onClick={() => ripEscAggiorna({ amb, escalationId: id, nota }).then(() => toast.success("Nota aggiunta")).catch(toastErrore)}>Aggiungi nota</Button>
            <Button size="sm" variant="outline" onClick={() => ripEscAggiorna({ amb, escalationId: id, stato: "CLOSED", nota: nota || undefined }).then(() => toast.success("Chiusa")).catch(toastErrore)}>Chiudi</Button>
            <Button size="sm" variant="destructive" onClick={() => window.confirm("Cancellare la bozza di escalation?") && ripEscAggiorna({ amb, escalationId: id, stato: "DELETED" }).then(() => toast.success("Bozza cancellata")).catch(toastErrore)}>Cancella bozza</Button>
          </div></div>}
      </Sezione>
    </div>);
}

function Ordini({ amb }: { amb: Ambiente }) {
  const [q, setQ] = useState("");
  const [ris, setRis] = useState<unknown>(null);
  const [carrello, setCarrello] = useState<{ number: string; quantity: number }[]>([]);
  const [po, setPo] = useState("");
  const [id, setId] = useState("");
  const vai = (p: Promise<{ dati: unknown }>) => p.then((x) => setRis(x.dati)).catch(toastErrore);
  const elenco = Array.isArray(ris) ? (ris as Record<string, unknown>[]) : null;
  return (
    <Sezione titolo="Ordini di stock">
      <div className="flex flex-wrap gap-2">
        <input className={cn(campo, "w-64")} placeholder="Descrizione (inglese), part number o seriale" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button size="sm" onClick={() => vai(ripOrdini("ricambi", amb, /^\d{3}-/.test(q) ? { partNumber: q } : /^[A-Z0-9]{10,12}$/.test(q) ? { device: { id: q } } : { description: q }))}>Cerca ricambi</Button>
        <Button size="sm" variant="outline" onClick={() => vai(ripOrdini("cerca", amb, { orderStatusCodes: ["OPEN", "SAVED", "NEW"] }))}>Ordini aperti</Button>
        <input className={cn(campo, "w-40")} placeholder="GS…" value={id} onChange={(e) => setId(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!id} onClick={() => ripOrdine(id, amb).then((x) => setRis(x.dati)).catch(toastErrore)}>Dettaglio</Button>
      </div>
      {elenco && <div className="mt-2 max-h-80 overflow-auto text-xs">{elenco.map((x, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 border-b py-1">
          <span className="font-mono">{String(x.partNumber || x.orderId || "")}</span><span className="flex-1">{String(x.description || x.orderStatusDescription || "")}</span>
          <span>{String(x.stockPrice ?? "")}</span>
          {!!x.partNumber && <Button size="sm" variant="ghost" onClick={() => setCarrello([...carrello, { number: String(x.partNumber), quantity: 1 }])}>+ ordine</Button>}
        </div>))}</div>}
      {!elenco && !!ris && <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(ris, null, 1)}</pre>}
      {carrello.length > 0 && (
        <div className="mt-2 rounded-lg border p-2 text-sm">
          {carrello.map((c, i) => <div key={i} className="flex items-center gap-2">{c.number}<input type="number" min={1} className={cn(campo, "h-7 w-20")} value={c.quantity}
            onChange={(e) => setCarrello(carrello.map((y, j) => j === i ? { ...y, quantity: Math.max(1, +e.target.value) } : y))} /></div>)}
          <input className={cn(campo, "mt-1 w-48")} placeholder="PO" value={po} onChange={(e) => setPo(e.target.value)} />
          <div className="mt-1 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => ripOrdini("crea", amb, { action: "SAVE", parts: carrello, purchaseOrderNumber: po || undefined }).then((x) => { setRis(x.dati); toast.success("Ordine salvato (bozza)"); }).catch(toastErrore)}>Salva bozza</Button>
            <Button size="sm" onClick={() => window.confirm("Inviare l'ordine ad Apple?") && ripOrdini("crea", amb, { action: "CONFIRM", parts: carrello, purchaseOrderNumber: po || undefined }).then((x) => { setRis(x.dati); toast.success("Ordine inviato"); setCarrello([]); }).catch(toastErrore)}>Invia ordine</Button>
          </div>
        </div>)}
    </Sezione>);
}

function Fatture({ amb }: { amb: Ambiente }) {
  const [dal, setDal] = useState(() => new Date(new Date().getTime() - 14 * 864e5).toISOString().slice(0, 10));
  const [al, setAl] = useState(() => new Date().toISOString().slice(0, 10));
  const [righe, setRighe] = useState<Record<string, unknown>[] | null>(null);
  return (
    <Sezione titolo="Fatture Apple" sottotitolo="massimo 15 giorni per ricerca · contestazioni entro 30 gg · una fattura scaduta blocca GSX">
      <div className="flex flex-wrap gap-2">
        <input type="date" className={cn(campo, "w-40")} value={dal} onChange={(e) => setDal(e.target.value)} />
        <input type="date" className={cn(campo, "w-40")} value={al} onChange={(e) => setAl(e.target.value)} />
        <Button size="sm" onClick={() => ripFatture({ amb, dal, al }).then((x) => setRighe(x.righe)).catch(toastErrore)}>Cerca</Button>
      </div>
      {righe && <div className="mt-2 text-xs">{righe.length ? righe.map((x, i) => <div key={i} className="flex flex-wrap gap-2 border-b py-1">
        <b>{String(x.invoiceId)}</b> {String(x.invoiceCreateDate || "").slice(0, 10)} · {String(x.invoiceTypeDescription || "")} · {String(x.repairId || "")} · {String(x.partNumber || "")}
        <button className="underline" onClick={() => ripDocumento(amb, "invoice", [{ invoiceId: x.invoiceId, invoiceAssetId: x.invoiceAssetId || "" }]).catch(toastErrore)}>PDF</button></div>) : "Nessuna fattura."}</div>}
    </Sezione>);
}

const MODULI = ["Repairs", "DraftRepairs", "UpdatedRepairs", "CompletedRepairs", "CancelledRepairs", "PartsPendingReturns", "Returns", "CompletedReturns", "BulkReturns",
  "Escalations", "DraftEscalations", "CompletedEscalations", "StockingOrders", "CompletedStockingOrders", "Invoices", "NewInvoices", "Parts", "AppleCareOrders", "ConsignmentOrders", "MailInReturns"];

function Ricerca({ amb }: { amb: Ambiente }) {
  const [modulo, setModulo] = useState("DraftRepairs");
  const [col, setCol] = useState("");
  const [op, setOp] = useState("equals");
  const [val, setVal] = useState("");
  const [ris, setRis] = useState<{ totale: string | null; dati: unknown; colonne: { columnKey: string; operatorKey: string[] }[] | null } | null>(null);
  const [busy, setBusy] = useState(false);
  async function cerca(colonne = false) {
    setBusy(true);
    try { setRis(await ripCerca({ amb, modulo, colonne, filtri: col && val ? [{ operatorKey: op, columnKey: col, value: val.split(",").map((v) => v.trim()) }] : [] })); }
    catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  const righe = ris && Array.isArray(ris.dati) ? (ris.dati as Record<string, unknown>[]) : null;
  return (
    <Sezione titolo="Ricerca avanzata GSX" sottotitolo="bozze (DraftRepairs), aggiornate da Apple (UpdatedRepairs), parti da rendere, escalation…">
      <div className="grid gap-2 sm:grid-cols-[200px_200px_140px_1fr_auto_auto]">
        <select className={campo} value={modulo} onChange={(e) => setModulo(e.target.value)}>{MODULI.map((m) => <option key={m}>{m}</option>)}</select>
        <input className={campo} placeholder="colonna (es. repairStatusCode)" value={col} onChange={(e) => setCol(e.target.value)} list="gsx-colonne" />
        <datalist id="gsx-colonne">{(ris?.colonne || []).map((c) => <option key={c.columnKey} value={c.columnKey} />)}</datalist>
        <select className={campo} value={op} onChange={(e) => setOp(e.target.value)}>{["equals", "in", "like", "specialLike", "greaterThan", "lessThan", "between", "prefix"].map((o) => <option key={o}>{o}</option>)}</select>
        <input className={campo} placeholder="valore (più valori con la virgola)" value={val} onChange={(e) => setVal(e.target.value)} />
        <Button size="sm" onClick={() => cerca()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Search />}Cerca</Button>
        <Button size="sm" variant="outline" onClick={() => cerca(true)} disabled={busy}>Filtri ammessi</Button>
      </div>
      {ris && <div className="mt-2 text-xs text-muted-foreground">Totale Apple: {ris.totale ?? "—"}</div>}
      {righe ? <div className="mt-1 max-h-96 overflow-auto text-xs">{righe.map((x, i) => (
        <div key={i} className="border-b py-1">{["repairId", "serialNumber", "productName", "repairStatusCode", "repairStatusDescription", "purchaseOrderNumber", "createdDate", "escalationId", "orderId", "partNumber"]
          .filter((k) => x[k] !== undefined).map((k) => <span key={k} className="mr-3"><span className="text-muted-foreground">{k}:</span> {String(x[k])}</span>)}</div>))}</div>
        : ris?.dati ? <pre className="mt-1 max-h-96 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(ris.dati, null, 1)}</pre> : null}
    </Sezione>);
}

function Libera({ amb }: { amb: Ambiente }) {
  const [servizio, setServizio] = useState("/order/applecare/agreementEligibility");
  const [metodo, setMetodo] = useState("POST");
  const [query, setQuery] = useState("");
  const [corpo, setCorpo] = useState('{"device":{"id":""}}');
  const [out, setOut] = useState<unknown>(null);
  return (
    <Sezione titolo="Chiamata libera GSX (solo titolare)" sottotitolo="AppleCare, conto deposito, articoli… In produzione solo letture: le scritture sono bloccate qui e sul ponte.">
      <div className="grid gap-2 sm:grid-cols-[100px_1fr_1fr_auto]">
        <select className={campo} value={metodo} onChange={(e) => setMetodo(e.target.value)}><option>POST</option><option>GET</option></select>
        <input className={campo} value={servizio} onChange={(e) => setServizio(e.target.value)} />
        <input className={campo} placeholder="query (es. orderId=GA123)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button size="sm" onClick={async () => {
          let c: unknown = null; try { c = corpo.trim() ? JSON.parse(corpo) : null; } catch { toast.error("Corpo JSON non valido"); return; }
          try { setOut(await fetchAPI("/api/assistenza/gsx/rip/chiama", { method: "POST", body: JSON.stringify({ amb, servizio, metodo, query, corpo: c }), timeoutMs: 170000 })); } catch (e) { toastErrore(e); }
        }}>Chiama</Button>
      </div>
      <Campo label="Corpo JSON" className="mt-2"><textarea className={cn(area, "font-mono")} rows={6} value={corpo} onChange={(e) => setCorpo(e.target.value)} /></Campo>
      {out !== null && <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(out, null, 1)}</pre>}
    </Sezione>);
}
