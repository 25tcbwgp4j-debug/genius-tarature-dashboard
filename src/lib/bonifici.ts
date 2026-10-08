// BONIFICI IN ENTRATA sul conto SumUp (02/10/2026): pulsante rosso in tutta la dashboard → /api/bonifici
import { fetchAPI } from "@/lib/api";

export type BonTipo = "fattura" | "fatture" | "bozza" | "proforma" | "pf" | "sessione" | "ordine" | "preventivo";

export interface BonProposta {
  tipo: BonTipo;
  id: string | null;
  ids?: string[];
  numero: string | null;
  nome: string | null;
  importo: number;
  data?: string | null;
  session_id?: string | null;
  punti?: number;
  perche?: string;
  manuale?: boolean;
  /** «cliente diverso» · «ordinante diverso dal cliente: verifica» */
  avviso?: string;
}

export interface Bonifico {
  id: string;
  codice: string;
  data: string;
  data_valuta: string | null;
  importo: number;
  ordinante: string | null;
  causale: string | null;
  iban: string | null;
  stato: string;
  proposte: BonProposta[];
  proposta_accettata: BonProposta | null;
  accettata_da?: string | null;
  esito?: string | null;
}

export interface BonControllo {
  id: string;
  eseguito_il: string;
  origine: string;
  fonte: string | null;
  esito: "ok" | "errore" | "mancato";
  letti: number;
  nuovi: number;
  gia_incassati: number;
  nota: string | null;
}

export interface BonStato {
  da_gestire: number;
  ultimo_controllo: BonControllo | null;
  prossimo_controllo: string | null;
  orari: string;
  dichiarati_da_riscontrare?: number;
  richiesta_aperta?: BonRichiesta | null;
}

/** «Controlla adesso il conto SumUp» (02/10/2026): richiesta per l'iMac del negozio */
export interface BonRichiesta {
  id: string;
  richiesto_il: string;
  richiesto_da: string | null;
  operatore: string | null;
  origine: string | null;
  stato: "in_attesa" | "in_corso" | "evasa" | "errore" | "scaduta";
  preso_il: string | null;
  evaso_il: string | null;
  esito: string | null;
  letti: number | null;
  nuovi: number | null;
  gia_in_corso?: boolean;
}

export const NOME_TIPO: Record<BonTipo, string> = {
  fattura: "Fattura", fatture: "Fatture", bozza: "Fattura in bozza", proforma: "Pro forma (sessione)", pf: "Pro forma",
  sessione: "Sessione di taratura", ordine: "Ordine cliente", preventivo: "Preventivo",
};

export const bonStato = (): Promise<BonStato> => fetchAPI("/api/bonifici/stato");
export const bonElenco = (): Promise<BonStato & { bonifici: Bonifico[]; controlli: BonControllo[] }> => fetchAPI("/api/bonifici");
export const bonDettaglio = (id: string): Promise<{ bonifico: Bonifico }> => fetchAPI(`/api/bonifici/${id}`);
export const bonCerca = (q: string): Promise<{ documenti: BonProposta[] }> => fetchAPI(`/api/bonifici/cerca?q=${encodeURIComponent(q)}`);
/** conferma=true: l'operatore ha visto l'avviso (bonifico più grande della fattura, somma diversa, clienti diversi). */
export const bonAccetta = (id: string, proposta: BonProposta, manuale = false, conferma = false): Promise<{ url: string; bonifico: Bonifico }> =>
  fetchAPI(`/api/bonifici/${id}/accetta`, { method: "POST", body: JSON.stringify({ proposta, manuale, conferma }) });
/** Più fatture scelte a mano per un bonifico (08/10/2026, caso CFS GROUP): il server le valida (≤ 20, emesse, non pagate). */
export const bonAccettaFatture = (id: string, ids: string[], conferma = false): Promise<{ url: string; bonifico: Bonifico }> =>
  fetchAPI(`/api/bonifici/${id}/accetta`, { method: "POST", body: JSON.stringify({ ids, conferma }) });
/** Testo dell'avviso quando il bonifico supera il documento scelto (null = nessun avviso). */
export function avvisoEccedenza(b: Pick<Bonifico, "importo">, p: Pick<BonProposta, "tipo" | "numero" | "importo">): string | null {
  if (!["fattura", "bozza", "fatture"].includes(p.tipo)) return null;
  const imp = Number(b.importo), doc = Number(p.importo);
  if (!(imp > doc + 0.005)) return null;
  const e = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
  const cosa = p.tipo === "fatture" ? `le fatture ${p.numero ?? ""} sono` : `la fattura ${p.numero ?? ""} è`;
  return `Il bonifico è ${e(imp)} ma ${cosa} ${e(doc)}: restano ${e(Math.round((imp - doc) * 100) / 100)} — scegli anche altre fatture o gestisci l'eccedenza`;
}
export const bonAnnullaAccettazione = (id: string) => fetchAPI(`/api/bonifici/${id}/annulla-accettazione`, { method: "POST", body: "{}" });
export const bonIgnora = (id: string, motivo: string) =>
  fetchAPI(`/api/bonifici/${id}/ignora`, { method: "POST", body: JSON.stringify({ motivo }) });
/** Azione PRECOMPILATA col bonifico (05/10/2026): tutto già pronto, basta «Conferma». */
export type BonAzione = "quietanza" | "fattura" | "scontrino" | "incasso" | "ordine";
export interface BonPrecompilato {
  bonifico: Bonifico;
  pagamento: { metodo: "bonifico"; importo: number; importo_da_registrare: number; data: string; transaction_code: string;
    riferimento: string; ordinante: string | null; causale: string | null; iban: string | null };
  documento: { tipo: BonTipo; id: string | null; numero: string | null; nome: string | null; totale: number; residuo: number; session_id?: string | null };
  confronto: { esito: "uguale" | "parziale" | "eccedenza"; differenza: number; resta_dopo: number; eccedenza: number; testo: string };
  azioni: { azione: BonAzione; etichetta: string }[];
  gestibile: boolean;
}
export const bonPrecompilato = (id: string): Promise<BonPrecompilato> => fetchAPI(`/api/bonifici/${id}/precompilato`);

export const bonConferma = (id: string, body: { operatore: string; azione?: BonAzione; emetti?: boolean; crea_fattura?: boolean }):
  Promise<{ bonifico: Bonifico; fattura_id?: string; documento_id?: string; scontrino?: { id: string; stato?: string; totale?: number };
    invio?: { ok: boolean; numero?: string; errore?: string } }> =>
  fetchAPI(`/api/bonifici/${id}/conferma`, { method: "POST", body: JSON.stringify(body) });
export const bonControlla = (): Promise<BonStato & { live: boolean; nota?: string; nuovi?: number }> =>
  fetchAPI("/api/bonifici/controlla", { method: "POST", body: "{}" });
export const bonRichiedi = (origine: string, operatore?: string): Promise<{ richiesta: BonRichiesta }> =>
  fetchAPI("/api/bonifici/richiesta", { method: "POST", body: JSON.stringify({ origine, operatore }) });
export const bonRichiesta = (id: string): Promise<{ richiesta: BonRichiesta }> => fetchAPI(`/api/bonifici/richiesta/${id}`);
