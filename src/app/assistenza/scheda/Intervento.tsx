"use client";
// INTERVENTO (12/11/2026, Christian): la sezione della scheda che lavora come su GSX, nell'ordine del banco:
//  1. DIFETTO con i codici Apple (componente → difetto, max 3, riproducibilità) — serve per idoneità e per aprire la riparazione;
//  2. IDONEITÀ E COPERTURA chieste ad Apple (repair/eligibility): blocchi, tipi ammessi, ricambi coperti o a pagamento;
//  3. RIPARAZIONE TIPO: un clic per componente (scheda logica, display, top case, batteria…) mette in preventivo 1ª + 2ª
//     ipotesi coi prezzi GSX (Touch ID abbinato); se Apple copre il ricambio, la 2ª va a 0 €;
//  4. COPERTURA scelta dall'operatore quando Apple non può saperlo: danno accertato, AppleCare+ con franchigia, programma.
//  Tutto resta nella scheda (difetto_apple, copertura, gsx.idoneita) ed è pronto per «Apri la riparazione su GSX» dopo l'UAT.
import { Loader2, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COPERTURE, RIPRODUCIBILITA, type CoperturaScheda, type DifettoApple, type GsxDispositivo, type GsxPrincipale } from "@/lib/gsx";
import { DifettoAppleScelta } from "./DifettoApple";
import { Pill, Sezione, campo } from "./ui";

const euro = (n?: number | null) => (n == null ? "—" : Number(n).toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }));
const ora = (s?: string | null) => (s ? new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—");

export function Intervento({ seriale, gsx, difetto, copertura, ro, operatore, onDifetto, onCopertura, onIdoneita, idoneitaBusy, onInserisci, onDecodifica }: {
  seriale?: string | null; gsx?: GsxDispositivo | null; difetto?: DifettoApple[] | null; copertura?: CoperturaScheda | null; ro: boolean; operatore?: string | null;
  onDifetto: (d: DifettoApple[]) => void; onCopertura: (c: CoperturaScheda | null) => void;
  onIdoneita?: () => void; idoneitaBusy?: boolean;
  onInserisci: (p: GsxPrincipale) => void; onDecodifica?: () => void;
}) {
  const g = gsx && gsx.seriale === String(seriale || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") ? gsx : null;
  const idon = g?.idoneita || null;
  const principali = g?.ricambi?.principali || [];
  const cop = copertura?.tipo || "apple";
  const copInfo = COPERTURE.find((c) => c.tipo === cop) || COPERTURE[0];
  const difetti = difetto || [];
  const copertoP = (codice: string) => cop === "programma" || cop === "applecare_franchigia" ? true : cop === "apple" ? !!idon?.parti.find((x) => x.codice === codice)?.coperto : false;
  const stato = !g ? <Pill tono="ambra">prima la Decodifica</Pill> : idon?.bloccata ? <Pill tono="rosso">Apple blocca</Pill> : idon ? <Pill tono={idon.coperto ? "verde" : "grigio"}>{idon.copertura || "idoneità letta"}</Pill> : <Pill tono="ambra">idoneità da chiedere</Pill>;

  return (
    <Sezione titolo="Intervento" icona={<Wrench />} sottotitolo={stato}
      azioni={cop !== "apple" ? <Pill tono={copInfo.copre ? "verde" : "ambra"}>Copertura: {copInfo.nome}{cop === "applecare_franchigia" && copertura?.franchigia ? ` · franchigia ${euro(copertura.franchigia)}` : ""}</Pill> : null}>
      <div className="space-y-3">
        {/* 1 · difetto con i codici Apple */}
        <div className="rounded-lg border p-2.5">
          <div className="mb-1 text-xs font-semibold">1 · Difetto nei codici Apple <span className="font-normal text-muted-foreground">(come su GSX: componente → difetto, il primo è il principale)</span></div>
          <DifettoAppleScelta seriale={seriale} valore={difetti} ro={ro} onChange={onDifetto} />
          {difetti.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Riproducibilità (codice Apple):</span>
              <select className={`${campo} h-7 max-w-[300px] text-xs`} disabled={ro} value={difetti[0].reproducibility || "A"}
                onChange={(e) => onDifetto(difetti.map((d, i) => (i === 0 ? { ...d, reproducibility: e.target.value } : d)))}>
                {RIPRODUCIBILITA.map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* 2 · idoneità e copertura secondo Apple */}
        <div className={`rounded-lg border p-2.5 ${idon ? (idon.bloccata ? "border-red-300 bg-red-50/40 dark:bg-red-950/20" : idon.coperto ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : "") : "border-dashed"}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <ShieldCheck className="size-4" /><b>2 · Idoneità e copertura secondo Apple</b>
            {idon ? <span>{idon.copertura || "—"}{idon.coperto ? " · RICAMBI COPERTI" : ""} · letta il {ora(idon.letto_il)}</span>
              : <span className="text-muted-foreground">{!g ? "serve la Decodifica del seriale" : difetti.length ? "Apple dice se la riparazione è ammessa, con che copertura e quali ricambi paga" : "scegli prima il difetto"}</span>}
            {!ro && onIdoneita && g && <Button type="button" size="xs" variant="outline" className="ml-auto" disabled={idoneitaBusy || !difetti.length} onClick={onIdoneita}>
              {idoneitaBusy ? <Loader2 className="size-3 animate-spin" /> : <ShieldCheck />}{idon ? "Rileggi da Apple" : "Verifica con Apple"}</Button>}
            {!g && onDecodifica && !ro && <Button type="button" size="xs" variant="outline" className="ml-auto" onClick={onDecodifica}>Decodifica il seriale</Button>}
          </div>
          {idon && (
            <div className="mt-1 space-y-0.5 text-xs">
              {idon.blocchi.length > 0 && <ul className="list-disc pl-4 text-red-800 dark:text-red-200">{idon.blocchi.map((b, i) => <li key={i}>{b.replace(/<a [^>]*>(\d+)<\/a>/g, "articolo $1").replace(/<[^>]+>/g, "")}</li>)}</ul>}
              <div>Ricambi: {idon.parti.map((p) => <span key={p.codice} className={`mr-2 ${p.coperto ? "font-semibold text-emerald-700" : ""}`}>{p.codice} {p.coperto ? "coperto" : "a pagamento"}</span>)}</div>
              <div className="text-muted-foreground">Tipi ammessi: {idon.tipi_riparazione.map((t) => t.nome).filter((x, i, a) => a.indexOf(x) === i).join(" · ") || "—"} · tecnico certificato {idon.tecnico_obbligatorio ? "obbligatorio" : "non obbligatorio"}{idon.trova_il_mio ? " · «Trova il mio» ATTIVO" : ""}</div>
            </div>
          )}
        </div>

        {/* 3 · riparazione tipo */}
        <div className="rounded-lg border p-2.5">
          <div className="mb-1 text-xs font-semibold">3 · Riparazione tipo <span className="font-normal text-muted-foreground">— un clic mette nel preventivo 1ª + 2ª ipotesi coi prezzi GSX (il ricambio giusto per configurazione e colore)</span></div>
          {principali.length === 0 ? <div className="text-xs text-muted-foreground">{g ? "Nessun ricambio principale letto da GSX per questo seriale." : "Dopo la Decodifica compaiono qui i componenti del dispositivo."}</div> : (
            <div className="flex flex-wrap gap-1.5">
              {principali.filter((p) => p.preventivo).map((p) => {
                const coperto = copertoP(p.codice);
                const pr = p.preventivo!;
                return (
                  <Button key={p.categoria} type="button" variant="outline" size="sm" disabled={ro} onClick={() => onInserisci(p)}
                    title={`${pr.uno ? `1ª ${pr.uno.t} € ${pr.uno.p} · ` : ""}2ª ${pr.due.t} € ${pr.due.p}${pr.due_touch_id ? ` + Touch ID € ${pr.due_touch_id.p}` : ""}${coperto ? " · COPERTO → 0 €" : cop === "applecare_franchigia" ? ` · franchigia ${euro(copertura?.franchigia)}` : ""}`}>
                    {pr.etichetta}
                    <span className={`ml-1 text-xs ${coperto ? "text-emerald-700" : "text-muted-foreground"}`}>
                      {coperto ? "0 €" : cop === "applecare_franchigia" ? `franchigia ${euro(copertura?.franchigia)}` : `${euro(pr.totale_2)}${pr.uno ? ` · 1ª ${euro(pr.uno.p)}` : ""}`}</span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {/* 4 · copertura scelta dall'operatore */}
        <div className="rounded-lg border p-2.5">
          <div className="mb-1 text-xs font-semibold">4 · Chi paga <span className="font-normal text-muted-foreground">— di norma lo dice Apple; si cambia solo per quello che Apple non può sapere</span></div>
          <div className="grid gap-1 text-xs">
            {COPERTURE.map((c) => (
              <label key={c.tipo} className={`flex items-start gap-2 rounded-md px-1 py-0.5 ${cop === c.tipo ? "bg-muted/60" : ""}`}>
                <input type="radio" name="copertura" className="mt-0.5" disabled={ro} checked={cop === c.tipo}
                  onChange={() => onCopertura(c.tipo === "apple" ? null : { tipo: c.tipo, franchigia: c.tipo === "applecare_franchigia" ? (copertura?.franchigia ?? null) : null, nota: copertura?.nota ?? null, scelta_da: operatore || null, scelta_il: new Date().toISOString() })} />
                <span><b>{c.nome}</b> <span className="text-muted-foreground">— {c.testo}</span></span>
              </label>
            ))}
          </div>
          {cop === "applecare_franchigia" && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span>Franchigia AppleCare+ (IVA inclusa, come la indica GSX):</span>
              <span className="relative"><span className="pointer-events-none absolute left-2 top-1.5 text-muted-foreground">€</span>
                <input className={`${campo} h-7 w-28 pl-5 text-right text-xs`} inputMode="decimal" disabled={ro} value={copertura?.franchigia ?? ""} placeholder="es. 99"
                  onChange={(e) => onCopertura({ ...(copertura || { tipo: "applecare_franchigia" }), tipo: "applecare_franchigia", franchigia: e.target.value ? Number(e.target.value.replace(",", ".")) : null })} /></span>
              <span className="text-muted-foreground">La 2ª ipotesi va nel preventivo a questo importo.</span>
            </div>
          )}
          {cop !== "apple" && (
            <input className={`${campo} mt-1.5 h-7 text-xs`} disabled={ro} placeholder="Nota (es. «ossidazione da liquido sulla logica», «programma 108539 assenza di alimentazione»)" value={copertura?.nota || ""}
              onChange={(e) => onCopertura({ ...(copertura || { tipo: cop }), nota: e.target.value || null })} />
          )}
          {cop !== "apple" && <div className="mt-1 text-[11px] text-muted-foreground">Scelta {copertura?.scelta_da ? `da ${copertura.scelta_da}` : ""}{copertura?.scelta_il ? ` il ${ora(copertura.scelta_il)}` : ""}. Si salva con la scheda.</div>}
        </div>
      </div>
    </Sezione>
  );
}
