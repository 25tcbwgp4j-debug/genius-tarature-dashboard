"use client";

// CASSA del negozio (GENIUS LAB): scanner → carrello → scontrino al registratore oppure fattura.
// La giacenza scende da sola. Lo scontrino lo emette la cassa tramite l'agente del negozio.
// /cassa?sessione=<id>: «Converti in scontrino» dalla sessione di taratura (il cliente non vuole la fattura):
// carrello precompilato con le righe del pro forma (o della sessione), stessi importi IVA inclusa.
// /cassa?ordine=<id>&importo=<x>&tipo=acconto|saldo[&ritiro=1]: incasso di un ORDINE cliente. Carrello pronto (pagamento
// totale al primo incasso: gli articoli dell'ordine; altrimenti una riga «Acconto/Saldo ordine n. X/AAAA: articoli»).
// L'operatore incassa come sempre; lo scontrino si collega all'ordine e si torna all'ordine (con ritiro=1 lo segna ritirato).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banknote, Loader2, Minus, Plus, Receipt, RotateCcw, Search, ShoppingCart, Trash2, Undo2, X } from "lucide-react";
import { StornoDialog } from "@/components/StornoDialog";
import { VerificaBonifico } from "@/components/VerificaBonifico";
import { PagaPos } from "@/components/PagaPos";
import { BadgeOperatore, SceltaOperatore, useOperatore } from "@/components/Operatore";
import { toast } from "sonner";
import { ScannerInput } from "@/components/ScannerInput";
import { DecInput, parseDec } from "@/components/DecInput";
import { oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";
import Link from "next/link";
import {
  cassaAnnulla, cassaGiornata, docDettaglio, docRitira, cassaFattura, cassaRiprova, cassaScontrini, cassaScontrino, magPerCodice, magProdotti, proformaSessioneStato,
  type Prodotto, type RigaCassa, type Scontrino,
} from "@/lib/api";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const MOD: Record<string, string> = { contanti: "Contanti", pos_sumup: "POS SumUp", bonifico: "Bonifico", paypal: "PayPal", non_riscosso: "Non riscosso" };
const STATO: Record<string, string> = {
  da_stampare: "in coda", in_stampa: "in stampa", emesso: "emesso", errore: "ERRORE", simulato: "simulato (non fiscale)", annullato: "annullato",
};

export default function CassaPage() {
  const router = useRouter();
  const [carrello, setCarrello] = useState<(RigaCassa & { giacenza?: number })[]>([]);
  const [q, setQ] = useState("");
  const [trovati, setTrovati] = useState<Prodotto[]>([]);
  const [operatore, setOperatore] = useOperatore();
  const [busy, setBusy] = useState("");
  const [oggi, setOggi] = useState<{ scontrini: Scontrino[]; totale: number; per_modalita: Record<string, number> } | null>(null);
  const [libera, setLibera] = useState({ descrizione: "", prezzo: "" });
  const [cassaChiusa, setCassaChiusa] = useState(false);
  // elenco scontrini: di oggi (default) o di un giorno passato, per fare reso/annullo di quelli già emessi
  const [giornoLista, setGiornoLista] = useState(oggiRoma);
  const [storno, setStorno] = useState<Scontrino | null>(null);
  // scontrino di una sessione di taratura (arrivo da «Converti in scontrino»)
  const [sessione, setSessione] = useState<{ id: string; etichetta: string } | null>(null);
  // incasso di un ordine cliente (arrivo dal pulsante «Scontrino» dell'ordine)
  const [ordine, setOrdine] = useState<{ id: string; sigla: string; cliente: string; tipo: "acconto" | "saldo"; max: number; ritiro: boolean } | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const oid = qs.get("ordine");
    if (!oid) return;
    const importo = Math.round(Number(qs.get("importo") || 0) * 100) / 100;
    const tipo = qs.get("tipo") === "acconto" ? "acconto" : "saldo";
    docDettaglio(oid).then((d) => {
      const max = d.da_certificare ?? d.residuo;
      if (d.stato !== "aperto") { toast.error(`L'ordine ${d.sigla} non è più aperto`); return; }
      if (max <= 0.005) { toast.error(`L'ordine ${d.sigla} non ha più nulla da incassare`); return; }
      const imp = importo > 0 && importo <= max + 0.001 ? importo : max;
      if (importo > max + 0.001) toast.warning(`Importo ridotto a ${eur(max)}: è quanto resta da pagare`);
      const articoli = d.righe.filter((r) => Number(r.quantita) > 0);
      const totArticoli = Math.round(articoli.reduce((s, r) => s + r.quantita * r.prezzo_ivato * (1 - (r.sconto || 0) / 100), 0) * 100) / 100;
      const voci = articoli.map((r) => r.descrizione).join("; ");
      // tutto in una volta e nessun pagamento prima: sullo scontrino gli articoli dell'ordine (senza scarico: escono al ritiro)
      if (!d.pagamenti?.length && Math.abs(totArticoli - imp) < 0.01) {
        setCarrello(articoli.map((r) => ({ descrizione: r.descrizione, quantita: Number(r.quantita) || 1, prezzo: Number(r.prezzo_ivato) || 0,
          aliquota: Number(r.aliquota ?? 22), sconto: Number(r.sconto || 0) })));
      } else {
        setCarrello([{ descrizione: `${tipo === "acconto" && imp < max - 0.001 ? "Acconto" : "Saldo"} ordine n. ${d.numero}/${d.anno}: ${voci}`.slice(0, 200),
          quantita: 1, prezzo: imp, aliquota: Number(d.righe[0]?.aliquota ?? 22) }]);
      }
      setOrdine({ id: d.id, sigla: d.sigla, cliente: d.cliente_nome || d.controparte?.denominazione || "", tipo: imp < max - 0.001 ? "acconto" : "saldo",
        max, ritiro: qs.get("ritiro") === "1" });
    }).catch((e: Error) => toast.error("Ordine non caricato: " + e.message));
  }, []);

  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get("sessione");
    if (!sid) return;
    proformaSessioneStato(sid).then((r) => {
      const righe = r.documento?.righe || r.anteprima?.righe || [];
      if (!righe.length) { toast.error("La sessione non ha righe da mettere nello scontrino"); return; }
      if (r.documento && r.documento.stato !== "aperto") toast.warning(`Il pro forma ${r.documento.sigla} è già ${r.documento.stato}: controlla di non fare un doppione`);
      setCarrello(righe.filter((x) => Number(x.quantita) > 0).map((x) => ({
        descrizione: x.descrizione, quantita: Number(x.quantita) || 1, prezzo: Number(x.prezzo_ivato) || 0,
        aliquota: Number(x.aliquota ?? 22), sconto: Number(x.sconto || 0),
      })));
      const n = r.anteprima?.session_number;
      setSessione({ id: sid, etichetta: r.documento ? `${r.documento.rif || "sessione di taratura"} · pro forma ${r.documento.sigla}` : `Sessione di taratura${n ? ` n. ${n}` : ""}` });
    }).catch((e: Error) => toast.error("Sessione non caricata: " + e.message));
  }, []);

  const ricarica = useCallback(() => {
    cassaScontrini(giornoLista).then(setOggi).catch(() => undefined);
    // gli scontrini finiscono nella cassa del giorno: se è già chiusa lo dico subito
    cassaGiornata(oggiRoma()).then((r) => setCassaChiusa(r.giornata.stato === "chiusa")).catch(() => undefined);
  }, [giornoLista]);
  useEffect(() => { ricarica(); const t = setInterval(ricarica, 10000); return () => clearInterval(t); }, [ricarica]);
  useEffect(() => {
    if (q.trim().length < 2) { setTrovati([]); return; }
    const t = setTimeout(() => magProdotti(q.trim(), false, 12).then((r) => setTrovati(r.prodotti || [])).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [q]);

  const aggiungi = useCallback((p: Prodotto) => {
    setCarrello((c) => {
      const i = c.findIndex((r) => r.prodotto_id === p.id);
      if (i >= 0) return c.map((r, j) => (j === i ? { ...r, quantita: r.quantita + 1 } : r));
      return [...c, { prodotto_id: p.id, descrizione: p.descrizione, quantita: 1, prezzo: Number(p.prezzo), aliquota: Number(p.aliquota), giacenza: Number(p.giacenza) }];
    });
    setQ(""); setTrovati([]);
  }, []);
  const scansiona = useCallback(async (codice: string) => {
    try { aggiungi(await magPerCodice(codice)); } catch (e) { toast.error((e as Error).message); }
  }, [aggiungi]);

  const tot = Math.round(carrello.reduce((s, r) => s + r.quantita * r.prezzo * (1 - (r.sconto || 0) / 100), 0) * 100) / 100;
  // incasso di un ordine: il carrello non può superare quanto resta da pagare (prima che il cliente paghi col POS)
  const oltreOrdine = !!ordine && tot > ordine.max + 0.001;

  async function scontrino(modalita: string, posIncassoId?: string) {
    if (!carrello.length || busy) return;
    if (!operatore) { toast.error("Scegli prima l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    if (carrello.some((r) => !(r.prezzo >= 0) || Number.isNaN(r.prezzo))) { toast.error("C'è un prezzo non valido nel carrello"); return; }
    if (ordine && tot > ordine.max + 0.001) { toast.error(`Lo scontrino supera quanto resta da pagare sull'ordine (${eur(ordine.max)})`); return; }
    if (modalita === "non_riscosso" && !confirm(`Emettere lo scontrino da ${eur(tot)} come NON RISCOSSO (il cliente non paga adesso)?`)) return;
    setBusy(modalita);
    try {
      await cassaScontrino({ righe: carrello, pagamenti: [{ modalita, importo: tot }], pos_incasso_id: posIncassoId, operatore,
                             ...(sessione ? { session_id: sessione.id } : {}), ...(ordine ? { documento_id: ordine.id } : {}) });
      toast.success(`Scontrino da ${eur(tot)} inviato alla cassa (${MOD[modalita]} · ${operatore})`);
      setCarrello([]); ricarica();
      if (sessione) { router.push(`/sessioni/${sessione.id}`); setSessione(null); }
      if (ordine) {
        toast.success(`${ordine.tipo === "acconto" ? "Acconto" : "Saldo"} registrato sull'ordine ${ordine.sigla}`);
        if (ordine.ritiro) {
          try { await docRitira(ordine.id, operatore); toast.success(`Ordine ${ordine.sigla} ritirato`); } catch (e) { toastErrore(e); }
        }
        router.push(`/ordini?id=${ordine.id}`); setOrdine(null);
      }
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  async function fattura() {
    if (!carrello.length || busy) return;
    if (!operatore) { toast.error("Scegli prima l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    setBusy("fattura");
    try {
      const f = await cassaFattura({ righe: carrello, operatore });
      toast.success("Bozza di fattura creata: completa il cliente e inviala allo SdI");
      setCarrello([]);
      router.push(`/fatturazione?id=${f.id}`);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }
  function setR(i: number, k: keyof RigaCassa, v: number | string) { setCarrello((c) => c.map((r, j) => (j === i ? { ...r, [k]: v } : r))); }

  return (
    <div className="grid gap-4 p-1 md:p-2 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex items-center gap-3"><ShoppingCart className="size-6" /><h1 className="text-2xl font-semibold">Cassa</h1>
          <span className="text-sm text-muted-foreground">GENIUS LAB · registratore CUSTOM</span></div>
        {cassaChiusa && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
            ⚠️ La cassa del giorno di oggi è CHIUSA: gli scontrini emessi adesso cambierebbero una giornata già chiusa.{" "}
            <Link className="font-medium underline" href="/cassa/giornata">Apri cassa del giorno</Link>
          </div>
        )}
        {sessione && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
            Scontrino al posto della fattura per: <b>{sessione.etichetta}</b>. Scegli operatore e pagamento come al solito.
            <Link className="ml-auto underline" href={`/sessioni/${sessione.id}`}>Torna alla sessione</Link>
          </div>
        )}
        {ordine && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border-2 border-violet-400 bg-violet-50 px-3 py-2 text-sm text-violet-950 dark:bg-violet-950/30 dark:text-violet-100">
            <span>{ordine.tipo === "acconto" ? "Acconto" : "Saldo"} per l&apos;ordine <b>{ordine.sigla}</b>{ordine.cliente ? <> — <b>{ordine.cliente}</b></> : ""}.
              Scegli operatore e pagamento come per ogni scontrino: si collega da solo all&apos;ordine{ordine.ritiro ? " e l'ordine risulta ritirato" : ""}.</span>
            {oltreOrdine && <span className="w-full font-semibold text-red-700">Il carrello ({eur(tot)}) supera quanto resta da pagare ({eur(ordine.max)}): correggi l&apos;importo.</span>}
            <Link className="ml-auto underline" href={`/ordini?id=${ordine.id}`}>Torna all&apos;ordine</Link>
          </div>
        )}
        <ScannerInput onCodice={scansiona} />
        <div className="relative">
          <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="…oppure cerca l'articolo per nome" value={q} onChange={(e) => setQ(e.target.value)} />
          {trovati.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
              {trovati.map((p) => (
                <button key={p.id} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => aggiungi(p)}>
                  <span>{p.descrizione} <span className="text-xs text-muted-foreground">{p.barcode || p.codice}</span></span>
                  <span className="tabular-nums">{eur(Number(p.prezzo))} · {Number(p.giacenza)} pz</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Articolo</th><th className="p-2 text-center">Q.tà</th><th className="p-2 text-right">Prezzo</th>
              <th className="p-2 text-right">IVA</th><th className="p-2 text-right">Totale</th><th /></tr></thead>
            <tbody>
              {carrello.map((r, i) => (
                <tr key={`${r.prodotto_id || "libera"}-${i}-${r.descrizione}`} className="border-b last:border-0">
                  <td className="p-2">{r.descrizione}{r.giacenza !== undefined && r.quantita > r.giacenza && <div className="text-xs text-amber-600">giacenza {r.giacenza}</div>}</td>
                  <td className="p-2"><div className="flex items-center justify-center gap-1">
                    <Button size="icon-xs" variant="outline" onClick={() => setR(i, "quantita", Math.max(1, r.quantita - 1))}><Minus /></Button>
                    <span className="w-6 text-center">{r.quantita}</span>
                    <Button size="icon-xs" variant="outline" onClick={() => setR(i, "quantita", r.quantita + 1)}><Plus /></Button></div></td>
                  <td className="p-2 text-right"><DecInput className="ml-auto h-7 w-24 px-1 text-right" value={r.prezzo}
                    onValue={(v) => setR(i, "prezzo", v ?? 0)} /></td>
                  <td className="p-2 text-right">{r.aliquota}%</td>
                  <td className="p-2 text-right tabular-nums">{eur(r.quantita * r.prezzo)}</td>
                  <td className="p-2"><Button size="icon-xs" variant="ghost" onClick={() => setCarrello((c) => c.filter((_, j) => j !== i))}><Trash2 /></Button></td>
                </tr>
              ))}
              {!carrello.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Spara un codice a barre per iniziare</td></tr>}
            </tbody>
          </table>
          <div className="flex flex-wrap items-end gap-2 border-t p-2">
            <Input className="h-8 flex-1" placeholder="Voce libera (es. Manodopera)" value={libera.descrizione} onChange={(e) => setLibera({ ...libera, descrizione: e.target.value })} />
            <Input className="h-8 w-28" inputMode="decimal" placeholder="Prezzo IVA incl." value={libera.prezzo} onChange={(e) => setLibera({ ...libera, prezzo: e.target.value })} />
            <Button size="sm" variant="outline" disabled={!libera.descrizione || !libera.prezzo}
              onClick={() => {
                const pz = parseDec(libera.prezzo);
                if (pz === null || Number.isNaN(pz) || pz < 0) { toast.error("Prezzo non valido (es. 25 o 12,50)"); return; }
                setCarrello((c) => [...c, { descrizione: libera.descrizione, quantita: 1, prezzo: pz, aliquota: 22 }]); setLibera({ descrizione: "", prezzo: "" });
              }}>
              <Plus /> Aggiungi</Button>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">Totale</span><span className="text-3xl font-bold tabular-nums">{eur(tot)}</span></div>
          <SceltaOperatore value={operatore} onChange={setOperatore} />
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!carrello.length || !!busy || !operatore || oltreOrdine} onClick={() => scontrino("contanti")}>{busy === "contanti" ? <Loader2 className="animate-spin" /> : <Banknote />} Contanti</Button>
            {/* un ordine si incassa davvero: niente «non riscosso» */}
            {!ordine && <Button variant="outline" disabled={!carrello.length || !!busy || !operatore || oltreOrdine} onClick={() => scontrino("non_riscosso")}>Non riscosso</Button>}
            {/* bonifico istantaneo: lo scontrino parte solo dopo aver visto l'accredito sul conto SumUp */}
            <VerificaBonifico className="col-span-2" importo={tot} etichettaConferma="Emetti scontrino" disabled={!carrello.length || !!busy || !operatore || oltreOrdine}
              onConfermato={() => scontrino("bonifico")} />
          </div>
          <div className="space-y-1 rounded-md border border-sky-200 bg-sky-50/50 p-2 dark:bg-sky-950/20">
            <div className="text-xs text-muted-foreground">POS e PayPal: lo scontrino parte da solo quando SumUp / PayPal registrano il pagamento</div>
            <div className="grid grid-cols-2 gap-2">
              <PagaPos importo={tot} descrizione={`GENIUS LAB scontrino ${eur(tot)}`} rifTipo="scontrino" disabled={!carrello.length || !!busy || !operatore || oltreOrdine}
                generico paypal onPagato={(p) => scontrino(p.metodo === "paypal" ? "paypal" : "pos_sumup", p.id)} />
            </div>
          </div>
          {/* dalla sessione la fattura si prepara con «Prepara bozza da controllare» (niente doppioni non collegati) */}
          {!sessione && !ordine && <Button variant="secondary" className="w-full" disabled={!carrello.length || !!busy || !operatore || oltreOrdine} onClick={fattura}>
            {busy === "fattura" ? <Loader2 className="animate-spin" /> : <Receipt />} Fai fattura invece dello scontrino</Button>}
          {carrello.length > 0 && <Button variant="ghost" size="sm" className="w-full" onClick={() => { if (confirm("Svuotare il carrello?")) setCarrello([]); }}><X /> Svuota carrello</Button>}
        </Card>

        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-sm font-medium">Scontrini {giornoLista === oggiRoma() ? "di oggi" : "del"}
              <input type="date" className="h-7 rounded-md border border-input bg-background px-1 text-xs" value={giornoLista} max={oggiRoma()}
                onChange={(e) => { if (e.target.value) { setOggi(null); setGiornoLista(e.target.value); } }} /></span>
            <span className="font-semibold tabular-nums">{eur(oggi?.totale || 0)}</span></div>
          <div className="mb-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {Object.entries(oggi?.per_modalita || {}).map(([k, v]) => <span key={k}>{MOD[k] || k}: {eur(v)}</span>)}
          </div>
          <div className="max-h-96 divide-y overflow-y-auto">
            {(oggi?.scontrini || []).map((s) => {
              const doc = s.tipo_documento || "vendita";
              const negativo = doc !== "vendita";   // reso / annullo: i soldi escono
              const stornabile = !negativo && ["emesso", "in_stampa"].includes(s.stato);
              return (
              <div key={s.id} className={`py-2 text-sm ${negativo ? "-mx-1 rounded bg-red-50/80 px-1 dark:bg-red-950/20" : ""}`}>
                <div className="flex justify-between">
                  <span className={s.stato === "annullato" ? "line-through opacity-60" : ""}>
                    {negativo && <span className="mr-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{doc === "annullo" ? "ANNULLO" : "RESO"}</span>}
                    {new Date(s.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {s.numero_rt ? `n. ${s.numero_rt}` : ""}
                    <BadgeOperatore op={s.operatore} className="ml-1" /></span>
                  <span className={`tabular-nums ${negativo ? "font-semibold text-red-700 dark:text-red-300" : s.stato === "annullato" ? "line-through opacity-60" : ""}`}>{negativo ? "− " : ""}{eur(Number(s.totale))}</span>
                </div>
                {negativo && s.motivo && <div className="text-xs text-muted-foreground">Motivo: {s.motivo}</div>}
                <div className="flex items-center justify-between text-xs">
                  <span className={s.stato === "errore" ? "text-red-600" : s.stato === "simulato" ? "text-amber-600" : "text-muted-foreground"}>
                    {STATO[s.stato] || s.stato} · {s.pagamenti.map((p) => MOD[p.modalita] || p.modalita).join(", ")}{s.errore ? ` · ${s.errore}` : ""}</span>
                  <span className="flex gap-1">
                    {(s.stato === "errore" || s.stato === "simulato") && <Button size="xs" variant="ghost" onClick={() => cassaRiprova(s.id).then(ricarica).catch(toastErrore)}><RotateCcw /> Riprova</Button>}
                    {["da_stampare", "errore", "simulato"].includes(s.stato) && <Button size="xs" variant="ghost" onClick={() => { if (confirm("Annullare lo scontrino e rimettere in giacenza gli articoli?")) cassaAnnulla(s.id).then(ricarica).catch(toastErrore); }}>Annulla</Button>}
                    {stornabile && <Button size="xs" variant="ghost" className="text-red-600" title="Reso (anche parziale) o annullo di uno scontrino già emesso"
                      onClick={() => setStorno(s)}><Undo2 /> Storno</Button>}
                  </span>
                </div>
              </div>
              );
            })}
            {!oggi?.scontrini.length && <div className="py-4 text-center text-sm text-muted-foreground">Nessuno scontrino {giornoLista === oggiRoma() ? "oggi" : "in questo giorno"}</div>}
          </div>
        </Card>
      </div>
      <StornoDialog oggetto={storno ? { fonte: "scontrino", scontrino: storno } : null} onClose={() => setStorno(null)} onFatto={ricarica} />
    </div>
  );
}
