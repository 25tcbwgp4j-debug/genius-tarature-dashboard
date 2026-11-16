"use client";

// 16/11/2026 (Christian): «i solleciti dobbiamo verificarli… bisogna vedere ogni tanto qual è la situazione e li mandiamo».
// Ai clienti non parte nulla da solo: qui l'elenco di oggi, riga per riga — Invia (solo in orario), Salta, Non sollecitare più.
// Solo il titolare (il server risponde 403 agli operatori).
import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Riga { scheda_id: string; sigla: string; cliente: string; giorni: number; tipo: "preventivo" | "ritiro"; codice: string;
  azione: "invia" | "avviso_banco" | "escluso"; motivo: string | null; saltati?: string[] }

export function SollecitiDaApprovare({ onScheda }: { onScheda?: (id: string) => void }) {
  const [righe, setRighe] = useState<Riga[] | null>(null);
  const [aperto, setAperto] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const carica = useCallback(async () => {
    try { const r = await fetchAPI("/api/assistenza/solleciti/prova", {}, false); setRighe((r?.piano || []).filter((x: Riga) => x.azione === "invia")); }
    catch { setRighe(null); }
  }, []);
  useEffect(() => { carica(); }, [carica]);
  if (!righe || !righe.length) return null;
  const decidi = async (x: Riga, decisione: "invia" | "salta" | "mai") => {
    const testo = decisione === "invia" ? `Mandare adesso il sollecito (${x.tipo}, ${x.giorni} giorni) a ${x.cliente}? Parte mail + WhatsApp della scheda.`
      : decisione === "salta" ? `Saltare questo sollecito per ${x.cliente}? Non parte nulla.` : `Non sollecitare più la scheda ${x.sigla} (${x.cliente})?`;
    if (!window.confirm(testo)) return;
    setBusy(x.scheda_id + x.codice); setMsg(null);
    try {
      const r = await fetchAPI("/api/assistenza/solleciti/decidi", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheda_id: x.scheda_id, codice: x.codice, decisione, operatore: "CHR" }) });
      setMsg(`Scheda ${x.sigla}: ${r?.esito || "fatto"}${r?.mail ? ` · mail ${r.mail}` : ""}${r?.whatsapp ? ` · WhatsApp ${r.whatsapp}` : ""}`);
      await carica();
    } catch (e) { setMsg(`Scheda ${x.sigla}: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };
  return (
    <div className="rounded-xl border-2 border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100" data-testid="solleciti-da-approvare">
      <button type="button" className="w-full text-left font-semibold" onClick={() => setAperto(!aperto)} aria-expanded={aperto}>
        📨 {righe.length} {righe.length === 1 ? "sollecito da approvare" : "solleciti da approvare"} (non parte nulla da solo) {aperto ? "▲" : "▼"}
      </button>
      {msg && <div className="mt-1 text-xs">{msg}</div>}
      {aperto && <ul className="mt-2 space-y-1.5">
        {righe.map((x) => (
          <li key={x.scheda_id + x.codice} className="flex flex-wrap items-center gap-2 border-t border-sky-200 pt-1.5 dark:border-sky-900">
            <button type="button" className="font-mono underline" onClick={() => onScheda?.(x.scheda_id)}>{x.sigla}</button>
            <span className="min-w-0 flex-1 truncate">{x.cliente} · {x.tipo === "preventivo" ? "preventivo senza risposta" : "pronto non ritirato"} da {x.giorni} giorni</span>
            <span className="flex gap-1">
              <Button size="sm" disabled={!!busy} onClick={() => decidi(x, "invia")}>Invia</Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decidi(x, "salta")}>Salta</Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decidi(x, "mai")}>Mai più</Button>
            </span>
          </li>))}
      </ul>}
    </div>
  );
}
