"use client";

// 16/11/2026 (Christian): «quando apro una scheda voglio vedere SUBITO i dati del cliente, i dati del dispositivo e a che punto
// è (la prosecuzione), senza cliccare su Accettazione». Riquadro sempre in vista sotto la testata, a due colonne leggibili
// (Cliente · Dispositivo) + una riga SITUAZIONE: stato, riparazione, importi, pagamento, consegna/spedizione.
// Solo lettura: per modificare si clicca il riquadro e si apre la sezione giusta.

import { Mail, MapPin, Package, Phone, Smartphone, UserRound } from "lucide-react";
import { ETICHETTA_STATO, STATI_RIPARAZIONE, nomeTecnico, type Scheda } from "@/lib/assistenza";
import { Badge } from "./ui";

const eur = (n: number | null | undefined) => `€ ${Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const data = (d: string | null | undefined) => (d ? new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString("it-IT") : "");

function Voce({ k, children, className = "" }: { k: string; children: React.ReactNode; className?: string }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="break-words text-sm font-medium leading-snug">{children}</div>
    </div>
  );
}

function Pillola({ tono, children }: { tono: "verde" | "rosso" | "ambra" | "blu" | "grigio"; children: React.ReactNode }) {
  const c = {
    verde: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
    rosso: "border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100",
    ambra: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
    blu: "border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
    grigio: "border-border bg-muted/50 text-foreground",
  }[tono];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}

export function RiepilogoScheda({ s, tecnici, onVai }: {
  s: Scheda; tecnici?: { codice: string; nome: string }[];
  onVai: (dove: "cliente" | "apparecchio" | "preventivo" | "lavorazione" | "documenti") => void;
}) {
  const a = s.anagrafica;
  const nome = s.azienda || s.nominativo || a?.denominazione || "—";
  const g = s.gsx || null;
  const rip = STATI_RIPARAZIONE.find(([k]) => k === s.riparazione_stato)?.[1];
  const chiusa = ["consegnato", "annullata"].includes(s.stato);
  const totale = s.totale_dovuto ?? s.totale_lavorazione ?? s.preventivo_totale ?? 0;
  const ricambiAperti = (s.ricambi_attesi || []).filter((r) => r.stato !== "arrivato");
  const sped = (s.spedizioni || []).filter((x) => !x.test_mode && x.status !== "annullata");
  const ultimaSped = sped[sped.length - 1];
  const indirizzo = s.indirizzo_spedizione || [a?.indirizzo, a?.cap, a?.comune, a?.provincia].filter(Boolean).join(" ");
  const trova = s.trova_il_mio === "attivo" ? <Pillola tono="rosso">🔒 «Trova il mio» attivo</Pillola>
    : s.trova_il_mio === "non_necessario" ? <Pillola tono="grigio">«Trova il mio» non necessario</Pillola>
      : s.trova_il_mio === "risolto" ? <Pillola tono="verde">«Trova il mio» disattivato</Pillola>
        : g?.trova_verifica?.stato === "non_attivo" ? <Pillola tono="verde">«Trova il mio» non attivo</Pillola> : null;
  const garanzia = g?.garanzia ? `${g.garanzia}${g.fine_copertura ? ` · fino al ${data(g.fine_copertura)}` : ""}` : null;

  const blocco = "rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30";
  return (
    <section aria-label="Riepilogo della scheda" data-testid="riepilogo-scheda" className="space-y-2">
      <div className="grid gap-2 lg:grid-cols-2">
        {/* CLIENTE */}
        <button type="button" className={blocco} onClick={() => onVai("cliente")} title="Apri la sezione Cliente (per modificare)">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><UserRound className="size-4" />Cliente
            {a?.tipo_cliente && <span className="rounded border px-1.5 py-px text-[10px] font-semibold normal-case">{a.tipo_cliente}</span>}</div>
          <div className="mb-2 text-lg font-bold leading-tight">{nome}</div>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <Voce k="Cellulare">{s.telefono && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" />{s.telefono}</span>}</Voce>
            <Voce k="Email">{s.email && <span className="inline-flex items-center gap-1 break-all"><Mail className="size-3.5 shrink-0" />{s.email}</span>}</Voce>
            <Voce k="Referente">{s.referente || a?.referente}</Voce>
            <Voce k="Anagrafica">{a ? `${a.denominazione}${a.piva ? ` · P.IVA ${a.piva}` : ""}` : <span className="text-amber-700">non collegata</span>}</Voce>
            <Voce k="Indirizzo" className="sm:col-span-2">{indirizzo && <span className="inline-flex items-start gap-1"><MapPin className="mt-0.5 size-3.5 shrink-0" />{indirizzo}</span>}</Voce>
            <Voce k="Rif. cliente">{s.rif_cliente}</Voce>
          </div>
        </button>
        {/* DISPOSITIVO */}
        <button type="button" className={blocco} onClick={() => onVai("apparecchio")} title="Apri la sezione Apparecchio e GSX">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Smartphone className="size-4" />Dispositivo</div>
          <div className="mb-2 text-lg font-bold leading-tight">{s.modello || g?.modello || s.prodotto || "—"}</div>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <Voce k="Prodotto">{s.prodotto}</Voce>
            <Voce k="Seriale"><span className="font-mono">{s.seriale || "—"}</span>{s.imei ? <span className="font-mono text-muted-foreground"> · IMEI {s.imei}</span> : null}</Voce>
            <Voce k="Difetto indicato" className="sm:col-span-2">{s.difetto}</Voce>
            <Voce k="Garanzia Apple">{garanzia}</Voce>
            <Voce k="Configurazione">{g?.configurazione}</Voce>
            <Voce k="Accessori">{s.accessori}</Voce>
            <Voce k="Password del dispositivo">{s.password_dispositivo ? "presente in scheda" : <span className="text-muted-foreground">non indicata</span>}</Voce>
          </div>
          {(trova || s.dati_cliente) && <div className="mt-2 flex flex-wrap gap-1.5">
            {trova}
            {s.dati_cliente === "importanti" && <Pillola tono="rosso">💾 Dati importanti: non formattare</Pillola>}
            {s.dati_cliente === "formattabile" && <Pillola tono="verde">Si può formattare</Pillola>}
          </div>}
        </button>
      </div>
      {/* SITUAZIONE */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border bg-card px-3 py-2 shadow-sm" data-testid="riepilogo-situazione">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Situazione</span>
        <Badge stato={s.stato} rip={s.riparazione_stato} rim={s.rimontaggio} />
        {s.etichetta_stato && s.etichetta_stato !== ETICHETTA_STATO[s.stato] && <span className="text-sm font-medium">{s.etichetta_stato}</span>}
        {rip && !chiusa && <button type="button" onClick={() => onVai("lavorazione")}><Pillola tono="blu">🔧 {rip}{s.tecnico_riparazione ? ` · ${nomeTecnico(s.tecnico_riparazione, tecnici) || s.tecnico_riparazione}` : ""}</Pillola></button>}
        {!rip && s.tecnico_verifica && !chiusa && <Pillola tono="grigio">🔎 verifica {nomeTecnico(s.tecnico_verifica, tecnici) || s.tecnico_verifica}{s.verifica_stato === "chiusa" ? " (chiusa)" : ""}</Pillola>}
        {ricambiAperti.length > 0 && <button type="button" onClick={() => onVai("lavorazione")}><Pillola tono="ambra"><Package className="size-3.5" />{ricambiAperti.length} ricambi attesi{ricambiAperti[0]?.arrivo_previsto ? ` · arrivo ${data(ricambiAperti[0].arrivo_previsto)}` : ""}</Pillola></button>}
        <button type="button" onClick={() => onVai("preventivo")} className="text-sm">
          Preventivo <b>{s.preventivo_totale != null ? eur(s.preventivo_totale) : "—"}</b>
          {s.preventivo_stato && s.preventivo_stato !== "da_fare" && <span className="text-muted-foreground"> · {s.preventivo_stato.replace(/_/g, " ")}</span>}
        </button>
        {totale > 0 && <span className="text-sm">Totale <b>{eur(totale)}</b></span>}
        {(s.acconto || 0) > 0 && <span className="text-sm">Acconto <b>{eur(s.acconto)}</b></span>}
        <button type="button" onClick={() => onVai("documenti")}>
          {s.pagata ? <Pillola tono="verde">💶 Pagata</Pillola>
            : totale > 0 ? <Pillola tono={s.stato === "pronto" ? "rosso" : "ambra"}>💶 Da pagare {eur(s.saldo)}</Pillola>
              : <Pillola tono="grigio">Nulla da pagare</Pillola>}
        </button>
        <span className="text-sm text-muted-foreground">
          {s.consegna_effettiva === "spedizione" ? "📦 Riconsegna con spedizione" : "🏪 Ritiro in negozio"}
          {ultimaSped ? ` · ${ultimaSped.carrier || ""} ${ultimaSped.direction === "ritiro" ? "ritiro" : "spedizione"} ${ultimaSped.tracking}${ultimaSped.status ? ` (${ultimaSped.status})` : ""}` : ""}
        </span>
      </div>
    </section>
  );
}
