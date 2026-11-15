"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LifeBuoy,
  Calculator,
  ClipboardList,
  Users,
  UserPlus,
  Wrench,
  Apple,
  Tags,
  FileText,
  CalendarClock,
  BarChart3,
  TrendingUp,
  Settings,
  QrCode,
  Activity,
  Zap,
  LogOut,
  MessageSquare,
  BookUser,
  Sun,
  Moon,
  Menu,
  X,
  Bell,
  BellOff,
  Handshake,
  Receipt,
  ShoppingCart,
  Boxes,
  NotebookPen,
  FileSpreadsheet,
  ShieldCheck,
  UserCog,
  History,
  Smartphone,
  Truck,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Landmark,
  PhoneCall,
  PanelLeftClose,
  Pin,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { getStats } from "@/lib/chat-api";
import { useTheme } from "@/components/theme-provider";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePermessi } from "@/components/permessi";
import { paginaDelTitolare } from "@/lib/riservate";
import { SelettoreAttivita, useAttivita } from "@/components/attivita";
import { fetchAPI } from "@/lib/api";
import { aggiornaRiepilogo, iscriviRiepilogo } from "@/lib/riepilogo";

// MENU PER DIVISIONE (04/10/2026): il selettore Tarature/Apple cambia davvero ambiente.
// Ogni divisione ha il suo menu; le sezioni del negozio (fatture, cassa, spedizioni, ordini, pro forma, magazzino,
// fatturato) sono in entrambi. I permessi restano quelli di sempre: voci del titolare (lib/riservate.ts) nascoste
// all'operatore; schede di assistenza e rubrica Apple solo a chi vede le schede (titolare, o operatori dopo l'ok).
type Voce = { href: string; label: string; icon: typeof ClipboardList };

// sezioni comuni alle due divisioni (stesso ordine nei due menu)
const COMUNI: Voce[] = [
  { href: "/fatturazione", label: "Fatturazione", icon: Receipt },
  { href: "/bonifici-arrivati", label: "Bonifici arrivati", icon: Landmark },
  // buste paga (16/10/2026): tolte dal menu, ora sono nella barra in alto della Fatturazione accanto alle società
  { href: "/cassa", label: "Scontrino (registratore)", icon: ShoppingCart },
  { href: "/cassa/giornata", label: "Cassa del giorno", icon: Calculator },
  { href: "/spedizioni", label: "Spedizioni", icon: Truck },
  { href: "/telefonate", label: "Telefonate", icon: PhoneCall },
  { href: "/ordini", label: "Ordini e preventivi", icon: NotebookPen },
  { href: "/proforma", label: "Pro forma", icon: FileSpreadsheet },
  { href: "/magazzino", label: "Magazzino", icon: Boxes },
];
// amministrazione (del titolare), in fondo a entrambi i menu
const AMMINISTRAZIONE: Voce[] = [
  { href: "/autorizzazioni", label: "Autorizzazioni", icon: ShieldCheck },
  { href: "/utenti", label: "Utenti", icon: UserCog },
  { href: "/audit", label: "Registro modifiche", icon: History },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

export const MENU_TARATURE: Voce[] = [
  { href: "/", label: "Registro", icon: ClipboardList },
  { href: "/chat", label: "Chat WhatsApp tarature", icon: MessageSquare },
  { href: "/rubrica", label: "Rubrica", icon: BookUser },
  { href: "/sessioni", label: "Sessioni", icon: Wrench },
  { href: "/clienti", label: "Clienti", icon: Users },
  { href: "/nuovi-clienti", label: "Nuovi Clienti", icon: UserPlus },
  { href: "/partner", label: "Partner B2B", icon: Handshake },
  // campagna offerte (18/10/2026): invii email/WhatsApp, esiti e risposte — solo titolare (lib/riservate.ts)
  { href: "/campagna", label: "Campagna offerte", icon: Megaphone },
  { href: "/rapporti", label: "Rapporti", icon: FileText },
  ...COMUNI,
  { href: "/scadenzario", label: "Scadenzario", icon: CalendarClock },
  { href: "/automazioni", label: "Automazioni", icon: Activity },
  { href: "/enrichment", label: "Arricchimento", icon: Zap },
  { href: "/statistiche", label: "Statistiche", icon: BarChart3 },
  { href: "/statistiche/fatturato", label: "Fatturato negozio", icon: TrendingUp },
  ...AMMINISTRAZIONE.slice(0, 3),
  { href: "/qrcode", label: "QR Code", icon: QrCode },
  ...AMMINISTRAZIONE.slice(3),
];

export const MENU_APPLE: Voce[] = [
  { href: "/assistenza", label: "Schede assistenza", icon: Smartphone },
  { href: "/assistenza/ricambi-da-ordinare", label: "Ricambi da ordinare", icon: ShoppingCart },
  { href: "/assistenza/voci", label: "Voci di preventivo", icon: ListChecks },
  { href: "/assistenza/gsx", label: "GSX Apple (seriale)", icon: Apple },
  { href: "/assistenza/ricambi-gsx", label: "Ricambi GSX (costi)", icon: Wrench },
  { href: "/assistenza/prezzi-ufficiali", label: "Prezzi assistenza ufficiale", icon: Tags },
  { href: "/assistenza/magazzino-ricambi", label: "Magazzino ricambi (display, schede)", icon: Boxes },
  { href: "/", label: "Panoramica Apple", icon: LayoutDashboard },
  { href: "/rubrica-apple", label: "Rubrica clienti Apple", icon: BookUser },
  { href: "/chat-apple", label: "Chat WhatsApp Apple", icon: MessageSquare },
  // 25/10/2026: copia locale sul PC HP del negozio, per lavorare se server o internet sono giù (solo dalla rete del negozio)
  { href: "http://10.10.60.180:8090", label: "Gestionale di emergenza (PC negozio)", icon: LifeBuoy },
  ...COMUNI,
  { href: "/statistiche/fatturato", label: "Fatturato negozio", icon: TrendingUp },
  ...AMMINISTRAZIONE,
];

// voci che si vedono solo a chi vede le schede di assistenza (titolare + operatori abilitati: dal 23/10/2026 anche GSX, voci e prezzi ufficiali)
// 28/10/2026 (Christian): la Chat WhatsApp Apple la vedono tutti (come quella Tarature)
const DELLE_SCHEDE = new Set(["/assistenza", "/assistenza/voci", "/assistenza/gsx", "/assistenza/ricambi-gsx", "/assistenza/prezzi-ufficiali", "/rubrica-apple"]);
// il Magazzino ricambi (23/10/2026, Christian) lo vedono e lo modificano tutti: non è in DELLE_SCHEDE

// 15/11/2026 (piano 2.12): il menu è diviso in TRE GRUPPI con titolo (prima 25 voci in fila: «Scontrino» era la 13ª)
const NEGOZIO = new Set([...COMUNI.map((v) => v.href), "/statistiche/fatturato"]);
const AMMIN = new Set(AMMINISTRAZIONE.map((v) => v.href));
function gruppoDi(href: string, apple: boolean): string {
  if (NEGOZIO.has(href)) return "Negozio";
  if (AMMIN.has(href)) return "Amministrazione";
  if (apple) return "Schede e ricambi";
  return ["/scadenzario", "/automazioni", "/enrichment", "/statistiche", "/qrcode"].includes(href) ? "Amministrazione" : "Laboratorio tarature";
}

/** La pagina appartiene solo all'altra divisione? (serve per tornare alla home quando si cambia divisione) */
function soloDellAltra(pathname: string, menu: Voce[]): boolean {
  if (pathname === "/") return false;
  const dentro = (m: Voce[]) => m.some((v) => v.href !== "/" && (pathname === v.href || pathname.startsWith(v.href + "/")));
  return !dentro(menu);
}

export function Sidebar() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  // il drawer mobile è aperto «per» una rotta: cambiando pagina si chiude da solo (senza setState in un effect)
  const [apertoSu, setApertoSu] = useState<string | null>(null);
  const mobileOpen = apertoSu === pathname;
  const setMobileOpen = (v: boolean) => setApertoSu(v ? pathname : null);
  // 11/11/2026 (Christian): sul computer il menu si può NASCONDERE per dare tutta la pagina alla scheda; la scelta resta
  // su questo dispositivo. Nascosto, si comporta come su iPhone: pulsante ☰ in alto a sinistra che lo apre sopra la pagina.
  const [menuNascosto, setMenuNascosto] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferenza del dispositivo letta dopo l'idratazione
    try { setMenuNascosto(localStorage.getItem("gl_menu_nascosto") === "1"); } catch { /* storage non disponibile */ }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.menu = menuNascosto ? "nascosto" : "";
  }, [menuNascosto]);
  const cambiaMenu = (v: boolean) => {
    setMenuNascosto(v); setApertoSu(null);
    try { localStorage.setItem("gl_menu_nascosto", v ? "1" : "0"); } catch { /* storage non disponibile */ }
  };
  const { theme, toggleTheme } = useTheme();
  const push = usePushNotifications();
  const { admin, nInAttesa, permessi } = usePermessi();
  // finché i permessi non arrivano si mostrano solo le voci del banco (niente lampo delle voci del titolare)
  const { attivita } = useAttivita();
  // schede di assistenza Apple (02/10/2026): in prova le vede solo il titolare, gli operatori dopo l'ok di Christian
  const [assistenzaOperatori, setAssistenzaOperatori] = useState(false);
  useEffect(() => {
    if (admin || pathname === "/login" || pathname.startsWith("/login/")) return;
    fetchAPI("/api/assistenza/config").then((c: { operatori_abilitati?: boolean }) => setAssistenzaOperatori(!!c.operatori_abilitati)).catch(() => undefined);
  }, [admin, pathname]);
  const voci = (attivita === "apple" ? MENU_APPLE : MENU_TARATURE).filter((v) => (admin || !paginaDelTitolare(v.href))
    && (!DELLE_SCHEDE.has(v.href) || admin || assistenzaOperatori)
    // buste paga (16/10/2026): solo l'account del titolare, non ogni amministratore
    && (v.href !== "/buste-paga" || !!permessi?.puo?.buste_paga));
  // cambiando divisione da una pagina che nell'altra non c'è (es. Sessioni → Apple) si va alla sua home
  const router = useRouter();
  // 13/11/2026 (revisione): il selettore Tarature/Apple SEGUE LA PAGINA APERTA. Se la pagina c'è solo nel menu dell'altra
  // divisione (es. /assistenza con il selettore su Tarature, /sessioni su Apple) si passa a quella divisione, così il menu
  // laterale mostra la voce della pagina. Le pagine comuni (fatture, cassa…) e la home non cambiano nulla.
  const { setAttivita } = useAttivita();
  useEffect(() => {
    const miaVoce = (m: Voce[]) => m.some((v) => v.href !== "/" && (pathname === v.href || pathname.startsWith(v.href + "/")));
    if (attivita === "tarature" && !miaVoce(MENU_TARATURE) && miaVoce(MENU_APPLE)) setAttivita("apple");
    else if (attivita === "apple" && !miaVoce(MENU_APPLE) && miaVoce(MENU_TARATURE)) setAttivita("tarature");
  }, [pathname, attivita, setAttivita]);
  const cambiaDivisione = (a: "tarature" | "apple") => {
    if (soloDellAltra(pathname, a === "apple" ? MENU_APPLE : MENU_TARATURE)) router.push(a === "apple" ? "/assistenza" : "/");
  };
  // messaggi WhatsApp fermi perché la linea dell'attività non è ancora abbinata (es. staff Genius 334 986 7400)
  const [avvisiWa, setAvvisiWa] = useState<string[]>([]);
  useEffect(() => {
    if (pathname === "/login" || pathname.startsWith("/login/")) return;
    let annullato = false;
    fetchAPI("/api/attivita/avvisi")
      .then((r: { avvisi?: { messaggio: string }[] }) => { if (!annullato) setAvvisiWa((r.avvisi || []).map((a) => a.messaggio)); })
      .catch(() => undefined);
    return () => { annullato = true; };
  }, [pathname]);

  // 30/10/2026: numero delle NOTIFICHE DA GESTIRE aperte accanto a «Schede assistenza» (si aggiorna ogni minuto e quando cambiano)
  const [nNotifiche, setNNotifiche] = useState(0);
  const vedeSchede = admin || assistenzaOperatori;
  useEffect(() => {
    if (!vedeSchede || pathname === "/login" || pathname.startsWith("/login/")) return;
    // 15/11/2026 (B-34): conteggio dal riepilogo condiviso (una chiamata al minuto per tutti gli avvisi, niente a scheda nascosta)
    const via = iscriviRiepilogo("notifiche", (d) => setNNotifiche((d as { aperte?: number } | null)?.aperte || 0));
    const conta = () => { void aggiornaRiepilogo("notifiche"); };
    window.addEventListener("gl-notifiche", conta);
    return () => { via(); window.removeEventListener("gl-notifiche", conta); };
  }, [vedeSchede, pathname]);

  useEffect(() => {
    // messaggi non letti della chat: la chat è del titolare (l'operatore riceverebbe 403)
    if (!admin || pathname === "/login" || pathname.startsWith("/login/")) return;
    let cancelled = false;
    const fetchCount = () => {
      getStats()
        .then((r) => {
          if (!cancelled) setUnread(r.unread_count || 0);
        })
        .catch(() => undefined);
    };
    fetchCount();
    const id = setInterval(() => { if (!document.hidden) fetchCount(); }, 30_000);   // 15/11/2026 (B-34): niente a scheda nascosta
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pathname, admin]);

  // 15/11/2026 (piano 2.12): voce attiva (calcolata una volta) → aria-current, portata in vista all'apertura del menu
  const voceAttiva = voci.find((item) => pathname === item.href ||
    (item.href !== "/" && pathname.startsWith(item.href + "/") && !voci.some((o) => o.href !== item.href && o.href.startsWith(item.href) && pathname.startsWith(o.href))));
  useEffect(() => {
    if (!mobileOpen) return;
    const t = setTimeout(() => document.querySelector('#menu-principale [aria-current="page"]')?.scrollIntoView({ block: "center" }), 60);
    return () => clearTimeout(t);
  }, [mobileOpen]);
  // 15/11/2026 (piano 2.13): titolo della scheda del browser = la pagina aperta («Cassa del giorno · Genius Lab»)
  const titoloPagina = voceAttiva ? (voceAttiva.href === "/" ? (attivita === "apple" ? "Panoramica Apple" : "Registro tarature") : voceAttiva.label) : "";
  useEffect(() => {
    if (!titoloPagina) return;
    const voluto = `${titoloPagina} · Genius Lab`;
    const metti = () => { if (document.title !== voluto) document.title = voluto; };
    metti();
    // Next riscrive il <title> dei metadati dopo l'idratazione: se lo cambia, si rimette quello della pagina
    const mo = new MutationObserver(metti);
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [titoloPagina]);
  // 15/11/2026 (piano 2.14): iPhone/iPad in Safari NON installato: le notifiche push esistono solo dalla schermata Home
  const [iosNonInstallato, setIosNonInstallato] = useState(false);
  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dato del dispositivo letto dopo l'idratazione
    setIosNonInstallato(ios && !standalone);
  }, []);

  // Non mostrare la sidebar sulla pagina login
  // 13/11/2026: niente menu (né contatori) su nessuna pagina senza accesso: login, password dimenticata, reimpostazione
  if (["/login", "/forgot-password", "/reset-password"].some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  return (
    <>
      {/* 15/11/2026 (piano 2.12): su iPhone/iPad una BARRA SUPERIORE piena (prima un pulsante flottante che copriva il testo
          che scorreva sotto). Sul computer col menu nascosto resta il pulsante ☰ in alto a sinistra. */}
      <div className="print:hidden fixed inset-x-0 top-0 z-40 flex items-center gap-2 border-b border-gray-200 bg-white/95 px-2 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 lg:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3rem + env(safe-area-inset-top))" }}>
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Apri menu" aria-expanded={mobileOpen}
          className="inline-flex size-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800">
          <Menu className="w-5 h-5" />
        </button>
        <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{titoloPagina || "Genius Lab"}</span>
        <span className="ml-auto shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{attivita === "apple" ? "Apple" : "Tarature"}</span>
      </div>
      {menuNascosto && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Apri menu"
          className="print:hidden fixed top-3 left-3 z-50 hidden rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-900 lg:block"
        >
          <Menu className="w-5 h-5 text-gray-700 dark:text-gray-200" />
        </button>
      )}

      {/* Overlay scuro mobile quando aperto */}
      {mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Chiudi menu"
          className={`${menuNascosto ? "" : "lg:hidden"} print:hidden fixed inset-0 bg-black/40 z-40`}
        />
      )}

      <aside
        className={`print:hidden w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col fixed inset-y-0 left-0 z-50 transform transition-transform ${
          menuNascosto ? (mobileOpen ? "translate-x-0" : "-translate-x-full")
            : `lg:static lg:transform-none ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`
        }`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Genius Lab Gestionale</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{attivita === "apple" ? "Assistenza Mac e iPhone" : "Laboratorio tarature F-GAS"}</p>
          </div>
          <div className="flex items-center gap-1">
            {/* 11/11/2026: sul computer «nascondi menu» (più spazio alla scheda) oppure, se è nascosto, «fissa» per tenerlo sempre aperto */}
            <button
              type="button"
              onClick={() => cambiaMenu(!menuNascosto)}
              aria-label={menuNascosto ? "Tieni il menu sempre aperto" : "Nascondi il menu"}
              title={menuNascosto ? "Tieni il menu sempre aperto" : "Nascondi il menu (più spazio alla pagina)"}
              className="hidden lg:inline-flex p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              {menuNascosto ? <Pin className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Chiudi"
              className={`${menuNascosto ? "" : "lg:hidden"} p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-4 pt-4 space-y-2">
          <SelettoreAttivita onCambia={cambiaDivisione} />
          {avvisiWa.map((m) => (
            <p key={m} className="text-[11px] leading-snug text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
              {m}
            </p>
          ))}
        </div>
        {/* 13/11/2026 (revisione iPhone): su iPhone Tema / Notifiche / Esci / indirizzo non sono più un fondo fisso che
            occupava un quarto dello schermo: stanno in fondo all'elenco e scorrono con le voci. Sul computer resta come prima. */}
        <div className="flex-1 min-h-0 overflow-y-auto lg:flex lg:flex-col lg:overflow-hidden">
        <nav id="menu-principale" aria-label="Menu principale" className="p-4 space-y-1 lg:flex-1 lg:overflow-y-auto">
          {voci.map((item, i) => {
            const isActive = item === voceAttiva;
            const gruppo = gruppoDi(item.href, attivita === "apple");
            const nuovoGruppo = i === 0 || gruppoDi(voci[i - 1].href, attivita === "apple") !== gruppo;
            const Icon = item.icon;
            const showBadge = item.href === "/chat" && unread > 0;
            const badgeAut = item.href === "/autorizzazioni" && nInAttesa > 0;
            const badgeNot = item.href === "/assistenza" && nNotifiche > 0;
            return (
              <div key={item.href}>
              {nuovoGruppo && <p className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 ${i ? "pt-3" : ""}`}>{gruppo}</p>}
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                {...(item.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-semibold">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
                {badgeNot && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-semibold" title="Notifiche da gestire aperte">
                    {nNotifiche > 99 ? "99+" : nNotifiche}
                  </span>
                )}
                {badgeAut && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-semibold" title="Richieste in attesa">
                    {nInAttesa}
                  </span>
                )}
              </Link>
              </div>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            aria-label={theme === "dark" ? "Tema chiaro" : "Tema scuro"}
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {theme === "dark" ? "Tema chiaro" : "Tema scuro"}
          </button>
          {/* 15/11/2026 (piano 2.14): su iPhone in Safari il pulsante non spariva più senza spiegazione */}
          {admin && iosNonInstallato && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              🔔 Per le notifiche su iPhone: tocca <b>Condividi</b> → <b>Aggiungi alla schermata Home</b>, poi apri Genius Lab dall&apos;icona e premi «Attiva notifiche».
            </p>
          )}
          {/* le notifiche push sono quelle dei messaggi WhatsApp: solo per il titolare */}
          {admin && push.status !== "unsupported" && (
            <button
              type="button"
              onClick={() => (push.status === "subscribed" ? push.unsubscribe() : push.subscribe())}
              disabled={push.busy || push.status === "denied"}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-50"
              aria-label={push.status === "subscribed" ? "Disattiva notifiche" : "Attiva notifiche"}
              title={push.status === "denied" ? "Permesso negato dal browser" : ""}
            >
              {push.status === "subscribed" ? (
                <Bell className="w-5 h-5 text-emerald-500" />
              ) : (
                <BellOff className="w-5 h-5" />
              )}
              {push.status === "subscribed"
                ? "Notifiche attive"
                : push.status === "denied"
                  ? "Notifiche bloccate"
                  : "Attiva notifiche"}
            </button>
          )}
          <form action={logout}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Esci
            </button>
          </form>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Genius Lab s.r.l.s.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Viale Somalia, 244/246/248 — Roma</p>
          </div>
        </div>
        </div>
      </aside>
    </>
  );
}
