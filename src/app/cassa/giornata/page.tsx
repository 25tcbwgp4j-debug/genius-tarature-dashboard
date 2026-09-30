"use client";

// CASSA DEL GIORNO (GENIUS LAB) — il vecchio Excel «BASE CASSA» che si compila da solo.
// In alto: quadratura, contanti di mattina e di sera (banconote | monete), chiusure del giorno (POS, registratore,
// fatture, note di credito, acconti degli ordini, rimborsi) e prelievi. Sotto: tutte le righe del giorno;
// fatture e scontrini della dashboard entrano da soli, gli scontrini battuti alla cassa si aggiungono a mano.
// Se i conti tornano si chiude la giornata e l'Excel finisce nella cartella DA FIRMARE.

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, Lock, Plus, Trash2, Unlock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CercaArticolo } from "@/components/CercaArticolo";
import {
  cassaGiornata, cassaGiornataChiudi, cassaGiornataElimina, cassaGiornataRiapri, cassaGiornataRiga, cassaGiornataSalva, cassaGiornataUrlExcel,
  type FoglioCassa, type Tagli,
} from "@/lib/api";

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const COL = [["contanti", "Contanti"], ["pos", "POS"], ["stripe", "Stripe"], ["bonifico", "Bonifico"], ["paypal", "PayPal"]] as const;
const FONTE: Record<string, string> = { fattura: "auto", fattura_prec: "auto", scontrino: "dashboard", manuale: "a mano" };
const TIPI_RIGA: [string, string][] = [
  ["scontrino", "Scontrino (battuto in cassa)"], ["storno", "Storno scontrino (reso)"], ["acconto", "Acconto ordine cliente"],
  ["reso", "Rimborso in contanti"], ["fattura", "Fattura fuori dashboard"], ["altro", "Altro"],
];
const TIPI_PRELIEVO: Record<string, string> = { eccesso: "Troppi contanti in cassa", spesa: "Spesa", altro: "Altro" };
const oggiRoma = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
const spostaGiorno = (g: string, n: number) => { const d = new Date(`${g}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const tondo = (v: number) => Math.round(v * 100) / 100;

// campo importo con la virgola: tiene il testo mentre si scrive, passa fuori il numero
function DecInput({ value, onValue, ...props }: { value: number | null | undefined; onValue: (v: number | null) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const fmt = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? "" : String(v).replace(".", ","));
  const [t, setT] = useState(fmt(value));
  const [prec, setPrec] = useState(value);
  if (value !== prec) {   // valore cambiato da fuori (altro giorno, server): riallineo il testo
    setPrec(value);
    if (num(t) !== (value || null)) setT(fmt(value));
  }
  return <Input inputMode="decimal" {...props} value={t} onChange={(e) => {
    setT(e.target.value); const v = num(e.target.value); if (v === null || !Number.isNaN(v)) onValue(v);
  }} />;
}

// Conteggio contanti: colonna BANCONOTE e colonna MONETE affiancate
function Contanti({ titolo, sotto, tagli, valori, onChange, disabled, colore }: {
  titolo: string; sotto: string; tagli: string[]; valori: Tagli; onChange: (t: Tagli) => void; disabled: boolean; colore: string;
}) {
  const visibili = Array.from(new Set([...tagli, ...Object.keys(valori).filter((t) => valori[t])])).sort((a, b) => Number(b) - Number(a));
  const tot = visibili.reduce((s, t) => s + Number(t) * (valori[t] || 0), 0);
  const colonna = (lista: string[], nome: string) => (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{nome}</div>
      {lista.map((t) => (
        <label key={t} className="flex items-center gap-2">
          <span className="w-12 text-right text-sm font-medium tabular-nums">€ {t.replace(".", ",")}</span>
          <span className="text-xs text-muted-foreground">×</span>
          <Input type="number" min={0} inputMode="numeric" disabled={disabled}
            className="h-9 w-16 border-2 bg-background px-1 text-right text-base font-semibold"
            value={valori[t] || ""} placeholder="0"
            onChange={(e) => onChange({ ...valori, [t]: Math.max(0, parseInt(e.target.value || "0", 10) || 0) })} />
          <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{valori[t] ? eur(Number(t) * valori[t]) : ""}</span>
        </label>
      ))}
    </div>
  );
  return (
    <div className={`space-y-2 rounded-lg border-2 p-3 ${colore}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{titolo}</span>
        <span className="text-xl font-bold tabular-nums">{eur(tot)}</span>
      </div>
      <div className="text-xs text-muted-foreground">{sotto}</div>
      <div className="grid grid-cols-2 gap-3">
        {colonna(visibili.filter((t) => Number(t) >= 5), "Banconote")}
        {colonna(visibili.filter((t) => Number(t) < 5), "Monete")}
      </div>
    </div>
  );
}

function Riquadro({ titolo, valore, sotto, stato, children }: {
  titolo: string; valore?: string; sotto?: React.ReactNode; stato?: "ok" | "ko" | "manca" | "info"; children?: React.ReactNode;
}) {
  const cls = stato === "ok" ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : stato === "ko" ? "border-red-400 bg-red-50 dark:bg-red-950/30"
    : stato === "manca" ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-sky-300 bg-sky-50 dark:bg-sky-950/30";
  return (
    <div className={`space-y-1 rounded-lg border-2 p-3 ${cls}`}>
      <div className="text-xs font-semibold uppercase text-muted-foreground">{titolo}</div>
      {valore !== undefined && <div className="text-xl font-bold tabular-nums">{valore}</div>}
      {sotto && <div className="text-xs text-muted-foreground">{sotto}</div>}
      {children}
    </div>
  );
}

export default function CassaGiornataPage() {
  const [giorno, setGiorno] = useState(oggiRoma());
  const [f, setF] = useState<FoglioCassa | null>(null);
  const [bozza, setBozza] = useState<FoglioCassa["giornata"] | null>(null);
  const [busy, setBusy] = useState("");
  const vuotaRiga = { tipo: "scontrino", numero: "", importo: "", modalita: "contanti", descrizione: "", modello: "", prodotto_id: "" };
  const [nuova, setNuova] = useState(vuotaRiga);
  const [prel, setPrel] = useState({ importo: "", tipo: "eccesso", nota: "" });
  const salvaT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chiusa = f?.giornata.stato === "chiusa";

  const applica = useCallback((r: FoglioCassa) => { setF(r); setBozza(r.giornata); }, []);
  const ricarica = useCallback(() => {
    cassaGiornata(giorno).then(applica).catch((e: Error) => toast.error(e.message));
  }, [giorno, applica]);
  useEffect(() => { setF(null); ricarica(); }, [ricarica]);
  // fatture, scontrini e POS entrano da soli: aggiorno ogni minuto se la giornata è aperta
  useEffect(() => {
    if (chiusa) return;
    const t = setInterval(() => { if (!salvaT.current) ricarica(); }, 60000);
    return () => clearInterval(t);
  }, [chiusa, ricarica]);

  function modifica(p: Partial<FoglioCassa["giornata"]>) {
    if (!bozza || chiusa) return;
    const b = { ...bozza, ...p };
    setBozza(b);
    if (salvaT.current) clearTimeout(salvaT.current);
    salvaT.current = setTimeout(async () => {
      salvaT.current = null;
      try {
        setF(await cassaGiornataSalva(giorno, {
          apertura_tagli: b.apertura_tagli, chiusura_tagli: b.chiusura_tagli, pos_terminale: b.pos_terminale, rt_scontrini: b.rt_scontrini, note: b.note,
        }));
      } catch (e) { toast.error((e as Error).message); }
    }, 700);
  }

  async function salvaPrelievi(lista: FoglioCassa["giornata"]["prelievi"]) {
    setBusy("prelievo");
    try { applica(await cassaGiornataSalva(giorno, { prelievi: lista })); } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  }
  async function aggiungiPrelievo() {
    const imp = num(prel.importo);
    if (!imp || imp <= 0) { toast.error("Scrivi l'importo del prelievo"); return; }
    await salvaPrelievi([...(bozza?.prelievi || []), { importo: imp, nota: prel.nota.trim(), tipo: prel.tipo }]);
    setPrel({ importo: "", tipo: prel.tipo, nota: "" });
  }

  async function aggiungi() {
    const imp = num(nuova.importo);
    if (!imp) { toast.error("Inserisci l'importo"); return; }
    setBusy("riga");
    try {
      applica(await cassaGiornataRiga({ giorno, tipo: nuova.tipo, numero: nuova.numero, descrizione: nuova.descrizione, modello: nuova.modello,
        prodotto_id: nuova.prodotto_id, [nuova.modalita]: imp }));
      const n = Number(nuova.numero);
      setNuova({ ...vuotaRiga, tipo: nuova.tipo, modalita: nuova.modalita, numero: nuova.tipo === "scontrino" && n ? String(n + 1) : "" });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  }

  async function chiudi() {
    if (!f) return;
    let forza = false, nota = "";
    if (!f.conti_tornano) {
      const m = prompt("I conti NON tornano. Per chiudere comunque scrivi il motivo della differenza:");
      if (!m || m.trim().length < 5) return;
      forza = true; nota = m.trim();
    } else if (!confirm(`Chiudere la cassa del ${new Date(`${giorno}T12:00:00`).toLocaleDateString("it-IT")}? L'Excel andrà nella cartella DA FIRMARE.`)) return;
    setBusy("chiudi");
    try { applica(await cassaGiornataChiudi(giorno, forza, nota)); toast.success("Giornata chiusa"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  }

  async function riapri() {
    if (!confirm("Riaprire la giornata per correggerla? Alla nuova chiusura l'Excel verrà rigenerato.")) return;
    try { applica(await cassaGiornataRiapri(giorno)); } catch (e) { toast.error((e as Error).message); }
  }

  const g = bozza;
  const ctl = (k: string) => f?.controlli.find((c) => c.chiave === k);
  const statoCtl = (k: string): "ok" | "ko" | "manca" => { const c = ctl(k); return !c ? "manca" : c.ok ? "ok" : c.mancante ? "manca" : "ko"; };
  const rp = f?.riepilogo;
  const diffContanti = rp ? tondo(rp.chiusura_contata - rp.chiusura_teorica) : 0;
  const seraVuota = !Object.values(g?.chiusura_tagli || {}).some(Boolean);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-semibold">Cassa del giorno</h1>
        <Button size="icon" variant="outline" className="size-8" onClick={() => setGiorno(spostaGiorno(giorno, -1))}><ChevronLeft className="size-4" /></Button>
        <label className="flex items-center gap-1"><CalendarDays className="size-4" />
          <input type="date" className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={giorno} onChange={(e) => e.target.value && setGiorno(e.target.value)} />
        </label>
        <Button size="icon" variant="outline" className="size-8" onClick={() => setGiorno(spostaGiorno(giorno, 1))}><ChevronRight className="size-4" /></Button>
        {giorno !== oggiRoma() && <Button size="sm" variant="ghost" onClick={() => setGiorno(oggiRoma())}>Oggi</Button>}
        {f && !f.giornata.futura && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chiusa ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"}`}>
            {chiusa ? `CHIUSA${f.giornata.chiusa_da ? ` da ${f.giornata.chiusa_da}` : ""}${f.giornata.file_scaricato_il ? " · in DA FIRMARE" : " · Excel in arrivo in DA FIRMARE"}` : "APERTA"}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <a href={cassaGiornataUrlExcel(giorno)}><Button size="sm" variant="outline"><FileSpreadsheet className="mr-1 size-4" />Excel</Button></a>
          {f?.giornata.futura ? null : chiusa
            ? <Button size="sm" variant="outline" onClick={riapri}><Unlock className="mr-1 size-4" />Riapri</Button>
            : <Button size="sm" onClick={chiudi} disabled={!f || busy === "chiudi"} className={f?.conti_tornano ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                {busy === "chiudi" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Lock className="mr-1 size-4" />}Chiudi giornata
              </Button>}
        </div>
      </div>

      {f?.giornata.futura ? (
        <Card className="p-6 text-center text-muted-foreground">
          📅 Il {new Date(`${giorno}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} deve ancora arrivare: la cassa si apre quel giorno.
          <div className="mt-2"><Button size="sm" variant="outline" onClick={() => setGiorno(oggiRoma())}>Vai alla cassa di oggi</Button></div>
        </Card>
      ) : !f || !g || !rp ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carico…</div> : (<>
        {g.origine === "excel" && (
          <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950/30">
            📄 Giornata importata dal file Excel <b>{g.file_excel}</b>: le righe sono quelle dell&apos;Excel firmato.{g.note ? ` ${g.note.split("\n").slice(-1)[0]}` : ""}
          </div>
        )}
        {/* QUADRATURA */}
        <Card className={`flex flex-wrap items-center gap-3 p-3 ${f.conti_tornano ? "border-2 border-emerald-500" : "border-2 border-red-300"}`}>
          {f.conti_tornano ? <CheckCircle2 className="size-6 text-emerald-600" /> : <XCircle className="size-6 text-red-600" />}
          <span className="text-lg font-semibold">{f.conti_tornano ? "I conti tornano" : "I conti non tornano (ancora)"}</span>
          <div className="flex flex-wrap gap-2">
            {f.controlli.map((c) => (
              <span key={c.chiave} className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.ok ? "bg-emerald-100 text-emerald-800" : c.mancante ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                {c.nome}: {c.ok ? "✓" : c.mancante ? "manca il dato" : `diff. ${eur(c.differenza)}`}
              </span>
            ))}
          </div>
          <span className="ml-auto text-sm text-muted-foreground">Incassi del giorno <b className="text-foreground">{eur(f.totale_giorno)}</b></span>
        </Card>

        {/* CONTANTI: MATTINA · SERA · CONTO */}
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_280px]">
          <Contanti titolo="☀️ Mattina — apertura cassa" colore="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20"
            sotto={g.nuova && g.apertura_da ? `Precompilata con la sera del ${new Date(`${g.apertura_da}T12:00:00`).toLocaleDateString("it-IT")}: correggi se serve` : "Conta i soldi in cassa quando apri"}
            tagli={f.tagli_apertura} valori={g.apertura_tagli || {}} disabled={chiusa} onChange={(t) => modifica({ apertura_tagli: t })} />
          <Contanti titolo="🌙 Sera — chiusura cassa" colore="border-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/20"
            sotto="Conta i soldi rimasti in cassa a fine giornata (dopo i prelievi)"
            tagli={f.tagli_chiusura} valori={g.chiusura_tagli || {}} disabled={chiusa} onChange={(t) => modifica({ chiusura_tagli: t })} />
          <Riquadro titolo="Conto dei contanti" stato={seraVuota ? "manca" : Math.abs(diffContanti) < 0.05 ? "ok" : "ko"}>
            <div className="space-y-1 text-sm tabular-nums">
              <div className="flex justify-between"><span>Mattina</span><span>{eur(rp.apertura)}</span></div>
              <div className="flex justify-between"><span>+ incassi in contanti</span><span>{eur(f.totali.contanti)}</span></div>
              <div className="flex justify-between"><span>− prelievi</span><span>{eur(rp.prelievi)}</span></div>
              <div className="flex justify-between border-t pt-1 font-semibold"><span>= devono esserci</span><span>{eur(rp.chiusura_teorica)}</span></div>
              <div className="flex justify-between"><span>contati la sera</span><span>{eur(rp.chiusura_contata)}</span></div>
              <div className={`flex justify-between border-t pt-1 text-lg font-bold ${seraVuota ? "text-muted-foreground" : Math.abs(diffContanti) < 0.05 ? "text-emerald-700" : "text-red-700"}`}>
                <span>Differenza</span><span>{seraVuota ? "conta la cassa" : Math.abs(diffContanti) < 0.05 ? "✓ torna" : eur(diffContanti)}</span>
              </div>
            </div>
          </Riquadro>
        </div>

        {/* CHIUSURE DEL GIORNO */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Riquadro titolo="POS — terminale SumUp" stato={statoCtl("pos")}
            valore={rp.pos_terminale === null ? "—" : eur(rp.pos_terminale)}
            sotto={<>righe POS del foglio {eur(f.totali.pos)}{rp.pos_da_sumup !== null ? " · letto da SumUp (pagamenti − rimborsi)" : ""}</>}>
            <DecInput className="mt-1 h-8 bg-background" disabled={chiusa} placeholder={rp.pos_da_sumup !== null ? "correggi a mano (se serve)" : "scrivi il totale del POS"}
              value={g.pos_terminale} onValue={(v) => modifica({ pos_terminale: v })} />
          </Riquadro>
          <Riquadro titolo="Registratore — chiusura scontrini" stato={statoCtl("scontrini")}
            valore={g.rt_scontrini === null || g.rt_scontrini === undefined ? "—" : eur(g.rt_scontrini)}
            sotto={<>{rp.scontrini_n} scontrini nel foglio {eur(rp.scontrini_totale)}{rp.storni_totale ? ` (storni ${eur(rp.storni_totale)})` : ""}</>}>
            <DecInput className="mt-1 h-8 bg-background" disabled={chiusa} placeholder="totale dalla chiusura fiscale" value={g.rt_scontrini}
              onValue={(v) => modifica({ rt_scontrini: v })} />
          </Riquadro>
          <Riquadro titolo="Fatture del giorno" stato="info" valore={eur(rp.fatture_totale)}
            sotto={<>{rp.fatture_n} fatture{rp.fatture_prec_totale ? ` · + fatture precedenti incassate oggi ${eur(rp.fatture_prec_totale)}` : ""}</>} />
          <Riquadro titolo="Note di credito" stato="info" valore={eur(rp.note_credito_totale)} sotto={`${rp.note_credito_n} note di credito`} />
          <Riquadro titolo="Ordini cliente — acconti" stato="info" valore={eur(rp.acconti_totale)} sotto={`${rp.acconti_n} acconti incassati oggi`} />
          <Riquadro titolo="Rimborsi" stato="info" valore={eur(rp.rimborsi_contanti + rp.storni_totale + rp.note_credito_totale)}
            sotto={<>contanti {eur(rp.rimborsi_contanti)} · storni scontrino {eur(rp.storni_totale)} · note di credito {eur(rp.note_credito_totale)}</>} />
        </div>

        {/* PRELIEVI */}
        <Card className="space-y-2 p-3">
          <div className="flex items-baseline justify-between"><span className="font-semibold">Prelievi di cassa</span><span className="font-semibold tabular-nums">{eur(rp.prelievi)}</span></div>
          {(g.prelievi || []).map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-24 text-right font-medium tabular-nums">{eur(p.importo)}</span>
              <span className="rounded bg-muted px-1.5 text-xs">{TIPI_PRELIEVO[p.tipo || "altro"] || p.tipo}</span>
              <span className="flex-1 text-muted-foreground">{p.nota}</span>
              {!chiusa && <button className="text-muted-foreground hover:text-red-600" title="Elimina prelievo"
                onClick={() => salvaPrelievi(g.prelievi.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>}
            </div>
          ))}
          {!chiusa && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
              <Input className="h-9 w-28 border-2 text-right font-semibold" inputMode="decimal" placeholder="€ importo" value={prel.importo}
                onChange={(e) => setPrel({ ...prel, importo: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aggiungiPrelievo()} />
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={prel.tipo} onChange={(e) => setPrel({ ...prel, tipo: e.target.value })}>
                {Object.entries(TIPI_PRELIEVO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <Input className="h-9 min-w-[180px] flex-1" placeholder="motivo (es. versati in banca, spesa cinesi…)" value={prel.nota}
                onChange={(e) => setPrel({ ...prel, nota: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aggiungiPrelievo()} />
              <Button size="sm" onClick={aggiungiPrelievo} disabled={busy === "prelievo"}>
                {busy === "prelievo" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}Aggiungi prelievo
              </Button>
            </div>
          )}
        </Card>

        {/* RIGHE DEL GIORNO */}
        <Card className="overflow-x-auto p-0">
          {!chiusa && (
            <div className="space-y-2 border-b bg-muted/30 p-3">
              <div className="text-sm font-semibold">Aggiungi una riga</div>
              <div className="flex flex-wrap items-end gap-2">
                <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={nuova.tipo} onChange={(e) => setNuova({ ...nuova, tipo: e.target.value })}>
                  {TIPI_RIGA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <Input className="h-9 w-20" placeholder="N. scontr." value={nuova.numero} onChange={(e) => setNuova({ ...nuova, numero: e.target.value })} />
                <CercaArticolo className="min-w-[260px] flex-1"
                  onScelto={(a) => setNuova({ ...nuova, descrizione: a.descrizione, prodotto_id: a.prodotto_id || "",
                    importo: a.prezzo_ivato !== null ? String(a.prezzo_ivato).replace(".", ",") : nuova.importo })} />
                <Input className="h-9 w-28 border-2 text-right font-semibold" placeholder="€ importo" inputMode="decimal" value={nuova.importo}
                  onChange={(e) => setNuova({ ...nuova, importo: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aggiungi()} />
                <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={nuova.modalita} onChange={(e) => setNuova({ ...nuova, modalita: e.target.value })}>
                  {COL.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Input className="h-9 min-w-[240px] flex-1" placeholder="Cosa paga? (es. SCHEDA 63020, cavo Apple USB-C…)" value={nuova.descrizione}
                  onChange={(e) => setNuova({ ...nuova, descrizione: e.target.value, prodotto_id: "" })} onKeyDown={(e) => e.key === "Enter" && aggiungi()} />
                <Input className="h-9 w-40" placeholder="Modello" value={nuova.modello} onChange={(e) => setNuova({ ...nuova, modello: e.target.value })} />
                <Button onClick={aggiungi} disabled={busy === "riga"}>{busy === "riga" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}Aggiungi riga</Button>
              </div>
              <div className="text-xs text-muted-foreground">Finché la cassa non è collegata alla dashboard, gli scontrini battuti sul registratore si registrano qui con il loro numero.</div>
            </div>
          )}
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-2 py-2 text-left">Documento</th><th className="px-2 text-left">Num.</th>
                {COL.map(([k, l]) => <th key={k} className="px-2 text-right">{l}</th>)}
                <th className="px-2 text-left">Cosa paga?</th><th className="px-2 text-left">Modello</th><th className="px-2" /></tr>
            </thead>
            <tbody>
              <tr className="border-t bg-muted/20"><td className="px-2 py-1 font-medium">APERTURA</td><td>cassa</td><td className="px-2 text-right tabular-nums">{eur(rp.apertura)}</td><td colSpan={7} /></tr>
              {f.righe.map((r) => (
                <tr key={`${r.fonte}-${r.id}`} className="border-t">
                  <td className="px-2 py-1">{r.tipo}<span className="ml-1 text-[10px] text-muted-foreground">{FONTE[r.fonte]}</span></td>
                  <td className="px-2">{r.numero}</td>
                  {COL.map(([k]) => <td key={k} className={`px-2 text-right tabular-nums ${r[k] ? (r[k] < 0 ? "text-red-600" : "") : "text-muted-foreground/40"}`}>{r[k] ? eur(r[k]) : "0"}</td>)}
                  <td className="max-w-[280px] truncate px-2" title={r.descrizione}>{r.descrizione}</td>
                  <td className="px-2">{r.modello}</td>
                  <td className="px-2 text-right">{r.fonte === "manuale" && !chiusa && (
                    <button className="text-muted-foreground hover:text-red-600" title="Elimina riga" onClick={async () => {
                      if (confirm("Eliminare questa riga?")) { try { applica(await cassaGiornataElimina(r.id)); } catch (e) { toast.error((e as Error).message); } }
                    }}><Trash2 className="size-4" /></button>)}</td>
                </tr>
              ))}
              {!f.righe.length && <tr><td colSpan={10} className="px-2 py-4 text-center text-muted-foreground">Nessun movimento</td></tr>}
              <tr className="border-t-2 font-semibold"><td className="px-2 py-1" colSpan={2}>TOTALI</td>
                {COL.map(([k]) => <td key={k} className="px-2 text-right tabular-nums">{eur(f.totali[k] + (k === "contanti" ? rp.apertura : 0))}</td>)}<td colSpan={3} /></tr>
            </tbody>
          </table>
        </Card>

        <Card className="p-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Note della giornata</span>
            <textarea className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm" disabled={chiusa} value={g.note ?? ""}
              onChange={(e) => modifica({ note: e.target.value })} />
          </label>
        </Card>
      </>)}
    </div>
  );
}
