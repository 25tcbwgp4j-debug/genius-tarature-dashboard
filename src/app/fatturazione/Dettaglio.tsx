"use client";

// Scheda di una fattura: dati, controlli prima dell'invio, pagamento, azioni ed esiti SdI.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Banknote, Copy, CreditCard, FileCode2, Link2, Loader2, Pencil, Printer,
  Receipt, RotateCcw, Send, Smartphone, Trash2, Undo2, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  fattDettaglio, fattDuplica, fattElimina, fattEmetti, fattLinkStripe, fattNotaCredito,
  fattPagamento, fattUrlStampa, fattUrlXml, type FattModalita, type Fattura,
} from "@/lib/api";
import { MODALITA_LABEL, SOCIETA_LABEL, STATI, TIPI_LABEL, dataIt, eur } from "./util";

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

  const carica = useCallback(() => {
    fattDettaglio(id).then(setF).catch((e) => toast.error((e as Error).message));
  }, [id]);
  useEffect(() => { carica(); }, [carica]);

  async function azione<T>(nome: string, fn: () => Promise<T>, ok?: (r: T) => void) {
    setBusy(nome);
    try {
      const r = await fn();
      ok?.(r);
      carica();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message || "Errore");
    } finally {
      setBusy("");
    }
  }

  if (!f) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <Loader2 className="size-6 animate-spin text-white" />
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
            <a href={fattUrlStampa(f.id)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><Printer /> Copia di cortesia</Button></a>
            <a href={fattUrlXml(f.id)}><Button size="sm" variant="outline"><FileCode2 /> XML</Button></a>
            {emessa && f.numero && !["bozza", "scartata"].includes(f.stato) && f.tipo_documento !== "TD04" && (
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => azione("nc", () => fattNotaCredito(f.id), (r) => { toast.success("Nota di credito preparata"); onOpen(r.id); })}>
                <RotateCcw /> Nota di credito
              </Button>
            )}
            {emessa && (
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => azione("dup", () => fattDuplica(f.id), (r) => { toast.success("Copia creata come bozza"); onOpen(r.id); })}>
                <Copy /> Duplica
              </Button>
            )}
            {f.stato === "bozza" && !f.numero && (
              <Button size="sm" variant="destructive" disabled={!!busy}
                onClick={() => { if (confirm("Eliminare questa bozza?")) azione("del", () => fattElimina(f.id), () => { toast.success("Bozza eliminata"); onClose(); }); }}>
                <Trash2 /> Elimina bozza
              </Button>
            )}
          </div>

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
                  <Button size="xs" variant="ghost" disabled={!!busy} onClick={() => azione("ann", () => fattPagamento(f.id, { annulla: true }))}><Undo2 /> Annulla</Button>
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
                    {emessa && f.stato !== "bozza" && (
                      <Button size="sm" variant="secondary" disabled={!!busy}
                        onClick={() => azione("stripe", () => fattLinkStripe(f.id), (r) => {
                          if (r.url) { navigator.clipboard?.writeText(r.url).catch(() => undefined); toast.success("Link di pagamento copiato (valido 24 ore)"); window.open(r.url, "_blank"); }
                        })}>
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
