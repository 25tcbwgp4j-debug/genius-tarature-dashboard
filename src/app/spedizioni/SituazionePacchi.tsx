"use client";

// 05/11/2026 (Christian): i ritiri non si stampano più. Qui la situazione di tutti i pacchi, letta in automatico da UPS e DHL:
// arrivati da accettare, in arrivo da noi, in uscita ai clienti, con in evidenza quelli fermi o in ritardo.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, PackageCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BadgeAttivita } from "@/components/attivita";
import { toastErrore } from "@/lib/errori";
import { spedSituazione, spedSituazioneAggiorna, type SpedFase, type SpedRiga, type SpedSituazione } from "@/lib/api";

const FASI: Record<SpedFase, { testo: string; classe: string }> = {
  da_ritirare: { testo: "Non ancora preso dal corriere", classe: "bg-gray-200 text-gray-800" },
  al_punto: { testo: "Al punto di deposito", classe: "bg-amber-100 text-amber-900" },
  in_viaggio: { testo: "In viaggio", classe: "bg-blue-100 text-blue-800" },
  in_consegna: { testo: "In consegna oggi", classe: "bg-indigo-100 text-indigo-800" },
  problema: { testo: "Ritardo o problema", classe: "bg-red-100 text-red-800" },
  consegnata: { testo: "Consegnato", classe: "bg-green-100 text-green-800" },
};

const quando = (v: string) => new Date(v).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const giorno = (v: string) => v.split("-").reverse().slice(0, 2).join("/");

export function BadgeFase({ r }: { r: SpedRiga }) {
  const f = FASI[r.tracking_fase || (r.status === "consegnata" ? "consegnata" : "da_ritirare")];
  return <span className={`rounded px-1.5 py-0.5 text-xs ${f.classe}`}>{f.testo}</span>;
}

function Pacco({ r }: { r: SpedRiga }) {
  return (
    <div className="py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <BadgeFase r={r} />
        <BadgeAttivita a={r.attivita} />
        {r.pratica.tipo === "sessione" ? <Link className="underline" href={`/sessioni/${r.pratica.id}`}>{r.pratica.titolo}</Link>
          : r.pratica.tipo === "scheda" ? <Link className="underline" href={`/assistenza?id=${r.pratica.id}`}>{r.pratica.titolo}</Link>
          : <span className="text-muted-foreground">{r.riferimento || "Libera"}</span>}
        <span>{r.controparte}{r.address?.city ? ` (${r.address.city})` : ""}</span>
        <b>{r.carrier}</b>
        {r.tracking_url && <a href={r.tracking_url} target="_blank" rel="noreferrer" className="font-mono text-xs text-blue-700 inline-flex items-center gap-1">{r.tracking}<ExternalLink className="w-3 h-3" /></a>}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {r.tracking_ultimo_movimento && <span>{quando(r.tracking_ultimo_movimento)}{r.tracking_luogo ? ` · ${r.tracking_luogo}` : ""}{r.tracking_descrizione ? ` · ${r.tracking_descrizione}` : ""}</span>}
        {r.tracking_fase === "da_ritirare" && r.pickup_date && <span>Ritiro prenotato il {giorno(r.pickup_date)}</span>}
        {r.tracking_consegna_prevista && <span> · consegna prevista il {giorno(r.tracking_consegna_prevista)}</span>}
      </div>
      {r.avviso_pacco && r.tracking_fase !== "problema" && <div className="mt-0.5 text-xs font-medium text-red-700">{r.avviso_pacco}</div>}
    </div>
  );
}

function Sezione({ titolo, righe, vuoto }: { titolo: string; righe: SpedRiga[]; vuoto: string }) {
  // Prima i pacchi da guardare
  const ordinate = [...righe].sort((a, b) => Number(!!b.avviso_pacco) - Number(!!a.avviso_pacco));
  return (
    <div>
      <h3 className="font-semibold">{titolo} ({righe.length})</h3>
      {righe.length === 0 ? <p className="text-sm text-muted-foreground">{vuoto}</p> : <div className="divide-y">{ordinate.map((r) => <Pacco key={r.id} r={r} />)}</div>}
    </div>
  );
}

export function SituazionePacchi({ versione }: { versione: number }) {
  const [dati, setDati] = useState<SpedSituazione | null>(null);
  const [busy, setBusy] = useState(false);
  const carica = useCallback(() => spedSituazione().then(setDati).catch(toastErrore), []);
  useEffect(() => { carica(); }, [carica, versione]);

  async function aggiorna() {
    setBusy(true);
    try {
      const r = await spedSituazioneAggiorna();
      if (r.errori) toast.warning(`Aggiornati ${r.aggiornati} pacchi, ${r.errori} non letti dal corriere`);
      else toast.success(`Aggiornati ${r.aggiornati} pacchi`);
      await carica();
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  if (!dati) return <Card className="p-4"><Loader2 className="animate-spin" /></Card>;
  const fermi = [...dati.in_arrivo, ...dati.in_uscita].filter((r) => r.avviso_pacco).length;
  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">Situazione pacchi</h2>
        {fermi > 0 && <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-sm font-medium text-red-800"><AlertTriangle className="w-4 h-4" />{fermi} da guardare</span>}
        <span className="text-xs text-muted-foreground">{dati.aggiornato_at ? `Letto da UPS e DHL il ${quando(dati.aggiornato_at)}` : "Non ancora letto da UPS e DHL"}</span>
        <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={aggiorna}>
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}Aggiorna ora
        </Button>
      </div>
      {dati.da_accettare.length > 0 && (
        <div className="rounded-lg border border-green-600 bg-green-50 p-3 dark:bg-green-950/30">
          <h3 className="flex items-center gap-1 font-semibold"><PackageCheck className="w-4 h-4" />Arrivati, da accettare al banco ({dati.da_accettare.length})</h3>
          <div className="divide-y">{dati.da_accettare.map((r) => <Pacco key={r.id} r={r} />)}</div>
        </div>
      )}
      <Sezione titolo="In arrivo da noi" righe={dati.in_arrivo} vuoto="Nessun pacco in arrivo." />
      <Sezione titolo="In uscita ai clienti" righe={dati.in_uscita} vuoto="Nessun pacco in uscita." />
    </Card>
  );
}
