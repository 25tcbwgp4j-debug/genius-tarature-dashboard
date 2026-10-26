"use client";

// 26/10/2026 (Christian, es. Altramela): TUTTE le schede APERTE di un cliente, divise per fase (preventivi, in riparazione,
// pronti da ritirare, da spedire…), con i filtri; si scelgono e si manda un unico RIEPILOGO al cliente (mail + WhatsApp)
// con lo stato e il link al PDF di ogni scheda.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchAPI } from "@/lib/api";
import { toastErrore } from "@/lib/errori";
import { assClienti, eur, type Anagrafica, type RicambioAtteso } from "@/lib/assistenza";
import { Modale, campo } from "./scheda/ui";
import { useOperatore } from "@/components/Operatore";

interface SchedaAperta {
  id: string; numero: number; sigla: string; stato: string; prodotto: string | null; modello: string | null; seriale: string | null;
  rif_cliente: string | null; fase: string; fase_etichetta: string; saldo: number; pagata: boolean; totale: number | null;
  ricambi_attesi: RicambioAtteso[] | null; tecnico_riparazione: string | null; link_pdf: string | null;
}

export function PerCliente({ operatore: opEsterno, onApri, onClose, iniziale }: {
  operatore?: string; onApri: (id: string) => void; onClose: () => void;
  /** 26/10/2026: aperto dalla scheda cliente → il cliente è già scelto */
  iniziale?: { id: string; denominazione: string } | null;
}) {
  const [opProprio] = useOperatore();
  const operatore = opEsterno || opProprio;
  const [q, setQ] = useState("");
  const [trovati, setTrovati] = useState<Anagrafica[]>([]);
  const [cliente, setCliente] = useState<{ id: string; denominazione: string; email?: string | null; cellulare_whatsapp?: string | null; cellulare?: string | null; no_whatsapp?: boolean | null; no_whatsapp_nota?: string | null } | null>(null);
  const [allega, setAllega] = useState(true);
  const [schede, setSchede] = useState<SchedaAperta[] | null>(null);
  const [filtro, setFiltro] = useState<string>("");
  const [scelte, setScelte] = useState<Set<string>>(new Set());
  const [nota, setNota] = useState("");
  const [mail, setMail] = useState(true);
  const [wa, setWa] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2 || cliente) { setTrovati([]); return; }
    const t = setTimeout(() => assClienti(q.trim()).then((r) => setTrovati(r.clienti.slice(0, 12))).catch(() => setTrovati([])), 300);
    return () => clearTimeout(t);
  }, [q, cliente]);

  async function scegli(a: Anagrafica) {
    setTrovati([]); setSchede(null);
    try {
      const r = await fetchAPI(`/api/assistenza/clienti/${a.id}/aperte`);
      setCliente(r.cliente); setSchede(r.schede); setScelte(new Set((r.schede as SchedaAperta[]).map((x) => x.id))); setFiltro("");
      setWa(!r.cliente?.no_whatsapp);       // cliente «niente WhatsApp»: solo mail
    } catch (e) { toastErrore(e); }
  }
  useEffect(() => { if (iniziale) scegli(iniziale as Anagrafica); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fasi = useMemo(() => {
    const m = new Map<string, { etichetta: string; n: number }>();
    for (const x of schede || []) m.set(x.fase, { etichetta: x.fase_etichetta, n: (m.get(x.fase)?.n || 0) + 1 });
    return [...m.entries()];
  }, [schede]);
  const visibili = (schede || []).filter((x) => !filtro || x.fase === filtro);
  const scelteVisibili = visibili.filter((x) => scelte.has(x.id));
  function tutte(on: boolean) { setScelte((p) => { const n = new Set(p); visibili.forEach((x) => (on ? n.add(x.id) : n.delete(x.id))); return n; }); }

  async function invia() {
    if (!cliente) return;
    if (!operatore) { toast.error("Scegli l'operatore"); return; }
    if (!scelteVisibili.length) { toast.error("Scegli almeno una scheda"); return; }
    if (!confirm(`Mandare a ${cliente.denominazione}${mail ? " per mail" : ""}${mail && wa ? " e" : ""}${wa ? " su WhatsApp" : ""} il riepilogo di ${scelteVisibili.length} schede?`)) return;
    setBusy(true);
    try {
      const r = await fetchAPI(`/api/assistenza/clienti/${cliente.id}/riepilogo`, { method: "POST",
        body: JSON.stringify({ schede: scelteVisibili.map((x) => x.id), nota, invia_mail: mail, invia_wa: wa && !cliente.no_whatsapp, allega_pdf: mail && allega, operatore }) });
      toast.success(`Riepilogo inviato · mail: ${r.esito.mail || "—"} · WhatsApp: ${r.esito.whatsapp || "—"}`, { duration: 9000 });
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <Modale titolo={<span className="inline-flex items-center gap-2"><Users className="size-4" />Schede aperte per cliente</span>} onClose={onClose} largo>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input className={`${campo} pl-8`} autoFocus placeholder="Cerca il cliente (nome, P.IVA, telefono, email)…" value={cliente ? cliente.denominazione : q}
            onChange={(e) => { setCliente(null); setSchede(null); setQ(e.target.value); }} />
          {trovati.length > 0 && (
            <div className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
              {trovati.map((a) => <button key={a.id} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => scegli(a)}>
                <b>{a.denominazione}</b> <span className="text-xs text-muted-foreground">{[a.piva, a.email, a.cellulare || a.telefono].filter(Boolean).join(" · ")}</span></button>)}
            </div>)}
        </div>
        {cliente && !schede && <div className="p-4 text-center"><Loader2 className="inline animate-spin" /></div>}
        {schede && (schede.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna scheda aperta per {cliente?.denominazione}.</p> : <>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setFiltro("")} className={`rounded-full border px-2.5 py-0.5 text-xs ${!filtro ? "bg-primary text-primary-foreground" : ""}`}>Tutte ({schede.length})</button>
            {fasi.map(([k, f]) => <button key={k} type="button" onClick={() => setFiltro(k)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${filtro === k ? "bg-primary text-primary-foreground" : ""}`}>{f.etichetta} ({f.n})</button>)}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button type="button" className="underline" onClick={() => tutte(true)}>seleziona tutte</button>
            <button type="button" className="underline" onClick={() => tutte(false)}>nessuna</button>
            <span className="ml-auto text-muted-foreground">{scelteVisibili.length} scelte</span>
          </div>
          <div className="max-h-[45vh] divide-y overflow-y-auto rounded-lg border">
            {visibili.map((x, i) => (
              <div key={x.id}>
                {(i === 0 || visibili[i - 1].fase !== x.fase) && <div className="sticky top-0 bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">{x.fase_etichetta}</div>}
                <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm hover:bg-muted/50">
                  <input type="checkbox" className="mt-1" checked={scelte.has(x.id)} onChange={(e) => setScelte((p) => { const n = new Set(p); if (e.target.checked) n.add(x.id); else n.delete(x.id); return n; })} />
                  <span className="min-w-0 flex-1">
                    <button type="button" className="font-semibold text-blue-700 underline" onClick={(e) => { e.preventDefault(); onApri(x.id); }}>{x.sigla}</button>
                    {" "}{x.prodotto}{x.seriale ? ` · S/N ${x.seriale}` : ""}{x.rif_cliente ? ` · rif. ${x.rif_cliente}` : ""}
                    <span className="block text-xs text-muted-foreground">
                      {x.saldo > 0.009 && !x.pagata ? `da saldare ${eur(x.saldo)}` : x.totale ? `totale ${eur(x.totale)}` : ""}
                      {(x.ricambi_attesi || []).filter((r) => r.stato !== "arrivato").map((r) => ` · 📦 ${r.cosa}${r.arrivo_previsto ? ` (arrivo ${r.arrivo_previsto.slice(8, 10)}/${r.arrivo_previsto.slice(5, 7)})` : ""}`).join("")}
                    </span>
                  </span>
                </label>
              </div>))}
          </div>
          <textarea className={`${campo} min-h-[56px]`} placeholder="Nota da aggiungere al riepilogo (facoltativa), es. «Possiamo spedire tutto insieme con un unico pacco.»" value={nota} onChange={(e) => setNota(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} />mail{cliente?.email ? ` (${cliente.email})` : ""}</label>
            <label className="flex items-center gap-1.5" title="In allegato alla mail il PDF di ogni scheda (preventivo, pronto, consuntivo…)"><input type="checkbox" checked={allega} disabled={!mail} onChange={(e) => setAllega(e.target.checked)} />allega i PDF delle schede</label>
            {cliente?.no_whatsapp ? <span className="text-xs font-medium text-red-700">🚫 niente WhatsApp per questo cliente{cliente.no_whatsapp_nota ? ` (${cliente.no_whatsapp_nota})` : ""}</span>
              : <label className="flex items-center gap-1.5"><input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} />WhatsApp{cliente?.cellulare_whatsapp || cliente?.cellulare ? ` (${cliente.cellulare_whatsapp || cliente.cellulare})` : ""}</label>}
            <Button className="ml-auto" disabled={busy || !scelteVisibili.length || !(mail || wa)} onClick={invia}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Invia riepilogo al cliente ({scelteVisibili.length})</Button>
          </div>
        </>)}
      </div>
    </Modale>
  );
}
