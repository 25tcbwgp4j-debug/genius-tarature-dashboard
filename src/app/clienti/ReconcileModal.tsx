"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, X, Users, GitMerge, Crown, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { findDuplicateCustomers, mergeCustomers } from "@/lib/api";

interface Customer {
  id: string;
  company_name: string;
  vat_number?: string | null;
  tax_id?: string | null;
  sdi_code?: string | null;
  pec?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  province?: string | null;
  phone1?: string | null;
  mobile?: string | null;
  whatsapp_phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
}

interface DupGroup {
  reason: string;
  suggested_master_id: string;
  members: Customer[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onMerged?: () => void;
}

const MERGE_FIELDS: Array<{ key: keyof Customer; label: string }> = [
  { key: "company_name", label: "Ragione sociale" },
  { key: "vat_number", label: "P.IVA" },
  { key: "tax_id", label: "Codice fiscale" },
  { key: "sdi_code", label: "Codice SDI" },
  { key: "pec", label: "PEC" },
  { key: "address", label: "Indirizzo" },
  { key: "zip_code", label: "CAP" },
  { key: "city", label: "Citta'" },
  { key: "province", label: "Provincia" },
  { key: "phone1", label: "Tel. fisso" },
  { key: "mobile", label: "Cellulare" },
  { key: "whatsapp_phone", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "contact_person", label: "Referente" },
];

export function ReconcileModal({ open, onClose, onMerged }: Props) {
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [idx, setIdx] = useState(0);
  const [masterId, setMasterId] = useState<string | null>(null);
  // Per ogni campo, da quale member id importare il valore nel master (null = non importare)
  const [pick, setPick] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const r = await findDuplicateCustomers();
        setGroups(r.groups || []);
        setIdx(0);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Errore caricamento");
      } finally { setLoading(false); }
    })();
  }, [open]);

  const current = groups[idx];

  // Ad ogni cambio gruppo: setta il master suggerito + pre-seleziona per ogni
  // campo il member (non master) che ha valore non vuoto (preferendo quello
  // piu' completo). Il master NON viene pre-selezionato: i suoi valori sono
  // gia' presenti.
  useEffect(() => {
    if (!current) return;
    setMasterId(current.suggested_master_id);
    const initPick: Record<string, string | null> = {};
    const master = current.members.find((m) => m.id === current.suggested_master_id)!;
    for (const f of MERGE_FIELDS) {
      const masterHas = !!master[f.key];
      if (masterHas) { initPick[f.key] = null; continue; }
      // Prendi dal primo duplicato che ha il campo
      const donor = current.members.find((m) => m.id !== master.id && !!m[f.key]);
      initPick[f.key] = donor ? donor.id : null;
    }
    setPick(initPick);
  }, [current]);

  const handleChangeMaster = (newMasterId: string) => {
    if (!current) return;
    setMasterId(newMasterId);
    const master = current.members.find((m) => m.id === newMasterId)!;
    const newPick: Record<string, string | null> = {};
    for (const f of MERGE_FIELDS) {
      const masterHas = !!master[f.key];
      if (masterHas) { newPick[f.key] = null; continue; }
      const donor = current.members.find((m) => m.id !== master.id && !!m[f.key]);
      newPick[f.key] = donor ? donor.id : null;
    }
    setPick(newPick);
  };

  const handleMerge = async () => {
    if (!current || !masterId) return;
    const duplicateIds = current.members.filter((m) => m.id !== masterId).map((m) => m.id);
    if (duplicateIds.length === 0) { toast.error("Nessun duplicato"); return; }
    const fieldsToImport: Record<string, string> = {};
    for (const [field, fromId] of Object.entries(pick)) {
      if (fromId && duplicateIds.includes(fromId)) fieldsToImport[field] = fromId;
    }
    if (!confirm(
      `Unire ${duplicateIds.length} duplicat${duplicateIds.length > 1 ? "i" : "o"} nel master?\n\n` +
      `Il master assorbira' ${Object.keys(fieldsToImport).length} campi scelti + tutte le sessioni/strumenti/rapporti dei duplicati.\n` +
      `I duplicati verranno eliminati.`
    )) return;
    setMerging(true);
    try {
      const res = await mergeCustomers(masterId, duplicateIds, fieldsToImport);
      toast.success(`Uniti ${res.deleted_count} duplicati. ${res.fields_imported.length} campi importati.`);
      onMerged?.();
      // Rimuovi il gruppo processato dalla lista e passa al successivo
      const newGroups = groups.filter((_, i) => i !== idx);
      setGroups(newGroups);
      setIdx(Math.min(idx, newGroups.length - 1));
      if (newGroups.length === 0) {
        toast.info("Nessun altro duplicato trovato");
        onClose();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore merge");
    } finally { setMerging(false); }
  };

  const handleSkip = () => {
    if (idx + 1 < groups.length) setIdx(idx + 1);
    else { toast.info("Fine lista"); onClose(); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="bg-white max-w-5xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-amber-600" />
              Riconciliazione clienti duplicati
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Scan automatico per P.IVA uguale o nome normalizzato simile.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="text-center py-10">
            <Check className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="font-medium">Nessun duplicato trovato</p>
            <p className="text-xs text-gray-500">L&apos;anagrafica e&apos; pulita.</p>
          </div>
        )}

        {!loading && current && (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm flex-1">
                <div className="font-semibold text-amber-900">
                  Gruppo {idx + 1} di {groups.length} — {current.reason}
                </div>
                <div className="text-amber-700 text-xs">
                  Scegli il cliente <strong>master</strong> (quello che RESTA) e, campo per campo,
                  da quale duplicato importare eventuali dati mancanti.
                </div>
              </div>
            </div>

            {/* Tabella membri: scelta master */}
            <div className="border rounded overflow-hidden text-sm">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-2 py-2 w-12">Master</th>
                    <th className="text-left px-2 py-2">Ragione sociale</th>
                    <th className="text-left px-2 py-2">P.IVA</th>
                    <th className="text-left px-2 py-2">Email</th>
                    <th className="text-left px-2 py-2">Tel.</th>
                    <th className="text-left px-2 py-2">Citta&apos;</th>
                  </tr>
                </thead>
                <tbody>
                  {current.members.map((m) => (
                    <tr
                      key={m.id}
                      className={`border-t cursor-pointer ${m.id === masterId ? "bg-amber-50" : "hover:bg-gray-50"}`}
                      onClick={() => handleChangeMaster(m.id)}
                    >
                      <td className="px-2 py-2">
                        <input type="radio" checked={m.id === masterId} onChange={() => handleChangeMaster(m.id)} className="w-4 h-4" />
                        {m.id === current.suggested_master_id && (
                          <span title="Suggerito (piu' completo)">
                            <Crown className="w-3 h-3 inline ml-1 text-amber-500" />
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 font-medium">{m.company_name}</td>
                      <td className="px-2 py-2 text-gray-600">{m.vat_number || "—"}</td>
                      <td className="px-2 py-2 text-gray-600">{m.email || "—"}</td>
                      <td className="px-2 py-2 text-gray-600">{m.phone1 || m.mobile || "—"}</td>
                      <td className="px-2 py-2 text-gray-600">{m.city || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tabella scelta campi da importare */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Campi da importare nel master</h3>
              <div className="border rounded overflow-hidden text-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-2 py-2 w-40">Campo</th>
                      <th className="text-left px-2 py-2">Master (resta)</th>
                      {current.members
                        .filter((m) => m.id !== masterId)
                        .map((m) => (
                          <th key={m.id} className="text-left px-2 py-2">Duplicato</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MERGE_FIELDS.map((f) => {
                      const master = current.members.find((m) => m.id === masterId);
                      if (!master) return null;
                      const masterVal = master[f.key] as string | null | undefined;
                      const duplicates = current.members.filter((m) => m.id !== masterId);
                      return (
                        <tr key={f.key} className="border-t">
                          <td className="px-2 py-2 font-medium text-gray-700">{f.label}</td>
                          <td className="px-2 py-2">
                            {masterVal ? (
                              <span className="text-gray-900">{masterVal}</span>
                            ) : (
                              <span className="text-gray-300 italic">vuoto</span>
                            )}
                          </td>
                          {duplicates.map((d) => {
                            const val = d[f.key] as string | null | undefined;
                            const selected = pick[f.key] === d.id;
                            const same = !!(masterVal && val && String(masterVal).toLowerCase() === String(val).toLowerCase());
                            // Radio disabilitata SOLO se i due valori sono identici (niente da importare).
                            // Se master ha valore diverso: la radio resta cliccabile e
                            // il valore del duplicato SOVRASCRIVE il master al merge.
                            const isOverwrite = !!masterVal && !same;
                            return (
                              <td key={d.id} className="px-2 py-2">
                                {val ? (
                                  <label className="inline-flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`pick-${f.key}`}
                                      checked={selected}
                                      disabled={same}
                                      onChange={() => setPick({ ...pick, [f.key]: d.id })}
                                      className="w-3.5 h-3.5"
                                    />
                                    <span className={`text-xs ${
                                      selected ? (isOverwrite ? "font-semibold text-orange-700" : "font-semibold text-emerald-700")
                                               : same ? "text-gray-400"
                                               : isOverwrite ? "text-orange-600"
                                               : "text-gray-700"
                                    }`}>
                                      {val}
                                      {isOverwrite && <span className="ml-1 text-[10px] text-orange-500">(sovrascrive master)</span>}
                                    </span>
                                  </label>
                                ) : (
                                  <span className="text-gray-300 text-xs italic">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Il master assorbira&apos; anche automaticamente TUTTE le sessioni, strumenti, rapporti e
                proforma dei duplicati. I clienti duplicati verranno eliminati.
              </p>
            </div>

            <div className="flex justify-between items-center pt-2 border-t">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSkip} disabled={merging}>
                  Salta gruppo
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={merging}>Annulla</Button>
                <Button onClick={handleMerge} disabled={merging || !masterId} className="bg-amber-600 hover:bg-amber-700">
                  {merging ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <GitMerge className="w-4 h-4 mr-1" />}
                  Riconcilia
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
