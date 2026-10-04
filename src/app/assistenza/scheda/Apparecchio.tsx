"use client";

// APPARECCHIO (05/10/2026, specifica §8.3-8.5): prodotto = FAMIGLIA a scelta (menu, non testo libero), modello esatto
// dalla decodifica con la FONTE detta chiaro («decodificato dal seriale» / «già passato nella scheda 61941: modello
// preso da lì»), DIFETTO INDICATO in evidenza, accessori consegnati, «con alimentatore» per i non Apple; email,
// codice/password e Apple ID sono campi secondari, richiusi.
import { useState } from "react";
import { ChevronDown, ChevronRight, Cpu, ExternalLink, History, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { assSeriale, FAMIGLIE_DEFAULT, type GruppoProdotti, type Seriale } from "@/lib/assistenza";
import { AnnoInput, ProdottoCombo } from "./Prodotto";
import { Campo, Pill, area, campo, etich } from "./ui";

export type ValoriApparecchio = {
  famiglia?: string | null; prodotto?: string | null; anno?: number | null; modello?: string | null; modello_fonte?: string | null; modello_da_scheda?: string | null;
  seriale?: string | null; imei?: string | null; difetto?: string | null; accessori?: string | null; con_alimentatore?: boolean | null;
  password_dispositivo?: string | null; apple_id?: string | null; password_apple_id?: string | null;
};
type K = keyof ValoriApparecchio;

const FONTE_TESTO: Record<string, string> = { seriale: "decodificato dal seriale", scheda_precedente: "preso da una scheda precedente", gsx: "letto su GSX", manuale: "scritto a mano" };

export function etichettaFamiglia(codice?: string | null, famiglie = FAMIGLIE_DEFAULT) {
  return famiglie.find((f) => f.codice === codice)?.etichetta || "";
}

export function Apparecchio({ v, set, ro, famiglie = FAMIGLIE_DEFAULT, prodotti = [], idScheda, onApri, compatto }: {
  v: ValoriApparecchio; set: (k: K, val: unknown) => void; ro?: boolean; famiglie?: { codice: string; etichetta: string }[];
  prodotti?: GruppoProdotti[]; idScheda?: string; onApri?: (id: string) => void; compatto?: boolean;
}) {
  const [ser, setSer] = useState<Seriale | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondari, setSecondari] = useState(false);
  const [mostraPw, setMostraPw] = useState(false);
  const fam = v.famiglia || "";
  const nonApple = fam === "non_apple";
  const telefono = fam === "iphone" || fam === "ipad" || fam === "watch";

  async function decodifica() {
    const s = String(v.seriale || "").trim();
    if (!s) return;
    setBusy(true);
    try {
      const r = await assSeriale(s);
      setSer(r);
      if (r.modello && (!v.modello || v.modello_fonte !== "manuale")) {
        set("modello", r.modello);
        set("modello_fonte", r.fonte || "seriale");
        set("modello_da_scheda", r.fonte === "scheda_precedente" ? r.da_scheda : null);
      }
      // 05/10/2026 (§10.1): seriale riconosciuto → prodotto del menu + anno + modello esatto
      if (r.prodotto_menu) {
        set("prodotto", r.prodotto_menu);
        if (r.famiglia_menu) set("famiglia", r.famiglia_menu);
      } else if (r.famiglia_menu && !v.famiglia) {
        set("famiglia", r.famiglia_menu);
        if (!v.prodotto) set("prodotto", etichettaFamiglia(r.famiglia_menu, famiglie).toUpperCase());
      }
      if (r.anno && (!v.anno || v.modello_fonte !== "manuale")) set("anno", r.anno);
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  const altrePrecedenti = (ser?.precedenti || []).filter((p) => p.id !== idScheda);

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${compatto ? "" : "sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"}`}>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          {/* div e non <label>: dentro c'è il menu a tendina (un label girerebbe i clic al pulsante) */}
          <div className="min-w-0">
            <span className={etich}>Prodotto *{fam ? ` · ${etichettaFamiglia(fam, famiglie)}` : ""}</span>
            {/* menu completo con ricerca (lista valori FileMaker + nuovi); la famiglia segue la voce scelta */}
            <ProdottoCombo valore={v.prodotto || ""} gruppi={prodotti} disabled={ro} onScelto={(p, f) => { set("prodotto", p); set("famiglia", f); }} />
          </div>
          <Campo label="Anno"><AnnoInput valore={v.anno} disabled={ro} onChange={(a) => set("anno", a)} /></Campo>
        </div>
        <Campo label="Numero di serie">
          <div className="flex gap-1.5">
            <input className={`${campo} font-mono uppercase`} disabled={ro} value={v.seriale || ""} onChange={(e) => set("seriale", e.target.value.toUpperCase())}
              onBlur={() => { if (v.seriale && !ser) decodifica(); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); decodifica(); } }} />
            <Button type="button" variant="outline" className="h-9" disabled={busy || !v.seriale} onClick={decodifica} title="Decodifica il seriale e cerca le schede precedenti">
              {busy ? <Loader2 className="animate-spin" /> : <ScanLine />}Decodifica</Button>
          </div>
        </Campo>
      </div>

      {ser && (
        <div className={`rounded-lg border p-2.5 text-sm ${ser.fonte === "scheda_precedente" ? "border-sky-200 bg-sky-50/70 dark:bg-sky-950/30" : ser.fonte === "seriale" ? "border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30" : "border-amber-200 bg-amber-50/70 dark:bg-amber-950/30"}`}>
          <div className="flex items-start gap-2">
            {ser.fonte === "scheda_precedente" ? <History className="mt-0.5 size-4 shrink-0" /> : <Cpu className="mt-0.5 size-4 shrink-0" />}
            <div className="min-w-0">
              {ser.modello && <div className="font-semibold">{ser.modello}</div>}
              <div className="text-xs">{ser.fonte_testo}</div>
              {altrePrecedenti.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">Già passato dal banco:
                  {altrePrecedenti.map((p) => onApri
                    ? <button key={p.id} type="button" className="font-semibold underline" onClick={() => onApri(p.id)}>{p.sigla}</button>
                    : <b key={p.id}>{p.sigla}</b>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Campo label="Modello esatto" aiuto={v.modello && v.modello_fonte ? <>Fonte: <b>{v.modello_fonte === "scheda_precedente" && v.modello_da_scheda ? `già passato nella scheda ${v.modello_da_scheda}: modello preso da lì` : FONTE_TESTO[v.modello_fonte] || v.modello_fonte}</b></> : "si compila dalla decodifica del seriale (o da GSX)"}>
        <div className="flex gap-1.5">
          <input className={campo} disabled={ro} value={v.modello || ""} placeholder="es. MacBook Air (Retina, 13-inch, 2020)"
            onChange={(e) => { set("modello", e.target.value); set("modello_fonte", e.target.value ? "manuale" : null); set("modello_da_scheda", null); }} />
          {v.seriale && <a className="inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted" target="_blank" rel="noreferrer"
            href={`https://gsx2.apple.com/product-details/${encodeURIComponent(String(v.seriale).trim())}`} title="Apri il seriale su GSX (serve essere loggati)"><ExternalLink className="size-3.5" />GSX</a>}
        </div>
      </Campo>

      <Campo label="Difetto indicato dal cliente *">
        <textarea className={`${area} min-h-[84px] border-primary/40 bg-primary/[0.03] text-[15px] font-medium`} rows={3} disabled={ro}
          placeholder="Cosa non funziona, secondo il cliente" value={v.difetto || ""} onChange={(e) => set("difetto", e.target.value)} />
      </Campo>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Campo label="Accessori consegnati"><input className={campo} disabled={ro} value={v.accessori || ""} placeholder="es. nessuno · custodia · cavo" onChange={(e) => set("accessori", e.target.value)} /></Campo>
        {nonApple && (
          <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm" title="Per i computer Apple l'alimentatore non si prende mai">
            <input type="checkbox" className="size-4" disabled={ro} checked={!!v.con_alimentatore} onChange={(e) => set("con_alimentatore", e.target.checked)} />con alimentatore
          </label>
        )}
      </div>

      <div className="rounded-lg border">
        <button type="button" className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-muted-foreground" onClick={() => setSecondari((x) => !x)}>
          {secondari ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Altri dati (IMEI, email/Apple ID, codice di sblocco)
          {(v.imei || v.apple_id || v.password_dispositivo) && <Pill>compilati</Pill>}
          {telefono && !secondari && <span className="ml-auto text-[11px]">per iPhone utile l&apos;email</span>}
        </button>
        {secondari && (
          <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
            <Campo label="IMEI"><input className={campo} disabled={ro} value={v.imei || ""} onChange={(e) => set("imei", e.target.value)} /></Campo>
            <Campo label="Email / Apple ID"><input className={campo} disabled={ro} value={v.apple_id || ""} onChange={(e) => set("apple_id", e.target.value)} /></Campo>
            <Campo label="Codice / password del dispositivo">
              <input className={campo} disabled={ro} type={mostraPw ? "text" : "password"} autoComplete="off" value={v.password_dispositivo || ""} onChange={(e) => set("password_dispositivo", e.target.value)} />
            </Campo>
            <Campo label="Password Apple ID">
              <input className={campo} disabled={ro} type={mostraPw ? "text" : "password"} autoComplete="off" value={v.password_apple_id || ""} onChange={(e) => set("password_apple_id", e.target.value)} />
            </Campo>
            <button type="button" className="text-left text-xs text-primary underline" onClick={() => setMostraPw((x) => !x)}>{mostraPw ? "nascondi" : "mostra"} codici</button>
            <span className="text-[11px] text-muted-foreground sm:text-right">Restano solo nella scheda interna: mai sui PDF del cliente.</span>
          </div>
        )}
      </div>
    </div>
  );
}
