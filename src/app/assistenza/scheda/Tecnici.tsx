"use client";

// VERIFICA e RIPARAZIONE assegnate ai tecnici (05/10/2026, specifica §10.5 — ordine vincolante):
// Ricevuta → ASSEGNA IN VERIFICA (tecnico) → il tecnico scrive la VERIFICA e la CHIUDE → Da preventivare → … →
// Accettato → ASSEGNA IN RIPARAZIONE (tecnico) → STATO RIPARAZIONE (attesa ricambi · aggiornamento al cliente ·
// serve più tempo · da disabilitare «Trova il mio dispositivo» · finita) → Pronto.
import { useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2, UserCog, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dataOra, eur, nomeTecnico, STATI_RIPARAZIONE, type Scheda } from "@/lib/assistenza";
import { cn } from "@/lib/utils";
import { Campo, Modale, Pill, Sezione, area, campo } from "./ui";

type Tecnico = { codice: string; nome: string; attivo?: boolean; esterno?: boolean };

/** Scelta del tecnico a pulsanti grandi (iPad). */
export function DialogoAssegna({ titolo, testo, tecnici, attuale, onClose, onAssegna }: {
  titolo: string; testo: string; tecnici: Tecnico[]; attuale?: string | null; onClose: () => void;
  onAssegna: (codice: string, messaggio: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState("");
  // 27/10/2026 (Christian, 63228): messaggio al tecnico che riceve il lavoro (pop-up all'apertura + cronologia nelle note)
  const [msg, setMsg] = useState("");
  return (
    <Modale titolo={titolo} onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">{testo}</p>
      <label className="mb-3 block text-sm">
        <span className="font-medium">Messaggio per il tecnico</span> <span className="text-xs text-muted-foreground">(cosa è stato fatto, cosa resta da fare — gli compare appena apre la scheda e resta nelle note)</span>
        <textarea className="mt-1 min-h-[70px] w-full rounded-md border px-2.5 py-1.5 text-sm" placeholder="Es. Ho sistemato BIOS, firmware e driver: ora rimontalo integralmente e fai il test finale." value={msg} onChange={(e) => setMsg(e.target.value)} />
      </label>
      {/* 27/10/2026 (Christian): tecnici del laboratorio + riparazione ESTERNA (Bagnetti, New Tech System per il recupero dati) */}
      {[["", tecnici.filter((t) => t.attivo !== false && !t.esterno)], ["Riparazione esterna", tecnici.filter((t) => t.attivo !== false && t.esterno)]].map(([etichetta, lista]) =>
        (lista as Tecnico[]).length > 0 && (
          <div key={etichetta as string} className="mb-2">
            {etichetta && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{etichetta as string}</div>}
            <div className="grid grid-cols-2 gap-2">
              {(lista as Tecnico[]).map((t) => (
                <Button key={t.codice} variant={attuale === t.codice ? "default" : "outline"} className={`h-14 text-base ${t.esterno ? "border-dashed" : ""}`} disabled={!!busy}
                  onClick={async () => { setBusy(t.codice); try { if (await onAssegna(t.codice, msg.trim())) onClose(); } finally { setBusy(""); } }}>
                  {busy === t.codice ? <Loader2 className="animate-spin" /> : <UserCog />}{t.nome}</Button>
              ))}
            </div>
          </div>))}
      {!tecnici.length && <p className="text-sm text-red-700">Nessun tecnico in elenco: aggiungili in Impostazioni.</p>}
    </Modale>
  );
}

/** Il tecnico scrive la verifica (test in ingresso / diagnosi) e la chiude. */
export function DialogoChiudiVerifica({ s, tecnici, onClose, onChiudi }: {
  s: Scheda; tecnici: Tecnico[]; onClose: () => void; onChiudi: (b: { note_verifica: string; diagnosi: string }) => Promise<boolean>;
}) {
  const [note, setNote] = useState(s.note_verifica || "");
  const [diagnosi, setDiagnosi] = useState(s.preventivo?.diagnosi || "");
  const [busy, setBusy] = useState(false);
  return (
    <Modale titolo={`Verifica della scheda ${s.sigla} — ${nomeTecnico(s.tecnico_verifica, tecnici) || "tecnico"}`} onClose={onClose}
      piedi={<Button disabled={busy || (!note.trim() && !diagnosi.trim())} onClick={async () => {
        setBusy(true); try { if (await onChiudi({ note_verifica: note, diagnosi })) onClose(); } finally { setBusy(false); }
      }}>{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Chiudi la verifica → da preventivare</Button>}>
      <div className="space-y-3">
        <Campo label="Test in ingresso / diagnosi (va nel preventivo al cliente)">
          <input className={campo} value={diagnosi} placeholder="es. SCHEDA LOGICA IN CORTO" onChange={(e) => setDiagnosi(e.target.value)} />
        </Campo>
        <Campo label="Note della verifica (interne: cosa è stato provato, misure, componenti)">
          <textarea className={area} rows={5} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="es. Assorbimento 0,1 A, nessun boot. Corto sulla linea PP3V3…" />
        </Campo>
        <p className="text-xs text-muted-foreground">Chiusa la verifica, la scheda passa in «Da preventivare» nel cruscotto.</p>
      </div>
    </Modale>
  );
}

/** Pannello in testa alla lavorazione: chi verifica / chi ripara e lo STATO DELLA RIPARAZIONE a un clic. */
// 03/11/2026 (Christian, 63185): gli stati della riparazione a gruppi, con preventivo e lavorazione effettuata sott'occhio
const GRUPPI_RIPARAZIONE: { titolo: string; stati: string[] }[] = [
  { titolo: "A che punto è", stati: ["in_corso", "attesa_ricambi", "ricambio_arrivato", "piu_tempo"] },
  { titolo: "Serve il cliente", stati: ["aggiornamento_cliente", "disabilitare_trova"] },
  { titolo: "Com'è finita", stati: ["finita", "non_riparabile"] },
];

/** La nota che accompagna lo stato della riparazione (prima era un prompt del browser). */
export function DialogoStatoRiparazione({ stato, serveRicambio, totale, onClose, onConferma }: {
  stato: string; serveRicambio: boolean; totale: number | null | undefined; onClose: () => void; onConferma: (nota: string, importo?: number) => Promise<boolean>;
}) {
  const [nota, setNota] = useState("");
  const [importo, setImporto] = useState("0");
  const [busy, setBusy] = useState(false);
  const nonRip = stato === "non_riparabile";
  const obbligatoria = nonRip || (stato === "attesa_ricambi" && serveRicambio);
  const testi: Record<string, [string, string, string]> = {
    attesa_ricambi: ["In attesa ricambi", serveRicambio ? "Quale ricambio serve? Va tra i ricambi da ordinare." : "Nota sul ricambio (facoltativa): dove è ordinato, quando arriva.", "es. batteria Dell PKWVM 95Wh"],
    piu_tempo: ["Serve più tempo", "Perché serve più tempo? (facoltativo)", ""],
    finita: ["Riparazione finita", "Cosa hai fatto? Resta nelle note di riparazione.", "es. sostituita scheda logica, test finale OK"],
    non_riparabile: ["Non riparabile", "Perché non è riparabile? Va nella lavorazione effettuata e nel PRONTO al cliente.", "es. processore morto"],
  };
  const [titolo, testo, esempio] = testi[stato];
  return (
    <Modale titolo={titolo} onClose={onClose} piedi={<>
      <Button variant="outline" onClick={onClose}>Annulla</Button>
      <Button disabled={busy || (obbligatoria && !nota.trim())} onClick={async () => {
        setBusy(true);
        try { if (await onConferma(nota.trim(), nonRip ? Number(importo.replace(",", ".")) || 0 : undefined)) onClose(); } finally { setBusy(false); }
      }}>{busy && <Loader2 className="animate-spin" />}Conferma</Button>
    </>}>
      <div className="space-y-3">
        <Campo label={testo}><textarea className={`${area} min-h-[84px]`} autoFocus value={nota} placeholder={esempio} onChange={(e) => setNota(e.target.value)} /></Campo>
        {nonRip && (
          <Campo label="Importo da far pagare €" aiuto={`Sostituisce il totale del preventivo${totale != null ? ` (${eur(Number(totale))})` : ""}. Comprendi le spese di spedizione, se ci sono. Il cliente lo riceve solo quando mandi il PRONTO.`}>
            <input className={campo} type="number" min={0} step={1} value={importo} onChange={(e) => setImporto(e.target.value)} />
          </Campo>
        )}
      </div>
    </Modale>
  );
}

export function PannelloTecnici({ s, tecnici, ro, busy, onAssegnaVerifica, onChiudiVerifica, onRiapriVerifica, onAssegnaRiparazione, onStato, onVai }: {
  s: Scheda; tecnici: Tecnico[]; ro: boolean; busy: boolean;
  onAssegnaVerifica: () => void; onChiudiVerifica: () => void; onRiapriVerifica: () => void; onAssegnaRiparazione: () => void;
  onStato: (stato: string) => void;
  onVai: (dove: "preventivo" | "lavorazione") => void;
}) {
  const st = s.stato;
  const vs = s.verifica_stato;
  const inRiparazione = st === "accettato";
  return (
    <Sezione titolo="Verifica e riparazione" icona={<ClipboardCheck />} className="border-primary/30" sottotitolo="tecnici: Alex, Roberto, Christian, Dumi">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border p-3" data-testid="pannello-verifica">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
            <b>Verifica</b>
            {vs === "chiusa" ? <Pill tono="verde">chiusa · {nomeTecnico(s.verifica_chiusa_da || s.tecnico_verifica, tecnici)}</Pill>
              : vs === "in_corso" ? <Pill tono="blu">in corso · {nomeTecnico(s.tecnico_verifica, tecnici)}</Pill>
                : st === "da_preventivare" ? <Pill tono="ambra">da assegnare</Pill> : <Pill>—</Pill>}
          </div>
          <div className="text-xs text-muted-foreground">
            {s.verifica_assegnata_il && <>assegnata {dataOra(s.verifica_assegnata_il)}{s.verifica_assegnata_da ? ` da ${s.verifica_assegnata_da}` : ""}</>}
            {s.verifica_chiusa_il && <> · chiusa {dataOra(s.verifica_chiusa_il)}</>}
          </div>
          {s.note_verifica && <p className="mt-1 whitespace-pre-line text-sm">{s.note_verifica}</p>}
          {!ro && st === "da_preventivare" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {vs !== "chiusa" && <Button size="sm" variant={vs === "in_corso" ? "outline" : "default"} disabled={busy} onClick={onAssegnaVerifica}>
                <UserCog />{vs === "in_corso" ? "Riassegna" : "Assegna in verifica"}</Button>}
              {vs === "in_corso" && <Button size="sm" disabled={busy} onClick={onChiudiVerifica}><CheckCircle2 />Scrivi e chiudi la verifica</Button>}
              {vs === "chiusa" && <Button size="sm" variant="ghost" disabled={busy} onClick={onRiapriVerifica}>Riapri la verifica</Button>}
            </div>
          )}
        </div>
        <div className="rounded-lg border p-3" data-testid="pannello-riparazione">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
            <b>Riparazione</b>
            {s.tecnico_riparazione ? <Pill tono={s.riparazione_stato === "finita" ? "verde" : "blu"}>{nomeTecnico(s.tecnico_riparazione, tecnici)}
              {s.riparazione_stato ? ` · ${STATI_RIPARAZIONE.find(([k]) => k === s.riparazione_stato)?.[1] || s.riparazione_stato}` : ""}</Pill>
              : inRiparazione ? <Pill tono="ambra">da assegnare</Pill> : <Pill>—</Pill>}
          </div>
          {s.riparazione_assegnata_il && <div className="text-xs text-muted-foreground">assegnata {dataOra(s.riparazione_assegnata_il)}</div>}
          {["accettato", "pronto", "consegnato"].includes(st) && (
            <div className="mt-2 grid gap-1 rounded-md bg-muted/40 p-2 text-sm">
              <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onVai("preventivo")}>
                <b>Preventivo:</b> {s.preventivo_totale != null ? eur(Number(s.preventivo_totale)) : "—"}{s.preventivo_esito === "accettato" ? " · accettato" : ""}</button>
              <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onVai("lavorazione")}>
                <b>Lavorazione effettuata:</b> {s.lavorazione ? s.lavorazione.slice(0, 160) + (s.lavorazione.length > 160 ? "…" : "") : "da scrivere"}{s.totale_lavorazione != null ? ` · ${eur(Number(s.totale_lavorazione))}` : ""}</button>
            </div>
          )}
          {s.note_riparazione && <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-line rounded-md border p-2 text-xs">{s.note_riparazione.trim()}</p>}
          {!ro && inRiparazione && (
            <div className="mt-2 space-y-2">
              <Button size="sm" variant={s.tecnico_riparazione ? "outline" : "default"} disabled={busy} onClick={onAssegnaRiparazione}>
                <Wrench />{s.tecnico_riparazione ? "Riassegna" : "Assegna in riparazione"}</Button>
              {s.tecnico_riparazione && GRUPPI_RIPARAZIONE.map((g) => (
                <div key={g.titolo}>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.titolo}</div>
                  <div className="flex flex-wrap gap-1">
                    {STATI_RIPARAZIONE.filter(([k]) => g.stati.includes(k)).map(([k, l]) => (
                      <button key={k} type="button" disabled={busy} onClick={() => onStato(k)} aria-pressed={s.riparazione_stato === k}
                        className={cn("rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-60",
                          s.riparazione_stato === k ? (k === "finita" ? "border-emerald-600 bg-emerald-600 text-white" : k === "non_riparabile" ? "border-rose-700 bg-rose-700 text-white" : "border-primary bg-primary text-primary-foreground")
                            : k === "disabilitare_trova" || k === "non_riparabile" ? "border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-100" : "bg-background hover:bg-muted")}>
                        {l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sezione>
  );
}
