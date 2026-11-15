// CHIAVE DI IDEMPOTENZA DEGLI INCASSI (15/11/2026, piano Genius 5.5 — backend a230411).
// Il server (POST /api/pagamenti/fattura/{fid}) con l'header «Idempotency-Key» esegue l'incasso UNA volta: la stessa
// richiesta ripetuta (doppio clic, rete che ripete, «riprova» dopo un timeout) riceve lo stesso esito, mai un secondo
// incasso. La chiave nasce all'apertura del dialogo di incasso e si riusa se l'operatore ripreme; dopo un incasso
// riuscito se ne genera una nuova (il prossimo incasso è un'operazione diversa).
// (il hook React è in lib/useChiaveIncasso.ts: questo file lo importa anche api.ts)

export function nuovaChiave(): string {
  try { if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID(); } catch { /* Safari vecchio */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Header per una richiesta di incasso. `variante` (modalità + importo) distingue due incassi diversi dello stesso
 *  dialogo (pagamento misto: contanti 50 + POS 30 sono due operazioni), mentre lo stesso tasto ripremuto resta uguale. */
export function headerIdempotenza(chiave: string | undefined, variante?: string): Record<string, string> {
  if (!chiave) return {};
  const v = (variante || "").replace(/[^A-Za-z0-9_.:-]/g, "");
  return { "Idempotency-Key": (v ? `${chiave}:${v}` : chiave).slice(0, 100) };
}
