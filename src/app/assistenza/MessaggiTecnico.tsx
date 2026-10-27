"use client";

// 27/10/2026 (Christian, 63228): cliccando un tecnico nel cruscotto («In riparazione · ROBERTO») compaiono SUBITO i messaggi
// di passaggio non ancora letti per lui, prima ancora di aprire la scheda. La X li chiude solo su questo computer.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchAPI } from "@/lib/api";
import { toastErrore } from "@/lib/errori";
import type { SchedaBreve } from "@/lib/assistenza";
import { Modale } from "./scheda/ui";

export function MessaggiTecnico({ tecnico, schede, operatore, onApri, onLetto }: {
  tecnico: string; schede: SchedaBreve[] | null; operatore: string; onApri: (id: string) => void; onLetto: () => void;
}) {
  const nuovi = (schede || []).filter((s) => s.passaggio && !s.passaggio.letto_il && (s.passaggio.a || "").toUpperCase() === tecnico.toUpperCase());
  const chiave = `messaggi-${tecnico}-${nuovi.map((s) => `${s.id}:${s.passaggio?.il}`).join(",")}`;
  const [chiuso, setChiuso] = useState(true);
  useEffect(() => { try { setChiuso(sessionStorage.getItem(chiave) === "1"); } catch { setChiuso(false); } }, [chiave]);
  if (!tecnico || !nuovi.length || chiuso) return null;
  const chiudi = () => { try { sessionStorage.setItem(chiave, "1"); } catch { /* */ } setChiuso(true); };
  async function letto(id: string) {
    if (!confirm(`Sei ${tecnico}? Il messaggio sparirà per tutti (resta nelle note di riparazione).`)) return;
    try { await fetchAPI(`/api/assistenza/schede/${id}/passaggio-letto`, { method: "POST", body: JSON.stringify({ operatore }) }); toast.success("Messaggio letto"); onLetto(); }
    catch (e) { toastErrore(e); }
  }
  return (
    <Modale titolo={`📨 ${nuovi.length === 1 ? "Un messaggio" : `${nuovi.length} messaggi`} per ${tecnico}`} onClose={chiudi}
      piedi={<Button variant="outline" onClick={chiudi}>Chiudi (non sono {tecnico})</Button>}>
      <div className="space-y-3">
        {nuovi.map((s) => (
          <div key={s.id} className="rounded-lg border p-3">
            <div className="mb-1 text-sm"><b>Scheda {s.sigla}</b> · {s.prodotto} · {s.azienda || s.nominativo} <span className="text-muted-foreground">— da {s.passaggio?.da}</span></div>
            <p className="whitespace-pre-line">{s.passaggio?.testo}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { chiudi(); onApri(s.id); }}>Apri la scheda</Button>
              <Button size="sm" onClick={() => letto(s.id)}>Sono {tecnico}: ho letto</Button>
            </div>
          </div>
        ))}
      </div>
    </Modale>
  );
}
