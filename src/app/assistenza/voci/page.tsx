"use client";

// VOCI DI PREVENTIVO (04/10/2026, Fase 0bis della nuova scheda assistenza Apple) — backend assistenza_voci.py.
// Le voci con cui si scrivono i preventivi NON sono magazzino: qui si cercano e si vedono in due modi:
//   · PER INTERVENTO: es. tutte le batterie di tutti i modelli, con il testo completo e il prezzo;
//   · PER MODELLO: scelta famiglia e modello (es. MacBook Pro 16" 2019) → tutte le voci possibili per intervento e ipotesi.
// Il titolare corregge prezzo, «scontato da», testo e nota direttamente nella riga (il cambio di prezzo resta nella
// storia della voce). Gli altri le vedono in sola lettura (come le schede: solo con «Visibile agli operatori»).

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ListChecks, Loader2, Pencil, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { usePermessi } from "@/components/permessi";
import { fetchAPI } from "@/lib/api";
import { eur } from "@/lib/assistenza";

interface Voce {
  id: string; famiglia: string; modello_chiave: string | null; modello_testo: string | null; anni: string | null;
  intervento: string; ipotesi: string | null; descrizione: string; prezzo: number | null; scontato_da: number | null;
  iva_inclusa: boolean; tipo_ricambio: string | null; nota: string | null; fonte: string; prezzo_aggiornato_il: string | null;
  da_verificare: boolean; storico_prezzo: number | null; storico_n_schede: number | null; storico_ultima_scheda: string | null;
  storico_flag: string | null; attiva: boolean; codice_origine: string | null;
}
interface Gruppo { chiave: string; etichetta: string; voci: Voce[] }
interface Risposta { voci: Voce[]; totale: number; gruppi?: Gruppo[] }
interface Voc { codice: string; etichetta: string; voci: number }
interface Meta { famiglie: Voc[]; interventi: Voc[]; totale: number }
interface Modello { chiave: string; nome: string | null; famiglia: string; voci: number; anno?: number | null }

const FONTI: Record<string, string> = {
  listino_apple_20260920: "listino Apple 20/09", listino_banco: "listino banco", storico_schede: "storico schede", gsx: "GSX",
  prezzi_pubblici_apple: "prezzi pubblici Apple", nota_christian: "nota Christian", bozza_0210: "bozza 02/10", manuale: "a mano",
};
const IPOTESI: Record<string, string> = { "1": "1ª ipotesi", "2": "2ª ipotesi", "3": "3ª ipotesi", aggiuntiva: "aggiuntiva" };
const msg403 = "Le schede di assistenza sono in prova: le voci di preventivo per ora le vede solo il titolare.";
const giorno = (d: string | null) => (d ? new Date(d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "");
const numero = (t: string) => { const s = t.replace("€", "").replace(",", ".").trim(); return s === "" ? null : Number(s); };

function Bottoni({ valori, scelto, onScegli }: { valori: { v: string; label: string }[]; scelto: string; onScegli: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
      {valori.map((x) => (
        <button key={x.v} type="button" onClick={() => onScegli(x.v)}
          className={`px-3 py-1.5 text-sm ${scelto === x.v ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"}`}>
          {x.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ attivo, onClick, children }: { attivo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-2.5 py-1 rounded-full border text-xs whitespace-nowrap ${attivo ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900" : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"}`}>
      {children}
    </button>
  );
}

function RigaVoce({ v, admin, mostraModello, onSalvata }: { v: Voce; admin: boolean; mostraModello: boolean; onSalvata: (v: Voce) => void }) {
  const [modifica, setModifica] = useState(false);
  const [prezzo, setPrezzo] = useState("");
  const [scontato, setScontato] = useState("");
  const [testo, setTesto] = useState("");
  const [nota, setNota] = useState("");
  const [salvo, setSalvo] = useState(false);
  const apri = () => {
    setPrezzo(v.prezzo == null ? "" : String(v.prezzo)); setScontato(v.scontato_da == null ? "" : String(v.scontato_da));
    setTesto(v.descrizione); setNota(v.nota || ""); setModifica(true);
  };
  const salva = async (extra: Record<string, unknown> = {}) => {
    const p = numero(prezzo), s = numero(scontato);
    if ((p != null && Number.isNaN(p)) || (s != null && Number.isNaN(s))) { toast.error("Prezzo non valido"); return; }
    setSalvo(true);
    try {
      const corpo = modifica ? { prezzo: p, scontato_da: s, descrizione: testo, nota, ...extra } : extra;
      const nuova = await fetchAPI(`/api/assistenza/voci/${v.id}`, { method: "PATCH", body: JSON.stringify(corpo) });
      onSalvata(nuova); setModifica(false); toast.success("Voce aggiornata");
    } catch (e) { toast.error((e as Error).message || "Errore"); } finally { setSalvo(false); }
  };
  const campo = "h-9 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 text-sm";
  return (
    <div className={`p-3 flex flex-col gap-1 ${v.attiva ? "" : "opacity-50"}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 mb-0.5">
            {mostraModello && <span className="font-semibold text-gray-800 dark:text-gray-200">{v.modello_testo || (v.famiglia === "tutte" ? "Tutte le famiglie" : "Tutta la famiglia")}</span>}
            {v.ipotesi && <span className="rounded bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200 px-1.5">{IPOTESI[v.ipotesi] || v.ipotesi}</span>}
            {v.tipo_ricambio && <span className="rounded border px-1.5">{v.tipo_ricambio}</span>}
            {v.da_verificare && <span className="rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 px-1.5 inline-flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> da verificare su GSX</span>}
            {!v.attiva && <span className="rounded border px-1.5">disattivata</span>}
          </div>
          {modifica ? (
            <textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={3}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 text-sm" />
          ) : (
            <p className="text-sm text-gray-900 dark:text-gray-100 break-words">{v.descrizione}</p>
          )}
          {modifica ? (
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (es. senza recupero dati, Touch ID obbligatorio)"
              className={`${campo} w-full mt-1`} />
          ) : v.nota ? <p className="text-xs text-gray-500 mt-0.5">{v.nota}</p> : null}
        </div>
        <div className="sm:text-right shrink-0 flex sm:flex-col items-baseline sm:items-end gap-2 sm:gap-0">
          {modifica ? (
            <div className="flex items-center gap-1">
              <input value={prezzo} onChange={(e) => setPrezzo(e.target.value)} inputMode="decimal" placeholder="Prezzo" aria-label="Prezzo IVA inclusa" className={`${campo} w-24`} />
              <input value={scontato} onChange={(e) => setScontato(e.target.value)} inputMode="decimal" placeholder="Scontato da" aria-label="Scontato da" className={`${campo} w-24`} />
            </div>
          ) : (
            <>
              <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{v.prezzo == null ? "a preventivo" : eur(v.prezzo)}</span>
              {v.scontato_da != null && <span className="text-xs text-gray-500">scontato da {eur(v.scontato_da)}</span>}
            </>
          )}
          {!modifica && v.storico_prezzo != null && v.storico_prezzo !== v.prezzo && (
            <span className="text-xs text-gray-500">storico {eur(v.storico_prezzo)}{v.storico_n_schede ? ` (${v.storico_n_schede} schede)` : ""}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
        <span>{FONTI[v.fonte] || v.fonte}{v.prezzo_aggiornato_il ? ` · ${giorno(v.prezzo_aggiornato_il)}` : ""}</span>
        {v.codice_origine && <span>{v.codice_origine}</span>}
        {v.storico_ultima_scheda && <span>ultima scheda {v.storico_ultima_scheda}</span>}
        {admin && !modifica && (
          <span className="flex gap-3 ml-auto">
            <button type="button" onClick={apri} className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300 underline min-h-[32px]"><Pencil className="w-3 h-3" /> Modifica</button>
            <button type="button" disabled={salvo} onClick={() => salva({ da_verificare: !v.da_verificare })} className="text-gray-600 dark:text-gray-300 underline min-h-[32px]">
              {v.da_verificare ? "Segna verificata" : "Da verificare"}
            </button>
          </span>
        )}
        {modifica && (
          <span className="flex gap-2 ml-auto">
            <button type="button" disabled={salvo} onClick={() => salva()} className="inline-flex items-center gap-1 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-3 h-9 text-sm">
              {salvo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salva
            </button>
            <button type="button" onClick={() => setModifica(false)} className="inline-flex items-center gap-1 rounded-md border px-3 h-9 text-sm"><X className="w-4 h-4" /> Annulla</button>
          </span>
        )}
      </div>
    </div>
  );
}

export default function VociPreventivo() {
  const { admin } = usePermessi();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [vista, setVista] = useState<"intervento" | "modello">("intervento");
  const [q, setQ] = useState("");
  const [intervento, setIntervento] = useState("batteria");
  const [famiglia, setFamiglia] = useState("");
  const [modelli, setModelli] = useState<Modello[]>([]);
  const [modello, setModello] = useState("");
  const [generiche, setGeneriche] = useState(true);
  const [dati, setDati] = useState<Risposta | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [carico, setCarico] = useState(false);

  const gestisci = (e: { status?: number; message?: string }) => setErrore(e?.status === 403 ? msg403 : e?.message || "Errore");

  useEffect(() => { fetchAPI("/api/assistenza/voci/meta", { timeoutMs: 60_000 }, false).then(setMeta).catch(gestisci); }, []);

  // modelli della famiglia scelta (vista per modello)
  useEffect(() => {
    if (vista !== "modello" || !famiglia) return;
    let annullato = false;
    fetchAPI(`/api/assistenza/voci/modelli?famiglia=${famiglia}`, { timeoutMs: 60_000 }, false)
      .then((r: { modelli: Modello[] }) => { if (!annullato) setModelli(r.modelli || []); })
      .catch(gestisci);
    return () => { annullato = true; };
  }, [vista, famiglia]);

  const percorso = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (vista === "intervento") {
      if (intervento) p.set("intervento", intervento);
      if (famiglia) p.set("famiglia", famiglia);
      p.set("raggruppa", intervento ? "modello" : "intervento");
    } else {
      if (!famiglia) return null;
      if (modello) p.set("modello", modello); else p.set("famiglia", famiglia);
      p.set("generiche", String(generiche));
      p.set("raggruppa", "intervento");
    }
    return `/api/assistenza/voci?${p.toString()}`;
  }, [q, vista, intervento, famiglia, modello, generiche]);

  useEffect(() => {
    if (!percorso) return;
    let annullato = false;
    const t = setTimeout(() => {
      setCarico(true);
      fetchAPI(percorso, { timeoutMs: 60_000 }, false)
        .then((r: Risposta) => { if (!annullato) { setDati(r); setErrore(null); } })
        .catch((e) => { if (!annullato) gestisci(e); })
        .finally(() => { if (!annullato) setCarico(false); });
    }, 250);
    return () => { annullato = true; clearTimeout(t); };
  }, [percorso]);

  const aggiorna = useCallback((nuova: Voce) => {
    setDati((d) => d && {
      ...d, voci: d.voci.map((x) => (x.id === nuova.id ? nuova : x)),
      gruppi: d.gruppi?.map((g) => ({ ...g, voci: g.voci.map((x) => (x.id === nuova.id ? nuova : x)) })),
    });
  }, []);

  const famiglieConVoci = (meta?.famiglie || []).filter((f) => f.codice !== "tutte" && f.voci > 0);
  const famigliePerModello = (meta?.famiglie || []).filter((f) => f.codice !== "tutte" && f.codice !== "non_apple");
  const nomeModello = modelli.find((m) => m.chiave === modello)?.nome;
  const mostraVoci = vista === "intervento" || !!famiglia;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ListChecks className="w-6 h-6" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Voci di preventivo</h2>
        <span className="text-xs rounded border px-2 py-0.5 text-gray-600 dark:text-gray-300">non magazzino</span>
        {meta && <span className="text-sm text-gray-500">{meta.totale.toLocaleString("it-IT")} voci · prezzi IVA inclusa</span>}
      </div>
      <p className="text-sm text-gray-500">
        I testi e i prezzi con cui si scrivono i preventivi della scheda di assistenza. Per intervento (es. tutte le batterie) o per
        modello (tutte le voci possibili di un computer, con le ipotesi). {admin ? "Prezzo e testo si correggono dalla riga." : ""}
      </p>

      {errore && <Card className="p-4 text-sm text-gray-600 dark:text-gray-300">{errore}</Card>}

      <div className="flex flex-wrap items-center gap-2">
        <Bottoni valori={[{ v: "intervento", label: "Per intervento" }, { v: "modello", label: "Per modello" }]} scelto={vista}
          onScegli={(v) => { setVista(v as "intervento" | "modello"); setDati(null); }} />
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca: «air 2020 batteria», «logica», «flex»…"
            className="w-full h-9 pl-8 pr-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm" />
        </div>
      </div>

      {vista === "intervento" && (
        <div className="space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <Chip attivo={!intervento} onClick={() => setIntervento("")}>Tutti</Chip>
            {(meta?.interventi || []).filter((i) => i.voci > 0).map((i) => (
              <Chip key={i.codice} attivo={intervento === i.codice} onClick={() => setIntervento(i.codice)}>{i.etichetta} · {i.voci}</Chip>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <Chip attivo={!famiglia} onClick={() => setFamiglia("")}>Tutte le famiglie</Chip>
            {famiglieConVoci.map((f) => (
              <Chip key={f.codice} attivo={famiglia === f.codice} onClick={() => setFamiglia(f.codice)}>{f.etichetta}</Chip>
            ))}
          </div>
        </div>
      )}

      {vista === "modello" && (
        <div className="space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {famigliePerModello.map((f) => (
              <Chip key={f.codice} attivo={famiglia === f.codice} onClick={() => { setFamiglia(f.codice); setModello(""); setModelli([]); }}>{f.etichetta}</Chip>
            ))}
          </div>
          {famiglia && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={modello} onChange={(e) => setModello(e.target.value)} aria-label="Modello"
                className="h-9 max-w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 text-sm">
                <option value="">Tutti i modelli ({modelli.length})</option>
                {modelli.map((m) => <option key={m.chiave} value={m.chiave}>{m.nome || m.chiave}{m.voci ? ` · ${m.voci} voci` : ""}</option>)}
              </select>
              <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 min-h-[36px]">
                <input type="checkbox" checked={generiche} onChange={(e) => setGeneriche(e.target.checked)} />
                anche le voci valide per tutte le famiglie
              </label>
            </div>
          )}
          {!famiglia && <Card className="p-4 text-sm text-gray-500">Scegli la famiglia e poi il modello (es. MacBook Pro → MacBook Pro 16&quot; 2019).</Card>}
        </div>
      )}

      {mostraVoci && (
        <div className="space-y-3">
          {!dati && !errore && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Caricamento…</p>}
          {dati && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              {dati.totale.toLocaleString("it-IT")} {dati.totale === 1 ? "voce" : "voci"}{nomeModello ? ` per ${nomeModello}` : ""}
              {carico && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            </p>
          )}
          {dati?.totale === 0 && <Card className="p-4 text-sm text-gray-500">Nessuna voce. Le voci dai prezzi dello storico delle schede arriveranno con l&apos;import del listino da storico.</Card>}
          {(dati?.gruppi || []).map((g) => (
            <Card key={g.chiave} className="overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border-b flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{g.etichetta}</h3>
                <span className="text-xs text-gray-500">{g.voci.length}</span>
              </div>
              <div className="divide-y">
                {g.voci.map((v) => (
                  <RigaVoce key={v.id} v={v} admin={admin} onSalvata={aggiorna}
                    mostraModello={vista === "modello" ? !v.modello_chiave || !modello : !intervento} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
