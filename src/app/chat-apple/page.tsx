"use client";

// 24/10/2026 (Christian): Chat WhatsApp APPLE nel gestionale. Le conversazioni del chatbot Genius (numero WhatsApp
// del negozio collegato al bot) lette dal gestionale. Al banco il cliente inquadra il QR, scrive nome e cognome e la sua
// email: qui i dati si riconoscono da soli e con un clic diventano una RICHIESTA di assistenza (poi «Apri scheda»).

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FilePlus2, Loader2, MessageCircle, Search, Send, Sparkles, UserPlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { listConversations, listMessages, sendText, usaChatApple, type ChatMessage, type Conversation } from "@/lib/chat-api";
import { assNomiNumeri, assRichiestaNuova, assStaffConversazioni, assStaffInviaProposta, assStaffMessaggi, assStaffProposte, assStaffScartaProposta, type NomeNumero, type StaffConv, type StaffMsg, type StaffProposta } from "@/lib/assistenza";
import { usePermessi } from "@/components/permessi";
import { SceltaOperatore, useOperatore } from "@/components/Operatore";
import { COLORE_STATO, ETICHETTA_STATO, assSchedaCliente, assStaffChatDelNumero, assStaffConfermaEsito, assStaffContesto, assStaffEstrai,
  type Anagrafica, type StaffContesto, type StaffDati } from "@/lib/assistenza";
import { SchedaClienteModal } from "@/app/assistenza/scheda/Cliente";
import { NuovaScheda } from "@/app/assistenza/scheda/NuovaScheda";

/** nomi dei numeri (gestionale o rubrica 334), caricati per l'elenco visibile */
function useNomi(telefoni: string[]) {
  const [nomi, setNomi] = useState<Record<string, NomeNumero>>({});
  const chiave = telefoni.join(",");
  useEffect(() => { if (telefoni.length) assNomiNumeri(telefoni).then((r) => setNomi(r.nomi)).catch(() => undefined); }, [chiave]); // eslint-disable-line react-hooks/exhaustive-deps
  return (tel: string | null | undefined) => {
    const d = String(tel || "").replace(/\D/g, "");
    return nomi[d.length === 10 && d.startsWith("3") ? `39${d}` : d];
  };
}
function Etichetta({ n }: { n?: NomeNumero }) {
  if (!n) return null;
  return <span className={`shrink-0 rounded px-1 text-[10px] ${n.fonte === "gestionale" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>{n.fonte === "gestionale" ? "cliente" : "rubrica 334"}</span>;
}

const RE_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

/** Nome ed email scritti dal cliente: la prima riga «solo parole» (2-4 parole, lettere) e la prima email. */
function datiCliente(msgs: ChatMessage[]): { nome: string | null; email: string | null } {
  let nome: string | null = null, email: string | null = null;
  for (const m of msgs) {
    if (m.direction !== "inbound" || !m.body) continue;
    const b = m.body.trim();
    if (!email) { const e = b.match(RE_EMAIL); if (e) email = e[0].toLowerCase(); }
    if (!nome && /^[A-Za-zÀ-ÿ'’ ]{4,60}$/.test(b) && b.split(/\s+/).length >= 2 && b.split(/\s+/).length <= 4
      && !/ciao|salve|buongiorno|buonasera|grazie|info|prezzo|riparazione/i.test(b)) nome = b.replace(/\s+/g, " ");
  }
  return { nome, email };
}

const ora = (s: string) => new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ChatApple() {
  // 24/10/2026: due linee — il chatbot (si risponde da qui) e lo STAFF 334 (sola lettura: si invia solo su comando)
  const [linea, setLinea] = useState<"chatbot" | "staff">(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "staff" ? "staff" : "chatbot"));
  return (
    <div className="space-y-2 p-3">
      <div className="flex gap-1">
        {([["chatbot", "Chatbot WhatsApp"], ["staff", "Staff 334 986 7400"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setLinea(k)} className={`rounded-lg border px-3 py-1.5 text-sm ${linea === k ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}>{l}</button>
        ))}
      </div>
      {linea === "chatbot" ? <ChatChatbot /> : <ChatStaff />}
    </div>
  );
}

function ChatStaff() {
  const [conv, setConv] = useState<StaffConv[] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<StaffMsg[] | null>(null);
  useEffect(() => { const f = () => assStaffConversazioni(q).then((r) => setConv(r.conversazioni)).catch(toastErrore); f(); const t = setInterval(f, 15000); return () => clearInterval(t); }, [q]);
  useEffect(() => { if (sel) { setMsgs(null); assStaffMessaggi(sel).then((r) => setMsgs(r.messaggi)).catch(toastErrore); } }, [sel]);
  // 25/10/2026: aperta dalla scheda di assistenza («Chat WhatsApp») → si seleziona la chat di quel numero
  useEffect(() => {
    const tel = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tel") : null;
    if (tel) assStaffChatDelNumero(tel).then((r) => { if (r.chat[0]) setSel(r.chat[0]); else toast.message(`Nessuna chat sul 334 con il numero ${tel}`); }).catch(() => {});
  }, []);
  // 25/10/2026: risposte proposte dalla verifica periodica (ogni 10 minuti): chi aspetta va in cima
  const [proposte, setProposte] = useState<StaffProposta[]>([]);
  const caricaProposte = () => assStaffProposte().then((r) => setProposte(r.proposte)).catch(() => {});
  useEffect(() => { caricaProposte(); const t = setInterval(caricaProposte, 15000); return () => clearInterval(t); }, []);
  const propDi = (chat: string) => proposte.find((p) => p.chat_id === chat);
  const ordinate = useMemo(() => [...(conv || [])].sort((a, b) => Number(!!propDi(b.chat_id)) - Number(!!propDi(a.chat_id))), [conv, proposte]);
  const c = conv?.find((x) => x.chat_id === sel) || null;
  const dati = useMemo(() => datiCliente((msgs || []).map((m) => ({ direction: m.da_noi ? "outbound" : "inbound", body: m.testo } as ChatMessage))), [msgs]);
  const nomeDi = useNomi((conv || []).map((x) => x.telefono || ""));
  async function creaRichiesta() {
    if (!c) return;
    const ultimi = (msgs || []).filter((m) => !m.da_noi && m.testo).slice(-8).map((m) => `${m.inviato_il ? ora(m.inviato_il) : ""} ${m.testo}`).join("\n");
    try {
      const r = await assRichiestaNuova({ telefono: c.telefono, nome: dati.nome || c.nome, email: dati.email, conversazione: ultimi, origine: "whatsapp_staff" });
      toast.success(`Richiesta R-${String(r.id).slice(0, 6).toUpperCase()} creata: la trovi in «Schede assistenza» → «Richieste da WhatsApp»`);
    } catch (e) { toastErrore(e); }
  }
  return (
    <div className="flex h-[calc(100vh-5rem)] gap-3">
      {/* 26/10/2026: su telefono (app iPhone) si vede o l'elenco o la conversazione, a tutto schermo */}
      <div className={`${sel ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col rounded-xl border bg-card md:w-80`}>
        <div className="border-b p-2">
          <div className="mb-1 px-1 text-xs text-muted-foreground">Storico recuperato il 26/10: rivenditori ultimi 2 mesi, altri clienti ultimo mese; poi tutto in diretta. In cima chi aspetta risposta.</div>
          <input className="h-9 w-full rounded-md border bg-background px-2 text-sm" placeholder="Cerca nome o numero" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {!conv ? <div className="p-4 text-center"><Loader2 className="inline animate-spin" /></div> : !conv.length ? <div className="p-4 text-sm text-muted-foreground">Ancora nessun messaggio.</div> : ordinate.map((x) => (
            <button key={x.chat_id} type="button" onClick={() => setSel(x.chat_id)} className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted ${sel === x.chat_id ? "bg-muted" : ""}`}>
              <div className="flex items-center gap-2"><b className="truncate">{nomeDi(x.telefono)?.nome || x.nome || `+${x.telefono}`}</b><Etichetta n={nomeDi(x.telefono)} /><span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{x.ultimo.inviato_il ? ora(x.ultimo.inviato_il) : ""}</span></div>
              <div className="truncate text-xs text-muted-foreground">{x.ultimo.da_noi ? "↪ " : ""}{x.ultimo.testo || `[${x.ultimo.tipo}]`}</div>
              {propDi(x.chat_id) && <div className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">💬 Aspetta risposta · proposta pronta</div>}
            </button>
          ))}
        </div>
      </div>
      <div className={`${sel ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col rounded-xl border bg-card`}>
        {!c ? <div className="m-auto text-sm text-muted-foreground">Scegli una conversazione</div> : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b p-3">
              <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setSel(null)}>← Chat</Button>
              <div><div className="font-semibold">{c.nome || `+${c.telefono}`}</div><div className="text-xs text-muted-foreground">+{c.telefono}</div></div>
              <div className="rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">
                <div><span className="text-muted-foreground">Nome:</span> <b>{dati.nome || c.nome || "—"}</b></div>
                <div><span className="text-muted-foreground">Email:</span> <b>{dati.email || "—"}</b></div>
              </div>
              <Button size="sm" className="ml-auto" onClick={creaRichiesta}><UserPlus />Crea richiesta di assistenza</Button>
            </div>
            <PannelloCliente key={c.chat_id} chat={c.chat_id} nomeChat={dati.nome || c.nome} emailChat={dati.email} />
            <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
              {!msgs ? <div className="text-center"><Loader2 className="inline animate-spin" /></div> : msgs.map((m) => (
                <div key={m.id} className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${m.da_noi ? "ml-auto bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted"}`}>
                  {m.testo ? <div className="whitespace-pre-line break-words">{m.testo}</div> : <div className="italic text-muted-foreground">[{m.tipo}]</div>}
                  <div className="mt-0.5 text-right text-[10px] text-muted-foreground">{m.inviato_il ? ora(m.inviato_il) : ""}</div>
                </div>
              ))}
            </div>
            {propDi(c.chat_id) ? <RispostaProposta key={propDi(c.chat_id)!.id} p={propDi(c.chat_id)!} fatto={() => { caricaProposte(); assStaffMessaggi(c.chat_id).then((r) => setMsgs(r.messaggi)).catch(() => {}); }} />
              : <div className="border-t p-2 text-xs text-muted-foreground">Nessuna risposta in sospeso. Dal telefono del negozio si risponde come sempre; il gestionale propone una risposta a chi aspetta da qualche minuto.</div>}
          </>
        )}
      </div>
    </div>
  );
}

/** 25/10/2026 (Christian): dalla chat WhatsApp 334 → cliente in rubrica e scheda di assistenza, con i dati scritti dal cliente.
 *  Mostra le schede del numero e le risposte ai preventivi da confermare (accetta / rifiuta lette dalla chat). */
function PannelloCliente({ chat, nomeChat, emailChat }: { chat: string; nomeChat: string | null; emailChat: string | null }) {
  const [ctx, setCtx] = useState<StaffContesto | null>(null);
  const [dati, setDati] = useState<StaffDati | null>(null);
  const [leggo, setLeggo] = useState(false);
  const [modale, setModale] = useState<null | "cliente" | "scheda">(null);
  const [anag, setAnag] = useState<Anagrafica | null>(null);
  const [operatore, setOperatore] = useOperatore();
  const carica = () => assStaffContesto(chat).then(setCtx).catch(toastErrore);
  useEffect(() => { carica(); }, [chat]); // eslint-disable-line react-hooks/exhaustive-deps
  const cliente = ctx?.clienti.length === 1 ? ctx.clienti[0] : null;
  async function leggi(): Promise<StaffDati | null> {
    if (dati) return dati;
    setLeggo(true);
    try { const r = await assStaffEstrai(chat); setDati(r.dati); return r.dati; } catch (e) { toastErrore(e); return null; } finally { setLeggo(false); }
  }
  const nomeDa = (d: StaffDati | null) => d?.azienda || [d?.nome, d?.cognome].filter(Boolean).join(" ") || nomeChat || "";
  const caricaAnag = async () => (cliente ? ((await assSchedaCliente(cliente.id).catch(() => null)) as Anagrafica | null) : null);
  async function apriCliente() {
    if (!cliente) await leggi();
    setAnag(await caricaAnag());
    setModale("cliente");
  }
  async function apriScheda() {
    const d = await leggi();
    setAnag(await caricaAnag());
    if (d || cliente) setModale("scheda");
  }
  async function conferma(eid: string, b: { esito?: string; ipotesi?: number; ignora?: boolean }) {
    if (!b.ignora && !operatore) { toast.error("Scegli l'operatore"); return; }
    try { const r = await assStaffConfermaEsito(eid, { ...b, operatore }); toast.success(r.descrizione || "Fatto"); carica(); } catch (e) { toastErrore(e); }
  }
  const tel = ctx?.telefono || "";
  return (
    <div className="space-y-2 border-b bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Numero:</span><b>{tel ? `+${tel}` : "—"}</b>
        {cliente ? <Button size="sm" variant="outline" onClick={apriCliente}><UserRound />{cliente.denominazione}</Button>
          : <Button size="sm" variant="outline" disabled={leggo} onClick={apriCliente}>{leggo ? <Loader2 className="animate-spin" /> : <UserPlus />}Crea cliente</Button>}
        <Button size="sm" disabled={leggo} onClick={apriScheda}>{leggo ? <Loader2 className="animate-spin" /> : <FilePlus2 />}Crea scheda di assistenza</Button>
        <Button size="sm" variant="ghost" disabled={leggo} onClick={() => { setDati(null); setLeggo(true); assStaffEstrai(chat).then((r) => setDati(r.dati)).catch(toastErrore).finally(() => setLeggo(false)); }}>
          <Sparkles />Leggi i dati dai messaggi</Button>
        {ctx && ctx.clienti.length > 1 && <span className="text-xs text-amber-700">Numero presente in {ctx.clienti.length} clienti: {ctx.clienti.map((x) => x.denominazione).join(" · ")}</span>}
      </div>
      {dati && <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {Object.entries(dati).filter(([, v]) => v).map(([k, v]) => <span key={k}><span className="opacity-70">{k.replaceAll("_", " ")}:</span> <b className="text-foreground">{v}</b></span>)}
      </div>}
      {!!ctx?.schede.length && <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Schede di questo numero:</span>
        {ctx.schede.map((x) => <a key={x.id} href={`/assistenza?id=${x.id}`} className={`rounded-md border px-2 py-0.5 text-xs ${COLORE_STATO[x.stato] || ""}`}>
          <b>{x.sigla || x.numero}</b> · {x.prodotto || x.modello || ""} · {ETICHETTA_STATO[x.stato] || x.stato}</a>)}
      </div>}
      {ctx?.esiti_da_confermare.map((e) => {
        const sch = ctx.schede.find((x) => x.id === e.scheda_id);
        return (
          <div key={e.id} className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:bg-amber-950/30">
            <div className="text-xs"><b>Scheda {sch?.sigla || ""}: il cliente forse {e.esito === "accettato" ? "ACCETTA" : "RIFIUTA"} il preventivo</b> — «{(e.testo || "").slice(-200)}»
              {e.motivo && <span className="text-muted-foreground"> ({e.motivo})</span>}</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <SceltaOperatore value={operatore} onChange={setOperatore} compatto />
              {e.esito === "accettato" ? <>
                {(e.ipotesi || (e.n_ipotesi || 0) <= 1) && <Button size="sm" onClick={() => conferma(e.id, { esito: "accettato", ...(e.ipotesi ? { ipotesi: e.ipotesi } : {}) })}>Sì, accetta{e.ipotesi ? ` la ${e.ipotesi}ª ipotesi` : ""}</Button>}
                {(e.n_ipotesi || 0) > 1 && Array.from({ length: e.n_ipotesi || 0 }, (_, i) => i + 1).filter((n) => n !== e.ipotesi).map((n) =>
                  <Button key={n} size="sm" variant="outline" onClick={() => conferma(e.id, { esito: "accettato", ipotesi: n })}>Accetta la {n}ª</Button>)}
              </> : <Button size="sm" variant="destructive" onClick={() => conferma(e.id, { esito: "rifiutato" })}>Sì, rifiuta</Button>}
              <Button size="sm" variant="ghost" onClick={() => conferma(e.id, { ignora: true })}>Non è una risposta al preventivo</Button>
            </div>
          </div>
        );
      })}
      {modale === "cliente" && <SchedaClienteModal id={cliente?.id || null} onClose={() => setModale(null)}
        iniziale={cliente ? undefined : {
          denominazione: nomeDa(dati), tipo_cliente: dati?.piva ? "azienda" : "privato", vuole_fattura: !!dati?.piva,
          cellulare: tel, cellulare_whatsapp: tel, email: dati?.email || emailChat || "", pec: dati?.pec || "", piva: dati?.piva || "", cf: dati?.cf || "",
          sdi: dati?.sdi || "", indirizzo: dati?.indirizzo || "", cap: dati?.cap || "", comune: dati?.comune || "", provincia: dati?.provincia || "",
          referente: dati?.azienda ? [dati?.nome, dati?.cognome].filter(Boolean).join(" ") : "", telefoni_altri: dati?.telefono_altro || "" } as Partial<Anagrafica>}
        onSalvato={() => { toast.success("Cliente salvato: il numero WhatsApp è in rubrica"); setModale(null); carica(); }} />}
      {modale === "scheda" && <NuovaScheda cfg={null} operatore={operatore} setOperatore={setOperatore} onClose={() => setModale(null)}
        iniziale={{ azienda: anag?.denominazione || nomeDa(dati), telefono: tel, email: anag?.email || dati?.email || emailChat || "", anagrafica: anag,
          prodotto: [dati?.prodotto, dati?.modello].filter(Boolean).join(" ") || undefined, seriale: dati?.seriale || dati?.imei || undefined,
          difetto: dati?.difetto || undefined, note: [dati?.accessori && `Accessori: ${dati.accessori}`, dati?.note].filter(Boolean).join(" · ") || undefined }}
        onCreata={() => { toast.success("Scheda creata"); setModale(null); carica(); }} />}
    </div>
  );
}

/** Risposta proposta dalla verifica periodica: il titolare la corregge e la manda dal 334 (gli altri vedono il testo). */
function RispostaProposta({ p, fatto }: { p: StaffProposta; fatto: () => void }) {
  const { admin } = usePermessi();
  const [testo, setTesto] = useState(p.proposta || "");
  const [busy, setBusy] = useState(false);
  async function invia() {
    setBusy(true);
    try { const r = await assStaffInviaProposta(p.id, testo); toast.success(r.messaggio); fatto(); } catch (e) { toastErrore(e); } finally { setBusy(false); }
  }
  async function scarta() {
    try { await assStaffScartaProposta(p.id); toast.success("Proposta scartata"); fatto(); } catch (e) { toastErrore(e); }
  }
  return (
    <div className="space-y-2 border-t bg-amber-50/60 p-3 dark:bg-amber-950/20">
      <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">💬 Risposta proposta (controlla prezzi e disponibilità prima di inviare)</div>
      <textarea className="min-h-28 w-full rounded-md border bg-background p-2 text-sm" value={testo} onChange={(e) => setTesto(e.target.value)} readOnly={!admin} />
      <div className="flex flex-wrap items-center gap-2">
        {admin ? <Button size="sm" disabled={busy || !testo.trim()} onClick={invia}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Invia dal 334</Button>
          : <span className="text-xs text-muted-foreground">Sul 334 invia solo il titolare: copia il testo e rispondi dal telefono del negozio.</span>}
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(testo); toast.success("Testo copiato"); }}>Copia testo</Button>
        {admin && <Button size="sm" variant="ghost" onClick={scarta}>Scarta</Button>}
      </div>
    </div>
  );
}

function ChatChatbot() {
  usaChatApple(true);
  const [conv, setConv] = useState<Conversation[] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [testo, setTesto] = useState("");
  const [busy, setBusy] = useState(false);

  const caricaConv = () => listConversations({ search: q || undefined }).then((r) => setConv(r.conversations)).catch(toastErrore);
  useEffect(() => { caricaConv(); const t = setInterval(caricaConv, 15000); return () => clearInterval(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sel) return;
    setMsgs(null);
    listMessages(sel).then((r) => setMsgs([...r.messages].sort((a, b) => a.created_at.localeCompare(b.created_at)))).catch(toastErrore);
  }, [sel]);
  const c = conv?.find((x) => x.phone_number === sel) || null;
  const dati = useMemo(() => datiCliente(msgs || []), [msgs]);
  const nomeDi = useNomi((conv || []).map((x) => x.phone_number));

  async function creaRichiesta() {
    if (!sel) return;
    const ultimi = (msgs || []).filter((m) => m.direction === "inbound" && m.body).slice(-8).map((m) => `${ora(m.created_at)} ${m.body}`).join("\n");
    try {
      const r = await assRichiestaNuova({ telefono: sel, nome: dati.nome || nomeDi(sel)?.nome || c?.sender_name || null, email: dati.email,
        problema: null, conversazione: ultimi, origine: "whatsapp_staff" });
      toast.success(`Richiesta R-${String(r.id).slice(0, 6).toUpperCase()} creata: la trovi in «Schede assistenza» → «Richieste da WhatsApp»`);
    } catch (e) { toastErrore(e); }
  }
  async function invia() {
    if (!sel || !testo.trim()) return;
    setBusy(true);
    try { await sendText({ phone: sel, text: testo.trim() }); setTesto(""); const r = await listMessages(sel); setMsgs([...r.messages].sort((a, b) => a.created_at.localeCompare(b.created_at))); }
    catch (e) { toastErrore(e); } finally { setBusy(false); }
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-3">
      {/* 26/10/2026: su telefono (app iPhone) si vede o l'elenco o la conversazione, a tutto schermo */}
      <div className={`${sel ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col rounded-xl border bg-card md:w-80`}>
        <div className="border-b p-2">
          <div className="mb-1 flex items-center gap-2 px-1 text-sm font-semibold"><MessageCircle className="size-4" />Chat WhatsApp Apple</div>
          <div className="relative"><Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <input className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm" placeholder="Cerca nome o numero" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!conv ? <div className="p-4 text-center"><Loader2 className="inline animate-spin" /></div> : conv.map((x) => (
            <button key={x.phone_number} type="button" onClick={() => setSel(x.phone_number)}
              className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted ${sel === x.phone_number ? "bg-muted" : ""}`}>
              <div className="flex items-center gap-2"><b className="truncate">{nomeDi(x.phone_number)?.nome || x.sender_name || `+${x.phone_number}`}</b><Etichetta n={nomeDi(x.phone_number)} />
                {x.unread_count > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] text-white">{x.unread_count}</span>}
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{ora(x.last_message_at)}</span></div>
              <div className="truncate text-xs text-muted-foreground">{x.last_direction === "outbound" ? "↪ " : ""}{x.last_message_body || `[${x.last_message_type}]`}</div>
            </button>
          ))}
        </div>
      </div>
      <div className={`${sel ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col rounded-xl border bg-card`}>
        {!sel ? <div className="m-auto text-sm text-muted-foreground">Scegli una conversazione</div> : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b p-3">
              <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setSel(null)}>← Chat</Button>
              <div><div className="font-semibold">{nomeDi(sel)?.nome || c?.sender_name || `+${sel}`}</div><div className="text-xs text-muted-foreground">+{sel}{nomeDi(sel)?.rubrica_334 && nomeDi(sel)?.fonte === "gestionale" ? ` · in rubrica 334: ${nomeDi(sel)?.rubrica_334}` : ""}</div></div>
              {/* dati riconosciuti dai messaggi del cliente (QR → nome e cognome → email) */}
              <div className="rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">
                <div><span className="text-muted-foreground">Nome:</span> <b>{dati.nome || c?.sender_name || "—"}</b></div>
                <div><span className="text-muted-foreground">Email:</span> <b>{dati.email || "—"}</b></div>
              </div>
              <span className="ml-auto flex gap-1.5">
                <Button size="sm" onClick={creaRichiesta}><UserPlus />Crea richiesta di assistenza</Button>
                <Button size="sm" variant="outline" onClick={() => window.open(`/rubrica-apple?q=${encodeURIComponent(sel.slice(-9))}`, "_blank")}>Cerca in rubrica</Button>
              </span>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
              {!msgs ? <div className="text-center"><Loader2 className="inline animate-spin" /></div> : msgs.map((m) => (
                <div key={m.id} className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${m.direction === "outbound" ? "ml-auto bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted"}`}>
                  {m.body ? <div className="whitespace-pre-line break-words">{m.body}</div> : <div className="italic text-muted-foreground">[{m.message_type}]</div>}
                  {m.media_url && <a className="text-xs text-blue-700 underline" href={m.media_url} target="_blank" rel="noreferrer">{m.media_filename || "allegato"}</a>}
                  <div className="mt-0.5 text-right text-[10px] text-muted-foreground">{ora(m.created_at)}{m.operator_email ? ` · ${m.operator_email}` : ""}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t p-2">
              <textarea className="min-h-10 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm" rows={2} placeholder="Rispondi dal numero WhatsApp del negozio (chatbot)" value={testo}
                onChange={(e) => setTesto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) invia(); }} />
              <Button disabled={busy || !testo.trim()} onClick={invia}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Invia</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
