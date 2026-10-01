"use client";

// Scheda di una fattura: dati, controlli prima dell'invio, pagamento, azioni ed esiti SdI.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Banknote, Copy, CreditCard, FileCode2, FileDown, Link2, Loader2, Mail, MessageCircle, Pencil, Printer,
  Receipt, RotateCcw, Send, Smartphone, Trash2, Undo2, Wallet, X,
} from "lucide-react";
import { toast } from "sonner";
import { docDaFattura } from "@/lib/api";
import { VerificaBonifico } from "@/components/VerificaBonifico";
import { toastErrore } from "@/lib/errori";
import {
  fattDettaglio, fattDuplica, fattElimina, fattEmetti, fattInvia, fattLinkStripe, fattNotaCredito,
  fattPagamento, fattUrlPdf, fattUrlStampa, fattUrlXml, type FattModalita, type Fattura,
} from "@/lib/api";
import { MODALITA_LABEL, SOCIETA_LABEL, STATI, TIPI_LABEL, dataIt, eur } from "./util";

const MODALITA_SCONTRINO: Record<string, string> = { contanti: "Contanti", pos_sumup: "POS SumUp", bonifico: "Bonifico", paypal: "PayPal", carta_stripe: "Carta (Stripe)" };

export function Dettaglio({
  id, onClose, onChanged, onEdit, onOpen,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (f: Fattura) => void;
  onOpen: (id: string) => void;
}) {
  const [f, setF] = useState<Fattura | null>(null);
  const [busy, setBusy] = useState("");
  const [rif, setRif] = useState("");
  const [invio, setInvio] = useState<"" | "email" | "whatsapp">("");
  const [dest, setDest] = useState("");
  const [msgInvio, setMsgInvio] = useState("");
  const [errore, setErrore] = useState("");
  const [conv, setConv] = useState<{ numero: string; modalita: string } | null>(null);   // conversione in scontrino

  const carica = useCallback(() => {
    fattDettaglio(id).then((r) => { setF(r); setErrore(""); })
      .catch((e) => { const m = (e as Error).message || "Errore"; setErrore(m); toast.error(m); });
  }, [id]);
  useEffect(() => { carica(); }, [carica]);

  /** Bozza → ordine / preventivo / scontrino (la bozza viene eliminata dal backend). */
  async function converti(body: { a: "ordine" | "preventivo" | "scontrino"; scontrino_numero?: string; modalita?: string }) {
    if (busy) return;
    setBusy("conv");
    try {
      const r = await docDaFattura(id, body);
      toast.success(r.documento ? `Creato ${r.documento.sigla}` : "Scontrino registrato nella cassa di oggi");
      setConv(null); onChanged(); onClose();
      if (r.documento) window.location.href = `/ordini?id=${r.documento.id}`;
    } catch (err) { toastErrore(err); } finally { setBusy(""); }
  }

  async function azione<T>(nome: string, fn: () => Promise<T>, ok?: (r: T) => void) {
    if (busy) return;
    setBusy(nome);
    try {
      const r = await fn();
      ok?.(r);
      carica();
      onChanged();
    } catch (e) {
      toastErrore(e);
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
                {pagata ? `${emessa ? "Incassata" : "Pagata"} ${dataIt(f.pagato_il)}` : emessa ? "Da incassare" : "Da pagare"}
              </span>
              {f.ambiente === "sandbox" && <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-xs text-orange-700 dark:text-orange-300">PROVA</span>}
            </div>
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

          {/* Azioni */}
          <div className="flex flex-wrap gap-2">
            {inviabile && (
              <Button size="sm" disabled={!!busy || !!f.controlli?.length}
                onClick={() => azione("emetti", () => fattEmetti(f.id), (r) => r.ok ? toast.success(`Fattura ${r.numero} inviata allo SdI`) : toast.error(`Invio non riuscito: ${r.errore}`))}>
                {busy === "emetti" ? <Loader2 className="animate-spin" /> : <Send />} {f.stato === "bozza" ? "Invia allo SdI" : "Reinvia allo SdI"}
              </Button>
            )}
            {inviabile && <Button size="sm" variant="outline" onClick={() => onEdit(f)}><Pencil /> Modifica</Button>}
            {emessa && ["bozza", "errore", "scartata"].includes(f.stato) && (
              <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value="" disabled={!!busy}
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
            {emessa && f.stato !== "bozza" && (
              <>
                <Button size="sm" variant={invio === "email" ? "default" : "outline"}
                  onClick={() => { setInvio(invio === "email" ? "" : "email"); setDest(f.recapiti?.email || ""); }}>
                  <Mail /> Invia per email
                </Button>
                <Button size="sm" variant={invio === "whatsapp" ? "default" : "outline"}
                  onClick={() => { setInvio(invio === "whatsapp" ? "" : "whatsapp"); setDest(f.recapiti?.telefono || ""); }}>
                  <MessageCircle /> WhatsApp staff
                </Button>
              </>
            )}
            <a href={fattUrlXml(f.id)}><Button size="sm" variant="outline"><FileCode2 /> XML</Button></a>
            {/* nota di credito: solo su fatture trasmesse allo SdI (come il backend); per l'operatore serve l'autorizzazione dell'admin */}
            {emessa && f.numero && ["inviata", "consegnata", "non_consegnata"].includes(f.stato) && f.tipo_documento !== "TD04" && (
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => azione("nc", () => fattNotaCredito(f.id), (r) => { toast.success("Nota di credito preparata"); onOpen(r.id); })}>
                <RotateCcw /> Nota di credito
              </Button>
            )}
            {emessa && (
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => azione("dup", () => fattDuplica(f.id), (r) => { toast.success("Copia pronta: modificala e inviala"); onEdit(r); })}>
                <Copy /> Copia in nuova fattura
              </Button>
            )}
            {f.stato === "bozza" && !f.numero && (
              <Button size="sm" variant="destructive" disabled={!!busy}
                onClick={() => { if (confirm("Eliminare questa bozza?")) azione("del", () => fattElimina(f.id), () => { toast.success("Bozza eliminata"); onClose(); }); }}>
                <Trash2 /> Elimina bozza
              </Button>
            )}
          </div>

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
                {invio === "email" ? "Invia la copia di cortesia per email (PDF allegato)" : "Invia sul WhatsApp dello staff (link al PDF)"}
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
                    ? { canale: "email", email: dest, messaggio: msgInvio } : { canale: "whatsapp", telefono: dest, messaggio: msgInvio }),
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
                    <td className="p-2 text-right">{Number(r.aliquota)}%{r.natura ? ` ${r.natura}` : ""}</td>
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
          {f.collegata && (
            <div className="text-sm">Storna la fattura{" "}
              <button className="underline" onClick={() => onOpen(f.collegata!.id)}>n. {f.collegata.numero} del {dataIt(f.collegata.data)}</button></div>
          )}
          {!!f.note_credito?.length && (
            <div className="text-sm">Note di credito collegate:{" "}
              {f.note_credito.map((n) => <button key={n.id} className="mr-2 underline" onClick={() => onOpen(n.id)}>n. {n.numero || "bozza"} ({eur(n.totale)})</button>)}</div>
          )}

          {/* Pagamento */}
          {f.tipo_documento !== "TD04" && (
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
                    {modalitaPagamento.map((m) => (
                      <Button key={m.k} size="sm" variant="outline" disabled={!!busy}
                        onClick={() => azione("pag", () => fattPagamento(f.id, { modalita: m.k, riferimento: rif }), () => toast.success(`Segnata ${emessa ? "incassata" : "pagata"}: ${m.label}`))}>
                        <m.icon /> {m.label}
                      </Button>
                    ))}
                    {emessa && Number(f.totale) > 0 && (
                      // bonifico istantaneo: si segna pagata solo dopo aver visto l'accredito sul conto SumUp (l'admin può forzare)
                      <VerificaBonifico importo={Number(f.totale)} testo={f.controparte_nome || ""} etichettaConferma="Segna pagata" disabled={!!busy}
                        onConfermato={(r, forzato) => azione("pag", () => fattPagamento(f.id, { modalita: "bonifico", riferimento: (rif ? `${rif} · ${r}` : r).slice(0, 200) }),
                          () => toast.success(forzato ? "Segnata incassata (bonifico forzato)" : "Incassata: bonifico verificato sul conto SumUp"))} />
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
