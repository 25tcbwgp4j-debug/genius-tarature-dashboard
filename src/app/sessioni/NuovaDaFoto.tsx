"use client";

// «NUOVA DA FOTO» (Christian, 15/10/2026): «dalle foto inquadri direttamente anche solo un nome dell'azienda, il
// bigliettino da visita o i dati su un foglio, e li registri o apra la sessione».
// Il pulsante grande apre SUBITO la fotocamera posteriore (iPhone/iPad); in alternativa «Scegli foto», «Incolla
// testo», «Scrivi il nome» (e dal Mac ⌘V di un'immagine). Poi l'anteprima: dati letti (incerti in giallo), cliente
// trovato («È lui» / «È un altro» / «Cliente nuovo»), sessione già aperta da riprendere (niente doppioni), e il
// tasto «Apri sessione» → scheda sessione con «Acquisisci strumenti» già pronto.
// Pulsanti ≥ 44 px, campi a 16 px (niente zoom di Safari), verticale e orizzontale.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle, Camera, Check, ClipboardPaste, Images, Loader2, PackageOpen, Play, RotateCcw, Type, UserPlus, X,
} from "lucide-react";
import { toast } from "sonner";
import { riduci } from "@/components/EstraiDati";
import {
  analizzaSessioneDaFoto, apriSessioneDaFoto,
  type CampiEstratti, type CandidatoCliente, type EsitoAnalisiDaFoto,
} from "@/lib/api";
import { etichettaSessione } from "@/lib/numeroSessione";

type Modo = "scelta" | "testo" | "nome";
type Scelta = { fonte: "cliente" | "prospect"; id: string } | "nuovo" | null;

const CAMPI: [keyof CampiEstratti, string, string][] = [
  ["denominazione", "Ragione sociale / nome", "sm:col-span-6"],
  ["piva", "Partita IVA", "sm:col-span-3"],
  ["telefono", "Telefono", "sm:col-span-3"],
  ["email", "Email", "sm:col-span-3"],
  ["pec", "PEC", "sm:col-span-3"],
  ["indirizzo", "Indirizzo", "sm:col-span-6"],
  ["comune", "Comune", "sm:col-span-3"],
  ["provincia", "Prov.", "sm:col-span-1"],
  ["sdi", "SDI", "sm:col-span-2"],
];

const STATO_SESSIONE: Record<string, string> = { attesa_strumenti: "in attesa strumenti", registrazione: "in registrazione" };
const giorno = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
};

export function NuovaDaFoto() {
  const [aperto, setAperto] = useState(false);
  const [modo, setModo] = useState<Modo>("scelta");
  const [testo, setTesto] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "analizza" | "apri">("");
  const [esito, setEsito] = useState<EsitoAnalisiDaFoto | null>(null);
  const [campi, setCampi] = useState<Partial<CampiEstratti>>({});
  const [scelta, setScelta] = useState<Scelta>(null);
  const [scartati, setScartati] = useState<string[]>([]);
  const [riprendi, setRiprendi] = useState(true);
  const [attesa, setAttesa] = useState(false);
  const [clone, setClone] = useState<{ message: string; sessionId: string } | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [touch, setTouch] = useState(true);
  useEffect(() => { setTouch(typeof navigator !== "undefined" && navigator.maxTouchPoints > 0); }, []);

  const azzera = () => {
    setModo("scelta"); setTesto(""); setFoto(null); setEsito(null); setCampi({}); setScelta(null);
    setScartati([]); setRiprendi(true); setAttesa(false); setClone(null);
  };
  const chiudi = () => { setAperto(false); azzera(); };

  const analizza = useCallback(async (body: { testo?: string; file_base64?: string }) => {
    setBusy("analizza");
    setEsito(null); setClone(null); setScartati([]);
    try {
      const r = await analizzaSessioneDaFoto(body);
      if (r.vuoto && r.candidati.length === 0) {
        toast.warning("Non ho letto dati utili: rifai la foto più da vicino o scrivi il nome");
      }
      setEsito(r);
      setCampi(r.campi);
      const migliore = r.candidati.find((c) => c.id === r.migliore);
      setScelta(migliore ? { fonte: migliore.fonte, id: migliore.id } : r.candidati.length === 0 ? "nuovo" : null);
      setRiprendi(true);
    } catch (e) {
      toast.error("Lettura non riuscita: " + (e as Error).message);
    } finally {
      setBusy("");
    }
  }, []);

  const daFile = async (f: File | Blob) => {
    setAperto(true);
    try {
      const d = await riduci(f);
      setFoto(d);
      await analizza({ file_base64: d, ...(testo.trim() ? { testo: testo.trim() } : {}) });
    } catch (e) { toast.error((e as Error).message); }
  };
  const daInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void daFile(f);
  };

  // Mac: ⌘V di un'immagine mentre il pannello è aperto
  useEffect(() => {
    if (!aperto || esito) return;
    const onPaste = (e: ClipboardEvent) => {
      const it = Array.from(e.clipboardData?.items || []).find((x) => x.type.startsWith("image/"));
      const f = it?.getAsFile();
      if (f) { e.preventDefault(); void daFile(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, esito]);

  const candidati = (esito?.candidati || []).filter((c) => !scartati.includes(c.id));
  const scelto: CandidatoCliente | null =
    scelta && scelta !== "nuovo" ? (esito?.candidati.find((c) => c.id === scelta.id) || null) : null;
  const proposta = scelto?.sessione_proposta || null;
  const incerti = new Set(esito?.incerti || []);

  const apri = async (opz: { sessionId?: string; conferma?: boolean } = {}) => {
    if (!scelta) { toast.warning("Scegli il cliente o «Cliente nuovo»"); return; }
    const sessionId = opz.sessionId ?? (proposta && riprendi ? proposta.id : undefined);
    setBusy("apri");
    try {
      const body: Parameters<typeof apriSessioneDaFoto>[0] = {
        cliente: campi, attesa_strumenti: attesa, session_id: sessionId, conferma_duplicato: !!opz.conferma,
      };
      if (scelta !== "nuovo") {
        if (scelta.fonte === "cliente") body.customer_id = scelta.id; else body.prospect_id = scelta.id;
      }
      const r = await apriSessioneDaFoto(body);
      toast.success(r.riusata ? `Ripresa la sessione ${etichettaSessione(r.session)}`
        : r.cliente_creato ? "Cliente creato e sessione aperta" : "Sessione aperta");
      window.location.assign(`/sessioni/${r.session.id}${attesa ? "" : "?acquisisci=1"}`);
    } catch (err) {
      const e = err as { status?: number; message?: string; detail?: { code?: string; message?: string; session?: { id?: string } } };
      if (e?.status === 409 && e.detail?.code === "sessione_in_attesa_strumenti" && e.detail.session?.id) {
        setClone({ message: e.detail.message || "C'è già una sessione in attesa strumenti", sessionId: e.detail.session.id });
      } else {
        toast.error(e?.message || "Apertura non riuscita");
      }
      setBusy("");
    }
  };

  const nomeCampo = (k: keyof CampiEstratti) => (incerti.has(k) ? "border-amber-400 bg-amber-50" : "border-gray-300 bg-white");

  return (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={daInput} />
      <input ref={galRef} type="file" accept="image/*" hidden onChange={daInput} />
      {/* Pulsante grande: su iPhone/iPad apre SUBITO la fotocamera (Safari vuole il gesto diretto) */}
      <Button
        onClick={() => { azzera(); setAperto(true); if (touch) camRef.current?.click(); }}
        className="h-12 w-full shrink-0 bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 sm:w-auto"
        title="Fotografa il biglietto da visita, un foglio con i dati o anche solo il nome dell'azienda: il cliente viene trovato (o creato) e la sessione si apre"
      >
        <Camera className="size-5" /> Nuova da foto
      </Button>

      <Dialog open={aperto} onOpenChange={(o) => { if (!o) chiudi(); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Nuova sessione da foto</DialogTitle>
          </DialogHeader>

          {/* 1. come si danno i dati */}
          {!esito && busy !== "analizza" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => camRef.current?.click()} className="col-span-2 h-14 bg-blue-600 text-base font-semibold text-white hover:bg-blue-700">
                  <Camera className="size-5" /> Fotografa biglietto / foglio / nome
                </Button>
                <Button variant="outline" className="h-12" onClick={() => galRef.current?.click()}>
                  <Images className="size-4" /> Scegli foto
                </Button>
                <Button variant="outline" className="h-12" onClick={() => setModo(modo === "testo" ? "scelta" : "testo")}>
                  <ClipboardPaste className="size-4" /> Incolla testo
                </Button>
                <Button variant="outline" className="col-span-2 h-12" onClick={() => setModo(modo === "nome" ? "scelta" : "nome")}>
                  <Type className="size-4" /> Scrivi il nome
                </Button>
              </div>
              {modo === "testo" && (
                <div className="space-y-2">
                  <textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={6} autoFocus
                    placeholder="Incolla qui firma mail, messaggio WhatsApp, visura…"
                    className="w-full rounded-md border border-gray-300 p-2 text-base" />
                  <Button className="h-12 w-full" disabled={!testo.trim()} onClick={() => analizza({ testo: testo.trim() })}>Leggi i dati</Button>
                </div>
              )}
              {modo === "nome" && (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (testo.trim()) void analizza({ testo: testo.trim() }); }}>
                  <input value={testo} onChange={(e) => setTesto(e.target.value)} autoFocus placeholder="Es. Termoidraulica Rossi"
                    className="h-12 min-w-0 flex-1 rounded-md border border-gray-300 px-3 text-base" />
                  <Button type="submit" className="h-12" disabled={!testo.trim()}>Cerca</Button>
                </form>
              )}
              {!touch && <p className="text-xs text-gray-500">Dal Mac puoi anche copiare un&apos;immagine e premere <kbd className="rounded bg-gray-100 px-1">⌘V</kbd>.</p>}
            </div>
          )}

          {busy === "analizza" && (
            <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              {foto && <img src={foto} alt="" className="size-16 rounded object-cover" />}
              <Loader2 className="size-5 animate-spin" /> Leggo i dati e cerco il cliente…
            </div>
          )}

          {/* 2. anteprima */}
          {esito && busy !== "analizza" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                {foto && <img src={foto} alt="" className="size-16 shrink-0 rounded object-cover" />}
                <div className="min-w-0 flex-1 text-xs text-gray-600">
                  {esito.ai.errore && <p className="text-amber-700">AI non disponibile: letti solo i dati certi.</p>}
                  {incerti.size > 0 && <p><span className="rounded bg-amber-100 px-1">in giallo</span> i dati da controllare.</p>}
                  {esito.avvisi.map((a) => <p key={a} className="text-amber-800">{a}</p>)}
                </div>
                <Button variant="ghost" className="h-11 shrink-0" onClick={azzera} title="Rifai">
                  <RotateCcw className="size-4" /> Rifai
                </Button>
              </div>

              {/* Cliente trovato */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Cliente</h3>
                {candidati.length === 0 && scelta !== "nuovo" && (
                  <p className="text-sm text-gray-600">Nessun cliente corrispondente.</p>
                )}
                {candidati.map((c) => {
                  const sel = scelta !== "nuovo" && scelta?.id === c.id;
                  return (
                    <div key={`${c.fonte}-${c.id}`} className={`rounded-lg border p-2.5 ${sel ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400" : "border-gray-200"}`}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 font-medium">
                            <span className="break-words">{c.nome}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] ${c.fonte === "cliente" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                              {c.fonte === "cliente" ? "In rubrica" : "F-GAS"}
                            </span>
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">{c.punteggio}%</span>
                          </p>
                          <p className="break-words text-xs text-gray-500">
                            {[c.piva && `P.IVA ${c.piva}`, c.citta && `${c.citta}${c.provincia ? ` (${c.provincia})` : ""}`, c.telefono].filter(Boolean).join(" · ")}
                          </p>
                          <p className="text-xs text-emerald-800">{c.motivi.join(" · ")}</p>
                          {c.sessioni_aperte.length > 0 && (
                            <p className="text-xs text-orange-800">
                              Sessioni aperte: {c.sessioni_aperte.map((s) => `${etichettaSessione(s) || "?"} ${STATO_SESSIONE[s.status] || s.status} dal ${giorno(s.created_at)}`).join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Button className={`h-11 ${sel ? "bg-emerald-600 hover:bg-emerald-700" : ""}`} variant={sel ? "default" : "outline"}
                          onClick={() => setScelta({ fonte: c.fonte, id: c.id })}>
                          <Check className="size-4" /> È lui
                        </Button>
                        <Button variant="outline" className="h-11" onClick={() => {
                          setScartati((s) => [...s, c.id]);
                          if (sel) setScelta(null);
                        }}>
                          <X className="size-4" /> È un altro
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <Button variant={scelta === "nuovo" ? "default" : "outline"}
                  className={`h-11 w-full ${scelta === "nuovo" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                  onClick={() => setScelta("nuovo")}>
                  <UserPlus className="size-4" /> Cliente nuovo{scelta === "nuovo" ? " (con i dati qui sotto)" : ""}
                </Button>
              </section>

              {/* Dati letti: modificabili, usati per il cliente nuovo e per completare i campi vuoti di quello trovato */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Dati letti {scelta && scelta !== "nuovo" && <span className="font-normal text-gray-500">(completano solo i campi vuoti del cliente)</span>}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  {CAMPI.map(([k, et, col]) => (
                    <label key={k} className={`col-span-2 block ${col}`}>
                      <span className="text-xs text-gray-600">{et}</span>
                      <input value={(campi[k] as string) || ""} onChange={(e) => setCampi((c) => ({ ...c, [k]: e.target.value }))}
                        className={`h-11 w-full rounded-md border px-2 text-base ${nomeCampo(k)}`} />
                    </label>
                  ))}
                </div>
              </section>

              {/* Sessione già aperta: si riprende quella */}
              {proposta && (
                <section className="space-y-2 rounded-lg border border-orange-300 bg-orange-50 p-2.5">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-orange-900">
                    <AlertTriangle className="size-4" /> Sessione già aperta: {etichettaSessione(proposta)} {STATO_SESSIONE[proposta.status] || proposta.status} dal {giorno(proposta.created_at)}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button variant={riprendi ? "default" : "outline"} className={`h-11 ${riprendi ? "bg-orange-600 hover:bg-orange-700" : "bg-white"}`} onClick={() => setRiprendi(true)}>
                      Riprendi la {etichettaSessione(proposta)}
                    </Button>
                    <Button variant={!riprendi ? "default" : "outline"} className="h-11" onClick={() => setRiprendi(false)}>
                      Apri una sessione nuova
                    </Button>
                  </div>
                </section>
              )}

              {/* Strumenti al banco o in arrivo */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant={!attesa ? "default" : "outline"} className={`h-11 ${!attesa ? "bg-blue-600 hover:bg-blue-700" : ""}`} onClick={() => setAttesa(false)}>
                  <Camera className="size-4" /> Strumenti qui
                </Button>
                <Button variant={attesa ? "default" : "outline"} className={`h-11 ${attesa ? "bg-orange-600 hover:bg-orange-700" : "border-orange-300 text-orange-800"}`} onClick={() => setAttesa(true)}>
                  <PackageOpen className="size-4" /> In attesa
                </Button>
              </div>

              {clone ? (
                <div className="space-y-2 rounded-lg border border-orange-400 bg-orange-50 p-2.5 text-sm text-orange-900">
                  <p>{clone.message}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button className="h-11 bg-orange-600 hover:bg-orange-700" disabled={!!busy} onClick={() => apri({ sessionId: clone.sessionId })}>Riprendi quella</Button>
                    <Button variant="outline" className="h-11 bg-white" disabled={!!busy} onClick={() => apri({ conferma: true })}>Crea comunque una nuova</Button>
                  </div>
                </div>
              ) : (
                <Button className="h-14 w-full bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
                  disabled={!scelta || !!busy} onClick={() => apri()}>
                  {busy === "apri" ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
                  {proposta && riprendi ? `Riprendi sessione ${etichettaSessione(proposta)}` : "Apri sessione"}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
