"use client";

// CASSA DEL GIORNO (GENIUS LAB) — il vecchio Excel «BASE CASSA» che si compila da solo:
// fatture e scontrini della dashboard entrano in automatico, gli scontrini battuti alla cassa si aggiungono a mano.
// In fondo: contanti per tagli (apertura/chiusura), prelievi, riepilogo POS, chiusura del registratore e quadratura.
// Se i conti tornano si chiude la giornata e l'Excel finisce nella cartella DA FIRMARE.

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, Lock, Plus, Trash2, Unlock, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  cassaGiornata, cassaGiornataChiudi, cassaGiornataElimina, cassaGiornataRiapri, cassaGiornataRiga, cassaGiornataSalva, cassaGiornataUrlExcel,
  type FoglioCassa, type Tagli,
} from "@/lib/api";

const eur = (v: number | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const COL = [["contanti", "Contanti"], ["pos", "POS"], ["stripe", "Stripe"], ["bonifico", "Bonifico"], ["paypal", "PayPal"]] as const;
const FONTE: Record<string, string> = { fattura: "auto", fattura_prec: "auto", scontrino: "dashboard", manuale: "a mano" };
const oggiRoma = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
const spostaGiorno = (g: string, n: number) => { const d = new Date(`${g}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

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

function TagliBox({ titolo, tagli, valori, onChange, disabled }: {
  titolo: string; tagli: string[]; valori: Tagli; onChange: (t: Tagli) => void; disabled: boolean;
}) {
  const tot = tagli.reduce((s, t) => s + Number(t) * (valori[t] || 0), 0);
  const visibili = tagli.filter((t) => Number(t) >= 0.5 || valori[t]);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between"><span className="text-sm font-medium">{titolo}</span><span className="font-semibold tabular-nums">{eur(tot)}</span></div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {visibili.map((t) => (
          <label key={t} className="flex items-center gap-2 text-xs">
            <span className="w-16 text-muted-foreground">{Number(t) >= 5 ? "€" : "moneta"} {t.replace(".", ",")}</span>
            <Input type="number" min={0} inputMode="numeric" className="h-7 w-16 px-1 text-right" disabled={disabled}
              value={valori[t] ?? ""} onChange={(e) => onChange({ ...valori, [t]: Math.max(0, parseInt(e.target.value || "0", 10) || 0) })} />
            <span className="tabular-nums text-muted-foreground">{eur(Number(t) * (valori[t] || 0))}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function CassaGiornataPage() {
  const [giorno, setGiorno] = useState(oggiRoma());
  const [f, setF] = useState<FoglioCassa | null>(null);
  const [bozza, setBozza] = useState<FoglioCassa["giornata"] | null>(null);
  const [busy, setBusy] = useState("");
  const [nuova, setNuova] = useState({ tipo: "scontrino", numero: "", importo: "", modalita: "contanti", descrizione: "", modello: "" });
  const salvaT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chiusa = f?.giornata.stato === "chiusa";

  const applica = useCallback((r: FoglioCassa) => { setF(r); setBozza(r.giornata); }, []);
  const ricarica = useCallback(() => {
    cassaGiornata(giorno).then(applica).catch((e: Error) => toast.error(e.message));
  }, [giorno, applica]);
  useEffect(() => { setF(null); ricarica(); }, [ricarica]);
  // le fatture e gli scontrini della dashboard entrano da soli: aggiorno ogni minuto se la giornata è aperta
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
          apertura_tagli: b.apertura_tagli, chiusura_tagli: b.chiusura_tagli, prelievi: b.prelievi,
          pos_terminale: b.pos_terminale, rt_scontrini: b.rt_scontrini, note: b.note,
        }));
      } catch (e) { toast.error((e as Error).message); }
    }, 700);
  }

  async function aggiungi() {
    const imp = num(nuova.importo);
    if (!imp) { toast.error("Inserisci l'importo"); return; }
    setBusy("riga");
    try {
      applica(await cassaGiornataRiga({ giorno, tipo: nuova.tipo, numero: nuova.numero, descrizione: nuova.descrizione, modello: nuova.modello, [nuova.modalita]: imp }));
      setNuova({ ...nuova, numero: nuova.tipo === "scontrino" && nuova.numero ? String(Number(nuova.numero) + 1 || "") : "", importo: "", descrizione: "", modello: "" });
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
        {f && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chiusa ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"}`}>
            {chiusa ? `CHIUSA${f.giornata.chiusa_da ? ` da ${f.giornata.chiusa_da}` : ""}${f.giornata.file_scaricato_il ? " · in DA FIRMARE" : " · Excel in arrivo in DA FIRMARE"}` : "APERTA"}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <a href={cassaGiornataUrlExcel(giorno)}><Button size="sm" variant="outline"><FileSpreadsheet className="mr-1 size-4" />Excel</Button></a>
          {chiusa
            ? <Button size="sm" variant="outline" onClick={riapri}><Unlock className="mr-1 size-4" />Riapri</Button>
            : <Button size="sm" onClick={chiudi} disabled={!f || busy === "chiudi"} className={f?.conti_tornano ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                {busy === "chiudi" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Lock className="mr-1 size-4" />}Chiudi giornata
              </Button>}
        </div>
      </div>

      {!f || !g ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carico…</div> : (<>
        {/* QUADRATURA */}
        <Card className={`p-3 ${f.conti_tornano ? "border-emerald-500" : ""}`}>
          <div className="mb-2 flex items-center gap-2 font-medium">
            {f.conti_tornano ? <CheckCircle2 className="size-5 text-emerald-600" /> : <XCircle className="size-5 text-red-600" />}
            {f.conti_tornano ? "I conti tornano" : "I conti non tornano (ancora)"}
            <span className="ml-auto text-sm text-muted-foreground">Totale incassi del giorno <b className="text-foreground">{eur(f.totale_giorno)}</b></span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {f.controlli.map((c) => (
              <div key={c.chiave} className={`rounded-md border p-2 text-sm ${c.ok ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : c.mancante ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "border-red-300 bg-red-50 dark:bg-red-950/30"}`}>
                <div className="flex justify-between font-medium"><span>{c.nome}</span><span>{c.ok ? "OK" : c.mancante ? "manca il dato" : `diff. ${eur(c.differenza)}`}</span></div>
                <div className="text-xs text-muted-foreground">atteso {c.atteso === null ? "—" : eur(c.atteso)} · trovato {eur(c.trovato)}</div>
                <div className="text-xs text-muted-foreground">{c.nota}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* RIEPILOGO */}
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[["Fatture del giorno", `${f.riepilogo.fatture_n} · ${eur(f.riepilogo.fatture_totale)}`], ["Fatture prec. incassate", eur(f.riepilogo.fatture_prec_totale)],
            ["Scontrini", `${f.riepilogo.scontrini_n} · ${eur(f.riepilogo.scontrini_totale)}`], ...COL.map(([k, l]) => [l, eur(f.totali[k])])].map(([l, v]) => (
            <Card key={l} className="p-2"><div className="text-xs text-muted-foreground">{l}</div><div className="font-semibold tabular-nums">{v}</div></Card>
          ))}
        </div>

        {/* RIGHE */}
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-2 py-2 text-left">Scontr/Fatt</th><th className="px-2 text-left">Num.</th>
                {COL.map(([k, l]) => <th key={k} className="px-2 text-right">{l}</th>)}
                <th className="px-2 text-left">Cosa paga?</th><th className="px-2 text-left">Modello</th><th className="px-2" /></tr>
            </thead>
            <tbody>
              <tr className="border-t bg-muted/20"><td className="px-2 py-1 font-medium">APERTURA</td><td>cassa</td><td className="px-2 text-right tabular-nums">{eur(f.riepilogo.apertura)}</td><td colSpan={7} /></tr>
              {f.righe.map((r) => (
                <tr key={`${r.fonte}-${r.id}`} className="border-t">
                  <td className="px-2 py-1">{r.tipo}<span className="ml-1 text-[10px] text-muted-foreground">{FONTE[r.fonte]}</span></td>
                  <td className="px-2">{r.numero}</td>
                  {COL.map(([k]) => <td key={k} className={`px-2 text-right tabular-nums ${r[k] ? "" : "text-muted-foreground/40"}`}>{r[k] ? eur(r[k]) : "0"}</td>)}
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
                {COL.map(([k]) => <td key={k} className="px-2 text-right tabular-nums">{eur(f.totali[k] + (k === "contanti" ? f.riepilogo.apertura : 0))}</td>)}<td colSpan={3} /></tr>
            </tbody>
          </table>
          {!chiusa && (
            <div className="flex flex-wrap items-end gap-2 border-t bg-muted/20 p-2">
              <span className="self-center text-xs font-medium">Aggiungi a mano:</span>
              <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={nuova.tipo} onChange={(e) => setNuova({ ...nuova, tipo: e.target.value })}>
                <option value="scontrino">Scontrino (dalla cassa)</option><option value="fattura">Fattura (fuori dashboard)</option>
                <option value="acconto">Acconto</option><option value="reso">Reso / rimborso</option><option value="altro">Altro</option>
              </select>
              <Input className="h-8 w-20" placeholder="Num." value={nuova.numero} onChange={(e) => setNuova({ ...nuova, numero: e.target.value })} />
              <Input className="h-8 w-24" placeholder="Importo" inputMode="decimal" value={nuova.importo} onChange={(e) => setNuova({ ...nuova, importo: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && aggiungi()} />
              <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={nuova.modalita} onChange={(e) => setNuova({ ...nuova, modalita: e.target.value })}>
                {COL.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <Input className="h-8 min-w-[200px] flex-1" placeholder="Cosa paga? (es. SCHEDA 63020, vetrino…)" value={nuova.descrizione}
                onChange={(e) => setNuova({ ...nuova, descrizione: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aggiungi()} />
              <Input className="h-8 w-32" placeholder="Modello" value={nuova.modello} onChange={(e) => setNuova({ ...nuova, modello: e.target.value })} />
              <Button size="sm" onClick={aggiungi} disabled={busy === "riga"}>{busy === "riga" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}</Button>
            </div>
          )}
        </Card>

        {/* CONTANTI, PRELIEVI, POS, REGISTRATORE */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-3 p-3">
            <TagliBox titolo={`Apertura contanti${g.nuova && g.apertura_da ? ` (dalla chiusura del ${new Date(`${g.apertura_da}T12:00:00`).toLocaleDateString("it-IT")})` : ""}`}
              tagli={f.tagli} valori={g.apertura_tagli || {}} disabled={chiusa} onChange={(t) => modifica({ apertura_tagli: t })} />
          </Card>
          <Card className="space-y-3 p-3">
            <TagliBox titolo="Chiusura contanti (conteggio)" tagli={f.tagli} valori={g.chiusura_tagli || {}} disabled={chiusa} onChange={(t) => modifica({ chiusura_tagli: t })} />
            <div className="border-t pt-2 text-sm">
              <div className="flex justify-between"><span>In cassa dovrebbero esserci</span><b className="tabular-nums">{eur(f.riepilogo.chiusura_teorica)}</b></div>
              <div className="text-xs text-muted-foreground">apertura {eur(f.riepilogo.apertura)} + contanti {eur(f.totali.contanti)} − prelievi {eur(f.riepilogo.prelievi)}</div>
            </div>
          </Card>
          <Card className="space-y-3 p-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm font-medium">Prelievi di cassa
                {!chiusa && <Button size="sm" variant="ghost" className="h-7" onClick={() => modifica({ prelievi: [...(g.prelievi || []), { importo: 0, nota: "" }] })}><Plus className="size-3" /></Button>}
              </div>
              {(g.prelievi || []).map((p, i) => (
                <div key={i} className="flex gap-1">
                  <DecInput className="h-7 w-24 text-right" placeholder="€" disabled={chiusa} value={p.importo}
                    onValue={(v) => modifica({ prelievi: g.prelievi.map((x, j) => (j === i ? { ...x, importo: v || 0 } : x)) })} />
                  <Input className="h-7 flex-1" placeholder="motivo (es. cinesi, spesa…)" disabled={chiusa} value={p.nota}
                    onChange={(e) => modifica({ prelievi: g.prelievi.map((x, j) => (j === i ? { ...x, nota: e.target.value } : x)) })} />
                  {!chiusa && <button className="text-muted-foreground hover:text-red-600" onClick={() => modifica({ prelievi: g.prelievi.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></button>}
                </div>
              ))}
              {!(g.prelievi || []).length && <div className="text-xs text-muted-foreground">Nessun prelievo</div>}
            </div>
            <label className="block space-y-1 border-t pt-2 text-sm">
              <span className="font-medium">Riepilogo terminale POS (totale del giorno)</span>
              <DecInput className="h-8" disabled={chiusa} placeholder={f.riepilogo.pos_da_sumup !== null ? `da SumUp: ${eur(f.riepilogo.pos_da_sumup)}` : "es. 792,06"}
                value={g.pos_terminale} onValue={(v) => modifica({ pos_terminale: v })} />
              <span className="text-xs text-muted-foreground">{f.riepilogo.pos_da_sumup !== null ? "Letto da SumUp: scrivi solo per correggere." : "Dallo scontrino di chiusura del POS (finché non colleghiamo l'API SumUp)."}</span>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Chiusura registratore: totale scontrini</span>
              <DecInput className="h-8" disabled={chiusa} placeholder="dalla chiusura fiscale giornaliera" value={g.rt_scontrini}
                onValue={(v) => modifica({ rt_scontrini: v })} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Note</span>
              <textarea className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm" disabled={chiusa} value={g.note ?? ""}
                onChange={(e) => modifica({ note: e.target.value })} />
            </label>
          </Card>
        </div>
      </>)}
    </div>
  );
}
