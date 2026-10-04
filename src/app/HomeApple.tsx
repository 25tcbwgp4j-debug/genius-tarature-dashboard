"use client";

// HOME DELLA DIVISIONE APPLE (04/10/2026): panoramica delle schede di assistenza, della cassa Apple di oggi,
// dei bonifici da gestire e delle bozze mail Apple. Solo letture dagli endpoint che esistono già
// (/api/assistenza/*, /api/cassa/scontrini, /api/bonifici/stato, /api/mail-drafts/count): nessuna logica delle schede qui.
// Le schede in prova le vede solo il titolare (flag «Visibile agli operatori»): se non sono visibili il riquadro lo dice.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Smartphone, Inbox, FileQuestion, Send, Wrench, PackageCheck, Euro, Landmark, Mail, Calculator, Clock, Plus } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import { usePermessi } from "@/components/permessi";
import { COLORE_STATO, ETICHETTA_STATO, dataOra, eur, type SchedaBreve, type ConfigAssistenza } from "@/lib/assistenza";

// letture silenziose: un 403 o un backend in avvio non deve aprire finestre di errore sulla home
const leggi = <T,>(path: string): Promise<T | null> => fetchAPI(path, { timeoutMs: 20_000 }, false).catch(() => null);

const FASI_HOME: { stato: string; label: string; icon: typeof Inbox; tono: string }[] = [
  { stato: "in_arrivo", label: "In arrivo", icon: Inbox, tono: "bg-slate-100 text-slate-700" },
  { stato: "da_preventivare", label: "Da preventivare", icon: FileQuestion, tono: "bg-amber-100 text-amber-700" },
  { stato: "preventivo_inviato", label: "Preventivo inviato", icon: Send, tono: "bg-sky-100 text-sky-700" },
  { stato: "accettato", label: "In riparazione", icon: Wrench, tono: "bg-indigo-100 text-indigo-700" },
  { stato: "pronto", label: "Pronte", icon: PackageCheck, tono: "bg-emerald-100 text-emerald-700" },
];

function Stato({ s }: { s: string }) {
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold ${COLORE_STATO[s] || ""}`}>{ETICHETTA_STATO[s] || s}</span>;
}

function RigaScheda({ s, extra }: { s: SchedaBreve; extra?: React.ReactNode }) {
  return (
    <Link href={`/assistenza?id=${s.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/60">
      <div className="min-w-0">
        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
          <span className="font-mono text-gray-500 mr-2">{s.sigla}</span>
          {s.azienda || s.nominativo || "Cliente N/D"}
        </p>
        <p className="text-sm text-gray-500 truncate">{[s.prodotto, s.modello].filter(Boolean).join(" · ") || "—"} · {dataOra(s.created_at)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {extra}
        <Stato s={s.stato} />
      </div>
    </Link>
  );
}

const MAX_RIGHE = 10;   // la home resta corta anche su iPhone: il resto è nelle schede assistenza

function Elenco({ titolo, schede, vuoto, extra, href = "/assistenza" }: { titolo: React.ReactNode; schede: SchedaBreve[] | null; vuoto: string; extra?: (s: SchedaBreve) => React.ReactNode; href?: string }) {
  const altre = (schede?.length || 0) - MAX_RIGHE;
  return (
    <Card>
      <div className="p-4 border-b font-semibold">{titolo}</div>
      <div className="divide-y">
        {schede === null ? <p className="p-4 text-sm text-gray-500">Caricamento…</p>
          : schede.length === 0 ? <p className="p-4 text-sm text-gray-500">{vuoto}</p>
          : schede.slice(0, MAX_RIGHE).map((s) => <RigaScheda key={s.id} s={s} extra={extra?.(s)} />)}
        {altre > 0 && <Link href={href} className="block p-3 text-sm text-blue-700 dark:text-blue-300 hover:underline">… e altre {altre}: apri le schede assistenza</Link>}
      </div>
    </Card>
  );
}

export function HomeApple() {
  const { admin, caricato } = usePermessi();
  const [cfg, setCfg] = useState<ConfigAssistenza | null>(null);
  const [contatori, setContatori] = useState<Record<string, number> | null>(null);
  const [pronte, setPronte] = useState<SchedaBreve[] | null>(null);
  const [daPrev, setDaPrev] = useState<SchedaBreve[] | null>(null);
  const [ultime, setUltime] = useState<SchedaBreve[] | null>(null);
  const [cassa, setCassa] = useState<{ n: number; totale: number } | null>(null);
  const [bonifici, setBonifici] = useState<number | null>(null);
  const [bozze, setBozze] = useState<number | null>(null);

  useEffect(() => {
    if (!caricato) return;   // si aspetta di sapere chi è collegato
    let annullato = false;
    const set = <T,>(f: (v: T) => void) => (v: T) => { if (!annullato) f(v); };
    leggi<ConfigAssistenza>("/api/assistenza/config").then(set((c) => {
      setCfg(c);
      if (!c?.visibile) return;
      leggi<{ contatori: Record<string, number> }>("/api/assistenza/contatori").then(set((r) => setContatori(r?.contatori || {})));
      leggi<{ schede: SchedaBreve[] }>("/api/assistenza/schede?stato=pronto&limit=500").then(set((r) => setPronte(r?.schede || [])));
      leggi<{ schede: SchedaBreve[] }>("/api/assistenza/schede?stato=da_preventivare&limit=10").then(set((r) => setDaPrev(r?.schede || [])));
      leggi<{ schede: SchedaBreve[] }>("/api/assistenza/schede?stato=tutte&limit=10").then(set((r) => setUltime(r?.schede || [])));
    }));
    leggi<{ scontrini: unknown[]; totale: number }>("/api/cassa/scontrini?attivita=apple").then(set((r) => setCassa(r ? { n: r.scontrini?.length || 0, totale: r.totale || 0 } : null)));
    leggi<{ da_gestire: number }>("/api/bonifici/stato").then(set((r) => setBonifici(r ? r.da_gestire : null)));
    if (admin) {
      leggi<{ accounts: { account: string; count: number }[] }>("/api/mail-drafts/count")
        .then(set((r) => setBozze(r ? (r.accounts || []).filter((a) => a.account === "info@apple-assistenza.it").reduce((t, a) => t + (a.count || 0), 0) : null)));
    }
    return () => { annullato = true; };
  }, [admin, caricato]);

  const visibili = cfg?.visibile;
  // pronte: chi ha già pagato aspetta solo la consegna/spedizione, gli altri aspettano il pagamento
  const daPagare = pronte?.filter((s) => !s.fasi?.pagamento) ?? null;
  const pagate = pronte?.filter((s) => !!s.fasi?.pagamento) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Smartphone className="w-6 h-6" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Panoramica Apple</h2>
        {visibili && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Link href="/assistenza?nuova=1" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800/60">
              <Plus className="w-4 h-4" /> Nuova accettazione
            </Link>
            <Link href="/assistenza" className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-3 py-2 text-sm font-semibold">
              <Smartphone className="w-4 h-4" /> Apri le schede assistenza
            </Link>
          </div>
        )}
      </div>

      {cfg && !visibili && (
        <Card className="p-4 text-sm text-gray-600 dark:text-gray-300">
          Le schede di assistenza sono in prova: per ora le vede solo il titolare.
        </Card>
      )}

      {visibili && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {FASI_HOME.map((f) => {
            const Icon = f.icon;
            return (
              <Link key={f.stato} href={`/assistenza?stato=${f.stato}`}>
                <Card className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors h-full">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${f.tono}`}><Icon className="w-5 h-5" /></div>
                    <div>
                      <p className="text-2xl font-bold">{contatori ? contatori[f.stato] ?? 0 : "…"}</p>
                      <p className="text-sm text-gray-500">{f.label}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/cassa/giornata">
          <Card className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors h-full">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100 text-gray-800"><Calculator className="w-5 h-5" /></div>
              <div>
                <p className="text-2xl font-bold">{cassa ? eur(cassa.totale) : "—"}</p>
                <p className="text-sm text-gray-500">Cassa Apple di oggi{cassa ? ` · ${cassa.n} scontrini` : ""}</p>
              </div>
            </div>
          </Card>
        </Link>
        <Card className="p-4 h-full">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${bonifici ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-800"}`}><Landmark className="w-5 h-5" /></div>
            <div>
              <p className="text-2xl font-bold">{bonifici ?? "—"}</p>
              <p className="text-sm text-gray-500">Bonifici da abbinare (conto SumUp unico: pulsante rosso in alto)</p>
            </div>
          </div>
        </Card>
        {admin && (
          <Card className="p-4 h-full">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 text-indigo-800"><Mail className="w-5 h-5" /></div>
              <div>
                <p className="text-2xl font-bold">{bozze ?? "—"}</p>
                <p className="text-sm text-gray-500">Bozze mail Apple da vedere (info@apple-assistenza.it)</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {visibili && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Elenco titolo={<span className="flex items-center gap-2"><Euro className="w-4 h-4" /> Pronte, in attesa di pagamento{daPagare ? ` (${daPagare.length})` : ""}</span>}
            schede={daPagare} href="/assistenza?stato=pronto" vuoto="Nessuna scheda pronta da incassare."
            extra={(s) => <span className="text-sm font-medium">{eur(s.totale_lavorazione ?? s.preventivo_totale)}</span>} />
          <Elenco titolo={<span className="flex items-center gap-2"><PackageCheck className="w-4 h-4" /> Pagate, da consegnare o spedire{pagate ? ` (${pagate.length})` : ""}</span>}
            schede={pagate} href="/assistenza?stato=pronto" vuoto="Nessuna scheda pagata in attesa di consegna." />
          <Elenco titolo={<span className="flex items-center gap-2"><FileQuestion className="w-4 h-4" /> In attesa di preventivo</span>}
            schede={daPrev} href="/assistenza?stato=da_preventivare" vuoto="Nessuna scheda da preventivare." />
          <Elenco titolo={<span className="flex items-center gap-2"><Clock className="w-4 h-4" /> Ultime schede</span>}
            schede={ultime} href="/assistenza?stato=tutte" vuoto="Nessuna scheda." />
        </div>
      )}
    </div>
  );
}
