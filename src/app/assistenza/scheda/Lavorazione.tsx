"use client";

// LAVORAZIONE (05/10/2026, specifica §2-3): ricambi (disponibile / in attesa con data d'arrivo e dove è stato ordinato:
// NOTA INTERNA), tecnico della verifica e sue note, tecnico della riparazione e sue note, LAVORAZIONE EFFETTUATA
// (precompilata dall'ipotesi accettata), totale, esito. Tutto ciò che è interno non va mai sui PDF del cliente.
import { Wrench } from "lucide-react";
import { eur, type Scheda } from "@/lib/assistenza";
import { Campo, Pill, Scelta, Sezione, area, campo } from "./ui";

type V = <K extends keyof Scheda>(k: K) => Scheda[K] | undefined;

export function Lavorazione({ s, v, set, ro, tecnici }: { s: Scheda; v: V; set: (k: keyof Scheda, val: unknown) => void; ro: boolean; tecnici: string[] }) {
  const tot = v("totale_lavorazione") ?? s.preventivo_totale;
  const acc = Number(v("acconto") || 0);
  const saldo = Number(tot || 0) - acc;
  const T = (k: keyof Scheda, l: string, extra: React.ComponentProps<"input"> = {}) => (
    <Campo label={l}><input className={campo} disabled={ro} value={(v(k) as string) ?? ""} onChange={(e) => set(k, e.target.value)} {...extra} /></Campo>
  );
  const Tec = (k: "tecnico_verifica" | "tecnico_riparazione", l: string) => (
    <Campo label={l}>
      <input className={campo} disabled={ro} list="tecnici-assistenza" value={(v(k) as string) || ""} placeholder="sigla" onChange={(e) => set(k, e.target.value.toUpperCase())} />
    </Campo>
  );
  return (
    <Sezione titolo="Lavorazione" icona={<Wrench />} sottotitolo={s.preventivo_stato === "accettato" ? <Pill tono="verde">in riparazione</Pill> : null}>
      <datalist id="tecnici-assistenza">{tecnici.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="space-y-3">
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Ricambi</span>
            <Scelta piccolo disabled={ro} valore={(v("ricambi_stato") as string) || "non_servono"}
              opzioni={[["non_servono", "Non servono"], ["disponibile", "Disponibile"], ["in_attesa", "In attesa"]]} onChange={(x) => set("ricambi_stato", x)} />
          </div>
          {v("ricambi_stato") === "in_attesa" && (
            <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
              {T("ricambi_arrivo_previsto", "Arrivo previsto", { type: "date" })}
              {T("ricambi_fornitore", "Ordinato da (interno)", { placeholder: "es. eBay, Mobilax, Bagnetti…" })}
            </div>
          )}
          {v("ricambi_stato") && v("ricambi_stato") !== "non_servono" && T("ricambi_nota", "Nota ricambi (interna)")}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            {Tec("tecnico_verifica", "Tecnico della verifica")}
            <Campo label="Note di verifica (interne)"><textarea className={area} rows={2} disabled={ro} value={(v("note_verifica") as string) || ""} onChange={(e) => set("note_verifica", e.target.value)} /></Campo>
          </div>
          <div className="space-y-2">
            {Tec("tecnico_riparazione", "Tecnico della riparazione")}
            <Campo label="Note di riparazione (interne)"><textarea className={area} rows={2} disabled={ro} value={(v("note_riparazione") as string) || ""} onChange={(e) => set("note_riparazione", e.target.value)} /></Campo>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_230px]">
          <Campo label="Lavorazione effettuata (va al cliente)" aiuto={s.preventivo_stato === "accettato" ? "Precompilata con l'ipotesi accettata e il suo importo: correggi se serve." : undefined}>
            <textarea className={area} rows={Math.max(3, String(v("lavorazione") || "").split("\n").length)} disabled={ro} value={(v("lavorazione") as string) || ""} onChange={(e) => set("lavorazione", e.target.value)} />
          </Campo>
          <div className="space-y-2">
            <Campo label="Totale lavorazione € (IVA compresa)">
              <input className={`${campo} text-right font-semibold`} inputMode="decimal" disabled={ro} value={v("totale_lavorazione") ?? ""} onChange={(e) => set("totale_lavorazione", e.target.value.replace(",", "."))} />
            </Campo>
            <Campo label="Acconto €">
              <input className={`${campo} text-right`} inputMode="decimal" disabled={ro} value={v("acconto") ?? ""} onChange={(e) => set("acconto", e.target.value.replace(",", "."))} />
            </Campo>
            <Campo label="Esito">
              <select className={campo} disabled={ro} value={(v("esito") as string) || ""} onChange={(e) => set("esito", e.target.value)}>
                <option value="">—</option><option value="EFFETTUATO">Effettuato</option><option value="NEGATIVO">Negativo</option><option value="DA ULTIMARE">Da ultimare</option></select>
            </Campo>
            <div className="rounded-md bg-muted/50 px-2.5 py-2 text-sm">Totale <b>{eur(tot)}</b> · acconto {eur(acc)}<br />SALDO <b className="text-base">{eur(saldo)}</b></div>
          </div>
        </div>
      </div>
    </Sezione>
  );
}
