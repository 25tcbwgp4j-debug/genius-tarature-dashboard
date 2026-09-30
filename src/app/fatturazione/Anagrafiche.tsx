"use client";

// Clienti e fornitori di fatturazione della società (per Genius importati da SimplyFatt):
// ricerca, scheda modificabile, documenti collegati, «Nuova fattura» già intestata.

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Receipt, Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  fattAnagrafica, fattAnagraficaCrea, fattAnagraficaModifica, fattAnagrafiche,
  type FattAnagrafica, type FattControparte,
} from "@/lib/api";
import { STATI, TIPI_LABEL, dataIt, eur } from "./util";

const CAMPI: [keyof FattAnagrafica, string, string][] = [
  ["denominazione", "Ragione sociale / nome", "sm:col-span-4"],
  ["piva", "Partita IVA", "sm:col-span-2"], ["cf", "Codice fiscale", "sm:col-span-2"],
  ["sdi", "Codice destinatario SDI", "sm:col-span-1"], ["pec", "PEC", "sm:col-span-1"],
  ["indirizzo", "Indirizzo", "sm:col-span-2"], ["cap", "CAP", "sm:col-span-1"], ["comune", "Comune", "sm:col-span-1"],
  ["provincia", "Prov.", "sm:col-span-1"], ["paese", "Paese", "sm:col-span-1"],
  ["email", "Email", "sm:col-span-1"], ["telefono", "Telefono", "sm:col-span-1"],
];

export function anagraficaAControparte(a: FattAnagrafica): FattControparte {
  return {
    denominazione: a.denominazione || "", piva: a.piva || "", cf: a.cf || "", sdi: a.sdi || "", pec: a.pec || "",
    indirizzo: a.indirizzo || "", cap: a.cap || "", comune: a.comune || "", provincia: a.provincia || "",
    paese: (a.paese || "IT").toUpperCase().slice(0, 2), email: a.email || "",
  };
}

export function Anagrafiche({
  societa, tipo, onNuovaFattura, onApriFattura,
}: {
  societa: string;
  tipo: "cliente" | "fornitore";
  onNuovaFattura: (a: FattAnagrafica) => void;
  onApriFattura: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [righe, setRighe] = useState<FattAnagrafica[]>([]);
  const [tot, setTot] = useState(0);
  const [loading, setLoading] = useState(false);
  const [aperta, setAperta] = useState<FattAnagrafica | null>(null);
  const [nuova, setNuova] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fattAnagrafiche(societa, tipo, q, 150);
      setRighe(r.anagrafiche || []);
      setTot(r.totale_righe || 0);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [societa, tipo, q]);

  useEffect(() => {
    const t = setTimeout(carica, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [carica, q]);

  async function apri(id: string) {
    try { setAperta(await fattAnagrafica(id)); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input className="h-8 w-72 pl-8" placeholder="Nome, P.IVA, C.F., comune, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{tot} {tipo === "cliente" ? "clienti" : "fornitori"}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setNuova(true)}><Plus /> Nuovo {tipo}</Button>
      </div>

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Nome</th><th className="p-2">P.IVA / C.F.</th><th className="p-2">Comune</th>
              <th className="p-2">SDI / PEC</th><th className="p-2">Contatti</th></tr></thead>
            <tbody>
              {righe.map((a) => (
                <tr key={a.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => apri(a.id)}>
                  <td className="p-2 font-medium">{a.denominazione}{a.origine === "simplyfatt" && <span className="ml-1 text-[10px] text-muted-foreground">SF</span>}</td>
                  <td className="p-2 text-xs">{a.piva || a.cf || "—"}</td>
                  <td className="p-2 text-xs">{[a.comune, a.provincia && `(${a.provincia})`].filter(Boolean).join(" ")}</td>
                  <td className="p-2 text-xs">{a.sdi || a.pec || "—"}</td>
                  <td className="p-2 text-xs">{[a.email, a.telefono].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
              {!righe.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nessun risultato</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {(aperta || nuova) && (
        <Scheda a={aperta} societa={societa} tipo={tipo}
          onClose={() => { setAperta(null); setNuova(false); }}
          onSaved={(a) => { setNuova(false); carica(); apri(a.id); }}
          onNuovaFattura={onNuovaFattura} onApriFattura={onApriFattura} />
      )}
    </div>
  );
}

function Scheda({
  a, societa, tipo, onClose, onSaved, onNuovaFattura, onApriFattura,
}: {
  a: FattAnagrafica | null; societa: string; tipo: "cliente" | "fornitore";
  onClose: () => void; onSaved: (a: FattAnagrafica) => void;
  onNuovaFattura: (a: FattAnagrafica) => void; onApriFattura: (id: string) => void;
}) {
  const [f, setF] = useState<Partial<FattAnagrafica>>(a || { paese: "IT" });
  const [busy, setBusy] = useState(false);
  const campo = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

  async function salva() {
    setBusy(true);
    try {
      const body = Object.fromEntries(CAMPI.map(([k]) => [k, (f[k] as string) ?? null])) as Partial<FattAnagrafica>;
      const r = a ? await fattAnagraficaModifica(a.id, body) : await fattAnagraficaCrea({ ...body, societa: societa as FattAnagrafica["societa"], tipo });
      toast.success("Anagrafica salvata");
      onSaved(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3">
          <h2 className="font-semibold">{a ? a.denominazione : `Nuovo ${tipo}`}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Chiudi"><X /></Button>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CAMPI.map(([k, l, cls]) => (
              <label key={k} className={`space-y-1 ${cls}`}>
                <div className="text-xs text-muted-foreground">{l}</div>
                <input className={campo} value={(f[k] as string) || ""} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={salva} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Salva</Button>
            {a && tipo === "cliente" && <Button size="sm" variant="outline" onClick={() => onNuovaFattura(a)}><Receipt /> Nuova fattura</Button>}
          </div>
          {a?.fatture && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Documenti ({a.fatture.length})</span>
                <span className="text-muted-foreground">Totale {eur(a.totale_fatturato)}</span>
              </div>
              <div className="divide-y rounded-lg border">
                {a.fatture.map((x) => (
                  <button key={x.id} className="flex w-full items-center gap-3 p-2 text-left text-sm hover:bg-muted/50" onClick={() => onApriFattura(x.id)}>
                    <span className="w-20 font-medium">{x.numero || "bozza"}</span>
                    <span className="w-24 text-xs">{dataIt(x.data)}</span>
                    <span className="flex-1 text-xs text-muted-foreground">{TIPI_LABEL[x.tipo_documento] || x.tipo_documento}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${(STATI[x.stato] || { cls: "" }).cls}`}>{(STATI[x.stato] || { label: x.stato }).label}</span>
                    <span className="w-24 text-right tabular-nums">{x.tipo_documento === "TD04" ? "−" : ""}{eur(x.totale)}</span>
                  </button>
                ))}
                {!a.fatture.length && <div className="p-3 text-sm text-muted-foreground">Nessun documento</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
