"use client";

// BONIFICO ISTANTANEO (01/10/2026): prima di emettere lo scontrino o segnare pagata la fattura si controlla
// IN DIRETTA sul conto SumUp di GENIUS LAB (IBAN IE93 SUMU 9903 6512 5660 78) che il bonifico sia arrivato.
// Backend: POST /api/incassi/verifica-bonifico (Open Banking; se il conto non è collegato guarda i movimenti
// già importati). «Conferma» si abilita solo se c'è un movimento con lo stesso importo; l'admin può forzare.

import { useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermessi } from "@/components/permessi";
import { incVerificaBonifico, type EsitoVerificaBonifico, type MovimentoBonifico } from "@/lib/api";
import { toastErrore } from "@/lib/errori";

const eur = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);

/** data/ora locale per <input type="datetime-local"> (ora di Roma del browser) */
function locale(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function quando(s: string) {
  if (!s) return "";
  if (s.length <= 10) return new Date(s + "T12:00:00").toLocaleDateString("it-IT");
  return new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function VerificaBonifico({ importo, testo: testoIniziale = "", etichettaConferma, disabled, onConfermato, size = "sm", className = "" }: {
  importo: number;
  /** nome del cliente / causale attesa: serve a riconoscere il bonifico giusto */
  testo?: string;
  /** es. «Emetti scontrino» / «Segna pagata» */
  etichettaConferma: string;
  disabled?: boolean;
  /** riferimento da salvare (ordinante + data) e se l'admin ha forzato senza conferma della banca */
  onConfermato: (riferimento: string, forzato: boolean) => void | Promise<void>;
  size?: "sm" | "default";
  className?: string;
}) {
  const { admin } = usePermessi();
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState(testoIniziale);
  const [dal, setDal] = useState("");
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<EsitoVerificaBonifico | null>(null);
  const [scelto, setScelto] = useState(0);

  function apri() {
    setTesto(testoIniziale); setEsito(null); setScelto(0);
    setDal(locale(new Date(Date.now() - 2 * 3600_000)));
    setAperto(true);
  }
  async function verifica() {
    if (!(importo > 0)) { toast.error("Importo non valido"); return; }
    setBusy(true);
    try {
      const r = await incVerificaBonifico({ importo, dal: dal ? new Date(dal).toISOString() : undefined, testo: testo.trim() || undefined });
      setEsito(r);
      const i = r.movimenti_candidati.findIndex((m) => !m.gia_usato);
      setScelto(i >= 0 ? i : 0);
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  async function conferma(forzato: boolean) {
    const m: MovimentoBonifico | undefined = esito?.movimenti_candidati[scelto];
    if (forzato && !confirm(`Il bonifico da ${eur(importo)} NON risulta sul conto SumUp. Procedere comunque (${etichettaConferma})?`)) return;
    const rif = forzato || !m ? "Bonifico istantaneo — forzato dall'amministratore senza conferma del conto"
      : `Bonifico ${m.ordinante || ""} ${quando(m.data)}`.replace(/\s+/g, " ").trim();
    setBusy(true);
    try { await onConfermato(rif.slice(0, 200), forzato); setAperto(false); } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  const validi = (esito?.movimenti_candidati || []).filter((m) => !m.gia_usato);
  const okScelto = !!esito?.trovato && !!esito.movimenti_candidati[scelto] && !esito.movimenti_candidati[scelto].gia_usato;

  return (
    <>
      <Button size={size} variant="outline" className={className} disabled={disabled || !(importo > 0)} onClick={apri}>
        <Landmark /> Bonifico istantaneo
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => { if (!busy) setAperto(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bonifico istantaneo · {eur(importo)}</DialogTitle>
            <DialogDescription>
              Prima di «{etichettaConferma}» controlla che il bonifico sia arrivato sul conto SumUp di GENIUS LAB
              (IBAN IE93 SUMU 9903 6512 5660 78).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input className="h-8" placeholder="Nome di chi paga o causale (facoltativo, aiuta a riconoscerlo)"
              value={testo} onChange={(e) => setTesto(e.target.value)} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">Arrivato dopo il
              <input type="datetime-local" className="h-7 rounded-md border border-input bg-background px-1 text-xs" value={dal}
                onChange={(e) => setDal(e.target.value)} /></label>
            <Button className="w-full" disabled={busy} onClick={verifica}>
              {busy ? <Loader2 className="animate-spin" /> : esito ? <RefreshCw /> : <Landmark />}
              {esito ? " Verifica di nuovo" : " Verifica incasso sul conto SumUp"}
            </Button>

            {esito && (
              <div className={`space-y-2 rounded-md border p-2 text-sm ${esito.trovato ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-red-300 bg-red-50 dark:bg-red-950/30"}`}>
                <div className="font-medium">
                  {esito.trovato ? `✅ Bonifico da ${eur(esito.importo)} arrivato` : `❌ Nessun bonifico da ${eur(esito.importo)} sul conto`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {esito.live ? "Letto in diretta dal conto SumUp" : "⚠️ Conto non letto in diretta: controllati solo i movimenti già importati"}
                  {" · "}{esito.movimenti_nel_periodo} entrate nel periodo · {quando(esito.controllato_il)}
                  {esito.nota ? <div>{esito.nota}</div> : null}
                </div>
                {esito.movimenti_candidati.length > 0 && (
                  <div className="divide-y rounded border bg-background">
                    {esito.movimenti_candidati.map((m, i) => (
                      <label key={i} className={`flex cursor-pointer items-start gap-2 p-2 text-xs ${m.gia_usato ? "opacity-50" : ""}`}>
                        <input type="radio" className="mt-0.5" name="bonifico" checked={scelto === i} disabled={m.gia_usato} onChange={() => setScelto(i)} />
                        <span className="flex-1">
                          <span className="font-medium">{m.ordinante || "ordinante non indicato"}</span> · {quando(m.data)} · {eur(m.importo)}
                          {m.nome_corrisponde && <span className="ml-1 rounded bg-emerald-600 px-1 text-[10px] text-white">nome giusto</span>}
                          {m.gia_usato && <span className="ml-1 rounded bg-muted px-1 text-[10px]">già abbinato</span>}
                          {m.causale && <div className="text-muted-foreground">{m.causale}</div>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {esito.trovato && testo.trim() && !validi.some((m) => m.nome_corrisponde) && (
                  <div className="text-xs text-amber-700 dark:text-amber-300">L&apos;importo torna ma il nome non corrisponde: controlla l&apos;ordinante prima di confermare.</div>
                )}
              </div>
            )}

            <Button className="w-full" disabled={busy || !okScelto} onClick={() => conferma(false)}>{etichettaConferma}</Button>
            {admin && esito && !esito.trovato && (
              <Button variant="ghost" size="sm" className="w-full text-red-600" disabled={busy} onClick={() => conferma(true)}>
                <ShieldAlert /> Forza senza conferma (amministratore)</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
