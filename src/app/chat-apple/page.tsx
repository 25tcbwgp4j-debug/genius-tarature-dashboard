"use client";

// 24/10/2026 (Christian): Chat WhatsApp APPLE nel gestionale. Le conversazioni del chatbot Genius (numero WhatsApp
// del negozio collegato al bot) lette dal gestionale. Al banco il cliente inquadra il QR, scrive nome e cognome e la sua
// email: qui i dati si riconoscono da soli e con un clic diventano una RICHIESTA di assistenza (poi «Apri scheda»).

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageCircle, Search, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastErrore } from "@/lib/errori";
import { listConversations, listMessages, sendText, usaChatApple, type ChatMessage, type Conversation } from "@/lib/chat-api";
import { assRichiestaNuova } from "@/lib/assistenza";

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

  async function creaRichiesta() {
    if (!sel) return;
    const ultimi = (msgs || []).filter((m) => m.direction === "inbound" && m.body).slice(-8).map((m) => `${ora(m.created_at)} ${m.body}`).join("\n");
    try {
      const r = await assRichiestaNuova({ telefono: sel, nome: dati.nome || c?.sender_name || null, email: dati.email,
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
    <div className="flex h-[calc(100vh-2rem)] gap-3 p-3">
      <div className="flex w-80 shrink-0 flex-col rounded-xl border bg-card">
        <div className="border-b p-2">
          <div className="mb-1 flex items-center gap-2 px-1 text-sm font-semibold"><MessageCircle className="size-4" />Chat WhatsApp Apple</div>
          <div className="relative"><Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <input className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm" placeholder="Cerca nome o numero" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!conv ? <div className="p-4 text-center"><Loader2 className="inline animate-spin" /></div> : conv.map((x) => (
            <button key={x.phone_number} type="button" onClick={() => setSel(x.phone_number)}
              className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted ${sel === x.phone_number ? "bg-muted" : ""}`}>
              <div className="flex items-center gap-2"><b className="truncate">{x.sender_name || `+${x.phone_number}`}</b>
                {x.unread_count > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] text-white">{x.unread_count}</span>}
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{ora(x.last_message_at)}</span></div>
              <div className="truncate text-xs text-muted-foreground">{x.last_direction === "outbound" ? "↪ " : ""}{x.last_message_body || `[${x.last_message_type}]`}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card">
        {!sel ? <div className="m-auto text-sm text-muted-foreground">Scegli una conversazione</div> : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b p-3">
              <div><div className="font-semibold">{c?.sender_name || `+${sel}`}</div><div className="text-xs text-muted-foreground">+{sel}</div></div>
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
