"use client";

// 02/11/2026 (Christian): come per Apple, le cose da gestire delle TARATURE devono comparire a prescindere.
// Pulsante rosso su ogni pagina (anche con il selettore su Apple). Con il selettore su Tarature il pannello si apre
// da solo quando arriva qualcosa di nuovo. Notifiche e avvisi sono gli stessi componenti del banco Apple.
// 04/11/2026 (Christian): il gestionale Tarature sta da una parte, quello che nasce dalle skill WhatsApp e mail dall'altra.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { BellRing, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAttivita } from "@/components/attivita";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { AvvisiAutomatici } from "@/app/assistenza/AvvisiAutomatici";
import { NotificaCard } from "@/app/assistenza/NotificheGestire";
import { assAvvisiVistiTutti, assTaratureDaGestire, type TaratureDaGestire } from "@/lib/assistenza";
import { toastErrore } from "@/lib/errori";

const SENZA = ["/login", "/forgot-password", "/reset-password"];
const CHIAVE_VISTI = "tarature-da-gestire-visti";
const OGNI_MS = 60_000;

const idDiAttenzione = (d: TaratureDaGestire) => [...d.notifiche.map((n) => n.id), ...d.avvisi.map((a) => a.id)];

function leggiVisti(): string[] {
  try { return JSON.parse(localStorage.getItem(CHIAVE_VISTI) || "[]"); } catch { return []; }
}
function salvaVisti(ids: string[]) {
  try { localStorage.setItem(CHIAVE_VISTI, JSON.stringify(ids)); } catch { /* niente memoria locale */ }
}

export function DaGestireTarature() {
  const pathname = usePathname();
  const { attivita } = useAttivita();
  const [dati, setDati] = useState<TaratureDaGestire | null>(null);
  const [aperto, setAperto] = useState(false);
  const fuori = SENZA.some((p) => pathname.startsWith(p));

  // qualcosa di nuovo e selettore su Tarature: il pannello si apre da solo, una volta sola per ogni novità
  const carica = useCallback(() => {
    assTaratureDaGestire().then((d) => {
      setDati(d);
      if (attivita !== "tarature") return;
      const ora = idDiAttenzione(d);
      const visti = leggiVisti();
      salvaVisti(ora);
      if (ora.some((id) => !visti.includes(id))) setAperto(true);
    }).catch(() => undefined);   // 403 = utente senza accesso: il pulsante non compare
  }, [attivita]);

  useEffect(() => {
    if (fuori) return;
    carica();
    const t = setInterval(carica, OGNI_MS);
    window.addEventListener("focus", carica);
    return () => { clearInterval(t); window.removeEventListener("focus", carica); };
  }, [fuori, carica]);

  const nSkill = dati?.avvisi_skill?.length || 0;
  if (fuori || !dati || (!dati.totale && !nSkill)) return null;
  const urgenti = dati.notifiche.length + dati.avvisi.filter((a) => a.livello !== "info").length;

  return (
    <>
      {!aperto && (
        <button type="button" onClick={() => setAperto(true)} title="Cose da gestire delle Tarature"
          className={`fixed bottom-28 right-4 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg print:hidden ${urgenti ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>
          {urgenti > 0 && <span className="absolute -left-1 -top-1 size-3 animate-ping rounded-full bg-red-400" />}
          <BellRing className="size-4" /> {dati.totale ? `Tarature: ${dati.totale} da gestire` : `Tarature: ${nSkill} dalle skill`}
        </button>
      )}
      {aperto && <Pannello dati={dati} onCambiati={carica} onClose={() => setAperto(false)} />}
    </>
  );
}

function Pannello({ dati, onCambiati, onClose }: { dati: TaratureDaGestire; onCambiati: () => void; onClose: () => void }) {
  const [operatore, setOperatore] = useOperatore();
  const [busy, setBusy] = useState(false);
  const avvisiSkill = dati.avvisi_skill || [];
  const notificheGestionale = dati.notifiche.filter((n) => n.fonte !== "skill");
  const notificheSkill = dati.notifiche.filter((n) => n.fonte === "skill");

  async function vistiTutti(fonte: "gestionale" | "skill") {
    if (!operatore) { toast.error("Scegli chi sei (CHR · VALE · DUMY · ALTRO)"); return; }
    const quanti = fonte === "skill" ? avvisiSkill.length : dati.avvisi.length;
    if (!confirm(`Segnare come visti tutti i ${quanti} avvisi? Restano nello storico.`)) return;
    setBusy(true);
    try { const r = await assAvvisiVistiTutti("tarature", operatore, fonte); toast.success(`${r.visti} avvisi segnati come visti`); onCambiati(); }
    catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 print:hidden" onClick={onClose}>
      <div className="h-full w-full max-w-2xl space-y-4 overflow-y-auto bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><BellRing className="size-5 text-red-600" /> Tarature: da gestire</h2>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={onClose} aria-label="Chiudi"><X /></Button>
        </div>
        <SceltaOperatore value={operatore} onChange={setOperatore} />

        <h3 className="border-b pb-1 text-base font-bold">Gestionale Tarature</h3>
        {notificheGestionale.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-semibold">Notifiche da gestire ({notificheGestionale.length})</h3>
            {notificheGestionale.map((n) => <NotificaCard key={n.id} n={n} operatore={operatore} onCambiata={onCambiati} compatta />)}
          </section>
        )}

        {dati.da_fare.length > 0 && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 font-semibold"><Wrench className="size-4" /> In laboratorio ({dati.da_fare.length})</h3>
            {dati.da_fare.map((v) => (
              <Link key={`${v.session_id}-${v.tipo}`} href={`/sessioni/${v.session_id}`} onClick={onClose}
                className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                <b>Sessione {v.numero}</b><span>{v.cliente}</span><span className="ml-auto font-medium">{v.testo}</span>
              </Link>
            ))}
          </section>
        )}

        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Fatto in automatico ({dati.avvisi.length})</h3>
            {dati.avvisi.length > 1 && <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => vistiTutti("gestionale")}>✔ Ho visto tutti</Button>}
          </div>
          <AvvisiAutomatici avvisi={dati.avvisi} operatore={operatore} attivita="tarature" fonte="gestionale" onVisto={onCambiati} />
        </section>

        <h3 className="border-b pb-1 pt-2 text-base font-bold">Dalle skill: WhatsApp e mail</h3>
        {notificheSkill.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-semibold">Da decidere ({notificheSkill.length})</h3>
            {notificheSkill.map((n) => <NotificaCard key={n.id} n={n} operatore={operatore} onCambiata={onCambiati} compatta />)}
          </section>
        )}
        <details className="space-y-2">
          <summary className="cursor-pointer font-semibold">Fatto dalle skill ({avvisiSkill.length})</summary>
          {avvisiSkill.length > 1 && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => vistiTutti("skill")}>✔ Ho visto tutti</Button>
            </div>
          )}
          <div className="mt-2"><AvvisiAutomatici avvisi={avvisiSkill} operatore={operatore} attivita="tarature" fonte="skill" onVisto={onCambiati} /></div>
        </details>
      </div>
    </div>
  );
}
