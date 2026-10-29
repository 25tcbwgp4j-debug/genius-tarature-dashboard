"use client";

// DOPO IL BONIFICO (29/10/2026, Christian): appena un bonifico è abbinato a una scheda (o alla sua fattura / pro forma),
// su qualsiasi pagina compare la finestra «cosa fare adesso»: ritiro in negozio → avviso «pagamento ricevuto, può passare
// a ritirare» · corriere del cliente → «pagamento ricevuto, mandateci l'etichetta» · nostro corriere → crea la spedizione.
// Compare anche per i bonifici dei giorni scorsi rimasti senza seguito, finché non si gestiscono o si segnano «già fatto».

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { fetchAPI } from "@/lib/api";
import { toastErrore } from "@/lib/errori";

export const EVENTO_DOPO_BONIFICO = "bonifici:dopo";
/** Da chiamare dopo un abbinamento riuscito: la finestra si riapre con i dati aggiornati. */
export function dopoBonifico() { window.setTimeout(() => window.dispatchEvent(new Event(EVENTO_DOPO_BONIFICO)), 1200); }

type Passo = { scheda_id: string; sigla: string; cliente: string; stato: string; consegna: string; pagata: boolean; saldo: number;
  importo: number; azione: Azione; alternativa?: Azione; testo: string; fatto?: boolean };
type Azione = "avvisa_ritiro" | "richiedi_etichetta" | "spedisci" | "niente";
type Voce = { incasso: { id: string; data: string; importo: number | string; ordinante: string | null; causale: string | null;
  documento_numero: string | null }; schede: Passo[]; da_fare: number };

type Documento = { scheda_id: string; sigla: string; cliente: string; stato: string; consegna: string;
  documento: { tipo: "fattura" | "scontrino"; numero: string | null; data: string | null; totale: number | string | null }; recensione: string | null };

const RIMANDA = "dopo_bonifico_rimandato";
const SENZA = ["/login", "/forgot-password", "/reset-password"];
const eur = (v: number | string | null | undefined) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));
const giorno = (d: string) => new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const PULSANTE: Record<string, string> = {
  avvisa_ritiro: "📣 Avvisa: può passare a ritirare",
  richiedi_etichetta: "📮 Chiedi l'etichetta di ritorno",
  spedisci: "🚚 Crea la spedizione",
};

export function DopoBonifico() {
  const path = usePathname() || "";
  const router = useRouter();
  const [voci, setVoci] = useState<Voce[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [aperto, setAperto] = useState(false);
  const [busy, setBusy] = useState("");
  const [operatore, setOperatore] = useOperatore();

  const ultimo = useRef(0);
  const carica = useCallback((forza: boolean) => {
    if (SENZA.includes(path)) return;
    // 29/10/2026: al cambio pagina al massimo una richiesta al minuto (prima ogni navigazione chiamava il backend)
    if (!forza && Date.now() - ultimo.current < 60 * 1000) return;
    ultimo.current = Date.now();
    // 29/10/2026: anche le schede con fattura o scontrino EMESSI e non ancora consegnate («chiudo la scheda come…»)
    Promise.all([
      fetchAPI("/api/assistenza/dopo-bonifici?giorni=3", undefined, false).catch(() => ({ bonifici: [] })),
      fetchAPI("/api/assistenza/dopo-documenti?giorni=3", undefined, false).catch(() => ({ schede: [] })),
    ]).then(([b, d]: [{ bonifici: Voce[] }, { schede: Documento[] }]) => {
      setVoci(b.bonifici); setDocs(d.schede);
      const n = b.bonifici.length + d.schede.length;
      let rimandato = 0;
      try { rimandato = Number(sessionStorage.getItem(RIMANDA) || 0); } catch { /* storage non disponibile */ }
      if (n && (forza || Date.now() - rimandato > 30 * 60 * 1000)) setAperto(true);
      if (!n) setAperto(false);
    });
  }, [path]);

  // a ogni cambio pagina si ricontrolla (es. fattura emessa in /fatturazione, scontrino dalla cassa)
  useEffect(() => { carica(false); }, [carica]);
  useEffect(() => {
    const ev = () => carica(true);
    window.addEventListener(EVENTO_DOPO_BONIFICO, ev);
    return () => window.removeEventListener(EVENTO_DOPO_BONIFICO, ev);
    // solo all'avvio e sugli eventi: non a ogni cambio pagina
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rimanda() {
    try { sessionStorage.setItem(RIMANDA, String(Date.now())); } catch { /* storage non disponibile */ }
    setAperto(false);
  }

  async function esegui(v: Voce, p: Passo, az: Azione = p.azione) {
    if (!operatore) { toast.error("Scegli l'operatore"); return; }
    if (az === "spedisci") {
      setAperto(false);
      router.push(`/assistenza?id=${p.scheda_id}&az=spedisci`);
      return;
    }
    const cosa = az === "avvisa_ritiro" ? "«pagamento ricevuto: può passare a ritirare»"
      : "«pagamento ricevuto: inviateci l'etichetta di spedizione di ritorno»";
    if (!confirm(`Scheda ${p.sigla} · ${p.cliente}\n\nMandare al cliente (mail + WhatsApp) ${cosa}?`)) return;
    setBusy(p.scheda_id);
    try {
      await fetchAPI(`/api/assistenza/schede/${p.scheda_id}/${az === "avvisa_ritiro" ? "avvisa-pagato" : "richiedi-etichetta"}`,
        { method: "POST", body: JSON.stringify({ operatore, incassato: Number(v.incasso.importo) }) });
      toast.success(`Scheda ${p.sigla}: cliente avvisato`);
      carica(true);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  async function giaFatto(p: Passo) {
    if (!operatore) { toast.error("Scegli l'operatore"); return; }
    const nota = prompt(`Scheda ${p.sigla}: com'è stato gestito? (es. «avvisato al banco», «spedito fuori dashboard»)`, "");
    if (nota === null) return;
    setBusy(p.scheda_id);
    try {
      await fetchAPI(`/api/assistenza/schede/${p.scheda_id}/dopo-pagamento-fatto`, { method: "POST", body: JSON.stringify({ operatore, nota }) });
      carica(true);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  async function chiudiCome(d: Documento, come: "ritiro" | "spedizione" | "non_ancora") {
    if (!operatore) { toast.error("Scegli l'operatore"); return; }
    setBusy(d.scheda_id);
    try {
      if (come === "non_ancora") {
        await fetchAPI(`/api/assistenza/schede/${d.scheda_id}/dopo-documento`, { method: "POST", body: JSON.stringify({ operatore }) });
      } else {
        await fetchAPI(`/api/assistenza/schede/${d.scheda_id}/consegna`, { method: "POST", body: JSON.stringify({ operatore, modo: come }) });
        toast.success(`Scheda ${d.sigla}: ${come === "ritiro" ? "riconsegnata" : "spedita"} e chiusa`);
        if (d.recensione !== "inviata" && confirm(`Scheda ${d.sigla} · ${d.cliente}\n\nChiedere la recensione su Google al cliente (mail + WhatsApp)?`)) {
          await fetchAPI(`/api/assistenza/schede/${d.scheda_id}/recensione`, { method: "POST", body: JSON.stringify({ operatore }) });
          toast.success("Recensione chiesta");
        }
      }
      carica(true);
    } catch (e) { toastErrore(e); } finally { setBusy(""); }
  }

  if (!aperto || (!voci.length && !docs.length)) return null;
  const n = voci.reduce((t, v) => t + v.da_fare, 0) + docs.length;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-black/40 p-3 sm:p-8" onClick={rimanda}>
      <div className="w-full max-w-2xl rounded-xl bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Banknote className="size-5 text-emerald-600" />
          <div className="flex-1">
            <div className="font-semibold">{voci.length ? "Bonifico arrivato: cosa fare adesso" : "Fattura o scontrino emesso: chiudo la scheda?"}</div>
            <div className="text-xs text-muted-foreground">{n} {n === 1 ? "scheda aspetta" : "schede aspettano"} il passo successivo (avviso, spedizione o consegna)</div>
          </div>
          <SceltaOperatore value={operatore} onChange={setOperatore} compatto />
          <button type="button" onClick={rimanda} aria-label="Più tardi" className="rounded p-1 hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-auto p-4">
          {docs.map((d) => (
            <div key={d.scheda_id} className="rounded-lg border">
              <div className="flex flex-wrap items-baseline gap-x-3 border-b bg-muted/40 px-3 py-2 text-sm">
                <span className="font-semibold">{d.documento.tipo === "fattura" ? `Fattura ${d.documento.numero}` : `Scontrino ${d.documento.numero || ""}`}</span>
                <span>{eur(d.documento.totale)}</span>
                <a className="underline" href={`/assistenza?id=${d.scheda_id}`}>Scheda {d.sigla}</a> · {d.cliente}
              </div>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="mr-1 text-xs text-muted-foreground">Chiudo la scheda come:</span>
                <Button size="sm" disabled={!!busy} onClick={() => chiudiCome(d, "ritiro")}>{busy === d.scheda_id && <Loader2 className="animate-spin" />}✅ Riconsegnato</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => chiudiCome(d, "spedizione")}>🚚 Spedito</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { setAperto(false); router.push(`/assistenza?id=${d.scheda_id}`); }}>Altro…</Button>
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => chiudiCome(d, "non_ancora")}>Non ancora (resta aperta)</Button>
              </div>
            </div>
          ))}
          {voci.map((v) => (
            <div key={v.incasso.id} className="rounded-lg border">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b bg-muted/40 px-3 py-2 text-sm">
                <span className="font-semibold">{eur(v.incasso.importo)}</span>
                <span>{v.incasso.ordinante || "—"}</span>
                <span className="text-xs text-muted-foreground">{giorno(v.incasso.data)}{v.incasso.documento_numero ? ` · fattura ${v.incasso.documento_numero}` : ""}</span>
                <span className="w-full truncate text-xs text-muted-foreground">{v.incasso.causale}</span>
              </div>
              {v.schede.filter((p) => !p.fatto).map((p) => (
                <div key={p.scheda_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <a className="font-medium underline" href={`/assistenza?id=${p.scheda_id}`}>Scheda {p.sigla}</a> · {p.cliente}
                    <div className="text-xs text-muted-foreground">{p.testo}{p.pagata ? "" : " · ⚠️ non risulta ancora pagata"}</div>
                  </div>
                  <Button size="sm" disabled={!!busy} onClick={() => esegui(v, p)}>
                    {busy === p.scheda_id && <Loader2 className="animate-spin" />}{PULSANTE[p.azione]}
                  </Button>
                  {p.alternativa && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => esegui(v, p, p.alternativa)}>{PULSANTE[p.alternativa]}</Button>}
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => giaFatto(p)}>Già fatto</Button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t px-4 py-2">
          <Button variant="outline" size="sm" onClick={rimanda}>Più tardi (riappare tra 30 minuti)</Button>
        </div>
      </div>
    </div>
  );
}
