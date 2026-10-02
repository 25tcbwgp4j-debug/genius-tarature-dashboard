// CONTABILITÀ ALLO STUDIO GARGIULO (02/10/2026) — solo titolare.
// Il backend prepara, controlla e invia da solo (giorno 5 alle 9:00 per il mese prima). Da qui: stato dei periodi,
// anteprima della mail e degli allegati, esito dei controlli, «Ricontrolla», «Invia ora», «Rimanda a…», annotazioni.

export type StatoPeriodo = "mese_in_corso" | "da_preparare" | "in_preparazione" | "controlli_ko" | "pronto" | "in_invio" | "inviato" | "errore";

export interface Anomalia { testo: string; tipo: string | null; riferimento: string | null; importo: number | null; annotata: string | null }
export interface Controllo { chiave: string; nome: string; ok: boolean; esito: "ok" | "ko" | "annotato"; dettaglio: string; anomalie: Anomalia[]; note: string[] }
export interface Destinatari { a: string[]; cc: string[]; ccn: string[]; mittente_nome: string; mittente_email: string }
export interface ConfigComm extends Destinatari { invio_automatico: boolean; primo_mese_auto: string; giorno_invio: number }
export interface Invio { resend_id: string; da: string; a: string[]; cc: string[]; ccn: string[]; oggetto: string; quando: string; esito: string; link?: string | null; trigger?: string;
  allegati?: { file: string; byte: number; modo: string }[] }

export interface PeriodoVista {
  chiave: string; tipo: "mese" | "trimestre" | "intervallo"; dal: string; al: string; etichetta: string; stato: StatoPeriodo;
  automatico: boolean; prossimo_tentativo: string | null; controlli_ko: number; controlli_n: number;
  preparato_il?: string | null; inviato_il?: string | null; inviato_da?: string | null; invio?: Invio | null;
  rimanda_al?: string | null; rimanda_motivo?: string | null; file_byte?: number | null; errore?: string | null; tentativi?: number | null;
  riepilogo: { fatture_n?: number; note_credito_n?: number; fatture_totale?: number; scontrini_totale?: number; ricevute_n?: number; totale?: number };
}
export interface Annotazione { id: string; tipo: string; riferimento: string; importo: number | null; motivo: string; creato_da: string | null; created_at: string }

export interface RigaPeriodo {
  id: string; chiave: string; stato: StatoPeriodo; etichetta: string; controlli: Controllo[] | null; oggetto: string | null; corpo: string | null;
  destinatari: Destinatari | null; allegati: { file: string; byte: number; modo: string }[] | null; file_byte: number | null;
  link_url: string | null; link_scade: string | null; preparato_il: string | null; inviato_il: string | null; inviato_da: string | null;
  invio: Invio | null; rimanda_al: string | null; rimanda_motivo: string | null; errore: string | null; tentativi: number;
  eventi: { quando: string; evento: string }[];
  riepilogo: (Record<string, unknown> & { contenuto?: { file: string; byte: number }[]; nome_zip?: string;
    incassi_per_metodo?: Record<string, number> }) | null;
}
export interface DettaglioPeriodo { chiave: string; tipo: string; dal: string; al: string; etichetta: string; in_corso: boolean;
  riga: RigaPeriodo | null; config: ConfigComm; download?: string; download_errore?: string }

async function chiama<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/backend${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login?error=session_expired";
    const e = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof e.detail === "string" ? e.detail : (e.detail?.messaggio || `Errore ${res.status}`));
  }
  return res.json();
}

const B = "/api/fatturato/commercialista";
export const commElenco = () => chiama<{ config: ConfigComm; periodi: PeriodoVista[]; annotazioni: Annotazione[] }>(B);
export const commPeriodo = (chiave: string) => chiama<DettaglioPeriodo>(`${B}/periodo?chiave=${encodeURIComponent(chiave)}`);
export const commRicontrolla = (chiave: string) => chiama<{ avviato: boolean }>(`${B}/ricontrolla?chiave=${encodeURIComponent(chiave)}`, { method: "POST" });
export const commInvia = (chiave: string) => chiama<{ avviato: boolean }>(`${B}/invia`, { method: "POST", body: JSON.stringify({ chiave, conferma: true }) });
export const commRimanda = (chiave: string, al: string, motivo: string) => chiama<unknown>(`${B}/rimanda`, { method: "POST", body: JSON.stringify({ chiave, al, motivo }) });
export const commAnnota = (tipo: string, riferimento: string, motivo: string, importo: number | null) =>
  chiama<Annotazione>(`${B}/annota`, { method: "POST", body: JSON.stringify({ tipo, riferimento, motivo, importo }) });
export const commTogliAnnotazione = (tipo: string, riferimento: string) =>
  chiama<unknown>(`${B}/annota?tipo=${encodeURIComponent(tipo)}&riferimento=${encodeURIComponent(riferimento)}`, { method: "DELETE" });
export const commConfig = (c: Partial<ConfigComm>) => chiama<ConfigComm>(`${B}/config`, { method: "PUT", body: JSON.stringify(c) });

export const STATI_COMM: Record<StatoPeriodo, { label: string; cls: string }> = {
  mese_in_corso: { label: "mese in corso", cls: "bg-muted text-muted-foreground" },
  da_preparare: { label: "da preparare", cls: "bg-muted text-muted-foreground" },
  in_preparazione: { label: "preparazione in corso…", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  controlli_ko: { label: "controlli KO", cls: "bg-red-600/15 text-red-700 dark:text-red-300" },
  pronto: { label: "pronto", cls: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300" },
  in_invio: { label: "invio in corso…", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  inviato: { label: "inviato", cls: "bg-emerald-600 text-white" },
  errore: { label: "errore", cls: "bg-red-600 text-white" },
};
