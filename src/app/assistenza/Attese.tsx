"use client";

// 15/11/2026 (piano 2.16): due riquadri per non lasciare indietro nessuno, con dati di endpoint che esistono già.
// · «Aspettano da più di 2 ore»: chat WhatsApp staff 334 il cui ULTIMO messaggio è del cliente, da oltre 2 ore
//   (/api/chat-apple-staff/conversazioni: ultimo.da_noi = false). Solo gli ultimi 7 giorni, le più vecchie in cima.
// · «Schede ferme»: in arrivo da più di 5 giorni, accettate da più di 7 giorni e non ancora finite, ricambi ordinati
//   senza data di arrivo (/api/assistenza/schede?stato=…).
//   15/11/2026 (sera): i giorni di fermo sono quelli REALI, dall'ultimo cambiamento della scheda (updated_at): una scheda
//   accettata da 10 giorni ma toccata ieri non è ferma.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Hourglass, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { assElenco, assStaffConversazioni, dataOra, type SchedaBreve, type StaffConv } from "@/lib/assistenza";
import { senzaIdWhatsApp, telefonoLeggibile } from "@/lib/formato";

const ORA = 3600_000;
const GIORNO = 24 * ORA;
const daQuanto = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  return ms < GIORNO ? `da ${Math.floor(ms / ORA)} ore` : `da ${Math.floor(ms / GIORNO)} giorni`;
};

export function AspettanoRisposta() {
  const [lista, setLista] = useState<StaffConv[] | null>(null);
  useEffect(() => {
    let vivo = true;
    const carica = () => assStaffConversazioni().then((r) => {
      if (!vivo) return;
      const ora = Date.now();
      setLista((r.conversazioni || []).filter((c) => {
        const t = c.ultimo?.inviato_il ? new Date(c.ultimo.inviato_il).getTime() : 0;
        return c.ultimo && !c.ultimo.da_noi && t && ora - t > 2 * ORA && ora - t < 7 * GIORNO;
      }).sort((a, b) => String(a.ultimo.inviato_il).localeCompare(String(b.ultimo.inviato_il))));
    }).catch(() => { if (vivo) setLista([]); });
    carica();
    const t = setInterval(carica, 5 * 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  if (!lista?.length) return null;
  return (
    <Card className="border-2 border-amber-300 p-3 dark:border-amber-700">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><MessageCircle className="size-4" /> Aspettano una risposta da più di 2 ore · WhatsApp 334 <span className="rounded-full bg-amber-500 px-2 text-xs text-white">{lista.length}</span></h3>
      <ul className="divide-y text-sm">
        {lista.slice(0, 12).map((c) => (
          <li key={c.chat_id}>
            <Link href={`/chat-apple?tab=staff&tel=${encodeURIComponent(c.telefono || "")}`} className="flex min-h-10 flex-wrap items-baseline gap-x-2 py-1.5 hover:underline">
              <b>{c.nome || (c.telefono ? telefonoLeggibile(c.telefono) : "cliente")}</b>
              <span className="text-xs font-medium text-amber-800 dark:text-amber-300">{c.ultimo.inviato_il ? daQuanto(c.ultimo.inviato_il) : ""}</span>
              <span className="w-full truncate text-xs text-muted-foreground">{senzaIdWhatsApp(c.ultimo.testo || (c.ultimo.tipo ? `[${c.ultimo.tipo}]` : ""))}</span>
            </Link>
          </li>
        ))}
      </ul>
      {lista.length > 12 && <p className="mt-1 text-xs text-muted-foreground">… e altre {lista.length - 12}: apri «Chat WhatsApp Apple»</p>}
    </Card>
  );
}

type Ferma = { s: SchedaBreve; perche: string };

export function SchedeFerme() {
  const [lista, setLista] = useState<Ferma[] | null>(null);
  useEffect(() => {
    let vivo = true;
    Promise.all([assElenco("", "in_arrivo", "", 500, 0), assElenco("", "accettato", "", 500, 0)]).then(([arr, acc]) => {
      if (!vivo) return;
      const ora = Date.now();
      const out: Ferma[] = [];
      // ultimo movimento della scheda (senza updated_at: la data della fase)
      const fermaDa = (s: SchedaBreve, fase: string) => s.updated_at || fase;
      const ferma = (s: SchedaBreve, fase: string, giorni: number) => ora - new Date(fase).getTime() > giorni * GIORNO
        && ora - new Date(fermaDa(s, fase)).getTime() > giorni * GIORNO;
      const nota = (s: SchedaBreve) => s.updated_at ? ` · ferma ${daQuanto(s.updated_at)} (ultimo cambiamento ${dataOra(s.updated_at)})` : "";
      for (const s of arr.schede) {
        if (s.sola_lettura) continue;
        const da = s.fasi?.in_arrivo?.il || s.created_at;
        if (ferma(s, da, 5)) out.push({ s, perche: `in arrivo ${daQuanto(da)}${nota(s)}` });
      }
      for (const s of acc.schede) {
        if (s.sola_lettura) continue;
        const senzaData = (s.ricambi_attesi || []).filter((r) => r.stato === "ordinato" && !r.arrivo_previsto);
        if (senzaData.length) { out.push({ s, perche: `ricambio ordinato senza data di arrivo: ${senzaData.map((r) => r.cosa || "ricambio").join(", ")}` }); continue; }
        const da = s.fasi?.riparazione?.il;
        if (da && ferma(s, da, 7) && !["finita", "non_riparabile"].includes(s.riparazione_stato || ""))
          out.push({ s, perche: `accettata ${daQuanto(da)}, riparazione non finita${nota(s)}` });
      }
      // le più ferme in cima
      out.sort((a, b) => String(a.s.updated_at || a.s.created_at).localeCompare(String(b.s.updated_at || b.s.created_at)));
      setLista(out);
    }).catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, []);
  if (!lista?.length) return null;
  return (
    <Card className="border-2 border-sky-300 p-3 dark:border-sky-700">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Hourglass className="size-4" /> Schede ferme <span className="rounded-full bg-sky-600 px-2 text-xs text-white">{lista.length}</span></h3>
      <ul className="divide-y text-sm">
        {lista.slice(0, 15).map(({ s, perche }) => (
          <li key={s.id}>
            <Link href={`/assistenza?id=${s.id}`} className="flex min-h-10 flex-wrap items-baseline gap-x-2 py-1.5 hover:underline">
              <b className="tabular-nums">{s.sigla}</b><span>{s.azienda || s.nominativo}</span>
              <span className="text-xs text-muted-foreground">{s.prodotto}</span>
              <span className="w-full text-xs font-medium text-sky-800 dark:text-sky-300">{perche}</span>
            </Link>
          </li>
        ))}
      </ul>
      {lista.length > 15 && <p className="mt-1 text-xs text-muted-foreground">… e altre {lista.length - 15}</p>}
    </Card>
  );
}
