"use client";
// 11/11/2026 (Christian): con «Decodifica» la scheda legge da Apple GSX (via ponte sul server) modello, configurazione,
// garanzia e acquisto, e con «Ricambi Apple» i pezzi del dispositivo con la scheda logica esatta e il suo costo.
import { useMemo, useState } from "react";
import { Apple, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { gsxRicambi, type GsxDispositivo, type GsxRicambi } from "@/lib/gsx";

const euro = (n?: number | null) => (n == null ? "—" : n.toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const data = (s?: string | null) => (s ? s.split("-").reverse().join("/") : "—");

export function GsxPannello({ g, errore }: { g: GsxDispositivo | null; errore?: string | null }) {
  const [ric, setRic] = useState<GsxRicambi | null>(null);
  const [busy, setBusy] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [varianti, setVarianti] = useState(false);

  async function caricaRicambi() {
    if (!g) return;
    setBusy(true);
    try { setRic(await gsxRicambi(g.seriale)); } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  const righe = useMemo(() => {
    if (!ric) return [];
    const f = filtro.trim().toLowerCase();
    return ric.ricambi.filter((r) => (varianti || !r.variante) && (!f || `${r.codice} ${r.descrizione}`.toLowerCase().includes(f)));
  }, [ric, filtro, varianti]);

  if (errore) return <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs dark:bg-amber-950/30">GSX Apple: {errore}</div>;
  if (!g) return null;
  const garanziaOk = (g.giorni_garanzia ?? 0) > 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:bg-slate-950">
      <div className="flex items-start gap-3">
        {g.immagine ? <img src={g.immagine} alt="" className="size-14 shrink-0 object-contain" /> : <Apple className="size-6 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{g.modello || "Modello non indicato da Apple"}</div>
          <div className="text-xs text-muted-foreground">{g.configurazione}{g.imei ? ` · IMEI ${g.imei}` : ""} · letto su GSX</div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
            {g.dati_nascosti
              ? <span className="col-span-full text-amber-700">Apple nasconde garanzia e acquisto (di solito «Trova il mio» è attivo)</span>
              : <>
                  <span>Garanzia: <b className={garanziaOk ? "text-emerald-700" : ""}>{g.garanzia || "—"}</b>{garanziaOk ? ` (${g.giorni_garanzia} gg)` : ""}</span>
                  <span>Acquisto: <b>{data(g.data_acquisto)}</b>{g.paese_acquisto ? ` · ${g.paese_acquisto}` : ""}</span>
                  {g.fine_copertura && <span>Fine copertura: <b>{data(g.fine_copertura)}</b></span>}
                </>}
            {g.prima_attivazione && <span>Prima attivazione: <b>{data(g.prima_attivazione)}</b></span>}
            {g.operatore_telefonico && <span>Operatore: <b>{g.operatore_telefonico}</b>{g.sbloccato_operatore === false ? " (bloccato)" : ""}</span>}
            {g.prestito && <span className="text-amber-700">Dispositivo in prestito Apple</span>}
          </div>
          {g.messaggi.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs">{g.messaggi.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          {g.pratiche_apple.length > 0 && (
            <div className="mt-1 text-xs">Pratiche Apple: {g.pratiche_apple.map((c) => `${c.caseId} (${data(c.createdDateTime?.slice(0, 10))}${c.summary ? ` · ${c.summary}` : ""})`).join(" · ")}</div>
          )}
        </div>
        <Button type="button" variant="outline" className="h-8 shrink-0" disabled={busy} onClick={caricaRicambi} title="Pezzi del dispositivo secondo Apple GSX">
          {busy ? <Loader2 className="animate-spin" /> : <Package />}Ricambi Apple</Button>
      </div>

      {ric && ric.principali.length > 0 && (
        <div className="mt-2 rounded-md border border-sky-200 bg-sky-50/60 p-2 text-xs dark:bg-sky-950/30">
          <div className="mb-1 font-semibold">Preventivo pronto · prezzi da GSX (regola del listino: +10% Bagnetti +IVA → proposto → listino)</div>
          <table className="w-full">
            <thead><tr className="text-left">
              <th>Componente</th><th>Codice</th>{ric.costi_visibili && <><th className="text-right">GSX</th><th className="text-right">Ci costa</th></>}
              <th className="text-right">Proposto</th><th className="text-right">Listino</th><th></th>
            </tr></thead>
            <tbody>
              {ric.principali.map((p) => (
                <tr key={p.categoria} className="border-t align-top">
                  <td className="py-0.5 pr-2 font-semibold">{ric.categorie[p.categoria] || p.categoria}</td>
                  <td className="pr-2"><span className="font-mono">{p.codice}</span><div className="text-muted-foreground">{p.descrizione}{p.altri_codici > 0 ? ` · +${p.altri_codici} codici (preso il più caro)` : ""}</div>
                    {p.nota && <div className="text-amber-700">{p.nota}</div>}</td>
                  {ric.costi_visibili && <><td className="text-right">{euro(p.prezzi.gsx)}</td><td className="text-right">{euro(p.prezzi.costo)}</td></>}
                  <td className="text-right font-semibold">{euro(p.prezzi.proposto)}</td>
                  <td className="text-right">{euro(p.prezzi.listino)}</td>
                  <td className="pl-2"><Button type="button" variant="outline" className="h-6 px-2 text-[11px]" title={p.ipotesi}
                    onClick={() => { navigator.clipboard?.writeText(`2° IPOTESI: ${p.ipotesi}`); toast.success("Ipotesi copiata"); }}>Copia ipotesi</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ric && (
        <div className="mt-2 border-t pt-2">
          {ric.scheda_logica && (
            <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50/70 p-2 text-xs dark:bg-emerald-950/30">
              <div className="font-semibold">Scheda logica di questo dispositivo: {ric.scheda_logica.codice}</div>
              <div>{ric.scheda_logica.descrizione}</div>
              {ric.costi_visibili && <div className="mt-0.5">Costo Apple: stock <b>{euro(ric.scheda_logica.costo_stock)}</b> · sostituzione (rendendo il guasto) <b>{euro(ric.scheda_logica.costo_sostituzione)}</b></div>}
            </div>
          )}
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
            <input className="h-7 w-56 rounded border px-2" placeholder="Filtra: display, battery, 661-…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <label className="flex items-center gap-1"><input type="checkbox" checked={varianti} onChange={(e) => setVarianti(e.target.checked)} />mostra anche le altre configurazioni e lingue</label>
            <span className="text-muted-foreground">{righe.length} pezzi · configurazione {ric.configurazione_riconosciuta.join(", ") || "—"}</span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white dark:bg-slate-950"><tr className="text-left">
                <th className="py-1">Tipo</th><th>Codice</th><th>Descrizione</th>{ric.costi_visibili && <><th className="text-right">Stock</th><th className="text-right">Sostituz.</th></>}
              </tr></thead>
              <tbody>
                {righe.map((r) => (
                  <tr key={r.codice} className={`border-t ${r.esatta ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                    <td className="py-0.5 pr-2 text-muted-foreground">{ric.categorie[r.categoria] || r.categoria}</td>
                    <td className="pr-2 font-mono">{r.esatta ? "✅ " : ""}{r.codice}</td>
                    <td className="pr-2">{r.descrizione}{r.sostituito_da ? <span className="text-muted-foreground"> · sostituito da {r.sostituito_da}</span> : null}</td>
                    {ric.costi_visibili && <><td className="text-right">{euro(r.costo_stock)}</td><td className="text-right">{euro(r.costo_sostituzione)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ric.costi_visibili && <div className="mt-1 text-[11px] text-muted-foreground">Costi Apple da GSX (visibili solo al titolare). Stock = ricambio senza rendere il pezzo guasto · Sostituzione = rendendolo ad Apple.</div>}
        </div>
      )}
    </div>
  );
}
