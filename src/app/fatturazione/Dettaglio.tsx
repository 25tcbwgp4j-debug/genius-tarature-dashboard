"use client";

// Scheda di una fattura: dati, controlli prima dell'invio, pagamento, azioni ed esiti SdI.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Banknote, Copy, CreditCard, FileCode2, FileDown, Link2, Loader2, Mail, MessageCircle, Pencil, Printer,
  PackagePlus, Receipt, RotateCcw, Send, Smartphone, Trash2, Undo2, Wallet, X,
} from "lucide-react";
import { toast } from "sonner";
import { docDaFattura } from "@/lib/api";
import { PagaPos } from "@/components/PagaPos";
import { BadgeOperatore, SceltaOperatore, useOperatore, type Operatore } from "@/components/Operatore";
import { SceltaAttivita } from "@/components/attivita";
import { CaricoMagazzino } from "./CaricoMagazzino";
import { usePermessi as usePermessiAtt } from "@/components/permessi";
import { cambiaAttivita } from "@/lib/api";
import { SpedisciDocumento } from "@/components/SpedisciDocumento";
import { VerificaBonifico } from "@/components/VerificaBonifico";
import { Incassa, NOMI_MODALITA } from "@/components/Incassa";
import { GiaPagato } from "@/components/GiaPagato";
import { apriConfermaBonifico, useBonificoDelDocumento } from "@/components/BonificiAvviso";
import { toastErrore } from "@/lib/errori";
import {
  fattDettaglio, fattDuplica, fattElimina, fattEmetti, fattInvia, fattLinkStripe, fattNotaCredito,
  fattPagamento, fattUrlPdf, fattUrlStampa, fattUrlXml, pagAnnulla, pagIncassaFattura, pagRate, pagTerminiFattura,
  type FattModalita, type Fattura, type ModalitaIncasso,
} from "@/lib/api";
import { MODALITA_LABEL, SOCIETA_LABEL, STATI, TIPI_LABEL, dataIt, eur } from "./util";

const MODALITA_SCONTRINO: Record<string, string> = { contanti: "Contanti", pos_sumup: "POS SumUp", bonifico: "Bonifico", paypal: "PayPal", carta_stripe: "Carta (Stripe)" };

export function Dettaglio({
  id, onClose, onChanged, onEdit, onOpen, intento,
}: {
  id: string;
  /** aperta dall'editor con «Salva e registra pagamento» / «Salva come da pagare» */
  intento?: "pagamento" | "da_pagare" | null;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (f: Fattura) => void;
  onOpen: (id: string) => void;
}) {
  const [f, setF] = useState<Fattura | null>(null);
  const [busy, setBusy] = useState("");
  const [operatore, setOperatore] = useOperatore();
  const [rif, setRif] = useState("");
  const [invio, setInvio] = useState<"" | "email" | "whatsapp">("");
  const [dest, setDest] = useState("");
  const [msgInvio, setMsgInvio] = useState("");
  // ultimo link di pagamento con carta creato qui (07/10/2026): finisce nella copia di cortesia delle fatture da pagare
  const [linkCarta, setLinkCarta] = useState("");
  const [errore, setErrore] = useState("");
  const [conv, setConv] = useState<{ numero: string; modalita: string } | null>(null);   // conversione in scontrino
  const { admin: titolare } = usePermessiAtt();
  const [carico, setCarico] = useState(false);   // fattura ricevuta → «Carica in magazzino»

  const carica = useCallback(() => {
    fattDettaglio(id).then((r) => { setF(r); setErrore(""); })
      .catch((e) => { const m = (e as Error).message || "Errore"; setErrore(m); toast.error(m); });
  }, [id]);
  useEffect(() => { carica(); }, [carica]);

  /** Bozza → ordine / preventivo / scontrino (la bozza viene eliminata dal backend). */
  async function converti(body: { a: "ordine" | "preventivo" | "scontrino"; scontrino_numero?: string; modalita?: string }) {
    if (busy) return;
    if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO)"); return; }
    setBusy("conv");
    try {
      const r = await docDaFattura(id, { ...body, operatore });
      toast.success(r.documento ? `Creato ${r.documento.sigla}` : "Scontrino registrato nella cassa di oggi");
      setConv(null); onChanged(); onClose();
      if (r.documento) window.location.href = `/ordini?id=${r.documento.id}`;
    } catch (err) { toastErrore(err); } finally { setBusy(""); }
  }

  async function azione<T>(nome: string, fn: () => Promise<T>, ok?: (r: T) => void): Promise<T | null> {
    if (busy) return null;
    setBusy(nome);
    try {
      const r = await fn();
      ok?.(r);
      carica();
      onChanged();
      return r;
    } catch (e) {
      toastErrore(e);
      return null;
    } finally {
      setBusy("");
    }
  }

  if (!f) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        {errore ? (
          <div className="max-w-sm space-y-3 rounded-lg bg-background p-4 text-sm shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-red-600" />Non riesco ad aprire la fattura</div>
            <div className="text-muted-foreground">{errore}</div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onClose}>Chiudi</Button>
              <Button size="sm" onClick={() => { setErrore(""); carica(); }}>Riprova</Button>
            </div>
          </div>
        ) : <Loader2 className="size-6 animate-spin text-white" />}
      </div>
    );
  }

  const emessa = f.direzione === "emessa";
  const st = STATI[f.stato] || { label: f.stato, cls: "bg-muted" };
  const inviabile = emessa && ["bozza", "errore", "scartata"].includes(f.stato);
  // 05/10/2026 — PRIMA il pagamento, POI lo SdI: la bozza da incassare si invia dal pannello «Pagamento» (ultimo passo)
  const passaDalPagamento = emessa && f.stato === "bozza" && f.tipo_documento !== "TD04" && Number(f.totale) > 0.005;
  const c = f.controparte || {};
  const pagata = f.pagamento_stato === "pagata";
  const modalitaPagamento: { k: FattModalita; label: string; icon: typeof Banknote }[] = [
    { k: "contanti", label: "Contanti", icon: Banknote },
    { k: "pos_sumup", label: "POS SumUp", icon: Smartphone },
    { k: "carta_stripe", label: "Carta Stripe", icon: CreditCard },
    { k: "paypal", label: "PayPal", icon: Wallet },
    { k: "bonifico", label: "Bonifico", icon: Receipt },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b bg-background px-4 py-3">
          <div>
            <div className="text-xs text-muted-foreground">{SOCIETA_LABEL[f.societa]} · {emessa ? "emessa" : "ricevuta"}</div>
            <h2 className="text-lg font-semibold">
              {TIPI_LABEL[f.tipo_documento] || f.tipo_documento} {f.numero ? `n. ${f.numero}` : "(bozza)"}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{dataIt(f.data)}</span>
            </h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs ${pagata ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                {pagata ? `${emessa ? "Incassata" : "Pagata"} ${dataIt(f.pagato_il)}` : f.pagamento_stato === "parziale"
                  ? `Incassata in parte: ${eur(Number(f.pagato || 0))} su ${eur(Number(f.totale))}` : emessa ? "Da incassare" : "Da pagare"}
              </span>
              {f.operatore && <span className="flex items-center gap-1 text-xs text-muted-foreground">fatta da <BadgeOperatore op={f.operatore} /></span>}
              {f.ambiente === "sandbox" && <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-xs text-orange-700 dark:text-orange-300">PROVA</span>}
            </div>
            {emessa && f.societa === "genius" && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" title={f.attivita_nota || undefined}>
                Attività
                <SceltaAttivita value={f.attivita} disabled={!!busy || !(["bozza", "errore", "scartata"].includes(f.stato) || titolare)}
                  onChange={(a) => {
                    if (a === f.attivita) return;
                    // fattura già numerata/inviata (05/10/2026): solo l'etichetta interna, con conferma
                    if (!["bozza", "errore", "scartata"].includes(f.stato) && !confirm(`Fattura ${f.numero || ""} già inviata allo SdI: spostarla in ${a === "apple" ? "Apple" : "Tarature"}?\n\nCambia solo l'ETICHETTA interna: la numerazione è unica e l'XML non cambia.`)) return;
                    setBusy("attivita");
                    cambiaAttivita("fatture", f.id, a).then(() => { carica(); onChanged(); })
                      .catch((e) => toast.error((e as Error).message)).finally(() => setBusy(""));
                  }} />
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Chiudi"><X /></Button>
        </div>

        <div className="space-y-4 p-4">
          {f.errore && (
            <div className="flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="size-4 shrink-0" /> {f.errore}
            </div>
          )}
          {!!f.controlli?.length && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <div className="font-medium">Prima di inviare manca:</div>
              <ul className="ml-5 list-disc">{f.controlli.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}

          {/* Operatore: obbligatorio per inviare allo SdI, note di credito, copie e conversioni */}
          {emessa && <SceltaOperatore className="max-w-md" value={operatore} onChange={setOperatore} compatto />}
          {/* Azioni */}
          <div className="flex flex-wrap gap-2">
            {inviabile && !passaDalPagamento && (
              <Button size="sm" disabled={!!busy || !!f.controlli?.length || !operatore}
                onClick={() => azione("emetti", () => fattEmetti(f.id, operatore), (r) => r.ok ? toast.success(`Fattura ${r.numero} inviata allo SdI`) : toast.error(`Invio non riuscito: ${r.errore}`))}>
                {busy === "emetti" ? <Loader2 className="animate-spin" /> : <Send />} {f.stato === "bozza" ? "Invia allo SdI" : "Reinvia allo SdI"}
              </Button>
            )}
            {inviabile && <Button size="sm" variant="outline" onClick={() => onEdit(f)}><Pencil /> Modifica</Button>}
            {emessa && ["bozza", "errore", "scartata"].includes(f.stato) && (
              <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value="" disabled={!!busy || !operatore}
                onChange={(e) => {
                  const a = e.target.value as "ordine" | "preventivo" | "scontrino";
                  if (!a) return;
                  if (a === "scontrino") {
                    setConv({ numero: "", modalita: f.pagamento_modalita && f.pagamento_modalita in MODALITA_SCONTRINO ? f.pagamento_modalita : "contanti" });
                    return;
                  }
                  if (!confirm(`Trasformare questa bozza in ${a === "ordine" ? "ordine cliente" : "preventivo"}? La bozza di fattura verrà eliminata.`)) return;
                  converti({ a });
                }}>
                <option value="">⇄ Converti in…</option>
                <option value="ordine">Ordine cliente</option>
                <option value="preventivo">Preventivo</option>
                <option value="scontrino">Scontrino</option>
              </select>
            )}
            <a href={fattUrlPdf(f.id)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><FileDown /> PDF di cortesia</Button></a>
            <a href={fattUrlStampa(f.id)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><Printer /> Stampa</Button></a>
            {/* 09/10/2026: da pagare (anche in BOZZA, prima dello SdI) → «Richiedi pagamento» con estremi del bonifico */}
            {emessa && f.tipo_documento !== "TD04" && (f.stato !== "bozza" || (!pagata && Number(f.totale) > 0.005)) && (
              <>
                <Button size="sm" variant={invio === "email" ? "default" : "outline"}
                  className={!pagata && f.tipo_documento !== "TD04" && invio !== "email" ? "border-amber-500 text-amber-800 dark:text-amber-300" : ""}
                  onClick={() => { setInvio(invio === "email" ? "" : "email"); setDest(f.recapiti?.email || ""); }}>
                  <Mail /> {!pagata ? "Richiedi pagamento per email" : "Invia per email"}
                </Button>
                <Button size="sm" variant={invio === "whatsapp" ? "default" : "outline"}
                  onClick={() => { setInvio(invio === "whatsapp" ? "" : "whatsapp"); setDest(f.recapiti?.telefono || ""); }}>
                  <MessageCircle /> {!pagata ? "Richiedi pagamento su WhatsApp" : "WhatsApp staff"}
                </Button>
              </>
            )}
            {emessa && f.tipo_documento === "TD04" && f.stato !== "bozza" && (
              <Button size="sm" variant={invio === "email" ? "default" : "outline"}
                onClick={() => { setInvio(invio === "email" ? "" : "email"); setDest(f.recapiti?.email || ""); }}>
                <Mail /> Invia per email
              </Button>
            )}
            <a href={fattUrlXml(f.id)}><Button size="sm" variant="outline"><FileCode2 /> XML</Button></a>
            {/* nota di credito: solo su fatture trasmesse allo SdI (come il backend); per l'operatore serve l'autorizzazione dell'admin */}
            {emessa && f.numero && ["inviata", "consegnata", "non_consegnata"].includes(f.stato) && f.tipo_documento !== "TD04" && (
              <Button size="sm" variant="outline" disabled={!!busy || !operatore}
                onClick={() => azione("nc", () => fattNotaCredito(f.id, operatore), (r) => { toast.success("Nota di credito preparata"); onOpen(r.id); })}>
                <RotateCcw /> Nota di credito
              </Button>
            )}
            {/* Duplica (07/10/2026): nuova bozza con stesso cliente, righe, IVA, causale, note e pagamento —
                senza numero, SdI, pagamenti, scontrino né acconti. Poi si invia col solito flusso (prima il pagamento, poi lo SdI). */}
            {emessa && (
              <Button size="sm" variant="secondary" disabled={!!busy}
                title="Crea una nuova bozza identica (stesso cliente e righe, data di oggi, senza numero né pagamenti)"
                onClick={() => {
                  if (!operatore) { toast.error("Scegli l'operatore (CHR · VALE · DUMY · ALTRO) per duplicare"); return; }
                  azione("dup", () => fattDuplica(f.id, operatore), (r) => { toast.success("Duplicata: nuova bozza pronta, controllala e inviala"); onEdit(r); });
                }}>
                {busy === "dup" ? <Loader2 className="animate-spin" /> : <Copy />} Duplica fattura
              </Button>
            )}
            {f.stato === "bozza" && !f.numero && (
              <Button size="sm" variant="destructive" disabled={!!busy}
                onClick={() => { if (confirm("Eliminare questa bozza?")) azione("del", () => fattElimina(f.id), () => { toast.success("Bozza eliminata"); onClose(); }); }}>
                <Trash2 /> Elimina bozza
              </Button>
            )}
          </div>
          {/* «Spedisci» dalla fattura (05/10/2026): spedizione libera già compilata col cliente e la divisione della fattura */}
          {emessa && f.societa === "genius" && <SpedisciDocumento link={{ fattura_id: f.id }} />}

          {conv && (
            <div className="space-y-2 rounded-lg border border-primary/40 p-3">
              <div className="text-sm font-medium">Converti in scontrino — {eur(f.totale)} nella cassa di oggi (la bozza di fattura verrà eliminata)</div>
              <div className="flex flex-wrap items-center gap-2">
                <input className="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm" placeholder="N. scontrino *" value={conv.numero}
                  onChange={(e) => setConv({ ...conv, numero: e.target.value })} />
                <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={conv.modalita} onChange={(e) => setConv({ ...conv, modalita: e.target.value })}>
                  {Object.entries(MODALITA_SCONTRINO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <Button size="sm" disabled={!!busy || !conv.numero.trim()}
                  onClick={() => { if (confirm(`Registrare lo scontrino n. ${conv.numero.trim()} da ${eur(f.totale)} (${MODALITA_SCONTRINO[conv.modalita]}) ed eliminare la bozza di fattura?`)) converti({ a: "scontrino", scontrino_numero: conv.numero.trim(), modalita: conv.modalita }); }}>
                  {busy === "conv" ? <Loader2 className="animate-spin" /> : <Receipt />} Conferma
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConv(null)}>Annulla</Button>
              </div>
            </div>
          )}

          {invio && (
            <div className="space-y-2 rounded-lg border border-primary/40 p-3">
              <div className="text-sm font-medium">
                {f.stato === "bozza"
                  ? (invio === "email" ? "Richiesta di pagamento per email (PDF «Richiesta di pagamento» allegato)" : "Richiesta di pagamento sul WhatsApp dello staff (link al PDF)")
                  : invio === "email" ? "Invia la copia di cortesia per email (PDF allegato)" : "Invia sul WhatsApp dello staff (link al PDF)"}
                {!pagata && f.tipo_documento !== "TD04" && (
                  <div className="text-xs font-normal text-muted-foreground">
                    Da pagare: il messaggio indica importo residuo, scadenza ed estremi del bonifico{linkCarta ? " + il link di pagamento con carta" : ""}.
                    {f.stato === "bozza" ? " La fattura vera si emette e va allo SdI dopo il pagamento." : ""}
                  </div>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  placeholder={invio === "email" ? "Email del cliente" : "Cellulare del cliente (es. 347…)"} value={dest} onChange={(e) => setDest(e.target.value)} />
                <input className="h-8 rounded-md border border-input bg-background px-2 text-sm" placeholder="Messaggio aggiuntivo (facoltativo)"
                  value={msgInvio} onChange={(e) => setMsgInvio(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={!!busy || !dest}
                  onClick={() => azione("invio", () => fattInvia(f.id, invio === "email"
                    ? { canale: "email", email: dest, messaggio: msgInvio, link_pagamento: linkCarta || undefined }
                    : { canale: "whatsapp", telefono: dest, messaggio: msgInvio, link_pagamento: linkCarta || undefined }),
                  (r: { a: string; canale: string }) => { toast.success(r.canale === "email" ? `Fattura inviata a ${r.a}` : `Messaggio in coda sul WhatsApp dello staff per ${r.a}`); setInvio(""); })}>
                  {busy === "invio" ? <Loader2 className="animate-spin" /> : <Send />} Invia
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setInvio("")}>Annulla</Button>
              </div>
            </div>
          )}

          {/* Controparte */}
          <div className="rounded-lg border p-3 text-sm">
            <div className="text-xs text-muted-foreground">{emessa ? "Cliente" : "Fornitore"}</div>
            <div className="font-medium">{f.controparte_nome}</div>
            <div className="text-muted-foreground">
              {[f.controparte_piva && `P.IVA ${f.controparte_piva}`, f.controparte_cf && f.controparte_cf !== f.controparte_piva && `C.F. ${f.controparte_cf}`].filter(Boolean).join(" · ")}
            </div>
            {emessa && (
              <div className="text-muted-foreground">
                {[c.indirizzo, c.cap, c.comune, c.provincia && `(${c.provincia})`, c.paese && c.paese !== "IT" && c.paese].filter(Boolean).join(" ")}
                {(c.sdi || c.pec) && <div>Recapito SdI: {c.sdi || c.pec}</div>}
              </div>
            )}
          </div>

          {!emessa && f.societa === "genius" && (f.righe || []).length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setCarico(true)}><PackagePlus /> Carica in magazzino</Button>
            </div>
          )}
          {carico && <CaricoMagazzino fatturaId={f.id} onClose={() => setCarico(false)} />}

          {/* Righe */}
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2">Descrizione</th><th className="p-2 text-right">Q.tà</th><th className="p-2 text-right">Prezzo</th>
                <th className="p-2 text-right">IVA</th><th className="p-2 text-right">Importo</th></tr></thead>
              <tbody>
                {(f.righe || []).map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2">{r.descrizione}</td>
                    <td className="p-2 text-right tabular-nums">{Number(r.quantita || 1)}</td>
                    <td className="p-2 text-right tabular-nums">{eur(r.prezzo_unitario)}</td>
                    <td className="p-2 text-right">{r.natura === "N5"
                      ? <span title={r.costo_acquisto != null ? `Prezzo di acquisto ${eur(r.costo_acquisto)} per pezzo` : "Prezzo di acquisto non indicato"}>Margine</span>
                      : <>{Number(r.aliquota)}%{r.natura ? ` ${r.natura}` : ""}</>}</td>
                    <td className="p-2 text-right tabular-nums">{eur(r.prezzo_totale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-0.5 border-t p-2 text-sm">
              <div className="flex justify-end gap-6"><span>Imponibile</span><span className="w-28 text-right tabular-nums">{eur(f.imponibile)}</span></div>
              <div className="flex justify-end gap-6"><span>IVA</span><span className="w-28 text-right tabular-nums">{eur(f.iva)}</span></div>
              <div className="flex justify-end gap-6 font-semibold"><span>Totale</span><span className="w-28 text-right tabular-nums">{eur(f.totale)}</span></div>
            </div>
          </div>
          {f.causale && <div className="text-sm"><span className="text-muted-foreground">Causale: </span>{f.causale}</div>}
          {f.estremi_esenzione && <div className="text-sm"><span className="text-muted-foreground">Estremi dichiarazione del cliente: </span>{f.estremi_esenzione}</div>}
          {f.collegata && (
            <div className="text-sm">Storna la fattura{" "}
              <button className="underline" onClick={() => onOpen(f.collegata!.id)}>n. {f.collegata.numero} del {dataIt(f.collegata.data)}</button></div>
          )}
          {/* sessione di taratura e pro forma da cui nasce (03/10/2026): la sessione segue il pagamento di questa fattura */}
          {(f.sessione || f.da_proforma) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-sky-300/60 bg-sky-50 p-2 text-sm dark:bg-sky-950/30">
              {f.sessione && (
                <a className="font-medium underline" href={`/sessioni/${f.sessione.id}`}>Sessione di taratura n. {f.sessione.session_number ?? "—"}</a>
              )}
              {f.sessione && (
                <span className="text-xs text-muted-foreground">
                  {f.sessione.status === "completata" ? `strumenti riconsegnati${f.sessione.delivered_at ? ` il ${dataIt(f.sessione.delivered_at)}` : ""}` : f.sessione.status.replace("_", " ")}
                  {" · "}pagamento sessione: {f.sessione.payment_status === "pagato" ? "pagata" : f.sessione.payment_status === "non_richiesto" ? "non richiesto" : "in attesa"}
                  {" · "}termini cliente: {f.sessione.termini?.testo || "—"} ({f.sessione.termini?.descrizione || "immediato"})
                </span>
              )}
              {f.da_proforma && (
                <a className="text-xs underline" href={`/proforma?id=${f.da_proforma.id}`}>dal pro forma PF {f.da_proforma.numero}/{f.da_proforma.anno}</a>
              )}
            </div>
          )}
          {!!f.note_credito?.length && (
            <div className="text-sm">Note di credito collegate:{" "}
              {f.note_credito.map((n) => <button key={n.id} className="mr-2 underline" onClick={() => onOpen(n.id)}>n. {n.numero || "bozza"} ({eur(n.totale)})</button>)}</div>
          )}

          {/* Incasso della fattura EMESSA (03/10/2026): registro pagamenti — più incassi, metodi diversi, acconti e saldo */}
          {emessa && f.tipo_documento !== "TD04" && (
            <IncassoFattura f={f} operatore={operatore} busy={busy} onCambiato={() => { carica(); onChanged(); }}
              intento={intento} passaDalPagamento={passaDalPagamento} />
          )}
          {/* Pagamento al FORNITORE (fatture ricevute): come prima */}
          {!emessa && f.tipo_documento !== "TD04" && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{emessa ? "Incasso" : "Pagamento al fornitore"}</span>
                <span className="text-xs text-muted-foreground">
                  {f.pagamento_modalita ? MODALITA_LABEL[f.pagamento_modalita] : ""}{f.scadenza ? ` · scadenza ${dataIt(f.scadenza)}` : ""}
                </span>
              </div>
              {pagata ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{emessa ? "Incassata" : "Pagata"} il {dataIt(f.pagato_il)} con {MODALITA_LABEL[f.pagamento_modalita || ""] || "—"}
                    {f.pagamento_rif ? ` (rif. ${f.pagamento_rif})` : ""}</span>
                  <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => { if (confirm(`Annullare l'incasso del ${dataIt(f.pagato_il)} (${MODALITA_LABEL[f.pagamento_modalita || ""] || "—"})? La fattura tornerà «${emessa ? "da incassare" : "da pagare"}».`)) azione("ann", () => fattPagamento(f.id, { annulla: true })); }}><Undo2 /> Annulla</Button>
                </div>
              ) : (
                <>
                  <input className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" placeholder="Riferimento (CRO bonifico, n. ricevuta POS…) — facoltativo"
                    value={rif} onChange={(e) => setRif(e.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    {modalitaPagamento.filter((m) => !(emessa && Number(f.totale) > 0 && (m.k === "pos_sumup" || m.k === "paypal"))).map((m) => (
                      <Button key={m.k} size="sm" variant="outline" disabled={!!busy}
                        onClick={() => azione("pag", () => fattPagamento(f.id, { modalita: m.k, riferimento: rif }), () => toast.success(`Segnata ${emessa ? "incassata" : "pagata"}: ${m.label}`))}>
                        <m.icon /> {m.label}
                      </Button>
                    ))}
                    {emessa && Number(f.totale) > 0 && (
                      // POS SumUp e PayPal con VERIFICA: la fattura si segna pagata solo quando SumUp/PayPal registrano il pagamento
                      <PagaPos importo={Number(f.totale)} descrizione={`Fattura ${f.numero || ""} ${f.controparte_nome || ""}`.trim()}
                        rifTipo="fattura" rifId={f.id} disabled={!!busy} generico paypal
                        onPagato={(p) => {
                          const pp = p.metodo === "paypal";
                          const prova = p.transaction_code ? `${pp ? "PayPal" : "SumUp"} ${p.transaction_code}` : `${pp ? "PayPal" : "SumUp"} ${p.confermato_manualmente ? "confermato a mano" : p.id}`;
                          return azione("pag", () => fattPagamento(f.id, { modalita: pp ? "paypal" : "pos_sumup", riferimento: (rif ? `${rif} · ${prova}` : prova).slice(0, 200) }),
                            () => toast.success(`Incassata: ${pp ? "PayPal" : "POS SumUp"} verificato`));
                        }} />
                    )}
                    {emessa && Number(f.totale) > 0 && (
                      // bonifico istantaneo: si segna pagata solo dopo aver visto l'accredito sul conto SumUp (l'admin può forzare)
                      <VerificaBonifico importo={Number(f.totale)} testo={f.controparte_nome || ""} etichettaConferma="Segna pagata" disabled={!!busy}
                        documentoTipo="fattura" descrizione={`Fattura ${f.numero || "(bozza)"} — ${f.controparte_nome || ""}`}
                        onConfermato={async (r, _forzato, info) => {
                          // data di incasso = data del bonifico (scelto dal conto o dichiarato al banco)
                          const ok = await azione("pag", () => fattPagamento(f.id, { modalita: "bonifico", data: info.data, riferimento: (rif ? `${rif} · ${r}` : r).slice(0, 200) }),
                            () => toast.success(info.dichiarato ? "Incassata con bonifico dichiarato (da riscontrare sul conto)" : "Incassata: bonifico abbinato"));
                          return ok ? { id: f.id, descrizione: `Fattura ${f.numero || "(bozza)"} — ${f.controparte_nome || ""}` } : null;
                        }} />
                    )}
                    {emessa && f.stato !== "bozza" && (
                      <Button size="sm" variant="secondary" disabled={!!busy}
                        onClick={() => {
                          // la finestra si apre SUBITO (dentro il click), altrimenti il browser la blocca come popup
                          const w = window.open("about:blank", "_blank");
                          let aperto = false;
                          azione("stripe", () => fattLinkStripe(f.id), (r) => {
                            if (!r.url) return;
                            aperto = true;
                            setLinkCarta(r.url);
                            navigator.clipboard?.writeText(r.url).catch(() => undefined);
                            toast.success("Link di pagamento copiato (valido 24 ore)");
                            if (w) w.location.href = r.url; else window.open(r.url, "_blank");
                          }).then(() => { if (!aperto) w?.close(); });
                        }}>
                        <Link2 /> Link pagamento con carta
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Esiti */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Storico ed esiti SdI</div>
            <ol className="space-y-2 border-l pl-4">
              {(f.esiti || []).map((e) => (
                <li key={e.id} className="text-sm">
                  <div className="text-xs text-muted-foreground">{new Date(e.data).toLocaleString("it-IT")} · {e.tipo}</div>
                  <div>{e.descrizione}</div>
                </li>
              ))}
              {!f.esiti?.length && <li className="text-sm text-muted-foreground">Nessun evento</li>}
            </ol>
            {f.sdi_file_name && <div className="text-xs text-muted-foreground">File SdI: {f.sdi_file_name}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}


/** Incasso di una fattura emessa (03/10/2026): righe del registro pagamenti (anche annullate), residuo, un pagamento alla
 *  volta con qualunque metodo (Incassa in modo «documento»), link Stripe per l'importo scelto, piano rate per l'XML. */
function IncassoFattura({ f, operatore, busy, onCambiato, intento, passaDalPagamento }: {
  f: Fattura; operatore: Operatore | ""; busy: string; onCambiato: () => void;
  intento?: "pagamento" | "da_pagare" | null; passaDalPagamento: boolean;
}) {
  const inc = f.incassi;
  const totale = Number(f.totale) || 0;
  const pagato = inc ? inc.pagato : Number(f.pagato || 0);
  const residuo = inc ? inc.residuo : Math.max(0, totale - pagato);
  const righe = inc?.righe || [];
  const [rate, setRate] = useState<{ importo: string; scadenza: string }[] | null>(null);
  const modificabile = ["bozza", "errore", "scartata"].includes(f.stato);
  const desc = `Fattura ${f.numero || "(bozza)"} — ${f.controparte_nome || ""}`;
  // bonifico arrivato e abbinato a questa fattura (05/10/2026, caso Flaminia fatt. 740): niente «come registrare il
  // pagamento?» — si propone il bonifico già incassato; «Correggi» (nella finestra) riporta qui i metodi
  const { bonifico: bon, correggi: bonCorreggi } = useBonificoDelDocumento(f.id);
  const pannello = useRef<HTMLDivElement>(null);
  useEffect(() => { if (intento === "pagamento") pannello.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [intento]);

  async function annulla(pid: string, imp: number) {
    const motivo = prompt(`Annullare l'incasso di ${eur(imp)}? Scrivi il motivo (es. registrato per errore):`);
    if (!motivo || motivo.trim().length < 3) return;
    try { await pagAnnulla(pid, motivo.trim()); toast.success("Incasso annullato"); onCambiato(); } catch (e) { toastErrore(e); }
  }
  async function salvaRate() {
    if (!rate) return;
    try {
      await pagRate(f.id, rate.filter((r) => r.importo.trim()).map((r) => ({ importo: Number(r.importo.replace(",", ".")), scadenza: r.scadenza || null, modalita: "bonifico" })));
      toast.success("Piano rate salvato: va nell'XML (DatiPagamento)"); setRate(null); onCambiato();
    } catch (e) { toastErrore(e); }
  }

  return (
    <div ref={pannello} className={`space-y-2 rounded-lg border p-3 ${passaDalPagamento ? "border-primary/50" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{passaDalPagamento ? "1 · Pagamento" : "Incasso"}</span>
        <span className="text-xs text-muted-foreground">{f.scadenza && residuo > 0.005 ? `scadenza ${dataIt(f.scadenza)}` : ""}</span>
      </div>
      {inc?.badge && <div className={`rounded-md px-2 py-1.5 text-sm font-medium ${residuo <= 0.005 ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
        : pagato > 0 ? "bg-sky-500/15 text-sky-900 dark:text-sky-200" : "bg-amber-500/15 text-amber-800 dark:text-amber-300"}`}>{inc.badge}</div>}
      {f.scontrino && (
        <div className="rounded-md border border-sky-300 bg-sky-50 p-2 text-xs dark:bg-sky-950/30">
          Al posto dello scontrino <b>{f.scontrino.numero_rt || "(numero non letto)"}</b> del {dataIt(f.scontrino.data_rt || f.scontrino.created_at)},
          annullato sul registratore: già pagata con gli stessi pagamenti. Nota interna, non va nell&apos;XML.{f.stato === "bozza" ? " Controlla i dati e inviala allo SdI." : ""}</div>
      )}
      {!!f.acconti?.length && (
        <div className="text-xs text-muted-foreground">Scala le fatture d&apos;acconto: {f.acconti.map((a) => `${a.numero ? `n. ${a.numero}` : "(bozza)"} del ${dataIt(a.data)} (${eur(a.totale)})`).join(", ")}</div>
      )}
      {!!righe.length && (
        <div className="divide-y rounded-md border">
          {righe.map((r) => (
            <div key={r.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 text-sm ${r.stato === "annullato" ? "opacity-50" : ""}`}>
              <span className={r.stato === "annullato" ? "line-through" : ""}>
                {dataIt(r.data)} · <b>{NOMI_MODALITA[r.modalita] || r.modalita}</b> {eur(Number(r.importo))}
                {r.tipo && !["intero"].includes(r.tipo) ? <span className="ml-1 rounded bg-muted px-1 text-[11px]">{r.tipo}</span> : null}
                {r.riferimento ? <span className="text-xs text-muted-foreground"> · {r.riferimento}</span> : null}
                {r.operatore ? <BadgeOperatore op={r.operatore} className="ml-1" /> : null}
                {r.stato === "annullato" && r.annullo_motivo ? <span className="text-xs"> · annullato: {r.annullo_motivo}</span> : null}
              </span>
              {r.stato === "valido" && !r.scontrino_id && (
                <Button size="icon" variant="ghost" className="size-9 shrink-0" title="Annulla questo incasso (registrato per errore)" disabled={!!busy}
                  onClick={() => annulla(r.id, Number(r.importo))}><Undo2 className="size-4" /></Button>
              )}
            </div>
          ))}
        </div>
      )}
      {residuo > 0.005 && bon && !bonCorreggi && (
        <div className="space-y-2 rounded-md border-2 border-emerald-500 bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100">
          <div className="font-semibold">Bonifico già incassato: {eur(Number(bon.importo))} da {bon.ordinante || "—"}</div>
          <div className="text-xs">Metodo <b>bonifico</b> · accredito {(bon.data_valuta || bon.data).slice(0, 10).split("-").reverse().join("/")} · rif. SumUp {bon.codice.split(":").pop()}
            {Math.abs(Number(bon.importo) - residuo) > 0.005 && <b> · {Number(bon.importo) < residuo ? `dopo restano ${eur(residuo - Number(bon.importo))}` : `eccedenza ${eur(Number(bon.importo) - residuo)}`}</b>}</div>
          <Button className="h-11 w-full bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700" onClick={apriConfermaBonifico}>Conferma incasso del bonifico</Button>
        </div>
      )}
      {residuo > 0.005 && !(bon && !bonCorreggi) && (
        <>
          <Incassa key={`${f.id}-${pagato}`} modo="documento" totale={totale} giaPagato={pagato} documentoTipo="fattura" descrizione={desc}
            testoCliente={f.controparte_nome || ""} disabled={!!busy || !operatore} motivo={!operatore ? "scegli l'operatore" : ""}
            stripeLink={async (imp) => (await fattLinkStripe(f.id, imp))?.url}
            onPagamento={async (p) => {
              await pagIncassaFattura(f.id, { importo: p.importo, modalita: p.modalita as ModalitaIncasso, data: p.data, riferimento: p.riferimento,
                pos_incasso_id: p.pos_incasso_id, operatore: operatore! });
              return { id: f.id, descrizione: desc };
            }}
            onFatto={onCambiato} />
          {/* già pagato fuori dal banco: POS (codice o ricerca), PayPal (ID o ricerca tra i movimenti), assegno */}
          <GiaPagato fatturaId={f.id} residuo={residuo} disabled={!!busy || !operatore} motivo={!operatore ? "scegli l'operatore" : ""}
            onRegistra={async (d) => {
              try {
                await pagIncassaFattura(f.id, { ...d, operatore: operatore! });
                toast.success(`Registrato: ${NOMI_MODALITA[d.modalita] || d.modalita} ${eur(d.importo)}`);
                onCambiato();
                return true;
              } catch (e) { toastErrore(e); return false; }
            }} />
          {modificabile && (rate ? (
            <div className="space-y-1 rounded-md border p-2 text-sm">
              <div className="text-xs text-muted-foreground">Piano rate di quanto resta ({eur(residuo)}): va nell&apos;XML come più scadenze. Vuoto = una scadenza sola.</div>
              {rate.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <input className="h-9 w-28 rounded-md border border-input bg-background px-2 text-right" inputMode="decimal" placeholder="importo" value={r.importo}
                    onChange={(e) => setRate(rate.map((x, j) => (j === i ? { ...x, importo: e.target.value } : x)))} />
                  <input type="date" className="h-9 rounded-md border border-input bg-background px-2" value={r.scadenza}
                    onChange={(e) => setRate(rate.map((x, j) => (j === i ? { ...x, scadenza: e.target.value } : x)))} />
                  <Button size="icon" variant="ghost" className="size-9" onClick={() => setRate(rate.filter((_, j) => j !== i))}><X className="size-4" /></Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setRate([...rate, { importo: "", scadenza: "" }])}>+ Rata</Button>
                <Button size="sm" onClick={salvaRate}>Salva rate</Button>
                <Button size="sm" variant="ghost" onClick={() => setRate(null)}>Chiudi</Button>
              </div>
            </div>
          ) : (
            <button className="text-xs underline text-muted-foreground" onClick={() => setRate((f.rate || []).length
              ? (f.rate || []).map((r) => ({ importo: String(r.importo).replace(".", ","), scadenza: r.scadenza || "" }))
              : [{ importo: "", scadenza: "" }, { importo: "", scadenza: "" }])}>
              Pagamento a rate (scadenze nell&apos;XML){(f.rate || []).length ? ` · ${(f.rate || []).length} rate impostate` : ""}</button>
          ))}
        </>
      )}
      {passaDalPagamento && <InvioSdi f={f} residuo={residuo} operatore={operatore} busy={busy} intento={intento} onCambiato={onCambiato} />}
    </div>
  );
}


/** ULTIMO PASSO (05/10/2026): «Invia allo SdI» solo col pagamento registrato per intero, oppure con la scelta
 *  ESPLICITA «Da pagare» (scadenza + metodo atteso dai termini del cliente) e conferma. I DatiPagamento dell'XML
 *  escono dal registro pagamenti (incassi con la loro data) + il residuo con la scadenza scelta qui. */
function InvioSdi({ f, residuo, operatore, busy, intento, onCambiato }: {
  f: Fattura; residuo: number; operatore: Operatore | ""; busy: string; intento?: "pagamento" | "da_pagare" | null; onCambiato: () => void;
}) {
  const pagata = residuo <= 0.005;
  const [daPagare, setDaPagare] = useState(intento === "da_pagare");
  const [scadenza, setScadenza] = useState(f.scadenza || "");
  const [modalita, setModalita] = useState<string>(f.pagamento_modalita && f.pagamento_modalita !== "non_pagato" ? f.pagamento_modalita : "bonifico");
  const [termini, setTermini] = useState<{ testo: string | null; descrizione: string } | null>(null);
  const [invio, setInvio] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pagata) return;
    pagTerminiFattura(f.id).then((t) => {
      setTermini({ testo: t.testo, descrizione: t.descrizione });
      if (!f.scadenza && t.scadenza) setScadenza(t.scadenza);
      if (t.modalita && (!f.pagamento_modalita || f.pagamento_modalita === "bonifico")) setModalita(t.modalita);
    }).catch(() => undefined);
  }, [f.id, f.scadenza, f.pagamento_modalita, pagata]);
  useEffect(() => { if (intento === "da_pagare") box.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [intento]);
  const controlli = f.controlli || [];
  const motivo = !operatore ? "scegli l'operatore" : controlli.length ? "completa i dati mancanti (in alto)" : "";

  async function invia(comeDaPagare: boolean) {
    if (invio || busy) return;
    if (comeDaPagare) {
      if (!scadenza) { toast.error("Indica la scadenza del pagamento"); return; }
      const pagato = Number(f.totale) - residuo;
      if (!confirm(`Inviare allo SdI la fattura DA PAGARE?\n\n${f.controparte_nome || ""} · totale ${eur(Number(f.totale))}`
        + (pagato > 0.005 ? ` · già incassati ${eur(pagato)}` : "")
        + `\nResta da pagare: ${eur(residuo)} entro il ${scadenza.split("-").reverse().join("/")} (${NOMI_MODALITA[modalita] || modalita}).`
        + "\n\nDopo l'invio la fattura non si modifica più.")) return;
    } else if (!confirm(`Inviare allo SdI la fattura di ${f.controparte_nome || ""} (${eur(Number(f.totale))}, pagata)?`)) return;
    setInvio(true);
    try {
      const r = await fattEmetti(f.id, operatore as string, comeDaPagare ? { scadenza, modalita } : undefined);
      if (r.ok) toast.success(`Fattura ${r.numero} inviata allo SdI`); else toast.error(`Invio non riuscito: ${r.errore}`);
      onCambiato();
    } catch (e) { toastErrore(e); } finally { setInvio(false); }
  }

  return (
    <div ref={box} className="mt-3 space-y-2 border-t pt-3">
      <div className="text-sm font-medium">2 · Invia allo SdI</div>
      {pagata ? (
        <div className="rounded-md bg-emerald-500/15 px-2 py-1.5 text-sm text-emerald-800 dark:text-emerald-300">Pagamento registrato per intero: la fattura può partire.</div>
      ) : (
        <>
          <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border p-2 text-sm ${daPagare ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : ""}`}>
            <input type="checkbox" className="size-5" checked={daPagare} onChange={(e) => setDaPagare(e.target.checked)} />
            <span><b>Da pagare</b>: il cliente paga dopo ({eur(residuo)}){termini?.testo ? ` · termini del cliente: ${termini.testo} (${termini.descrizione})` : ""}</span>
          </label>
          {daPagare && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">Scadenza
                <input type="date" className="mt-0.5 h-11 w-full rounded-md border border-input bg-background px-2 text-sm" value={scadenza} onChange={(e) => setScadenza(e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Come pagherà
                <select className="mt-0.5 h-11 w-full rounded-md border border-input bg-background px-2 text-sm" value={modalita} onChange={(e) => setModalita(e.target.value)}>
                  {["bonifico", "paypal", "carta_stripe", "pos_sumup", "contanti", "assegno"].map((k) => <option key={k} value={k}>{NOMI_MODALITA[k] || k}</option>)}
                </select></label>
            </div>
          )}
          {!daPagare && <div className="text-xs text-amber-700 dark:text-amber-300">Registra il pagamento qui sopra, oppure spunta «Da pagare» con la scadenza.</div>}
        </>
      )}
      {motivo && <div className="text-xs text-amber-700 dark:text-amber-300">Prima {motivo}.</div>}
      <Button className={`h-auto min-h-11 w-full text-base font-semibold ${!pagata && daPagare ? "bg-amber-600 text-white hover:bg-amber-700" : ""}`}
        disabled={!!busy || invio || !!motivo || !(pagata || (daPagare && !!scadenza))} onClick={() => invia(!pagata)}>
        {invio ? <Loader2 className="animate-spin" /> : <Send />} {pagata ? "Invia allo SdI" : "Invia allo SdI come DA PAGARE"}
      </Button>
    </div>
  );
}
