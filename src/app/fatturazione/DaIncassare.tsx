"use client";

// Da incassare (o da pagare ai fornitori) per cliente: totale, scaduto, fatture aperte.
// Filtro per periodo (mese in corso, mese precedente, anno, una data, un intervallo), estratto conto in PDF,
// richiesta di pagamento via email con l'estratto del periodo (e, a scelta, le copie PDF delle fatture),
// incasso di più fatture insieme.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, FileDown, Loader2, RotateCcw, Search, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  fattCrediti, fattEstrattoInvia, fattPagamentoMultiplo, fattUrlEstrattoPdf,
  type FattCredito, type FattModalita,
} from "@/lib/api";
import { MODALITA_LABEL, STATI, dataIt, eur } from "./util";
import { oggiRoma } from "@/lib/date";
import { toastErrore } from "@/lib/errori";

type Periodo = "tutto" | "mese" | "mese_prec" | "anno" | "anno_prec" | "giorno" | "intervallo";
const PERIODI: [Periodo, string][] = [
  ["tutto", "Tutte"], ["mese", "Mese in corso"], ["mese_prec", "Mese precedente"], ["anno", "Anno in corso"],
  ["anno_prec", "Anno precedente"], ["giorno", "Una data"], ["intervallo", "Dal… al…"],
];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Periodo scelto → date dal/al (data fattura) + etichetta per la mail. */
export function calcolaPeriodo(p: Periodo, giorno: string, dal: string, al: string): { dal: string; al: string; label: string } {
  const oggi = new Date();
  const y = oggi.getFullYear(), m = oggi.getMonth();
  switch (p) {
    case "mese": return { dal: iso(new Date(y, m, 1)), al: iso(new Date(y, m + 1, 0)), label: `${MESI[m]} ${y}` };
    case "mese_prec": {
      const d = new Date(y, m - 1, 1);
      return { dal: iso(d), al: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)), label: `${MESI[d.getMonth()]} ${d.getFullYear()}` };
    }
    case "anno": return { dal: `${y}-01-01`, al: `${y}-12-31`, label: `anno ${y}` };
    case "anno_prec": return { dal: `${y - 1}-01-01`, al: `${y - 1}-12-31`, label: `anno ${y - 1}` };
    case "giorno": return giorno ? { dal: giorno, al: giorno, label: `del ${dataIt(giorno)}` } : { dal: "", al: "", label: "" };
    case "intervallo": return { dal, al, label: dal || al ? `${dal ? `dal ${dataIt(dal)}` : ""} ${al ? `al ${dataIt(al)}` : ""}`.trim() : "" };
    default: return { dal: "", al: "", label: "" };
  }
}

export function DaIncassare({
  societa, anno, direzione, onApriFattura, onCambiato, cercaIniziale = "",
}: {
  societa: string; anno: number; direzione: "emessa" | "ricevuta";
  onApriFattura: (id: string) => void; onCambiato: () => void; cercaIniziale?: string;
}) {
  const [dati, setDati] = useState<{ clienti: FattCredito[]; totale: number; scaduto: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(cercaIniziale);
  const [periodo, setPeriodo] = useState<Periodo>("tutto");
  const [giorno, setGiorno] = useState("");
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [soloScadute, setSoloScadute] = useState(false);
  const [aperto, setAperto] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [email, setEmail] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [allega, setAllega] = useState(false);
  const [busy, setBusy] = useState("");
  const [mod, setMod] = useState<FattModalita>("bonifico");
  const oggi = oggiRoma();
  const emessa = direzione === "emessa";
  const per = useMemo(() => calcolaPeriodo(periodo, giorno, dal, al), [periodo, giorno, dal, al]);

  const carica = useCallback(async () => {
    setLoading(true);
    try { setDati(await fattCrediti(societa || "genius", direzione, anno, per.dal, per.al)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [societa, direzione, anno, per.dal, per.al]);
  useEffect(() => { carica(); }, [carica]);

  const clienti = useMemo(() => (dati?.clienti || []).filter((c) =>
    (!q || `${c.nome} ${c.piva} ${c.cf}`.toLowerCase().includes(q.toLowerCase())) && (!soloScadute || c.scaduto > 0)), [dati, q, soloScadute]);
  const totVisibile = clienti.reduce((s, c) => s + c.totale, 0);

  function azzera() {
    setQ(""); setPeriodo("tutto"); setGiorno(""); setDal(""); setAl(""); setSoloScadute(false); setAperto(null);
  }

  function apri(c: FattCredito) {
    if (aperto === c.chiave) { setAperto(null); return; }
    setAperto(c.chiave);
    setSel(Object.fromEntries(c.fatture.map((f) => [f.id, true])));
    setEmail(c.email || "");
    setMessaggio("");
    setAllega(false);
  }
  const scelte = (c: FattCredito) => c.fatture.filter((f) => sel[f.id]).map((f) => f.id);

  async function richiedi(c: FattCredito) {
    const ids = scelte(c);
    if (!ids.length) { toast.error("Seleziona almeno una fattura"); return; }
    const tot = c.fatture.filter((f) => sel[f.id]).reduce((s, f) => s + Number(f.totale), 0);
    if (!confirm(`Inviare a ${email} la richiesta di pagamento${per.label ? ` (${per.label})` : ""}: ${ids.length} fatture, ${eur(tot)}` +
      `${allega ? ", con le copie PDF delle fatture" : ""}?`)) return;
    setBusy("mail");
    try {
      const r = await fattEstrattoInvia({ societa: societa || "genius", chiave: c.chiave, email, ids, messaggio,
        dal: per.dal, al: per.al, allega_fatture: allega });
      toast.success(`Richiesta di pagamento inviata a ${r.email} da ${r.mittente}: ${r.fatture} fatture, ${eur(r.totale)} (${r.allegati} PDF)`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  }
  async function incassa(c: FattCredito) {
    if (busy) return;
    const ids = scelte(c);
    if (!ids.length) { toast.error("Seleziona almeno una fattura"); return; }
    if (!confirm(`Segnare ${ids.length} fatture come ${emessa ? "incassate" : "pagate"} (${MODALITA_LABEL[mod]}, oggi)?`)) return;
    setBusy("pag");
    try {
      await fattPagamentoMultiplo({ ids, modalita: mod });
      toast.success(`${ids.length} fatture segnate ${emessa ? "incassate" : "pagate"}`);
      setAperto(null); carica(); onCambiato();
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  const campo = "h-8 rounded-md border border-input bg-background px-2 text-sm";
  const filtrato = !!q || periodo !== "tutto" || soloScadute;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input className="h-8 w-60 pl-8" placeholder={emessa ? "Cerca cliente (es. Bagnetti)…" : "Cerca fornitore…"} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {PERIODI.map(([k, l]) => (
            <Button key={k} size="xs" variant={periodo === k ? "default" : "outline"} onClick={() => setPeriodo(k)}>{l}</Button>
          ))}
        </div>
        {periodo === "giorno" && <input type="date" className={campo} value={giorno} onChange={(e) => setGiorno(e.target.value)} />}
        {periodo === "intervallo" && (
          <span className="flex items-center gap-1 text-sm">
            dal <input type="date" className={campo} value={dal} onChange={(e) => setDal(e.target.value)} />
            al <input type="date" className={campo} value={al} onChange={(e) => setAl(e.target.value)} />
          </span>
        )}
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={soloScadute} onChange={(e) => setSoloScadute(e.target.checked)} /> solo con scaduto
        </label>
        {filtrato && <Button size="xs" variant="ghost" onClick={azzera}><RotateCcw /> Azzera filtri</Button>}
      </div>
      {dati && (
        <div className="text-sm">
          <b>{eur(totVisibile)}</b> {emessa ? "da incassare" : "da pagare"} da {clienti.length} {emessa ? "clienti" : "fornitori"}
          {per.label && <span className="text-muted-foreground"> · fatture {per.label.startsWith("dal") || per.label.startsWith("del") ? per.label : `di ${per.label}`}</span>}
          {dati.scaduto > 0 && !q && <span className="ml-2 text-red-600">di cui scaduto {eur(dati.scaduto)}</span>}
        </div>
      )}
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : (
        <Card className="divide-y p-0">
          {clienti.map((c) => (
            <div key={c.chiave}>
              <button className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50" onClick={() => apri(c)}>
                {aperto === c.chiave ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                <div className="flex-1">
                  <div className="font-medium">{c.nome}</div>
                  <div className="text-xs text-muted-foreground">{c.piva || c.cf || ""} · {c.n} fatture · dalla {dataIt(c.piu_vecchia)}</div>
                </div>
                {c.scaduto > 0 && <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-600">scaduto {eur(c.scaduto)}</span>}
                <span className="w-28 text-right font-semibold tabular-nums">{eur(c.totale)}</span>
              </button>
              {aperto === c.chiave && (
                <div className="space-y-3 bg-muted/30 p-3">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground">
                      <th className="w-8 p-1"><input type="checkbox" checked={c.fatture.every((f) => sel[f.id])}
                        onChange={(e) => setSel(Object.fromEntries(c.fatture.map((f) => [f.id, e.target.checked])))} /></th>
                      <th className="p-1">Numero</th><th className="p-1">Data</th><th className="p-1">Scadenza</th><th className="p-1">SdI</th>
                      <th className="p-1 text-right">Importo</th></tr></thead>
                    <tbody>
                      {c.fatture.map((f) => (
                        <tr key={f.id} className="border-t">
                          <td className="p-1"><input type="checkbox" checked={!!sel[f.id]} onChange={(e) => setSel((p) => ({ ...p, [f.id]: e.target.checked }))} /></td>
                          <td className="p-1"><button className="underline" onClick={() => onApriFattura(f.id)}>{f.numero}</button></td>
                          <td className="p-1">{dataIt(f.data)}</td>
                          <td className={`p-1 ${(f.scadenza || f.data || "") < oggi ? "font-medium text-red-600" : ""}`}>{dataIt(f.scadenza)}</td>
                          <td className="p-1 text-xs">{(STATI[f.stato] || { label: f.stato }).label}</td>
                          <td className="p-1 text-right tabular-nums">{eur(f.totale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="text-right text-sm">Selezionate: <b>{eur(c.fatture.filter((f) => sel[f.id]).reduce((s, f) => s + Number(f.totale), 0))}</b></div>
                  {emessa && (
                    <div className="space-y-2 rounded-md border bg-background p-2">
                      <div className="text-xs font-medium">
                        Richiesta di pagamento{per.label ? ` — estratto ${per.label.startsWith("dal") || per.label.startsWith("del") ? per.label : `di ${per.label}`}` : ""}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input className="h-8" placeholder="Email del cliente" value={email} onChange={(e) => setEmail(e.target.value)} />
                        <Input className="h-8" placeholder="Messaggio in testa all'estratto (facoltativo)" value={messaggio} onChange={(e) => setMessaggio(e.target.value)} />
                      </div>
                      <label className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" checked={allega} onChange={(e) => setAllega(e.target.checked)} />
                        allega anche la copia PDF di ogni fattura
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <a href={fattUrlEstrattoPdf(societa || "genius", c.chiave, scelte(c), messaggio, per.dal, per.al)} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline"><FileDown /> PDF estratto</Button>
                        </a>
                        <Button size="sm" disabled={!!busy || !email} onClick={() => richiedi(c)}>
                          {busy === "mail" ? <Loader2 className="animate-spin" /> : <Send />} Richiedi pagamento via email
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <select className={campo} value={mod} onChange={(e) => setMod(e.target.value as FattModalita)}>
                      {(["bonifico", "pos_sumup", "paypal", "contanti", "carta_stripe"] as FattModalita[]).map((m) => <option key={m} value={m}>{MODALITA_LABEL[m]}</option>)}
                    </select>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => incassa(c)}>
                      {busy === "pag" ? <Loader2 className="animate-spin" /> : <Wallet />} Segna {emessa ? "incassate" : "pagate"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!clienti.length && <div className="p-8 text-center text-muted-foreground">Niente {emessa ? "da incassare" : "da pagare"} con questi filtri</div>}
        </Card>
      )}
    </div>
  );
}
