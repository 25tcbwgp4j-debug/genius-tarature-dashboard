// SEZIONI DEL TITOLARE (02/10/2026): pagine che l'operatore del banco non vede.
// Usato da proxy.ts (URL aperto a mano → «Riservato al titolare»), dalla sidebar e dalla guardia lato pagina.
// Il blocco vero è sul backend (403 dalle API, autorizzazioni.SEZIONI_DEL_TITOLARE).
// All'operatore restano: Registro, Sessioni, Clienti, Rapporti, Fatturazione, Scontrino, Cassa del giorno,
// Ordini e preventivi, Pro forma, Magazzino (anche carico), Scadenzario, Storico, QR Code.

export const PAGINE_DEL_TITOLARE = [
  "/statistiche",      // comprese /statistiche/fatturato (fatturato del negozio)
  "/automazioni",
  "/enrichment",       // arricchimento lead
  "/autorizzazioni",   // l'elenco; il dialogo dell'autorizzazione resta per tutti
  "/audit",            // registro delle modifiche
  "/impostazioni",
  "/utenti",
  "/chat",             // chat WhatsApp e chatbot
  "/rubrica",          // contatti della chat
  "/nuovi-clienti",    // prospect e campagne
  "/partner",          // partner B2B e outreach
  "/riservato",
];

export function paginaDelTitolare(pathname: string): boolean {
  return PAGINE_DEL_TITOLARE.some((p) => p !== "/riservato" && (pathname === p || pathname.startsWith(p + "/")));
}
