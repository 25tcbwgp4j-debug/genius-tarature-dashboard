"use client";

// CLIENTE della scheda (05/10/2026, specifica §8.2): ricerca in rubrica («Gallo» → Gianni Gallo) e con UN CLIC la
// SCHEDA CLIENTE completa, modificabile e salvata in rubrica (fatt_anagrafiche): privato / azienda / RIVENDITORE,
// vuole fattura, P.IVA, CF, SDI/PEC, sede legale, indirizzo di spedizione, cellulare, cellulare WhatsApp, email
// (anche per la contabilità e altre).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, Mail, MessageCircle, Phone, Search, Store, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { assClienti, assSalvaCliente, assSchedaCliente, dataOra, TIPI_CLIENTE, type Anagrafica, type SchedaCliente } from "@/lib/assistenza";
import { Badge, Campo, Modale, Pill, Scelta, campo, area } from "./ui";

export function iconaTipo(t?: string | null) {
  return t === "rivenditore" ? <Store className="size-3" /> : t === "azienda" ? <Building2 className="size-3" /> : <UserRound className="size-3" />;
}
export function PillTipo({ a }: { a: Anagrafica }) {
  if (!a.tipo_cliente) return null;
  return <Pill tono={a.tipo_cliente === "rivenditore" ? "ambra" : a.tipo_cliente === "azienda" ? "blu" : "grigio"}>{iconaTipo(a.tipo_cliente)}{TIPI_CLIENTE.find((x) => x[0] === a.tipo_cliente)?.[1]}</Pill>;
}

/** Ricerca in rubrica: nome (anche più parole), telefono, email, P.IVA. Clic su un risultato = scelto. */
export function CercaCliente({ onScelto, autoFocus, placeholder }: { onScelto: (a: Anagrafica) => void; autoFocus?: boolean; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [r, setR] = useState<Anagrafica[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setR(null); return; }
      assClienti(q).then((x) => setR(x.clienti)).catch(() => setR([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <input autoFocus={autoFocus} className={`${campo} pl-8`} placeholder={placeholder || "Cerca in rubrica: nome, telefono, email, P.IVA"} value={q}
        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
      {r && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
          {r.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Nessun cliente in rubrica con «{q}»</div>}
          {r.map((a) => (
            <button key={a.id} type="button" className="flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
              onClick={() => { onScelto(a); setQ(""); setR(null); }}>
              <span className="mt-0.5 text-muted-foreground">{iconaTipo(a.tipo_cliente)}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{a.denominazione}</b>
                <span className="block truncate text-xs text-muted-foreground">{[a.cellulare || a.telefono, a.email, a.piva && `P.IVA ${a.piva}`, a.comune].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              {a.tipo_cliente === "rivenditore" && <Pill tono="ambra">rivenditore</Pill>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Form = Partial<Anagrafica>;

/** SCHEDA CLIENTE completa: si apre con un clic, si salva in rubrica. `id` null = nuovo cliente. */
export function SchedaClienteModal({ id, iniziale, onClose, onSalvato, onApriScheda }: {
  id: string | null; iniziale?: Form; onClose: () => void; onSalvato: (a: SchedaCliente) => void; onApriScheda?: (id: string) => void;
}) {
  const [c, setC] = useState<SchedaCliente | null>(null);
  const [f, setF] = useState<Form>(iniziale || {});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (id) assSchedaCliente(id).then((x) => { setC(x); setF(x); }).catch(toastErrore);
  }, [id]);
  const set = (k: keyof Anagrafica, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const T = (k: keyof Anagrafica, l: string, extra: React.ComponentProps<"input"> = {}, cls = "") => (
    <Campo label={l} className={cls}><input className={campo} value={(f[k] as string) || ""} onChange={(e) => set(k, e.target.value)} {...extra} /></Campo>
  );
  async function salva() {
    setBusy(true);
    try {
      const corpo: Form = {};
      for (const k of Object.keys(f) as (keyof Anagrafica)[]) {
        if (["id", "origine"].includes(k) || k === ("schede" as keyof Anagrafica)) continue;
        if (!c || f[k] !== c[k]) (corpo as Record<string, unknown>)[k] = f[k] ?? null;
      }
      const r = await assSalvaCliente(id, corpo);
      toast.success(id ? "Scheda cliente salvata in rubrica" : "Cliente aggiunto alla rubrica");
      onSalvato(r);
    } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  const azienda = f.tipo_cliente === "azienda" || f.tipo_cliente === "rivenditore";
  return (
    <Modale titolo={id ? `Scheda cliente — ${c?.denominazione || "…"}` : "Nuovo cliente in rubrica"} onClose={onClose} largo
      piedi={<><Button variant="outline" onClick={onClose}>Chiudi</Button>
        <Button disabled={busy || (!!id && !c)} onClick={salva}>{busy && <Loader2 className="animate-spin" />}Salva in rubrica</Button></>}>
      {id && !c ? <div className="p-6 text-center"><Loader2 className="inline animate-spin" /></div> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Scelta valore={f.tipo_cliente || null} opzioni={TIPI_CLIENTE.map(([k, l]) => [k as "privato", <span key={k} className="inline-flex items-center gap-1">{iconaTipo(k)}{l}</span>])}
              onChange={(v) => set("tipo_cliente", v)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={!!f.vuole_fattura} onChange={(e) => set("vuole_fattura", e.target.checked)} />Vuole la fattura</label>
            {f.tipo_cliente === "rivenditore" && <Pill tono="ambra">Rivenditore: prezzi e pagamento da rivenditore</Pill>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {T("denominazione", azienda ? "Ragione sociale *" : "Nome e cognome *", {}, "sm:col-span-2")}
            {T("referente", "Referente / persona di contatto")}
            {T("piva", "Partita IVA", { inputMode: "numeric" })}
            {T("cf", "Codice fiscale")}
            {T("sdi", "Codice SDI")}
            {T("pec", "PEC", { type: "email" })}
          </div>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-xs font-semibold text-muted-foreground">Contatti</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {T("cellulare", "Cellulare", { inputMode: "tel" })}
              <Campo label="Cellulare WhatsApp" aiuto={!f.cellulare_whatsapp && f.cellulare ? "vuoto = il cellulare" : undefined}>
                <div className="flex gap-1"><input className={campo} inputMode="tel" value={f.cellulare_whatsapp || ""} onChange={(e) => set("cellulare_whatsapp", e.target.value)} />
                  {f.cellulare && !f.cellulare_whatsapp && <Button size="sm" variant="outline" className="h-9" onClick={() => set("cellulare_whatsapp", f.cellulare)}>= cell.</Button>}</div>
              </Campo>
              {T("telefono", "Telefono fisso / altro", { inputMode: "tel" })}
              {T("email", "Email", { type: "email" })}
              {T("email_contabilita", "Email per la contabilità", { type: "email" })}
              {T("email_altre", "Altre email")}
            </div>
          </fieldset>
          <div className="grid gap-3 lg:grid-cols-2">
            <fieldset className="space-y-2 rounded-lg border p-3">
              <legend className="px-1 text-xs font-semibold text-muted-foreground">{azienda ? "Sede legale" : "Indirizzo (fatturazione)"}</legend>
              {T("indirizzo", "Indirizzo")}
              <div className="grid grid-cols-[90px_1fr_70px] gap-2">{T("cap", "CAP")}{T("comune", "Comune")}{T("provincia", "Prov.")}</div>
            </fieldset>
            <fieldset className="space-y-2 rounded-lg border p-3">
              <legend className="px-1 text-xs font-semibold text-muted-foreground">Indirizzo di spedizione</legend>
              <div className="flex justify-end">
                <button type="button" className="text-xs text-primary underline" onClick={() => setF((x) => ({ ...x, sped_indirizzo: x.indirizzo, sped_cap: x.cap, sped_comune: x.comune, sped_provincia: x.provincia }))}>uguale alla sede</button>
              </div>
              {T("sped_presso", "Presso / c.a.")}
              {T("sped_indirizzo", "Indirizzo")}
              <div className="grid grid-cols-[90px_1fr_70px] gap-2">{T("sped_cap", "CAP")}{T("sped_comune", "Comune")}{T("sped_provincia", "Prov.")}</div>
            </fieldset>
          </div>
          <Campo label="Note sul cliente (interne)"><textarea className={area} rows={2} value={f.note_cliente || ""} onChange={(e) => set("note_cliente", e.target.value)} /></Campo>
          {c && c.schede.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">Schede del cliente ({c.schede.length})</div>
              <div className="divide-y rounded-lg border text-sm">
                {c.schede.map((s) => (
                  <button key={s.id} type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted" onClick={() => onApriScheda?.(s.id)}>
                    <b className="tabular-nums">{s.sigla}</b><span className="truncate text-muted-foreground">{s.modello || s.prodotto} · {s.difetto}</span>
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">{dataOra(s.created_at)}<Badge stato={s.stato} /></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modale>
  );
}

/** Riepilogo del cliente sulla scheda (nome, tipo, contatti) con «Apri scheda cliente». */
export function RiepilogoCliente({ a, nome, telefono, email }: { a: Anagrafica | null; nome: string; telefono?: string | null; email?: string | null }) {
  const cell = a?.cellulare_whatsapp || a?.cellulare || telefono;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{nome || "—"}</span>
        {a && <PillTipo a={a} />}
        {a?.vuole_fattura && <Pill tono="blu">vuole fattura</Pill>}
        {!a && <Pill tono="ambra">non collegato alla rubrica</Pill>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {cell && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" />{cell}</span>}
        {a?.cellulare_whatsapp && <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" />WhatsApp</span>}
        {email && <span className="inline-flex items-center gap-1"><Mail className="size-3.5" />{email}</span>}
        {a?.piva && <span>P.IVA {a.piva}</span>}
        {(a?.sped_comune || a?.comune) && <span>{a?.sped_comune || a?.comune}</span>}
      </div>
    </div>
  );
}
