/**
 * Snapshot dei template WhatsApp APPROVED Meta (WABA 779217981928995).
 * Usato dal frontend per renderizzare client-side il body quando:
 *  - msg.body è null (orphan creato dal webhook prima del fix log_wa_message)
 *  - msg.metadata contiene template_name + parameters
 *
 * Se i template vengono modificati in Meta Manager, aggiornare TEMPLATE_BODIES.
 * Allineato a `genius-tarature/whatsapp_template_render.py`.
 */

export const TEMPLATE_BODIES: Record<string, string> = {
  hello_world:
    "Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.",
  fgas_renewal_offer:
    "Buongiorno {{1}}! 👋\n" +
    "Sono del centro tarature di Genius S.R.L. — AvaTech Lab a Roma.\n" +
    "Le tarature degli strumenti F-GAS richiedono rinnovo annuale obbligatorio (Regolamento UE 2024/573).\n" +
    "Offriamo:\n" +
    "✅ Tempi rapidi 24-48h\n" +
    "✅ Listino tra i più competitivi del Lazio\n" +
    "✅ Certificazione ACCREDIA\n" +
    "Per informazioni sui nostri servizi, rispondi a questo messaggio.",
  calibration_expiring_notice:
    "Ciao {{1}}! 📅\n" +
    "Ti ricordiamo che la taratura dei tuoi strumenti sta per scadere.\n" +
    "📋 Strumenti: {{2}}\n" +
    "⏰ Prossima scadenza: {{3}}\n" +
    "Per programmare il rinnovo o ricevere informazioni, rispondi a questo messaggio.\n" +
    "Genius S.R.L. — Centro Tarature AvaTech Lab, Roma",
  session_registered:
    "Ciao {{1}}! 👋\n" +
    "Abbiamo registrato la tua sessione di taratura.\n" +
    "📋 Codice sessione: {{2}}\n" +
    "🔧 Strumenti ricevuti: {{3}}\n" +
    "Ti avvisiamo appena pronti al ritiro (3-10 giorni lavorativi).\n" +
    "Per domande rispondi a questo messaggio.",
  ready_for_pickup:
    "Ciao {{1}}! 🎉\n" +
    "I tuoi strumenti sono pronti al ritiro.\n" +
    "📋 Sessione: {{2}}\n" +
    "🔧 Strumenti: {{3}}\n" +
    "💶 Importo da saldare: {{4}}€ IVA inclusa\n" +
    "📍 Orari: Lun-Ven 09:00-18:00 · Sab 09:00-13:00\n" +
    "Porta un documento d'identità.",
  session_status_update:
    "Ciao {{1}}! 🔧\n" +
    "La sessione {{2}} è in lavorazione.\n" +
    "Strumenti: {{3}}\n" +
    "Completamento stimato: {{4}}\n" +
    "Grazie per la pazienza!",
  tarature_consegna_paper:
    "Ciao {{1}},\n" +
    "La sessione {{2}} si e' conclusa.\n" +
    "Strumenti consegnati: {{3}}.\n" +
    "Certificati ACCREDIA e RdT originali firmati in formato cartaceo (unica versione con valore legale, nessuna copia digitale).",
  taratura_scaduta:
    "Gentile {{1}},\n\n" +
    "La taratura del Suo strumento {{2}} ({{3}}) risulta scaduta dal {{4}}.\n\n" +
    "E importante rinnovare la taratura per garantire la conformita normativa dei Suoi strumenti.\n\n" +
    "Contattaci per programmare il ritiro o la consegna.\n\n" +
    "AvaTech Tarature Certificazioni\n" +
    "Viale Somalia, 246 - 00199 Roma\n" +
    "Tel. +39 06 80074880\n" +
    "Cell. +39 375 7371888\n" +
    "www.avatechlab.it",
  scadenza_7_giorni:
    "Gentile {{1}},\n\n" +
    "La taratura del Suo strumento {{2}} ({{3}}) scade tra 7 giorni ({{4}}).\n\n" +
    "La invitiamo a contattarci per programmare il rinnovo ed evitare interruzioni.\n\n" +
    "AvaTech Tarature Certificazioni\n" +
    "Viale Somalia, 246 - 00199 Roma\n" +
    "Tel. +39 06 80074880\n" +
    "Cell. +39 375 7371888\n" +
    "www.avatechlab.it",
  scadenza_taratura:
    "Gentile {{1}},\n\n" +
    "Le ricordiamo che la taratura dei Suoi strumenti e scaduta o in prossima scadenza.\n\n" +
    "La invitiamo a contattarci per programmare il rinnovo.\n\n" +
    "AvaTech Tarature Certificazioni\n" +
    "Viale Somalia, 246 - 00199 Roma\n" +
    "Tel. +39 06 80074880\n" +
    "Cell. +39 375 7371888\n" +
    "www.avatechlab.it",
  welcome_back_menu:
    "Ciao {{1}}! 👋\n" +
    "Come possiamo aiutarti oggi?\n" +
    "1️⃣ Nuova sessione di taratura\n" +
    "2️⃣ Info scadenze strumenti\n" +
    "3️⃣ Parlare con lo staff\n" +
    "Rispondi con il numero della tua scelta.",
  gl_device_received:
    "Ciao {{1}}! 👋\n" +
    "Abbiamo ricevuto il tuo {{2}} presso Genius Lab.\n" +
    "🎫 Ticket: #{{3}}\n" +
    "Ti avvisiamo appena completata la diagnosi (24-48h lavorative).\n" +
    "Per domande rispondi a questo messaggio.\n" +
    "— Genius Lab, Via XXX, Roma",
  gl_estimate_sent:
    "Ciao {{1}}! Diagnosi {{2}} completata ✅\n" +
    "📋 Preventivo: {{3}}€ IVA inclusa\n" +
    "⏱️ Tempi stimati: {{4}} giorni lavorativi\n" +
    "🔧 Intervento: {{5}}\n" +
    "Per approvare rispondi SI, per ritirare senza intervento rispondi NO.\n" +
    "Ticket: #{{6}}\n" +
    "Grazie, Genius Lab.",
  gl_estimate_updated:
    "Ciao {{1}}! 📝 Il preventivo per il tuo {{2}} è stato aggiornato.\n" +
    "Nuovo importo: {{3}}€ IVA inclusa\n" +
    "Dettaglio: {{4}}\n" +
    "Per approvare il nuovo preventivo rispondi SI, per declinare NO.\n" +
    "Ticket: #{{5}}\n" +
    "Grazie, Genius Lab.",
  gl_ready_for_pickup:
    "Ciao {{1}}! 🎉 Il tuo {{2}} è pronto.\n" +
    "💶 Da saldare al ritiro: {{3}}€ IVA inclusa\n" +
    "📍 Ritiro presso: Genius Lab, Via XXX, Roma\n" +
    "🕐 Orari: Lun-Ven 10:00-19:00 · Sab 10:00-13:00\n" +
    "🎫 Ticket: #{{4}}\n" +
    "Porta un documento d'identità.",
  gl_shipped:
    "Ciao {{1}}! 📦 Il tuo {{2}} è stato spedito.\n" +
    "🚚 Corriere: {{3}}\n" +
    "📦 Tracking: {{4}}\n" +
    "💶 Importo saldato: {{5}}€\n" +
    "Ticket: #{{6}}\n" +
    "Per qualsiasi domanda rispondi qui.",
};

/**
 * Renderizza il body del template sostituendo {{1}}, {{2}}, ... con i params.
 * Ritorna null se il template non è noto (il caller può poi usare il fallback).
 */
export function renderTemplate(name: string, params: unknown[] | null | undefined): string | null {
  const tpl = TEMPLATE_BODIES[name];
  if (!tpl) return null;
  if (!params || params.length === 0) return tpl;
  let out = tpl;
  params.forEach((val, idx) => {
    const token = `{{${idx + 1}}}`;
    const safe = val == null ? "" : String(val);
    out = out.split(token).join(safe);
  });
  return out;
}

export function isKnownTemplate(name: string): boolean {
  return name in TEMPLATE_BODIES;
}
