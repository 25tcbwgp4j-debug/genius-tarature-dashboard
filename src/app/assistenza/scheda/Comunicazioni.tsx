"use client";

// COMUNICAZIONI della scheda (05/10/2026): ogni mail e ogni WhatsApp con l'esito. Finché la linea Apple 334 986 7400 è
// in sola lettura (o la scheda è di prova) i WhatsApp NON partono: restano «da mandare a mano» con «Copia testo» e
// «Apri chat» (wa.me) — nessun invio automatico.
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, History, Mail, MessageCircle, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dataOra, FASI, type Comunicazione, type Scheda } from "@/lib/assistenza";
import { Pill, Sezione } from "./ui";

export function copia(testo: string) {
  navigator.clipboard?.writeText(testo).then(() => toast.success("Testo copiato")).catch(() => toast.error("Copia non riuscita"));
}

function esitoPill(c: Comunicazione) {
  if (c.esito === "inviata" || c.esito === "in_coda") return <Pill tono="verde">{c.canale === "mail" ? "inviata" : "in coda"}</Pill>;
  if (c.esito === "manuale") return <Pill tono="ambra">da mandare a mano</Pill>;
  if (c.esito === "saltata" || c.esito === "saltato") return <Pill>saltato</Pill>;
  if (c.esito === "errore") return <Pill tono="rosso">errore</Pill>;
  return null;
}

export function Comunicazioni({ s }: { s: Scheda }) {
  const [aperti, setAperti] = useState<Record<string, boolean>>({});
  const com = s.comunicazioni || [];
  return (
    <Sezione titolo="Comunicazioni al cliente" icona={<MessagesSquare />}
      sottotitolo={s.prova ? "scheda di PROVA: mail solo all'indirizzo di test, WhatsApp mai" : !s.wa_linea_attiva ? "WhatsApp Apple in sola lettura: si mandano a mano" : null}>
      {com.length === 0 ? <div className="text-sm text-muted-foreground">{s.sola_lettura ? "Scheda storica FileMaker." : "Ancora nessuna comunicazione."}</div> : (
        <div className="max-h-[520px] divide-y overflow-y-auto rounded-lg border">
          {com.map((c) => (
            <div key={c.id} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {c.canale === "mail" ? <Mail className="size-4 text-muted-foreground" /> : <MessageCircle className="size-4 text-emerald-600" />}
                <span className="font-medium">{c.canale === "mail" ? (c.oggetto || "Mail") : `WhatsApp${c.a ? ` a +${c.a}` : ""}`}</span>
                {esitoPill(c)}
                <span className="ml-auto text-xs text-muted-foreground">{dataOra(c.created_at)}{c.operatore ? ` · ${c.operatore}` : ""}</span>
              </div>
              {c.canale === "mail" && c.a && <div className="text-xs text-muted-foreground">a {c.a}</div>}
              {c.canale === "whatsapp" && c.testo && (
                <div className="mt-1">
                  <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground" onClick={() => setAperti((x) => ({ ...x, [c.id]: !x[c.id] }))}>
                    {aperti[c.id] ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}testo</button>
                  {aperti[c.id] && <pre className="mt-1 whitespace-pre-wrap rounded bg-muted/50 p-2 font-sans text-xs">{c.testo}</pre>}
                  {c.esito === "manuale" && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Button size="xs" variant="outline" onClick={() => copia(c.testo || "")}><Copy />Copia testo</Button>
                      {c.link && <a className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted" href={c.link} target="_blank" rel="noreferrer"><MessageCircle className="size-3" />Apri chat</a>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Sezione>
  );
}

export function Registro({ s }: { s: Scheda }) {
  const [tutti, setTutti] = useState(false);
  const fasi = s.fasi || {};
  const ev = tutti ? s.eventi : s.eventi.slice(0, 8);
  return (
    <Sezione titolo="Fasi e registro" icona={<History />}>
      <div className="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {[...FASI, ["riparazione", "In riparazione"] as [string, string]].map(([k, l]) => (
          <div key={k} className="flex justify-between gap-2 border-b py-1">
            <span className="text-muted-foreground">{l}</span>
            <span className="tabular-nums">{fasi[k]?.il ? `${dataOra(fasi[k].il)}${fasi[k].operatore ? ` · ${fasi[k].operatore}` : ""}` : "—"}</span>
          </div>
        ))}
      </div>
      {s.eventi.length === 0 ? <div className="text-xs text-muted-foreground">{s.sola_lettura ? "Scheda storica: le fasi vengono da FileMaker." : "Nessun evento"}</div> : (
        <div className="space-y-0.5 text-xs">
          {ev.map((e) => (
            <div key={e.id} className="flex gap-2 border-t py-1"><span className="shrink-0 tabular-nums text-muted-foreground">{dataOra(e.created_at)}</span>
              {e.operatore && <b className="shrink-0">{e.operatore}</b>}<span className="min-w-0 break-words">{e.descrizione}</span></div>
          ))}
          {s.eventi.length > 8 && <button className="pt-1 text-primary underline" onClick={() => setTutti((x) => !x)}>{tutti ? "meno" : `tutti (${s.eventi.length})`}</button>}
        </div>
      )}
    </Sezione>
  );
}
