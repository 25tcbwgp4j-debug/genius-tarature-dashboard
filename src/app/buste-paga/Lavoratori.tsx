"use client";

// Lavoratori domestici del datore scelto: anagrafica, contratto, orario settimanale, documenti (con scadenze).
// In fondo i dati del datore di lavoro. Le validazioni vere sono sul backend.

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Plus, Save, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import {
  GIORNI, GIORNI_LABEL, bpModificaDatore, bpModificaLavoratore, bpNuovoDatore, bpNuovoLavoratore,
  type BpDatore, type BpDocumento, type BpLavoratore, type BpOrario,
} from "@/lib/buste-paga";
import { toastErrore } from "@/lib/errori";
import { dataIt, eur, num, numDa, selCls } from "./util";

type Campo<T> = [keyof T, string, "text" | "date" | "number", string?];
const CAMPI_ANAGRAFICA: Campo<BpLavoratore>[] = [
  ["cognome", "Cognome", "text"], ["nome", "Nome", "text"], ["codice_fiscale", "Codice fiscale", "text"],
  ["data_nascita", "Data di nascita", "date"], ["luogo_nascita", "Luogo di nascita", "text"], ["cittadinanza", "Cittadinanza", "text"],
  ["domicilio", "Domicilio", "text", "sm:col-span-2"], ["telefono", "Telefono", "text"], ["email", "Email", "text"],
  ["iban", "IBAN (per il bonifico dello stipendio)", "text", "sm:col-span-2"],
];
const CAMPI_CONTRATTO: Campo<BpLavoratore>[] = [
  ["mansione", "Mansione", "text"], ["livello", "Livello CCNL", "text"],
  ["data_assunzione", "Data di assunzione", "date"], ["data_fine", "Scadenza (tempo determinato)", "date"],
  ["paga_oraria", "Paga oraria (€)", "number"], ["ore_settimanali", "Ore settimanali", "number"],
  ["rapporto_inps", "N. rapporto INPS", "text"], ["sede_inps", "Sede INPS", "text"],
  ["data_cessazione", "Data di cessazione", "date"], ["motivo_cessazione", "Motivo della cessazione", "text"],
];
const CAMPI_DATORE: Campo<BpDatore>[] = [
  ["cognome", "Cognome", "text"], ["nome", "Nome", "text"], ["codice_fiscale", "Codice fiscale", "text"],
  ["data_nascita", "Data di nascita", "date"], ["luogo_nascita", "Luogo di nascita", "text"],
  ["indirizzo", "Indirizzo di residenza", "text", "sm:col-span-2"], ["cap", "CAP", "text"], ["comune", "Comune", "text"],
  ["provincia", "Provincia", "text"], ["luogo_lavoro", "Luogo di lavoro", "text", "sm:col-span-2"],
  ["santo_patrono", "Santo Patrono del luogo di lavoro (MM-GG, Roma 06-29)", "text"], ["telefono", "Telefono", "text"], ["email", "Email", "text"],
];

function nuovoLavoratore(datoreId: string): Partial<BpLavoratore> {
  const orario: BpOrario = {};
  for (const g of GIORNI) orario[g] = { ore: 0 };
  return { datore_id: datoreId, tipo_contratto: "indeterminato", convivente: false, stato: "attivo", documenti: [], orario_tipo: orario };
}

function Campi<T>({ campi, valori, onChange }: { campi: Campo<T>[]; valori: Partial<T>; onChange: (k: keyof T, v: string | number | null) => void }) {
  return (
    <>
      {campi.map(([k, l, tipo, cls]) => (
        <label key={String(k)} className={`text-xs text-muted-foreground ${cls || ""}`}>{l}
          <Input className="mt-0.5" type={tipo === "date" ? "date" : "text"} inputMode={tipo === "number" ? "decimal" : undefined}
            value={valori[k] === null || valori[k] === undefined ? "" : String(valori[k])}
            onChange={(e) => onChange(k, tipo === "number" ? (e.target.value === "" ? null : e.target.value) : (e.target.value || null))} />
        </label>
      ))}
    </>
  );
}

function FormLavoratore({ iniziale, onClose, onSaved }: { iniziale: Partial<BpLavoratore>; onClose: () => void; onSaved: (l: BpLavoratore) => void }) {
  const [f, setF] = useState<Partial<BpLavoratore>>(iniziale);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof BpLavoratore, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const orario = f.orario_tipo || {};
  const oreTot = GIORNI.reduce((t, g) => t + Number(orario[g]?.ore || 0), 0);
  const setOrario = (g: (typeof GIORNI)[number], campo: "ore" | "dalle" | "alle", v: string) =>
    set("orario_tipo", { ...orario, [g]: { ...(orario[g] || { ore: 0 }), [campo]: campo === "ore" ? numDa(v) : v } });
  const docs = f.documenti || [];
  const setDoc = (i: number, campo: keyof BpDocumento, v: string) =>
    set("documenti", docs.map((d, k) => (k === i ? { ...d, [campo]: v || (campo === "scadenza" ? null : "") } : d)));

  async function salva() {
    const corpo = { ...f, paga_oraria: numDa(String(f.paga_oraria ?? "")), ore_settimanali: numDa(String(f.ore_settimanali ?? "")) };
    if (corpo.ore_settimanali && Math.abs(oreTot - corpo.ore_settimanali) > 0.01
        && !confirm(`L'orario dei giorni somma ${num(oreTot)} h ma le ore settimanali sono ${num(corpo.ore_settimanali)}. Salvare comunque?`)) return;
    setSalvando(true);
    try {
      const { avvisi: _a, id, ...dati } = corpo as BpLavoratore;   // eslint-disable-line @typescript-eslint/no-unused-vars
      const r = id ? await bpModificaLavoratore(id, dati) : await bpNuovoLavoratore(dati);
      toast.success("Lavoratore salvato");
      onSaved(r);
    } catch (e) { toastErrore(e); } finally { setSalvando(false); }
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-2">
        <UserRound className="size-5" />
        <span className="font-semibold">{f.id ? `${f.cognome} ${f.nome}` : "Nuovo lavoratore"}</span>
        <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={onClose} aria-label="Chiudi"><X /></Button>
      </div>
      <div className="text-xs font-medium uppercase text-muted-foreground">Anagrafica</div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Campi campi={CAMPI_ANAGRAFICA} valori={f} onChange={(k, v) => set(k, v)} />
      </div>
      <div className="text-xs font-medium uppercase text-muted-foreground">Contratto</div>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-xs text-muted-foreground">Tipo di contratto
          <select className={`${selCls} mt-0.5 w-full`} value={f.tipo_contratto} onChange={(e) => set("tipo_contratto", e.target.value)}>
            <option value="indeterminato">Tempo indeterminato</option>
            <option value="determinato">Tempo determinato</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Stato
          <select className={`${selCls} mt-0.5 w-full`} value={f.stato} onChange={(e) => set("stato", e.target.value)}>
            <option value="attivo">Attivo</option><option value="cessato">Cessato</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={!!f.convivente} onChange={(e) => set("convivente", e.target.checked)} /> Convivente
        </label>
        <div />
        <Campi campi={CAMPI_CONTRATTO} valori={f} onChange={(k, v) => set(k, v)} />
        <label className="text-xs text-muted-foreground sm:col-span-4">Note sul contratto
          <textarea className="mt-0.5 block min-h-16 w-full rounded-lg border border-input bg-background p-2 text-sm"
            value={f.note_contratto || ""} onChange={(e) => set("note_contratto", e.target.value)} />
        </label>
      </div>
      <div className="text-xs font-medium uppercase text-muted-foreground">Orario settimanale (totale {num(oreTot)} h)</div>
      <div className="grid gap-2 sm:grid-cols-7">
        {GIORNI.map((g) => (
          <div key={g} className="rounded border p-2 text-xs">
            <div className="font-medium">{GIORNI_LABEL[g]}</div>
            <label className="mt-1 block text-muted-foreground">ore
              <input className="block h-7 w-full rounded border border-input bg-background px-1 text-right" inputMode="decimal"
                value={orario[g]?.ore ? String(orario[g]?.ore).replace(".", ",") : ""} placeholder="0" onChange={(e) => setOrario(g, "ore", e.target.value)} />
            </label>
            <div className="mt-1 flex gap-1">
              <input type="time" className="h-7 w-full rounded border border-input bg-background px-0.5" aria-label="dalle" value={orario[g]?.dalle || ""} onChange={(e) => setOrario(g, "dalle", e.target.value)} />
              <input type="time" className="h-7 w-full rounded border border-input bg-background px-0.5" aria-label="alle" value={orario[g]?.alle || ""} onChange={(e) => setOrario(g, "alle", e.target.value)} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center text-xs font-medium uppercase text-muted-foreground">
        Documenti
        <Button size="xs" variant="ghost" className="ml-2" onClick={() => set("documenti", [...docs, { tipo: "", numero: "", scadenza: null }])}><Plus /> Aggiungi</Button>
      </div>
      {docs.map((d, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_160px_1fr_auto]">
          <Input placeholder="Tipo (es. Permesso di soggiorno)" value={d.tipo} onChange={(e) => setDoc(i, "tipo", e.target.value)} />
          <Input placeholder="Numero" value={d.numero} onChange={(e) => setDoc(i, "numero", e.target.value)} />
          <Input type="date" value={d.scadenza || ""} onChange={(e) => setDoc(i, "scadenza", e.target.value)} aria-label="Scadenza" />
          <Input placeholder="Note" value={d.note || ""} onChange={(e) => setDoc(i, "note", e.target.value)} />
          <Button size="icon-sm" variant="ghost" onClick={() => set("documenti", docs.filter((_, k) => k !== i))} aria-label="Togli documento"><Trash2 /></Button>
        </div>
      ))}
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={salva} disabled={salvando}><Save /> Salva</Button>
      </div>
    </Card>
  );
}

function FormDatore({ iniziale, onClose, onSaved }: { iniziale: Partial<BpDatore>; onClose: () => void; onSaved: (d: BpDatore) => void }) {
  const [f, setF] = useState<Partial<BpDatore>>(iniziale);
  async function salva() {
    try {
      const { id, ...dati } = f;
      const r = id ? await bpModificaDatore(id, dati) : await bpNuovoDatore(dati);
      toast.success("Datore di lavoro salvato");
      onSaved(r);
    } catch (e) { toastErrore(e); }
  }
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{f.id ? "Datore di lavoro" : "Nuovo datore di lavoro"}</span>
        <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={onClose} aria-label="Chiudi"><X /></Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Campi campi={CAMPI_DATORE} valori={f} onChange={(k, v) => setF((p) => ({ ...p, [k]: v }))} />
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={salva}><Save /> Salva</Button>
      </div>
    </Card>
  );
}

export function Lavoratori({ datore, lavoratori, onCambiato, onDatoreSalvato }: {
  datore: BpDatore | null; lavoratori: BpLavoratore[]; onCambiato: (id?: string) => void; onDatoreSalvato: (d: BpDatore) => void;
}) {
  const [aperto, setAperto] = useState<Partial<BpLavoratore> | null>(null);
  const [datoreAperto, setDatoreAperto] = useState<Partial<BpDatore> | null>(null);

  return (
    <div className="space-y-4">
      {aperto && <FormLavoratore key={aperto.id || "nuovo"} iniziale={aperto} onClose={() => setAperto(null)}
        onSaved={(l) => { setAperto(null); onCambiato(l.id); }} />}
      {datoreAperto && <FormDatore key={datoreAperto.id || "nuovo"} iniziale={datoreAperto} onClose={() => setDatoreAperto(null)}
        onSaved={(d) => { setDatoreAperto(null); onDatoreSalvato(d); }} />}
      <Card className="gap-0 overflow-x-auto p-0">
        <div className="flex items-center gap-2 border-b p-3">
          <span className="font-medium">Lavoratori</span>
          {datore && <Button size="sm" className="ml-auto" onClick={() => setAperto(nuovoLavoratore(datore.id))}><Plus /> Nuovo lavoratore</Button>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2">Lavoratore</th><th className="p-2">Mansione</th><th className="p-2">Contratto</th>
              <th className="p-2 text-right">Paga oraria</th><th className="p-2 text-right">Ore sett.</th><th className="p-2">Stato</th><th />
            </tr>
          </thead>
          <tbody>
            {lavoratori.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="p-2"><div className="font-medium">{l.cognome} {l.nome}</div><div className="text-xs text-muted-foreground">{l.codice_fiscale}</div></td>
                <td className="p-2">{l.mansione || "—"}{l.livello ? ` · liv. ${l.livello}` : ""}{l.convivente ? " · convivente" : ""}</td>
                <td className="p-2 text-xs">
                  {l.tipo_contratto === "determinato" ? "Tempo determinato" : "Tempo indeterminato"}<br />
                  dal {dataIt(l.data_assunzione)}{l.data_fine ? ` al ${dataIt(l.data_fine)}` : ""}
                  {l.rapporto_inps && <><br />INPS n. {l.rapporto_inps}</>}
                </td>
                <td className="p-2 text-right tabular-nums">{eur(l.paga_oraria)}</td>
                <td className="p-2 text-right tabular-nums">{num(l.ore_settimanali)}</td>
                <td className="p-2 text-xs">{l.stato === "attivo" ? "Attivo" : `Cessato ${dataIt(l.data_cessazione)}`}</td>
                <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => setAperto(l)}><Pencil /> Modifica</Button></td>
              </tr>
            ))}
            {!lavoratori.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nessun lavoratore per questo datore</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card className="gap-2 p-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">Datore di lavoro</span>
          <div className="ml-auto flex gap-2">
            {datore && <Button size="sm" variant="ghost" onClick={() => setDatoreAperto(datore)}><Pencil /> Modifica</Button>}
            <Button size="sm" variant="outline" onClick={() => setDatoreAperto({ santo_patrono: "06-29", tipo: "domestico" })}><Plus /> Nuovo datore</Button>
          </div>
        </div>
        {datore ? (
          <div className="text-muted-foreground">
            <b className="text-foreground">{datore.cognome} {datore.nome}</b> · C.F. {datore.codice_fiscale}<br />
            {[datore.indirizzo, datore.cap, datore.comune, datore.provincia].filter(Boolean).join(" ")}
            {datore.luogo_lavoro && <><br />Luogo di lavoro: {datore.luogo_lavoro} · Santo Patrono {datore.santo_patrono}</>}
          </div>
        ) : <div className="text-muted-foreground">Nessun datore: creane uno.</div>}
      </Card>
    </div>
  );
}
