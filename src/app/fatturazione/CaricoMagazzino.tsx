"use client";

// FATTURA RICEVUTA → «Carica in magazzino» (Genius Lab Gestionale, fase 2 — 02/10/2026).
// Il backend propone ogni riga: articolo esistente (codice o descrizione uguale) o nuovo; per iPhone/Mac/iPad i
// PEZZI con seriale/IMEI (letti dalla descrizione, es. «Seriale: 3598…»). Spedizioni e righe già caricate: saltate.

import { useEffect, useState } from "react";
import { Loader2, PackagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { CATEGORIE_MERCE, magCaricoFattura, magPropostaCaricoFattura, type CategoriaMerce, type RigaCaricoFattura } from "@/lib/api";

type PezzoUI = { seriale: string; imei: string; condizione: string };
type RigaUI = RigaCaricoFattura & { scelta: boolean; descr: string; cat: CategoriaMerce; prezzo: string; pezziUI: PezzoUI[]; usaEsistente: boolean };

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);

export function CaricoMagazzino({ fatturaId, onClose }: { fatturaId: string; onClose: () => void }) {
  const [righe, setRighe] = useState<RigaUI[] | null>(null);
  const [titolo, setTitolo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    magPropostaCaricoFattura(fatturaId).then((r) => {
      setTitolo(`${r.fattura.controparte_nome || ""} · n. ${r.fattura.numero || ""} del ${r.fattura.data || ""}`);
      setRighe(r.righe.map((x) => ({
        ...x, scelta: x.proposta === "carica" && !x.gia_caricata, descr: x.prodotto?.descrizione || x.descrizione_articolo,
        cat: x.categoria_merce, prezzo: "", usaEsistente: !!x.prodotto,
        pezziUI: x.serializzato
          ? Array.from({ length: Math.max(1, Math.round(x.quantita)) }, (_, i) => ({ seriale: i === 0 ? x.seriale || "" : "", imei: i === 0 ? x.imei || "" : "", condizione: "" }))
          : [],
      })));
    }).catch((e) => { toastErrore(e); onClose(); });
  }, [fatturaId, onClose]);

  const agg = (i: number, p: Partial<RigaUI>) => setRighe((l) => (l || []).map((r, j) => (j === i ? { ...r, ...p } : r)));
  const aggPezzo = (i: number, k: number, p: Partial<PezzoUI>) =>
    setRighe((l) => (l || []).map((r, j) => (j === i ? { ...r, pezziUI: r.pezziUI.map((z, h) => (h === k ? { ...z, ...p } : z)) } : r)));

  async function conferma() {
    if (!righe || busy) return;
    const scelte = righe.filter((r) => r.scelta);
    if (!scelte.length) { toast.error("Nessuna riga scelta"); return; }
    for (const r of scelte) {
      if (r.pezziUI.length && r.pezziUI.some((z) => !z.seriale.trim() && !z.imei.trim())) { toast.error(`Riga «${r.descr}»: manca il seriale o l'IMEI di un pezzo`); return; }
    }
    setBusy(true);
    try {
      const body = scelte.map((r) => ({
        indice: r.indice, quantita: r.quantita, costo: r.costo,
        ...(r.usaEsistente && r.prodotto ? { prodotto_id: r.prodotto.id }
          : { nuovo: { descrizione: r.descr, categoria_merce: r.cat, marca: /APPLE|IPHONE|IPAD|MAC|AIRPODS|WATCH/i.test(r.descr) ? "Apple" : null,
              prezzo: Number(String(r.prezzo).replace(",", ".")) || 0, aliquota: r.cat === "usato_margine" ? 0 : (r.aliquota ?? 22) } }),
        ...(r.pezziUI.length ? { pezzi: r.pezziUI.map((z) => ({ seriale: z.seriale.trim() || null, imei: z.imei.trim() || null, condizione: z.condizione.trim() || null })) } : {}),
      }));
      const esito = await magCaricoFattura(fatturaId, body);
      const ko = esito.esiti.filter((e) => !e.ok);
      if (ko.length) toast.error(`Non caricate ${ko.length} righe: ${ko.map((e) => e.errore).join(" · ")}`, { duration: 12000 });
      else toast.success(`Caricate in magazzino ${esito.esiti.length} righe`);
      onClose();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  const campo = "h-8 rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-3xl space-y-3 overflow-y-auto bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div><h2 className="flex items-center gap-2 text-lg font-semibold"><PackagePlus className="size-5" /> Carica in magazzino</h2>
            <div className="text-sm text-muted-foreground">{titolo}</div></div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Chiudi"><X /></Button>
        </div>
        {righe === null ? <Loader2 className="animate-spin" /> : righe.map((r, i) => (
          <div key={r.indice} className={`space-y-2 rounded-lg border p-3 text-sm ${r.scelta ? "" : "opacity-60"}`}>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" disabled={r.gia_caricata} checked={r.scelta} onChange={(e) => agg(i, { scelta: e.target.checked })} />
              <span className="flex-1"><span className="font-medium">{r.descrizione}</span>
                <span className="block text-xs text-muted-foreground">{r.quantita} × {eur(r.costo)}{r.gia_caricata ? " · GIÀ CARICATA" : ""}</span></span>
            </label>
            {r.scelta && (
              <div className="space-y-2 pl-6">
                {r.prodotto && (
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={r.usaEsistente} onChange={(e) => agg(i, { usaEsistente: e.target.checked })} />
                    Articolo già in magazzino: <b>{r.prodotto.descrizione}</b>
                  </label>
                )}
                {!r.usaEsistente && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <input className={`${campo} sm:col-span-2`} value={r.descr} onChange={(e) => agg(i, { descr: e.target.value })} placeholder="Descrizione dell'articolo" />
                    <select className={campo} value={r.cat} onChange={(e) => agg(i, { cat: e.target.value as CategoriaMerce })}>
                      {Object.entries(CATEGORIE_MERCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input className={campo} inputMode="decimal" placeholder="Prezzo vendita IVA incl." value={r.prezzo} onChange={(e) => agg(i, { prezzo: e.target.value })} />
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={r.pezziUI.length > 0} onChange={(e) => agg(i, {
                    pezziUI: e.target.checked ? Array.from({ length: Math.max(1, Math.round(r.quantita)) }, (_, k) => ({ seriale: k === 0 ? r.seriale || "" : "", imei: k === 0 ? r.imei || "" : "", condizione: "" })) : [] })} />
                  Pezzi con seriale / IMEI (iPhone, Mac, iPad…)
                </label>
                {r.pezziUI.map((z, k) => (
                  <div key={k} className="grid grid-cols-3 gap-2">
                    <input className={campo} placeholder="IMEI" value={z.imei} onChange={(e) => aggPezzo(i, k, { imei: e.target.value })} />
                    <input className={campo} placeholder="Seriale" value={z.seriale} onChange={(e) => aggPezzo(i, k, { seriale: e.target.value })} />
                    <input className={campo} placeholder="Condizione" value={z.condizione} onChange={(e) => aggPezzo(i, k, { condizione: e.target.value })} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annulla</Button>
          <Button onClick={conferma} disabled={busy || !righe}>{busy ? <Loader2 className="animate-spin" /> : <PackagePlus />} Carica le righe scelte</Button>
        </div>
      </div>
    </div>
  );
}
