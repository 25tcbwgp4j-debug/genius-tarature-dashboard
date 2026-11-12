"use client";

// 02/11/2026 (Christian): le cose da gestire delle TARATURE devono comparire a prescindere.
// 04/11/2026 (Christian): il gestionale Tarature sta da una parte, quello che nasce dalle skill WhatsApp e mail dall'altra.
// 12/11/2026 (Christian): niente più pulsante rosso fisso su ogni pagina (compariva anche sul lato Apple e il numero
// non scendeva mai, perché contava anche le sessioni in laboratorio). Ora è un riquadro nella home Tarature, come le
// notifiche del banco Apple: il numero rosso conta solo le notifiche da decidere; gli avvisi spariscono con «Ho visto»;
// le sessioni in laboratorio sono un promemoria a parte, chiuso, che non conta.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BellRing, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { AvvisiAutomatici } from "@/app/assistenza/AvvisiAutomatici";
import { NotificaCard } from "@/app/assistenza/NotificheGestire";
import { assAvvisiVistiTutti, assTaratureDaGestire, type TaratureDaGestire } from "@/lib/assistenza";
import { toastErrore } from "@/lib/errori";

const OGNI_MS = 60_000;

export function DaGestireTarature() {
  const [dati, setDati] = useState<TaratureDaGestire | null>(null);
  const [operatore, setOperatore] = useOperatore();
  const [busy, setBusy] = useState(false);
  const [ridotto, setRidotto] = useState(false);

  // 403 = utente senza accesso: il riquadro non compare
  const carica = useCallback(() => { assTaratureDaGestire().then(setDati).catch(() => undefined); }, []);

  useEffect(() => {
    carica();
    const t = setInterval(carica, OGNI_MS);
    window.addEventListener("focus", carica);
    return () => { clearInterval(t); window.removeEventListener("focus", carica); };
  }, [carica]);

  if (!dati) return null;
  const avvisiSkill = dati.avvisi_skill || [];
  const notificheGestionale = dati.notifiche.filter((n) => n.fonte !== "skill");
  const notificheSkill = dati.notifiche.filter((n) => n.fonte === "skill");
  const nNotifiche = dati.notifiche.length;
  const nAvvisi = dati.avvisi.length + avvisiSkill.length;
  if (!nNotifiche && !nAvvisi && !dati.da_fare.length) return null;

  async function vistiTutti(fonte: "gestionale" | "skill") {
    if (!operatore) { toast.error("Scegli chi sei (CHR · VALE · DUMY · MARTINA · ALTRO)"); return; }
    const quanti = fonte === "skill" ? avvisiSkill.length : dati!.avvisi.length;
    if (!confirm(`Segnare come visti tutti i ${quanti} avvisi? Restano nello storico.`)) return;
    setBusy(true);
    try { const r = await assAvvisiVistiTutti("tarature", operatore, fonte); toast.success(`${r.visti} avvisi segnati come visti`); carica(); }
    catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <div className={`space-y-3 rounded-xl border-2 p-3 shadow-sm ${nNotifiche ? "border-red-600" : "border-muted"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className={`h-5 w-5 ${nNotifiche ? "text-red-600" : "text-muted-foreground"}`} />
        <span className="text-lg font-bold">Notifiche da gestire</span>
        <span className={`inline-flex min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold text-white ${nNotifiche ? "bg-red-600" : "bg-gray-400"}`}>{nNotifiche}</span>
        {nAvvisi > 0 && <span className="text-sm text-muted-foreground">· {nAvvisi} avvisi da vedere</span>}
        {(nNotifiche > 0 || nAvvisi > 0) && (
          <button type="button" className="ml-auto text-xs text-muted-foreground underline" onClick={() => setRidotto((x) => !x)}>{ridotto ? "mostra" : "riduci"}</button>
        )}
      </div>

      {!ridotto && (
        <>
          {(nNotifiche > 0 || nAvvisi > 0) && <SceltaOperatore value={operatore} onChange={setOperatore} />}

          {notificheGestionale.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold">Gestionale Tarature ({notificheGestionale.length})</h3>
              {notificheGestionale.map((n) => <NotificaCard key={n.id} n={n} operatore={operatore} onCambiata={carica} compatta />)}
            </section>
          )}
          {notificheSkill.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold">Da decidere, da WhatsApp e mail ({notificheSkill.length})</h3>
              {notificheSkill.map((n) => <NotificaCard key={n.id} n={n} operatore={operatore} onCambiata={carica} compatta />)}
            </section>
          )}

          {dati.avvisi.length > 0 && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">Fatto in automatico ({dati.avvisi.length})</h3>
                {dati.avvisi.length > 1 && <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => vistiTutti("gestionale")}>✔ Ho visto tutti</Button>}
              </div>
              <AvvisiAutomatici avvisi={dati.avvisi} operatore={operatore} attivita="tarature" fonte="gestionale" onVisto={carica} />
            </section>
          )}
          {avvisiSkill.length > 0 && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">Fatto da Claude, da WhatsApp e mail ({avvisiSkill.length})</h3>
                {avvisiSkill.length > 1 && <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => vistiTutti("skill")}>✔ Ho visto tutti</Button>}
              </div>
              <AvvisiAutomatici avvisi={avvisiSkill} operatore={operatore} attivita="tarature" fonte="skill" onVisto={carica} />
            </section>
          )}
        </>
      )}

      {dati.da_fare.length > 0 && (
        <details className="rounded-lg border px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <Wrench className="size-4" /> In laboratorio ({dati.da_fare.length}) <span className="font-normal text-muted-foreground">· promemoria, si aggiorna da solo quando cambia la sessione</span>
          </summary>
          <div className="mt-2 space-y-1">
            {dati.da_fare.map((v) => (
              <Link key={`${v.session_id}-${v.tipo}`} href={`/sessioni/${v.session_id}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                <b>Sessione {v.numero}</b><span>{v.cliente}</span><span className="ml-auto font-medium">{v.testo}</span>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
