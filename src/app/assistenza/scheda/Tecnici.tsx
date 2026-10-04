"use client";

// VERIFICA e RIPARAZIONE assegnate ai tecnici (05/10/2026, specifica §10.5 — ordine vincolante):
// Ricevuta → ASSEGNA IN VERIFICA (tecnico) → il tecnico scrive la VERIFICA e la CHIUDE → Da preventivare → … →
// Accettato → ASSEGNA IN RIPARAZIONE (tecnico) → STATO RIPARAZIONE (attesa ricambi · aggiornamento al cliente ·
// serve più tempo · da disabilitare «Trova il mio dispositivo» · finita) → Pronto.
import { useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2, UserCog, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dataOra, nomeTecnico, STATI_RIPARAZIONE, type Scheda } from "@/lib/assistenza";
import { cn } from "@/lib/utils";
import { Campo, Modale, Pill, Sezione, area, campo } from "./ui";

type Tecnico = { codice: string; nome: string; attivo?: boolean };

/** Scelta del tecnico a pulsanti grandi (iPad). */
export function DialogoAssegna({ titolo, testo, tecnici, attuale, onClose, onAssegna }: {
  titolo: string; testo: string; tecnici: Tecnico[]; attuale?: string | null; onClose: () => void; onAssegna: (codice: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState("");
  return (
    <Modale titolo={titolo} onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">{testo}</p>
      <div className="grid grid-cols-2 gap-2">
        {tecnici.filter((t) => t.attivo !== false).map((t) => (
          <Button key={t.codice} variant={attuale === t.codice ? "default" : "outline"} className="h-14 text-base" disabled={!!busy}
            onClick={async () => { setBusy(t.codice); try { if (await onAssegna(t.codice)) onClose(); } finally { setBusy(""); } }}>
            {busy === t.codice ? <Loader2 className="animate-spin" /> : <UserCog />}{t.nome}</Button>
        ))}
      </div>
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
export function PannelloTecnici({ s, tecnici, ro, busy, onAssegnaVerifica, onChiudiVerifica, onRiapriVerifica, onAssegnaRiparazione, onStato }: {
  s: Scheda; tecnici: Tecnico[]; ro: boolean; busy: boolean;
  onAssegnaVerifica: () => void; onChiudiVerifica: () => void; onRiapriVerifica: () => void; onAssegnaRiparazione: () => void;
  onStato: (stato: string) => void;
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
          {!ro && inRiparazione && (
            <div className="mt-2 space-y-2">
              <Button size="sm" variant={s.tecnico_riparazione ? "outline" : "default"} disabled={busy} onClick={onAssegnaRiparazione}>
                <Wrench />{s.tecnico_riparazione ? "Riassegna" : "Assegna in riparazione"}</Button>
              {s.tecnico_riparazione && (
                <div className="flex flex-wrap gap-1">
                  {STATI_RIPARAZIONE.map(([k, l]) => (
                    <button key={k} type="button" disabled={busy} onClick={() => onStato(k)} aria-pressed={s.riparazione_stato === k}
                      className={cn("rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-60",
                        s.riparazione_stato === k ? (k === "finita" ? "border-emerald-600 bg-emerald-600 text-white" : "border-primary bg-primary text-primary-foreground")
                          : k === "disabilitare_trova" ? "border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-100" : "bg-background hover:bg-muted")}>
                      {l}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Sezione>
  );
}
