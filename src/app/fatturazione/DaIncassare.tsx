"use client";

// Da incassare (o da pagare ai fornitori) per cliente: totale, scaduto, fatture aperte,
// estratto conto da stampare o mandare via email, incasso di più fatture insieme.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, FileText, Loader2, Mail, Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  fattCrediti, fattEstrattoInvia, fattPagamentoMultiplo, fattUrlEstratto,
  type FattCredito, type FattModalita,
} from "@/lib/api";
import { MODALITA_LABEL, STATI, dataIt, eur } from "./util";

export function DaIncassare({
  societa, anno, direzione, onApriFattura, onCambiato,
}: {
  societa: string; anno: number; direzione: "emessa" | "ricevuta";
  onApriFattura: (id: string) => void; onCambiato: () => void;
}) {
  const [dati, setDati] = useState<{ clienti: FattCredito[]; totale: number; scaduto: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [aperto, setAperto] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [email, setEmail] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [busy, setBusy] = useState("");
  const [mod, setMod] = useState<FattModalita>("bonifico");
  const oggi = new Date().toISOString().slice(0, 10);
  const emessa = direzione === "emessa";

  const carica = useCallback(async () => {
    setLoading(true);
    try { setDati(await fattCrediti(societa || "genius", direzione, anno)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [societa, direzione, anno]);
  useEffect(() => { carica(); }, [carica]);

  const clienti = useMemo(() => (dati?.clienti || []).filter((c) =>
    !q || `${c.nome} ${c.piva} ${c.cf}`.toLowerCase().includes(q.toLowerCase())), [dati, q]);

  function apri(c: FattCredito) {
    if (aperto === c.chiave) { setAperto(null); return; }
    setAperto(c.chiave);
    setSel(Object.fromEntries(c.fatture.map((f) => [f.id, true])));
    setEmail(c.email || "");
    setMessaggio("");
  }
  const scelte = (c: FattCredito) => c.fatture.filter((f) => sel[f.id]).map((f) => f.id);

  async function invia(c: FattCredito) {
    const ids = scelte(c);
    if (!ids.length) { toast.error("Seleziona almeno una fattura"); return; }
    setBusy("mail");
    try {
      const r = await fattEstrattoInvia({ societa: societa || "genius", chiave: c.chiave, email, ids, messaggio });
      toast.success(`Estratto inviato a ${r.email}: ${r.fatture} fatture, ${eur(r.totale)}`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  }
  async function incassa(c: FattCredito) {
    const ids = scelte(c);
    if (!ids.length) { toast.error("Seleziona almeno una fattura"); return; }
    if (!confirm(`Segnare ${ids.length} fatture come ${emessa ? "incassate" : "pagate"} (${MODALITA_LABEL[mod]}, oggi)?`)) return;
    setBusy("pag");
    try {
      await fattPagamentoMultiplo({ ids, modalita: mod });
      toast.success(`${ids.length} fatture segnate ${emessa ? "incassate" : "pagate"}`);
      setAperto(null); carica(); onCambiato();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input className="h-8 w-64 pl-8" placeholder={emessa ? "Cerca cliente…" : "Cerca fornitore…"} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {dati && (
          <div className="text-sm">
            <b>{eur(dati.totale)}</b> {emessa ? "da incassare" : "da pagare"} da {dati.clienti.length} {emessa ? "clienti" : "fornitori"}
            {dati.scaduto > 0 && <span className="ml-2 text-red-600">di cui scaduto {eur(dati.scaduto)}</span>}
          </div>
        )}
      </div>
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
                {c.scaduto > 0 && <span className="text-xs text-red-600">scaduto {eur(c.scaduto)}</span>}
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
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input className="h-8" placeholder="Email del cliente" value={email} onChange={(e) => setEmail(e.target.value)} />
                      <Input className="h-8" placeholder="Messaggio in testa all'estratto (facoltativo)" value={messaggio} onChange={(e) => setMessaggio(e.target.value)} />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {emessa && (
                      <>
                        <a href={fattUrlEstratto(societa || "genius", c.chiave, scelte(c), messaggio)} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline"><FileText /> Estratto conto (stampa / PDF)</Button>
                        </a>
                        <Button size="sm" variant="outline" disabled={!!busy || !email} onClick={() => invia(c)}>
                          {busy === "mail" ? <Loader2 className="animate-spin" /> : <Mail />} Invia estratto via email
                        </Button>
                      </>
                    )}
                    <select className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-sm" value={mod} onChange={(e) => setMod(e.target.value as FattModalita)}>
                      {(["bonifico", "pos_sumup", "paypal", "contanti", "carta_stripe"] as FattModalita[]).map((m) => <option key={m} value={m}>{MODALITA_LABEL[m]}</option>)}
                    </select>
                    <Button size="sm" disabled={!!busy} onClick={() => incassa(c)}>
                      {busy === "pag" ? <Loader2 className="animate-spin" /> : <Wallet />} Segna {emessa ? "incassate" : "pagate"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!clienti.length && <div className="p-8 text-center text-muted-foreground">Niente {emessa ? "da incassare" : "da pagare"}</div>}
        </Card>
      )}
    </div>
  );
}
