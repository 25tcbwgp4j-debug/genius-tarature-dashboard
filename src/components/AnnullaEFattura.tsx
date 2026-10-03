"use client";

// «ANNULLA SCONTRINO E FAI FATTURA» (03/10/2026) — decisione di Christian: O scontrino O fattura.
// Il cliente chiede la fattura dopo lo scontrino: 1) dati di fatturazione (rubrica o a mano), 2) annullo dello scontrino
// in coda al registratore (operatore obbligatorio), 3) SOLO quando l'agente conferma l'annullo nasce la fattura (bozza)
// già pagata con gli stessi pagamenti, 4) si apre la fattura e si invia allo SdI col pulsante normale.
// Se l'annullo non riesce (registratore spento, oltre i tempi, già annullato) la fattura NON si crea: messaggio chiaro.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Loader2, RotateCcw, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { NOMI_MODALITA } from "@/components/Incassa";
import { toastErrore } from "@/lib/errori";
import {
  cassaAnnulla, cassaAnnullaEFattura, cassaAnnullaEFatturaRiprovaFattura, cassaAnnullaEFatturaStato, cassaRiprova,
  fattAnagrafiche, searchCustomers,
  type FattAnagrafica, type FattControparte, type Scontrino, type StatoAnnullaEFattura,
} from "@/lib/api";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const quando = (s: Pick<Scontrino, "created_at" | "data_rt">) =>
  new Date(s.data_rt || s.created_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

type TipoCliente = "privato" | "azienda";
interface Trovato { id: string; nome: string; sotto: string; fonte: "fatturazione" | "tarature"; c: FattControparte }

export function AnnullaEFattura({ scontrino, cliente: clienteIniziale, onClose, onCambiato, onFatta }: {
  scontrino: Scontrino | null;
  /** dati del cliente già scritti (es. dall'editor della fattura) */
  cliente?: { controparte: FattControparte; anagrafica_id?: string | null; customer_id?: string | null } | null;
  onClose: () => void;
  onCambiato?: () => void;
  /** fattura pronta: chi apre il dialogo la mostra (default: pagina Fatturazione) */
  onFatta?: (fatturaId: string) => void;
}) {
  const router = useRouter();
  const [operatore, setOperatore] = useOperatore();
  const [tipo, setTipo] = useState<TipoCliente>("privato");
  const [c, setC] = useState<FattControparte>({ paese: "IT" });
  const [anagraficaId, setAnagraficaId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [salvaAnag, setSalvaAnag] = useState(true);
  const [numeroOrig, setNumeroOrig] = useState("");
  const [q, setQ] = useState("");
  const [trovati, setTrovati] = useState<Trovato[]>([]);
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<StatoAnnullaEFattura | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const avvisa = useRef(onCambiato);
  useEffect(() => { avvisa.current = onCambiato; });

  // apertura: dati iniziali e, se l'annullo era già stato chiesto, il suo stato
  useEffect(() => {
    if (!scontrino) return;
    const ci = clienteIniziale?.controparte;
    setC({ paese: "IT", ...(ci || {}) });
    setTipo(ci?.piva ? "azienda" : "privato");
    setAnagraficaId(clienteIniziale?.anagrafica_id || null);
    setCustomerId(clienteIniziale?.customer_id || null);
    setNumeroOrig(scontrino.numero_rt || "");
    setQ(""); setTrovati([]); setSt(null);
    cassaAnnullaEFatturaStato(scontrino.id).then((r) => { if (r.stato !== "nessuna" && r.stato !== "annullata") setSt(r); }).catch(() => undefined);
  }, [scontrino, clienteIniziale]);

  // attesa dell'esito del registratore
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!scontrino || st?.stato !== "in_attesa") return;
    timer.current = setInterval(async () => {
      try {
        const r = await cassaAnnullaEFatturaStato(scontrino.id);
        if (r.stato !== "in_attesa") { setSt(r); avvisa.current?.(); if (r.stato === "fatta") toast.success("Scontrino annullato: la fattura è pronta"); }
      } catch { /* si riprova al giro dopo */ }
    }, 2500);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [scontrino, st?.stato]);

  // rubrica: anagrafiche della fatturazione + clienti delle tarature
  useEffect(() => {
    if (q.trim().length < 2) { setTrovati([]); return; }
    const t = setTimeout(async () => {
      const [fa, ta] = await Promise.all([
        fattAnagrafiche("genius", "cliente", q.trim(), 8).catch(() => ({ anagrafiche: [] })),
        searchCustomers(q.trim(), 6).catch(() => ({ customers: [] })),
      ]);
      const a: Trovato[] = (fa.anagrafiche || []).map((x: FattAnagrafica) => ({
        id: x.id, nome: x.denominazione || "", sotto: `${x.piva || x.cf || "senza P.IVA/CF"} · ${x.comune || ""}`, fonte: "fatturazione",
        c: { denominazione: x.denominazione || "", piva: x.piva || "", cf: x.cf || "", sdi: x.sdi || "", pec: x.pec || "",
          indirizzo: x.indirizzo || "", cap: x.cap || "", comune: x.comune || "", provincia: x.provincia || "",
          paese: (x.paese || "IT").toUpperCase().slice(0, 2), email: x.email || "" } }));
      const b: Trovato[] = (ta.customers || []).map((x: { id: string; company_name?: string; vat_number?: string; tax_id?: string; sdi_code?: string;
        pec?: string; address?: string; zip_code?: string; city?: string; province?: string; email?: string }) => ({
        id: x.id, nome: x.company_name || "", sotto: `${x.vat_number || x.tax_id || "senza P.IVA/CF"} · ${x.city || ""}`, fonte: "tarature",
        c: { denominazione: x.company_name || "", piva: (x.vat_number || "").replace(/\D/g, ""), cf: x.tax_id || "", sdi: x.sdi_code || "",
          pec: x.pec || "", indirizzo: x.address || "", cap: x.zip_code || "", comune: x.city || "", provincia: x.province || "",
          paese: "IT", email: (x.email || "").split(/[;,]/)[0]?.trim() || "" } }));
      setTrovati([...a, ...b]);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function scegli(x: Trovato) {
    setC(x.c); setTipo(x.c.piva ? "azienda" : "privato");
    if (x.fonte === "fatturazione") { setAnagraficaId(x.id); setCustomerId(null); } else { setCustomerId(x.id); setAnagraficaId(null); }
    setQ(""); setTrovati([]);
  }
  const set = (k: keyof FattControparte, v: string) => setC((p) => ({ ...p, [k]: v }));

  async function conferma() {
    if (!scontrino) return;
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    const cp: FattControparte = { ...c, paese: "IT" };
    if (tipo === "privato") { cp.piva = ""; if (cp.nome && cp.cognome) cp.denominazione = `${cp.nome} ${cp.cognome}`; }
    if (!confirm(`Annullare lo scontrino ${numeroOrig || ""} da ${eur(Number(scontrino.totale))} sul registratore e fare la fattura a ${cp.denominazione || "—"}?\n\n`
      + "Il registratore emette il documento di ANNULLO. Solo dopo la sua conferma nasce la fattura, già pagata con gli stessi pagamenti.")) return;
    setBusy(true);
    try {
      const r = await cassaAnnullaEFattura(scontrino.id, { operatore, controparte: cp, anagrafica_id: anagraficaId, customer_id: customerId,
        salva_anagrafica: !anagraficaId && salvaAnag, numero_originale: numeroOrig.trim() || undefined });
      setSt(r); onCambiato?.();
      toast.info("Annullo in coda al registratore: attendi la conferma");
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  async function riprovaAnnullo() {
    if (!st?.annullo_id) return;
    try { await cassaRiprova(st.annullo_id); setSt({ ...st, stato: "in_attesa", errore: null }); onCambiato?.(); } catch (e) { toastErrore(e); }
  }
  async function rinuncia() {
    if (!st?.annullo_id || !confirm("Rinunciare? Lo scontrino resta valido e la fattura non si fa.")) return;
    try { await cassaAnnulla(st.annullo_id); setSt(null); onCambiato?.(); toast.success("Annullo tolto dalla coda: lo scontrino resta valido"); }
    catch (e) { toastErrore(e); }
  }
  async function creaFattura() {
    if (!st?.annullo_id) return;
    try {
      const f = await cassaAnnullaEFatturaRiprovaFattura(st.annullo_id);
      setSt({ ...st, stato: "fatta", fattura_id: f.id, errore: null }); onCambiato?.();
    } catch (e) { toastErrore(e); }
  }

  const campo = "h-9 rounded-md border border-input bg-background px-2 text-sm w-full";
  const lab = "text-xs text-muted-foreground";
  const annulloFatto = st?.annullo_stato === "emesso" || st?.annullo_stato === "simulato";

  return (
    <Dialog open={!!scontrino} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Annulla scontrino e fai fattura</DialogTitle>
          <DialogDescription>O scontrino O fattura: lo scontrino si annulla sul registratore e al suo posto nasce la fattura, già pagata.</DialogDescription>
        </DialogHeader>
        {scontrino && (
          <div className="rounded-md border p-2 text-sm">
            <div className="flex justify-between gap-2"><span>Scontrino <b>{scontrino.numero_rt || "(numero non letto)"}</b> del {quando(scontrino)}</span>
              <b className="tabular-nums">{eur(Number(scontrino.totale))}</b></div>
            <div className="text-xs text-muted-foreground">{(scontrino.righe || []).map((r) => r.descrizione).join(", ").slice(0, 160)}</div>
            <div className="text-xs text-muted-foreground">Pagato: {(scontrino.pagamenti || []).map((p) => `${NOMI_MODALITA[p.modalita] || p.modalita} ${eur(p.importo)}`).join(" + ")}</div>
          </div>
        )}

        {st && st.stato !== "annullata" ? (
          <div className="space-y-3">
            {st.stato === "in_attesa" && (
              <div className="flex items-start gap-2 rounded-md bg-sky-500/10 p-3 text-sm">
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                <div>Annullo in coda al registratore. La fattura nasce appena il registratore conferma l&apos;annullo.
                  <div className="text-xs text-muted-foreground">Se il registratore è spento o non risponde entro 10 minuti la richiesta si ferma da sola e la fattura non si crea.</div></div>
              </div>
            )}
            {st.stato === "fatta" && (
              <div className="space-y-2 rounded-md bg-emerald-500/15 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4" /> Scontrino annullato, fattura pronta (già pagata).</div>
                <div className="text-xs">Controlla i dati e inviala allo SdI con il pulsante della fattura: non parte da sola.</div>
                <Button className="h-11 w-full" onClick={() => { if (!st.fattura_id) return; if (onFatta) onFatta(st.fattura_id); else router.push(`/fatturazione?id=${st.fattura_id}`); }}><FileText /> Apri la fattura e inviala allo SdI</Button>
              </div>
            )}
            {st.stato === "fallita" && (
              <div className="space-y-2 rounded-md bg-red-500/10 p-3 text-sm">
                <div className="flex items-start gap-2 font-medium text-red-700 dark:text-red-300"><XCircle className="mt-0.5 size-4 shrink-0" />
                  {annulloFatto ? "Lo scontrino è annullato ma la fattura non è stata creata." : "Annullo NON riuscito: la fattura non è stata creata e lo scontrino resta valido."}</div>
                {st.errore && <div className="text-xs">Motivo: {st.errore}</div>}
                {annulloFatto
                  ? <Button className="h-11 w-full" onClick={creaFattura}><FileText /> Crea ora la fattura</Button>
                  : <div className="flex flex-wrap gap-2">
                      <Button className="h-11 flex-1" variant="secondary" onClick={riprovaAnnullo}><RotateCcw /> Riprova l&apos;annullo</Button>
                      <Button className="h-11 flex-1" variant="ghost" onClick={rinuncia}>Rinuncia</Button>
                    </div>}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(["privato", "azienda"] as TipoCliente[]).map((t) => (
                <Button key={t} size="sm" className="h-9" variant={tipo === t ? "default" : "outline"} onClick={() => setTipo(t)}>{t === "privato" ? "Privato" : "Azienda"}</Button>
              ))}
              <div className="relative w-full sm:ml-auto sm:w-64">
                <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                <Input className="h-9 pl-8" placeholder="Cerca in rubrica…" value={q} onChange={(e) => setQ(e.target.value)} />
                {trovati.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
                    {trovati.map((x) => (
                      <button key={`${x.fonte}-${x.id}`} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => scegli(x)}>
                        <div className="font-medium">{x.nome} <span className="text-[10px] font-normal text-muted-foreground">{x.fonte === "tarature" ? "Tarature" : "anagrafica"}</span></div>
                        <div className="text-xs text-muted-foreground">{x.sotto}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              {tipo === "privato" ? (
                <>
                  <label className="space-y-1 sm:col-span-2"><div className={lab}>Nome</div><input className={campo} value={c.nome || ""} onChange={(e) => set("nome", e.target.value)} /></label>
                  <label className="space-y-1 sm:col-span-2"><div className={lab}>Cognome</div><input className={campo} value={c.cognome || ""} onChange={(e) => set("cognome", e.target.value)} /></label>
                  {!c.nome && !c.cognome && c.denominazione ? <div className="col-span-2 text-xs text-muted-foreground sm:col-span-6">Intestata a: {c.denominazione}</div> : null}
                  <label className="col-span-2 space-y-1"><div className={lab}>Codice fiscale</div><input className={campo} value={c.cf || ""} onChange={(e) => set("cf", e.target.value.toUpperCase())} /></label>
                </>
              ) : (
                <>
                  <label className="col-span-2 space-y-1 sm:col-span-3"><div className={lab}>Ragione sociale</div><input className={campo} value={c.denominazione || ""} onChange={(e) => set("denominazione", e.target.value)} /></label>
                  <label className="space-y-1 sm:col-span-2"><div className={lab}>Partita IVA</div><input className={campo} inputMode="numeric" value={c.piva || ""} onChange={(e) => set("piva", e.target.value)} /></label>
                  <label className="space-y-1"><div className={lab}>Cod. fiscale</div><input className={campo} value={c.cf || ""} onChange={(e) => set("cf", e.target.value.toUpperCase())} /></label>
                  <label className="space-y-1 sm:col-span-2"><div className={lab}>Codice SDI</div><input className={campo} maxLength={7} placeholder="0000000" value={c.sdi || ""} onChange={(e) => set("sdi", e.target.value.toUpperCase())} /></label>
                  <label className="space-y-1 sm:col-span-4"><div className={lab}>PEC (se manca il codice)</div><input className={campo} value={c.pec || ""} onChange={(e) => set("pec", e.target.value)} /></label>
                </>
              )}
              <label className="col-span-2 space-y-1 sm:col-span-3"><div className={lab}>Indirizzo</div><input className={campo} value={c.indirizzo || ""} onChange={(e) => set("indirizzo", e.target.value)} /></label>
              <label className="space-y-1"><div className={lab}>CAP</div><input className={campo} inputMode="numeric" value={c.cap || ""} onChange={(e) => set("cap", e.target.value)} /></label>
              <label className="space-y-1"><div className={lab}>Comune</div><input className={campo} value={c.comune || ""} onChange={(e) => set("comune", e.target.value)} /></label>
              <label className="space-y-1"><div className={lab}>Prov.</div><input className={campo} maxLength={2} value={c.provincia || ""} onChange={(e) => set("provincia", e.target.value.toUpperCase())} /></label>
              <label className="col-span-2 space-y-1 sm:col-span-6"><div className={lab}>Email per la copia di cortesia</div><input className={campo} value={c.email || ""} onChange={(e) => set("email", e.target.value)} /></label>
            </div>
            {!anagraficaId && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={salvaAnag} onChange={(e) => setSalvaAnag(e.target.checked)} /> salva il cliente in anagrafica</label>
            )}
            {!scontrino?.numero_rt && (
              <label className="block space-y-1"><div className={lab}>Numero dello scontrino (lo trovi stampato, es. 2312-0004)</div>
                <input className={campo} placeholder="AAAA-NNNN" value={numeroOrig} onChange={(e) => setNumeroOrig(e.target.value.trim())} /></label>
            )}
            <SceltaOperatore value={operatore} onChange={setOperatore} />
            <Button className="h-11 w-full" disabled={busy || !operatore} onClick={conferma}>
              {busy ? <Loader2 className="animate-spin" /> : <FileText />} Annulla lo scontrino e fai la fattura</Button>
            <p className="text-xs text-muted-foreground">Prima si controllano i dati del cliente; poi il registratore emette l&apos;annullo (stessa procedura dello storno) e solo allora nasce la fattura. L&apos;invio allo SdI resta a te.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
