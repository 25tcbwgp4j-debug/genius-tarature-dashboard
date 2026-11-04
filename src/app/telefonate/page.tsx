"use client";

// TELEFONATE (04/11/2026, Christian): agenda con tutti i giorni e le telefonate del centralino, entranti e uscenti,
// per ritrovare i numeri di chi ha chiamato. I dati vengono dal tabulato del Panasonic (agente sul PC HP del negozio).
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchAPI } from "@/lib/api";

type Telefonata = {
  inizio: string; direzione: "entrante" | "uscente"; numero: string | null; nome: string | null; interno: string | null;
  linee: (string | null)[]; durata_sec: number; squillo_sec: number | null; risposta: boolean;
};
type Giorno = { giorno: string; entranti: number; perse: number; uscenti: number };
type Agente = { attivo: boolean; ultimo_contatto: string | null; nota: string | null };

const FUSO = "Europe/Rome";
const SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const oggi = () => new Date().toLocaleDateString("sv-SE", { timeZone: FUSO });
const ora = (d: string) => new Date(d).toLocaleTimeString("it-IT", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const dataOra = (d: string) => new Date(d).toLocaleString("it-IT", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const titoloGiorno = (g: string) => new Date(`${g}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const titoloMese = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
const durata = (s: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");

function spostaMese(mese: string, di: number) {
  const [a, m] = mese.split("-").map(Number);
  const d = new Date(a, m - 1 + di, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function caselle(mese: string): (string | null)[] {
  const [a, m] = mese.split("-").map(Number);
  const vuote = (new Date(a, m - 1, 1).getDay() + 6) % 7;
  const quanti = new Date(a, m, 0).getDate();
  return [...Array(vuote).fill(null), ...Array.from({ length: quanti }, (_, i) => `${mese}-${String(i + 1).padStart(2, "0")}`)];
}

function Tipo({ t }: { t: Telefonata }) {
  if (t.direzione === "uscente") return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sky-700 dark:text-sky-400"><PhoneOutgoing className="h-4 w-4" /> Uscente</span>;
  if (!t.risposta) return <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-rose-700 dark:text-rose-400"><PhoneMissed className="h-4 w-4" /> Persa</span>;
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-emerald-700 dark:text-emerald-400"><PhoneIncoming className="h-4 w-4" /> Entrante</span>;
}

function Elenco({ righe, conData }: { righe: Telefonata[]; conData?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr><th className="p-2.5">{conData ? "Quando" : "Ora"}</th><th className="p-2.5">Tipo</th><th className="p-2.5">Numero</th><th className="p-2.5 text-right">Durata</th><th className="p-2.5">Interno</th><th className="p-2.5">Linea</th></tr>
        </thead>
        <tbody className="divide-y">
          {righe.map((t, i) => (
            <tr key={`${t.inizio}-${i}`}>
              <td className="whitespace-nowrap p-2.5 tabular-nums">{conData ? dataOra(t.inizio) : ora(t.inizio)}</td>
              <td className="p-2.5"><Tipo t={t} /></td>
              <td className="p-2.5 font-medium tabular-nums">{t.numero || <span className="font-normal text-muted-foreground">Numero nascosto</span>}{t.nome ? <span className="block text-xs font-normal text-muted-foreground">{t.nome}</span> : null}</td>
              <td className="p-2.5 text-right tabular-nums">{durata(t.durata_sec)}</td>
              <td className="p-2.5">{t.interno || "—"}</td>
              <td className="p-2.5">{t.linee.filter(Boolean).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TelefonatePage() {
  const [giorno, setGiorno] = useState(oggi);
  const [mese, setMese] = useState(() => oggi().slice(0, 7));
  const [giorni, setGiorni] = useState<Giorno[]>([]);
  const [agente, setAgente] = useState<Agente | null>(null);
  const [righe, setRighe] = useState<Telefonata[] | null>(null);
  const [testo, setTesto] = useState("");
  const [cerca, setCerca] = useState("");

  useEffect(() => {
    let vivo = true;
    fetchAPI(`/api/telefonate/giorni?mese=${mese}`)
      .then((r) => { if (vivo) { setGiorni(r.giorni); setAgente(r.agente); } })
      .catch((e) => { if (vivo) toast.error(e instanceof Error ? e.message : "Errore nel caricamento"); });
    return () => { vivo = false; };
  }, [mese]);

  useEffect(() => {
    let vivo = true;
    fetchAPI(cerca ? `/api/telefonate?q=${encodeURIComponent(cerca)}` : `/api/telefonate?giorno=${giorno}`)
      .then((r) => { if (vivo) setRighe(r.telefonate); })
      .catch((e) => { if (vivo) { toast.error(e instanceof Error ? e.message : "Errore nel caricamento"); setRighe([]); } });
    return () => { vivo = false; };
  }, [giorno, cerca]);

  const perGiorno = new Map(giorni.map((g) => [g.giorno, g]));
  const scegli = (g: string) => { setRighe(null); setCerca(""); setTesto(""); setGiorno(g); };

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">Telefonate</h1>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setRighe(null); setCerca(testo.trim()); }}>
          <input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cerca un numero" inputMode="tel"
            className="h-9 w-44 rounded-md border bg-background px-3 text-sm" aria-label="Cerca un numero in tutte le telefonate" />
          <Button type="submit" size="sm" variant="outline"><Search className="mr-1.5 h-4 w-4" /> Cerca</Button>
        </form>
      </div>

      {agente && !agente.attivo ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Le telefonate non si stanno aggiornando: ultimo contatto col centralino è del {agente.ultimo_contatto ? dataOra(agente.ultimo_contatto) : "—"}. Controllare il PC HP del negozio. Le chiamate restano nel centralino e arrivano qui quando torna il collegamento.</span>
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="self-start rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <Button size="icon" variant="ghost" aria-label="Mese precedente" onClick={() => setMese(spostaMese(mese, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-semibold capitalize">{titoloMese(mese)}</span>
            <Button size="icon" variant="ghost" aria-label="Mese successivo" onClick={() => setMese(spostaMese(mese, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">{SETTIMANA.map((s) => <span key={s}>{s}</span>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {caselle(mese).map((g, i) => {
              if (!g) return <span key={`v${i}`} />;
              const d = perGiorno.get(g);
              const tot = d ? d.entranti + d.uscenti : 0;
              const scelto = !cerca && g === giorno;
              return (
                <button key={g} type="button" onClick={() => scegli(g)} aria-pressed={scelto} aria-label={`${titoloGiorno(g)}: ${tot} telefonate${d?.perse ? `, ${d.perse} perse` : ""}`}
                  className={`flex h-12 flex-col items-center justify-center rounded-md border text-sm tabular-nums transition-colors ${scelto ? "border-primary bg-primary text-primary-foreground" : tot ? "bg-muted/60 hover:bg-muted" : "border-transparent text-muted-foreground hover:bg-muted/50"}`}>
                  <span>{Number(g.slice(8))}</span>
                  {tot ? <span className={`text-[11px] leading-none ${d?.perse && !scelto ? "font-semibold text-rose-700 dark:text-rose-400" : "opacity-80"}`}>{d?.perse ? `${tot} · ${d.perse}!` : tot}</span> : null}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Sotto ogni giorno: le telefonate e, col punto esclamativo, quelle perse. Le chiamate entranti si registrano dal 04/11/2026 sera; prima di allora ci sono solo le uscenti.</p>
        </section>

        <section className="min-w-0 space-y-2">
          <h2 className="text-sm font-semibold first-letter:uppercase">{cerca ? `Ricerca «${cerca}»` : titoloGiorno(giorno)}{righe ? ` · ${righe.length} ${righe.length === 1 ? "telefonata" : "telefonate"}` : ""}</h2>
          {righe === null ? <Loader2 className="animate-spin" /> : !righe.length ? <p className="py-6 text-sm text-muted-foreground">{cerca ? "Nessuna telefonata con questo numero." : "Nessuna telefonata in questo giorno."}</p> : <Elenco righe={righe} conData={!!cerca} />}
        </section>
      </div>
    </div>
  );
}
