"use client";

// LAVORAZIONE (05/10/2026, specifica §2-3): ricambi (disponibile / in attesa con data d'arrivo e dove è stato ordinato:
// NOTA INTERNA), tecnico della verifica e sue note, tecnico della riparazione e sue note, LAVORAZIONE EFFETTUATA
// (precompilata dall'ipotesi accettata), totale, esito. Tutto ciò che è interno non va mai sui PDF del cliente.
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eur, type Scheda } from "@/lib/assistenza";
import { Campo, Pill, Scelta, Sezione, area, campo } from "./ui";

type V = <K extends keyof Scheda>(k: K) => Scheda[K] | undefined;

export function Lavorazione({ s, v, set, ro, tecnici }: { s: Scheda; v: V; set: (k: keyof Scheda, val: unknown) => void; ro: boolean; tecnici: string[] }) {
  const tl = v("totale_lavorazione");
  // 27/10/2026 (63182): con i totali vuoti vale il totale ricavato dal backend (voci accettate + spedizione)
  const tot = tl !== null && tl !== undefined && String(tl) !== "" ? tl : (s.preventivo_totale ?? s.totale_dovuto);
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
        {/* 27/10/2026 (Christian, 63121): dispositivo SOSTITUITO (iPhone, iPad, Pencil…) → nuovo seriale/IMEI, comunicato al cliente
            in evidenza in pronto, consuntivo, spedizione (mail, WhatsApp e PDF) */}
        <div className="rounded-lg border border-sky-300 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20">
          <div className="mb-1 text-sm font-semibold">🔁 Dispositivo sostituito: nuovo numero di serie</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {T("seriale_nuovo", "Nuovo seriale", { placeholder: s.seriale ? `sostituisce ${s.seriale}` : "es. F4GXK2LMN0D2" })}
            {T("imei_nuovo", "Nuovo IMEI (iPhone / iPad cellular)", { inputMode: "numeric", placeholder: s.imei ? `sostituisce ${s.imei}` : "" })}
          </div>
          {(v("seriale_nuovo") || v("imei_nuovo")) && <p className="mt-1 text-xs text-muted-foreground">Il cliente lo riceve in evidenza nel pronto / consuntivo / spedizione (mail, WhatsApp e PDF).</p>}
        </div>
        {/* 24/10/2026: dispositivo lasciato in CONTO VENDITA (sezione del cruscotto) */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <label className="flex items-center gap-1.5 text-sm font-medium">
            <input type="checkbox" className="size-4" disabled={ro} checked={!!v("conto_vendita")} onChange={(e) => set("conto_vendita", e.target.checked)} />
            In conto vendita
          </label>
          {!!v("conto_vendita") && (() => {
            // 27/10/2026 (Christian, 63247): vendita − CARICO (al proprietario) − lavorazioni = MARGINE Genius.
            // Alla vendita: regime del margine (N5) → IVA 22% compresa sulla differenza vendita − carico
            const n = (k: keyof Scheda) => Number(String(v(k) ?? "").replace(",", ".")) || 0;
            const prezzo = n("conto_vendita_prezzo"), carico = n("conto_vendita_carico"), lav = Number(s.totale_dovuto || 0);
            const marg = Math.round((prezzo - carico - lav) * 100) / 100, diff = Math.round((prezzo - carico) * 100) / 100;
            const iva = Math.round(Math.max(diff, 0) * 22 / 122 * 100) / 100;
            return (<>
              <div className="w-36">{T("conto_vendita_prezzo", "Prezzo di vendita €", { type: "number", min: 0, step: 1 })}</div>
              <div className="w-40">{T("conto_vendita_carico", "Prezzo di carico € (al proprietario)", { type: "number", min: 0, step: 1 })}</div>
              {s.conto_vendita_valutazione != null && <div className="text-sm"><div className="text-xs text-muted-foreground">Valutazione concordata</div>{eur(Number(s.conto_vendita_valutazione))}</div>}
              {prezzo > 0 && <div className="basis-full rounded-md bg-muted/50 px-3 py-2 text-sm">
                <div className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                  <span>Prezzo di vendita</span><span className="text-right tabular-nums">{eur(prezzo)}</span>
                  <span>− Prezzo di carico (va al proprietario)</span><span className="text-right tabular-nums">{carico > 0 ? eur(carico) : <i className="font-semibold text-red-700">da scrivere</i>}</span>
                  <span>− Lavorazioni della scheda</span><span className="text-right tabular-nums">{eur(lav)}</span>
                  <b>= Margine Genius</b><b className={`text-right tabular-nums ${marg < 0 ? "text-red-700" : "text-emerald-700"}`}>{eur(marg)}</b>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Alla vendita (scontrino o fattura): regime del margine art. 36 DL 41/1995 — al proprietario {eur(carico)}, sulla differenza {eur(diff)} (lavorazioni + margine) IVA 22% compresa {eur(iva)}, non esposta.</div>
              </div>}
              {s.conto_vendita_sito && <a className="basis-full text-xs text-blue-700 underline" href={s.conto_vendita_sito.url} target="_blank" rel="noreferrer">
                Sul sito: {s.conto_vendita_sito.descrizione} · {eur(s.conto_vendita_sito.prezzo)}{s.conto_vendita_sito.codice ? ` · Cod. ${s.conto_vendita_sito.codice}` : ""} (agg. {s.conto_vendita_sito.aggiornato.split("-").reverse().join("/")})</a>}
            </>);
          })()}
        </div>
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
        {/* 24/10/2026 (Christian): tecnici e note tecniche interne a richiesta (sono anche in «Verifica e riparazione») */}
        <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Dettagli tecnici <span className="font-normal text-muted-foreground">
            — {[v("tecnico_verifica") && `verifica ${v("tecnico_verifica")}`, v("tecnico_riparazione") && `riparazione ${v("tecnico_riparazione")}`,
              (v("note_verifica") || v("note_riparazione")) && "con note"].filter(Boolean).join(" · ") || "nessun dato"}</span></summary>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            {Tec("tecnico_verifica", "Tecnico della verifica")}
            <Campo label="Note di verifica (interne)"><textarea className={area} rows={2} disabled={ro} value={(v("note_verifica") as string) || ""} onChange={(e) => set("note_verifica", e.target.value)} /></Campo>
          </div>
          <div className="space-y-2">
            {Tec("tecnico_riparazione", "Tecnico della riparazione")}
            <Campo label="Note di riparazione (interne)"><textarea className={area} rows={2} disabled={ro} value={(v("note_riparazione") as string) || ""} onChange={(e) => set("note_riparazione", e.target.value)} /></Campo>
          </div>
        </div>
        </details>
        {/* 26/10/2026 (Christian): la lavorazione a tutta larghezza (prima stava accanto alla colonna stretta) */}
        <div className="grid gap-3">
          <div className="space-y-2">
          <Campo label="Lavorazione effettuata (va al cliente)" aiuto={s.preventivo_stato === "accettato" ? "Precompilata con l'ipotesi accettata e il suo importo: correggi se serve." : undefined}>
            {/* 26/10/2026 (Christian, 63079): riquadro grande, si legge tutto il testo (anche le righe lunghe) */}
            <textarea className={`${area} min-h-[160px] resize-y text-[14px] leading-relaxed`} disabled={ro} value={(v("lavorazione") as string) || ""} onChange={(e) => set("lavorazione", e.target.value)}
              rows={Math.min(40, Math.max(6, String(v("lavorazione") || "").split("\n").reduce((n, r) => n + Math.max(1, Math.ceil(r.length / 120)), 0) + 1))} />
          </Campo>
          {/* 26/10/2026 (Christian, 63123): AirPods con cuffia o custodia sostituita → il cliente deve disassociarle e riassociarle */}
          {!ro && avvisoAirpods(s, String(v("lavorazione") || "")) && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
              <span>🎧 AirPods con un componente sostituito: aggiungo alla lavorazione l&apos;avviso per il cliente (disassociare e riassociare)?</span>
              <Button size="xs" className="ml-auto" onClick={() => set("lavorazione", `${String(v("lavorazione") || "").trimEnd()}\n${NOTA_AIRPODS}`.trim())}>Aggiungi l&apos;avviso</Button>
            </div>
          )}
          </div>
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
            {/* 24/10/2026: se la scheda risulta pagata (scontrino, fattura, bonifico) il saldo non si mostra come «da pagare» */}
            {s.pagata ? (
              <div className="rounded-md bg-emerald-50 px-2.5 py-2 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">Totale <b>{eur(tot)}</b> · <b>PAGATA</b><br /><span className="text-xs">vedi «Documenti, pagamento e spedizioni»</span></div>
            ) : (
              <div className={`rounded-md px-2.5 py-2 text-sm ${saldo > 0 ? "bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" : "bg-muted/50"}`}>Totale <b>{eur(tot)}</b> · acconto {eur(acc)}<br />{saldo > 0 ? "DA PAGARE" : "SALDO"} <b className="text-base">{eur(saldo)}</b></div>
            )}
          </div>
        </div>
      </div>
    </Sezione>
  );
}


// 26/10/2026 (Christian): AirPods — sostituita una cuffia o la custodia → il cliente lo deve sapere quando chiediamo il pagamento
export const NOTA_AIRPODS = "SUL TELEFONO DEVE DISASSOCIARE LE AIRPODS E POI NUOVAMENTE RIASSOCIARLE, ALTRIMENTI LA CUFFIA NUOVA NON VERRA' MAI RICONOSCIUTA.";
function avvisoAirpods(s: Scheda, lav: string): boolean {
  const airpods = /airpods/i.test(`${s.famiglia || ""} ${s.prodotto || ""} ${s.modello || ""}`);
  const sostituzione = /sostitu|cambio|nuov[ao]/i.test(lav) && /cuffi|auricolar|custodia|case|ricarica/i.test(lav);
  return airpods && sostituzione && !/DISASSOCIARE/i.test(lav);
}
