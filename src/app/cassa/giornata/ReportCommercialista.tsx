"use client";

// REPORT MENSILE PER IL COMMERCIALISTA (01/10/2026) — solo amministratore.
// Si sceglie il mese, si vedono i totali e si scarica lo ZIP (fatture Excel+PDF+XML, scontrini, cassa di ogni giorno,
// chiusure Z, foglio Riepilogo). «Bozza email» scarica un .eml con lo ZIP allegato: si apre in Mail come messaggio
// da inviare, Christian lo controlla e lo invia lui. Da qui non parte nessuna mail.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Download, FolderArchive, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { reportCommercialistaLink, reportCommercialistaRiepilogo, METODI, NOMI_METODI, type ReportLink, type ReportRiepilogo } from "@/lib/fatturato";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);

/** Mese prima di quello del giorno mostrato (a inizio mese si manda il mese appena finito). */
function mesePrecedente(giorno: string) {
  const [y, m] = giorno.split("-").map((x) => parseInt(x, 10));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function ReportCommercialista({ giorno }: { giorno: string }) {
  const [aperto, setAperto] = useState(false);
  const [mese, setMese] = useState(() => mesePrecedente(giorno));
  const [riep, setRiep] = useState<ReportRiepilogo | null>(null);
  const [carica, setCarica] = useState(false);
  const [busy, setBusy] = useState<"zip" | "email" | null>(null);
  const [esito, setEsito] = useState<ReportLink | null>(null);

  useEffect(() => {
    if (!aperto || !mese) return;
    let annullato = false;
    setCarica(true);
    setEsito(null);
    reportCommercialistaRiepilogo(mese)
      .then((r) => { if (!annullato) setRiep(r); })
      .catch((e: unknown) => { if (!annullato) { setRiep(null); toast.error(e instanceof Error ? e.message : "Errore"); } })
      .finally(() => { if (!annullato) setCarica(false); });
    return () => { annullato = true; };
  }, [aperto, mese]);

  async function genera(email: boolean) {
    setBusy(email ? "email" : "zip");
    try {
      const r = await reportCommercialistaLink(mese, email);
      setEsito(r);
      window.location.href = email && r.email_url ? r.email_url : r.zip_url;
      toast.success(email ? `Bozza della mail per ${r.email_a} scaricata: aprila, controlla e invia da Mail`
        : `Scaricato ${r.riepilogo.nome_zip}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore nella generazione del pacchetto");
    } finally { setBusy(null); }
  }

  const t = riep?.totali;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setMese(mesePrecedente(giorno)); setAperto(true); }} title="Pacchetto del mese per lo studio Gargiulo">
        <FolderArchive className="mr-1 size-4" />Report mensile commercialista
      </Button>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Report mensile per il commercialista</DialogTitle>
            <DialogDescription>
              ZIP con fatture (Excel, PDF e XML), scontrini, l&apos;Excel della cassa di ogni giorno, le chiusure fiscali Z e il foglio Riepilogo.
              Non viene inviata nessuna mail.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">Mese
            <input type="month" className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={mese}
              max={giorno.slice(0, 7)} onChange={(e) => e.target.value && setMese(e.target.value)} />
            {carica && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </label>
          {t && riep && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Fatture ({t.n_fatture}{t.n_note_credito ? ` + ${t.n_note_credito} NC` : ""})</div><div className="font-semibold">{eur(t.fatture)}</div>
                  <div className="text-xs text-muted-foreground">imp. {eur(t.imponibile)} · IVA {eur(t.iva)}</div></div>
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Scontrini ({t.n_scontrini})</div><div className="font-semibold">{eur(t.scontrini)}</div>
                  {t.n_annulli ? <div className="text-xs text-muted-foreground">{t.n_annulli} annulli/resi</div> : null}</div>
                <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Totale {riep.etichetta}</div><div className="font-semibold">{eur(t.totale)}</div></div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {METODI.filter((m) => t.pagamenti[m]).map((m) => <span key={m}>{NOMI_METODI[m]} <b className="text-foreground">{eur(t.pagamenti[m])}</b></span>)}
              </div>
              {Math.abs(riep.differenza_rt) > 0.5 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <div className="flex items-center gap-1 font-medium"><AlertTriangle className="size-3.5" />Scontrini {eur(t.scontrini)} contro chiusure RT {eur(riep.rt_totale)}: differenza {eur(riep.differenza_rt)}</div>
                  <div className="mt-0.5">{riep.giorni_differenza_rt.map((g) => `${g.giorno.slice(8)}/${g.giorno.slice(5, 7)} (${eur(g.differenza || 0)})`).join(" · ")}</div>
                  <div className="mt-0.5">Il dettaglio è nel foglio «Chiusure Z» del report.</div>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" />Gli scontrini tornano con le chiusure del registratore ({eur(riep.rt_totale)}).</div>
              )}
            </div>
          )}
          {esito && (
            <div className="rounded-md border p-2 text-xs">
              Pacchetto pronto: {esito.riepilogo.documenti_fattura} documenti ({esito.riepilogo.pdf} PDF, {esito.riepilogo.xml} XML) ·
              {" "}{esito.riepilogo.giornate_cassa} giornate di cassa · {esito.riepilogo.chiusure_z} chiusure Z.
              {" "}Se il download non è partito: <a className="text-blue-600 underline" href={esito.zip_url}>scarica lo ZIP</a>
              {esito.email_url && <> · <a className="text-blue-600 underline" href={esito.email_url}>scarica la bozza mail</a></>} (link valido un&apos;ora).
              {esito.avvisi.filter((a) => !a.startsWith("Scontrini della cassa")).map((a) => <div key={a} className="mt-1 text-amber-700">⚠ {a}</div>)}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" disabled={!!busy || !t} onClick={() => genera(true)}
              title="Scarica un .eml con lo ZIP allegato indirizzato allo studio: si apre in Mail, lo controlli e lo invii tu">
              {busy === "email" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Mail className="mr-1 size-4" />}Bozza email
            </Button>
            <Button size="sm" disabled={!!busy || !t} onClick={() => genera(false)}>
              {busy === "zip" ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Download className="mr-1 size-4" />}Scarica ZIP
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
