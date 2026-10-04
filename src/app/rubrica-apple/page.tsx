"use client";

// RUBRICA CLIENTI APPLE (04/10/2026) — sola lettura. Clienti delle schede di assistenza (storico FileMaker + nuove)
// e di fatture/scontrini con attività Apple, uniti per telefono/email/P.IVA (backend rubrica_apple_api.py).
// Viste: tutti · con schede aperte · aziende ricorrenti (B2B/rivenditori: P.IVA con almeno 2 fatture Apple).
// WhatsApp staff Genius 334: solo lo stato della linea (sola lettura), nessun messaggio parte da qui.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookUser, Search, MessageCircle, Building2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchAPI } from "@/lib/api";
import { eur } from "@/lib/assistenza";

interface Cliente {
  chiave: string; nome: string; telefono: string | null; email: string | null; piva: string | null; anagrafica_id: string | null;
  schede: number; schede_aperte: number; ultima_scheda: { id: string; sigla: string } | null; ultima_scheda_il: string | null;
  fatture: number; fatturato: number; ultima_fattura_il: string | null; ultima_attivita: string | null; cellulare: boolean;
}
interface Riepilogo {
  clienti: number; con_schede: number; con_fatture: number; schede_aperte: number; aziende_ricorrenti: number; con_cellulare: number;
  whatsapp: { linea: string; numero: string; collegata: boolean; sola_lettura: boolean; nota: string };
}

const VISTE = [
  { v: "tutti", label: "Tutti" },
  { v: "aperte", label: "Con schede aperte" },
  { v: "aziende", label: "Aziende ricorrenti (B2B)" },
];
const PAGINA = 100;
const giorno = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) : "—");

export default function RubricaApple() {
  const [rie, setRie] = useState<Riepilogo | null>(null);
  const [vista, setVista] = useState("tutti");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [dati, setDati] = useState<{ clienti: Cliente[]; totale: number } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    fetchAPI("/api/rubrica-apple/riepilogo", { timeoutMs: 60_000 }, false).then(setRie)
      .catch((e: { status?: number; message?: string }) => setErrore(e?.status === 403 ? "Le schede di assistenza sono in prova: la rubrica Apple per ora la vede solo il titolare." : e?.message || "Errore"));
  }, []);

  useEffect(() => {
    let annullato = false;
    const t = setTimeout(() => {
      fetchAPI(`/api/rubrica-apple?vista=${vista}&q=${encodeURIComponent(q)}&limit=${PAGINA}&offset=${offset}`, { timeoutMs: 60_000 }, false)
        .then((r) => { if (!annullato) { setDati(r); setErrore(null); } })
        .catch((e: { status?: number; message?: string }) => { if (!annullato) setErrore(e?.status === 403 ? "Le schede di assistenza sono in prova: la rubrica Apple per ora la vede solo il titolare." : e?.message || "Errore"); });
    }, 250);
    return () => { annullato = true; clearTimeout(t); };
  }, [vista, q, offset]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <BookUser className="w-6 h-6" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Rubrica clienti Apple</h2>
        <span className="text-xs rounded border px-2 py-0.5 text-gray-600 dark:text-gray-300">sola lettura</span>
      </div>

      {errore && <Card className="p-4 text-sm text-gray-600 dark:text-gray-300">{errore}</Card>}

      {rie && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3"><p className="text-xl font-bold">{rie.clienti.toLocaleString("it-IT")}</p><p className="text-xs text-gray-500">clienti ({rie.con_schede.toLocaleString("it-IT")} con schede, {rie.con_fatture} con fatture)</p></Card>
          <Card className="p-3"><p className="text-xl font-bold">{rie.schede_aperte}</p><p className="text-xs text-gray-500">con schede aperte</p></Card>
          <Card className="p-3"><p className="text-xl font-bold">{rie.aziende_ricorrenti}</p><p className="text-xs text-gray-500">aziende ricorrenti (P.IVA, ≥ 2 fatture)</p></Card>
          <Card className="p-3">
            <p className="text-sm font-semibold flex items-center gap-1"><MessageCircle className="w-4 h-4" /> WhatsApp negozio {rie.whatsapp.numero}</p>
            <p className="text-xs text-gray-500">
              {rie.whatsapp.collegata ? "linea collegata" : "linea non ancora collegata"} · sola lettura · {`${rie.con_cellulare.toLocaleString("it-IT")} clienti con cellulare`}, pronti per l&apos;abbinamento
            </p>
          </Card>
        </div>
      )}
      {rie && <p className="text-xs text-gray-500">{rie.whatsapp.nota}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Nome, telefono, email o P.IVA"
            className="w-full h-9 pl-8 pr-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm" />
        </div>
        <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
          {VISTE.map((x) => (
            <button key={x.v} type="button" onClick={() => { setVista(x.v); setOffset(0); }}
              className={`px-3 py-1.5 text-sm ${vista === x.v ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300"}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <div className="divide-y">
          {!dati && !errore && <p className="p-4 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Caricamento…</p>}
          {dati?.clienti.length === 0 && <p className="p-4 text-sm text-gray-500">Nessun cliente trovato.</p>}
          {dati?.clienti.map((c) => (
            <div key={c.chiave} className="p-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate flex items-center gap-1">
                  {c.piva && <Building2 className="w-4 h-4 text-gray-400 shrink-0" />}
                  {c.nome || "Cliente senza nome"}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {[c.telefono, c.email, c.piva && `P.IVA ${c.piva}`].filter(Boolean).join(" · ") || "nessun recapito"}
                </p>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300 flex flex-wrap gap-x-4 gap-y-1 sm:justify-end">
                {c.schede > 0 && (
                  <span>
                    {c.schede} {c.schede === 1 ? "scheda" : "schede"}{c.schede_aperte ? <b className="text-amber-700"> · {c.schede_aperte} aperte</b> : null}
                    {c.ultima_scheda && <> · <Link className="underline" href={`/assistenza?id=${c.ultima_scheda.id}`}>{c.ultima_scheda.sigla}</Link></>}
                  </span>
                )}
                {c.fatture > 0 && <span>{c.fatture} {c.fatture === 1 ? "fattura" : "fatture"} · {eur(c.fatturato)}</span>}
                <span className="text-gray-400">ultima: {giorno(c.ultima_attivita)}</span>
              </div>
            </div>
          ))}
        </div>
        {dati && dati.totale > PAGINA && (
          <div className="p-3 border-t flex items-center justify-between text-sm">
            <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGINA))} className="px-3 py-1 rounded border disabled:opacity-40">← Precedenti</button>
            <span>{offset + 1}–{Math.min(offset + PAGINA, dati.totale)} di {dati.totale.toLocaleString("it-IT")}</span>
            <button type="button" disabled={offset + PAGINA >= dati.totale} onClick={() => setOffset(offset + PAGINA)} className="px-3 py-1 rounded border disabled:opacity-40">Successivi →</button>
          </div>
        )}
      </Card>
    </div>
  );
}
