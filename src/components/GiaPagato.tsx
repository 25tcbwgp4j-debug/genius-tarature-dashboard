"use client";

// «GIÀ PAGATO» (05/10/2026) — il cliente ha già pagato PRIMA della fattura, fuori dal banco:
// - POS piccolo (Solo) / POS P8: data + codice transazione SumUp, oppure ricerca tra le transazioni POS arrivate;
// - PayPal: data + importo + ID transazione, oppure ricerca tra i movimenti PayPal (API PayPal del conto Genius):
//   si propongono quelli con importo UGUALE al residuo o POCO PIÙ ALTO (il cliente ha aggiunto la commissione
//   PayPal, es. Medianet ~3,5%): in fattura va il residuo, la differenza resta annotata sul movimento;
// - Altro: assegno (MP02 nell'XML).
// Il pagamento si registra sul registro `pagamenti` della fattura (stesso percorso del componente Incassa).

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Loader2, Search, Wallet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDec } from "@/components/DecInput";
import { toastErrore } from "@/lib/errori";
import { oggiRoma } from "@/lib/date";
import { pagMovimentiFattura, type ModalitaIncasso, type MovimentoProposto } from "@/lib/api";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

type Tipo = "piccolo" | "p8" | "paypal" | "assegno";
const TIPI: { k: Tipo; etichetta: string; modalita: ModalitaIncasso; icon: typeof CreditCard }[] = [
  { k: "piccolo", etichetta: "Già incassato col POS piccolo", modalita: "pos_sumup", icon: CreditCard },
  { k: "p8", etichetta: "Già incassato col POS P8", modalita: "pos_sumup", icon: CreditCard },
  { k: "paypal", etichetta: "Già pagato con PayPal", modalita: "paypal", icon: Wallet },
  { k: "assegno", etichetta: "Altro: assegno", modalita: "assegno", icon: FileText },
];

export type GiaPagatoDati = { modalita: ModalitaIncasso; importo: number; data: string; transaction_code?: string;
  incasso_id?: string; riferimento?: string };

export function GiaPagato({ fatturaId, residuo, disabled = false, motivo = "", onRegistra, iniziale }: {
  fatturaId: string; residuo: number; disabled?: boolean; motivo?: string;
  onRegistra: (d: GiaPagatoDati) => Promise<boolean>;
  /** apre subito un metodo (es. «paypal» quando i termini del cliente dicono PayPal) */
  iniziale?: Tipo | null;
}) {
  const [tipo, setTipo] = useState<Tipo | null>(iniziale || null);
  const [data, setData] = useState(oggiRoma());
  const [importoTxt, setImportoTxt] = useState("");
  const [codice, setCodice] = useState("");
  const [scelto, setScelto] = useState<MovimentoProposto | null>(null);
  const [mov, setMov] = useState<MovimentoProposto[] | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const t = TIPI.find((x) => x.k === tipo);
  const scritto = parseDec(importoTxt);
  const importo = scritto !== null && !Number.isNaN(scritto) && scritto > 0 ? r2(scritto) : r2(residuo);
  const oltre = importo > residuo + 0.005;

  function apri(k: Tipo) {
    setTipo(tipo === k ? null : k); setScelto(null); setMov(null); setAvviso(null); setCodice(""); setImportoTxt("");
  }

  async function cerca() {
    if (!t || t.modalita === "assegno") return;
    setBusy("cerca");
    try {
      const r = await pagMovimentiFattura(fatturaId, t.modalita === "paypal" ? "paypal" : "pos_sumup", true);
      setMov(r.movimenti || []);
      setAvviso([r.nota, r.avviso].filter(Boolean).join(" · ") || null);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  function scegli(m: MovimentoProposto) {
    setScelto(m); setCodice(m.codice); setData(String(m.data).slice(0, 10)); setImportoTxt(String(m.registra).replace(".", ","));
  }

  async function registra() {
    if (!t || disabled || busy || oltre || !(importo > 0)) return;
    const cod = codice.trim();
    if (t.modalita !== "assegno" && !cod && !scelto) { toast.error("Scrivi il codice della transazione o sceglila dall'elenco"); return; }
    if (t.modalita === "assegno" && !cod) { toast.error("Scrivi numero e banca dell'assegno"); return; }
    const diff = scelto ? r2(scelto.importo - importo) : 0;
    if (!confirm(`Registrare ${eur(importo)} — ${t.etichetta.replace(/^Già (incassato|pagato) /, "")} del ${data.split("-").reverse().join("/")}`
      + (cod && t.modalita !== "assegno" ? `, transazione ${cod}` : cod ? `, ${cod}` : "")
      + (diff > 0.005 ? `\n\nIl movimento è di ${eur(scelto!.importo)}: ${eur(diff)} in più = commissione PayPal pagata dal cliente (NON va in fattura).` : "")
      + "?")) return;
    setBusy("registra");
    try {
      const ok = await onRegistra({
        modalita: t.modalita, importo, data,
        ...(scelto ? { incasso_id: scelto.id } : {}),
        ...(t.modalita === "assegno" ? { riferimento: `Assegno ${cod}` } : { transaction_code: cod || undefined }),
        ...(t.k === "p8" && !scelto ? { riferimento: `POS P8 · SumUp ${cod} (dichiarato)` } : {}),
        ...(t.k === "piccolo" && !scelto ? { riferimento: `POS piccolo · SumUp ${cod} (dichiarato)` } : {}),
      });
      if (ok) { setTipo(null); setScelto(null); setMov(null); setCodice(""); setImportoTxt(""); }
    } finally { setBusy(""); }
  }

  const stile = "h-auto min-h-11 whitespace-normal text-sm leading-tight";
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Il cliente ha GIÀ pagato (prima della fattura)?</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TIPI.map((x) => (
          <Button key={x.k} variant={tipo === x.k ? "default" : "outline"} className={stile} disabled={disabled || residuo <= 0.005}
            onClick={() => apri(x.k)}><x.icon className="size-4" />{x.etichetta}</Button>
        ))}
      </div>
      {motivo && tipo && <div className="text-xs text-amber-700 dark:text-amber-300">Prima {motivo}.</div>}
      {t && (
        <div className="space-y-2 rounded-md border border-primary/40 p-3 text-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">Data del pagamento
              <Input type="date" className="mt-0.5 h-11" value={data} onChange={(e) => setData(e.target.value)} /></label>
            <label className="text-xs text-muted-foreground">Importo da registrare
              <Input inputMode="decimal" className="mt-0.5 h-11 text-right font-semibold" placeholder={eur(residuo)} value={importoTxt}
                onChange={(e) => setImportoTxt(e.target.value)} /></label>
            <label className="col-span-2 text-xs text-muted-foreground sm:col-span-1">
              {t.modalita === "paypal" ? "ID transazione PayPal" : t.modalita === "assegno" ? "N. assegno e banca" : "Codice transazione SumUp"}
              <Input className="mt-0.5 h-11 font-mono" value={codice} placeholder={t.modalita === "paypal" ? "es. 7KT41437CN7442157" : t.modalita === "assegno" ? "es. 1234567 Intesa" : "es. TAAA6RQN92K"}
                onChange={(e) => { setCodice(e.target.value); if (scelto && e.target.value !== scelto.codice) setScelto(null); }} /></label>
          </div>
          {oltre && <div className="text-xs font-semibold text-red-700">L&apos;importo supera quanto resta ({eur(residuo)}).</div>}
          {t.modalita !== "assegno" && (
            <Button size="sm" variant="outline" className="min-h-11" disabled={!!busy} onClick={cerca}>
              {busy === "cerca" ? <Loader2 className="animate-spin" /> : <Search />}
              {t.modalita === "paypal" ? "Cerca tra le transazioni PayPal" : "Cerca tra le transazioni POS"}</Button>
          )}
          {avviso && <div className="text-xs text-muted-foreground">{avviso}</div>}
          {mov && !mov.length && <div className="text-xs text-muted-foreground">Nessun movimento con importo uguale o poco più alto di {eur(residuo)}: inserisci i dati a mano.</div>}
          {mov && mov.length > 0 && (
            <div className="divide-y rounded-md border">
              {mov.map((m) => (
                <button key={m.id} className={`flex w-full items-center justify-between gap-2 px-2 py-2 text-left text-sm hover:bg-muted ${scelto?.id === m.id ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}
                  onClick={() => scegli(m)}>
                  <span>{scelto?.id === m.id && <CheckCircle2 className="mr-1 inline size-4 text-emerald-600" />}
                    <b>{eur(m.importo)}</b> · {new Date(m.data).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {m.ordinante ? ` · ${m.ordinante}` : ""}
                    <span className="block text-xs text-muted-foreground">{m.perche}{m.causale ? ` · «${m.causale.slice(0, 60)}»` : ""} · {m.codice}</span></span>
                  {m.differenza > 0.005 && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 text-xs text-amber-800 dark:text-amber-200">+{eur(m.differenza)} commissione</span>}
                </button>
              ))}
            </div>
          )}
          {scelto && scelto.differenza > 0.005 && (
            <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              Il cliente ha mandato {eur(scelto.importo)}: in fattura si registrano {eur(scelto.registra)}, i {eur(scelto.differenza)} in più sono la
              commissione PayPal che ha pagato lui (non è un incasso della fattura). Resta scritto sul movimento PayPal.</div>
          )}
          <Button className={`${stile} w-full bg-emerald-600 text-white hover:bg-emerald-700`} disabled={disabled || !!busy || oltre || !(importo > 0)} onClick={registra}>
            {busy === "registra" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Registra {eur(importo)} già pagati</Button>
        </div>
      )}
    </div>
  );
}
