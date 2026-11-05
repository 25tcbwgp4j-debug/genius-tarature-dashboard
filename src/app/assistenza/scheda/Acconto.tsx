"use client";

// ACCONTO DELLA SCHEDA (05/11/2026, Christian, 63331): un solo pop-up. O si chiede il bonifico al cliente (mail e/o WhatsApp),
// oppure si incassa adesso (contanti, bonifico arrivato, POS piccolo, POS P8, PayPal) con la fattura d'acconto o lo scontrino.
import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Mail, MessageCircle, Receipt, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Incassa } from "@/components/Incassa";
import { assAzione, eur, type Scheda } from "@/lib/assistenza";
import { Campo, Modale, Scelta, campo } from "./ui";

type Esito = { id: string; numero: string | null; emessa: boolean; errore: string | null; descrizione: string };

export function DialogoAcconto({ s, operatore, inizio, onClose, onRichiedi, onScontrino, onIncassato }: {
  s: Scheda; operatore: string | null | undefined; inizio: "invia" | "incassa"; onClose: () => void;
  onRichiedi: (b: { importo: number; invia_mail: boolean; invia_wa: boolean }) => Promise<boolean>;
  onScontrino: (importo: number) => void; onIncassato: () => void;
}) {
  const [txt, setTxt] = useState("");
  const [cosa, setCosa] = useState<"invia" | "incassa">(inizio);
  const [doc, setDoc] = useState<"fattura" | "scontrino">("fattura");
  const [mail, setMail] = useState(true);
  const [wa, setWa] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bozza, setBozza] = useState<Esito | null>(null);
  const inBozza = useRef(false);
  const imp = Math.round((Number(txt.replace(",", ".")) || 0) * 100) / 100;
  const oltre = s.saldo > 0 && imp > s.saldo + 0.005;
  const valido = imp > 0 && !oltre;
  const cliente = s.nominativo || s.azienda || "";

  async function invia() {
    setBusy(true);
    try { if (await onRichiedi({ importo: imp, invia_mail: mail, invia_wa: wa })) onClose(); } finally { setBusy(false); }
  }

  if (bozza) {
    return (
      <Modale titolo={`Acconto incassato — scheda ${s.sigla}`} onClose={onIncassato}
        piedi={<Button onClick={onIncassato}>Chiudi</Button>}>
        <div className="space-y-2 text-sm">
          <p>L&apos;incasso è registrato, ma la fattura d&apos;acconto non è partita allo SdI e resta in bozza.</p>
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{bozza.errore}</p>
          <Link className="underline" href={`/fatturazione?id=${bozza.id}`}>Apri la fattura e completa i dati</Link>
        </div>
      </Modale>
    );
  }

  return (
    <Modale titolo={`Acconto — scheda ${s.sigla}`} onClose={onClose}
      piedi={<><Button variant="outline" onClick={onClose}>Annulla</Button>
        {cosa === "invia" && <Button disabled={busy || !valido || (!mail && !wa)} onClick={invia}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Invia la richiesta</Button>}
        {cosa === "incassa" && doc === "scontrino" && <Button disabled={!valido} onClick={() => onScontrino(imp)}><Receipt />Vai alla cassa</Button>}</>}>
      <div className="space-y-3">
        <Campo label={`Importo dell'acconto € (da pagare ${eur(s.saldo)})`}>
          <input autoFocus className={`${campo} w-40 text-right`} inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} />
        </Campo>
        {oltre && <p className="text-xs font-semibold text-red-700">L&apos;acconto supera quanto resta da pagare.</p>}
        <Scelta valore={cosa} opzioni={[["invia", "Chiedo il bonifico al cliente"], ["incassa", "Incasso adesso"]]} onChange={(x) => setCosa(x as typeof cosa)} />
        {cosa === "invia" && (
          <div className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">Al cliente arrivano IBAN, causale e preventivo allegato. Nessun incasso viene registrato finché non arriva il bonifico.</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={mail} onChange={(e) => setMail(e.target.checked)} /><Mail className="size-4" />Mail</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4" checked={wa} onChange={(e) => setWa(e.target.checked)} /><MessageCircle className="size-4" />WhatsApp</label>
            </div>
          </div>
        )}
        {cosa === "incassa" && (
          <div className="space-y-3">
            <Campo label="Documento"><Scelta valore={doc} opzioni={[["fattura", "Fattura d'acconto"], ["scontrino", "Scontrino"]]} onChange={(x) => setDoc(x as typeof doc)} /></Campo>
            {doc === "scontrino" && <p className="text-xs text-muted-foreground">Dalla cassa scegli contanti, bonifico o POS: l&apos;acconto si scala da solo dal saldo.</p>}
            {doc === "fattura" && valido && (
              <Incassa key={imp} modo="documento" totale={imp} documentoTipo="fattura" descrizione={`Acconto scheda ${s.sigla}`} testoCliente={cliente}
                disabled={!operatore} motivo={!operatore ? "scegli l'operatore" : ""}
                onPagamento={async (p) => {
                  const r = await assAzione(s.id, "acconto-fattura", { operatore, importo: p.importo, modalita: p.modalita, data: p.data,
                    riferimento: p.riferimento, pos_incasso_id: p.pos_incasso_id }) as Esito;
                  if (r.emessa) toast.success(`Fattura d'acconto n. ${r.numero} emessa e inviata allo SdI`);
                  else { inBozza.current = true; setBozza(r); }
                  return { id: r.id, descrizione: r.descrizione };
                }}
                onFatto={() => { if (!inBozza.current) onIncassato(); }} />
            )}
          </div>
        )}
      </div>
    </Modale>
  );
}
