"use client";

// Delega al ritiro (20/10/2026, migr. 122). Caso GIU.MAR 225: «Delego al ritiro il Sig. Damiano Marrano».
// Prima finiva nelle note e al banco nessuno la vedeva: qui è un riquadro viola sempre in vista, il nome del
// delegato va sulla ricevuta di riconsegna e alla consegna viene registrato chi ha ritirato.

import { useState } from "react";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSession } from "@/lib/api";

type Sessione = {
  delega_ritiro_nome?: string | null;
  delega_ritiro_documento?: string | null;
  delega_ritiro_nota?: string | null;
  delega_ritiro_at?: string | null;
  ritirato_da?: string | null;
};

export function DelegaRitiro({ sessionId, session, onSalvato }: {
  sessionId: string; session: Sessione; onSalvato: () => void;
}) {
  const [apri, setApri] = useState(false);
  const [nome, setNome] = useState(session.delega_ritiro_nome || "");
  const [doc, setDoc] = useState(session.delega_ritiro_documento || "");
  const [nota, setNota] = useState(session.delega_ritiro_nota || "");
  const [salvo, setSalvo] = useState(false);

  const salva = async (dati: Record<string, string>) => {
    setSalvo(true);
    try {
      await updateSession(sessionId, dati);
      toast.success(dati.delega_ritiro_nome === "" ? "Delega tolta" : "Delega al ritiro salvata");
      setApri(false);
      onSalvato();
    } catch (e) {
      toast.error(`Delega non salvata: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSalvo(false);
    }
  };

  const modulo = (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <Input placeholder="Nome e cognome del delegato" value={nome} onChange={(e) => setNome(e.target.value)} />
      <Input placeholder="Documento (es. C.I. AB1234567)" value={doc} onChange={(e) => setDoc(e.target.value)} />
      <Input placeholder="Come è arrivata (es. WhatsApp 20/10)" value={nota} onChange={(e) => setNota(e.target.value)} />
      <div className="flex gap-2 sm:col-span-3">
        <Button size="sm" disabled={salvo || !nome.trim()}
          onClick={() => salva({ delega_ritiro_nome: nome, delega_ritiro_documento: doc, delega_ritiro_nota: nota })}>
          Salva delega
        </Button>
        <Button size="sm" variant="outline" disabled={salvo} onClick={() => setApri(false)}>Annulla</Button>
      </div>
    </div>
  );

  if (!session.delega_ritiro_nome) {
    return (
      <div>
        {!apri ? (
          <Button size="sm" variant="outline" onClick={() => setApri(true)}>
            <UserCheck className="mr-1 size-4" /> Aggiungi delega al ritiro
          </Button>
        ) : (
          <div className="rounded-lg border-2 border-violet-400 bg-violet-50 p-3">
            <p className="text-sm font-semibold text-violet-900">Chi ritira gli strumenti al posto del cliente?</p>
            {modulo}
          </div>
        )}
      </div>
    );
  }

  const quando = session.delega_ritiro_at ? new Date(session.delega_ritiro_at).toLocaleDateString("it-IT") : null;
  return (
    <div className="rounded-lg border-2 border-violet-600 bg-violet-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-lg font-extrabold tracking-wide text-violet-800">
            <UserCheck className="mr-1 inline size-5" /> RITIRA PER DELEGA: {session.delega_ritiro_nome}
          </p>
          <p className="text-sm text-violet-900">
            {session.delega_ritiro_nota ? `${session.delega_ritiro_nota} · ` : ""}
            {quando ? `registrata il ${quando} · ` : ""}
            {session.delega_ritiro_documento
              ? `documento: ${session.delega_ritiro_documento}`
              : "al ritiro chiedere un documento d'identità e scriverlo qui"}
          </p>
          {session.ritirato_da && <p className="mt-1 text-sm font-semibold text-violet-900">Ritirato da: {session.ritirato_da}</p>}
          <p className="mt-1 text-xs text-violet-700">Il nome del delegato è già sulla ricevuta, nella firma di riconsegna.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => setApri((v) => !v)}>Modifica</Button>
          <Button size="sm" variant="outline" disabled={salvo}
            onClick={() => { if (confirm("Togliere la delega al ritiro?")) salva({ delega_ritiro_nome: "" }); }}>
            Togli
          </Button>
        </div>
      </div>
      {apri && modulo}
    </div>
  );
}
