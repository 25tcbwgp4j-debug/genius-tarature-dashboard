"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calculator,
  ClipboardList,
  Users,
  UserPlus,
  Wrench,
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
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { getStats } from "@/lib/chat-api";
import { useTheme } from "@/components/theme-provider";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePermessi } from "@/components/permessi";
import { paginaDelTitolare } from "@/lib/riservate";
import { SelettoreAttivita, useAttivita } from "@/components/attivita";
import { fetchAPI } from "@/lib/api";

// MENU PER DIVISIONE (04/10/2026): il selettore Tarature/Apple cambia davvero ambiente.
// Ogni divisione ha il suo menu; le sezioni del negozio (fatture, cassa, spedizioni, ordini, pro forma, magazzino,
// fatturato) sono in entrambi. I permessi restano quelli di sempre: voci del titolare (lib/riservate.ts) nascoste
// all'operatore; schede di assistenza e rubrica Apple solo a chi vede le schede (titolare, o operatori dopo l'ok).
type Voce = { href: string; label: string; icon: typeof ClipboardList };

// sezioni comuni alle due divisioni (stesso ordine nei due menu)
const COMUNI: Voce[] = [
  { href: "/fatturazione", label: "Fatturazione", icon: Receipt },
  { href: "/cassa", label: "Scontrino (registratore)", icon: ShoppingCart },
  { href: "/cassa/giornata", label: "Cassa del giorno", icon: Calculator },
  { href: "/spedizioni", label: "Spedizioni", icon: Truck },
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
  { href: "/", label: "Panoramica Apple", icon: LayoutDashboard },
  { href: "/rubrica-apple", label: "Rubrica clienti Apple", icon: BookUser },
  ...COMUNI,
  { href: "/statistiche/fatturato", label: "Fatturato negozio", icon: TrendingUp },
  ...AMMINISTRAZIONE,
];

// voci che si vedono solo a chi vede le schede di assistenza (in prova: solo il titolare)
const DELLE_SCHEDE = new Set(["/assistenza", "/rubrica-apple"]);

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
  const { theme, toggleTheme } = useTheme();
  const push = usePushNotifications();
  const { admin, nInAttesa } = usePermessi();
  // finché i permessi non arrivano si mostrano solo le voci del banco (niente lampo delle voci del titolare)
  const { attivita } = useAttivita();
  // schede di assistenza Apple (02/10/2026): in prova le vede solo il titolare, gli operatori dopo l'ok di Christian
  const [assistenzaOperatori, setAssistenzaOperatori] = useState(false);
  useEffect(() => {
    if (admin || pathname === "/login" || pathname.startsWith("/login/")) return;
    fetchAPI("/api/assistenza/config").then((c: { operatori_abilitati?: boolean }) => setAssistenzaOperatori(!!c.operatori_abilitati)).catch(() => undefined);
  }, [admin, pathname]);
  const voci = (attivita === "apple" ? MENU_APPLE : MENU_TARATURE).filter((v) => (admin || !paginaDelTitolare(v.href))
    && (!DELLE_SCHEDE.has(v.href) || admin || assistenzaOperatori));
  // cambiando divisione da una pagina che nell'altra non c'è (es. Sessioni → Apple) si va alla sua home
  const router = useRouter();
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
    const id = setInterval(fetchCount, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pathname, admin]);

  // Non mostrare la sidebar sulla pagina login
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return null;
  }

  return (
    <>
      {/* Hamburger mobile (visibile <lg) */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Apri menu"
        className="lg:hidden print:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Menu className="w-5 h-5 text-gray-700 dark:text-gray-200" />
      </button>

      {/* Overlay scuro mobile quando aperto */}
      {mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Chiudi menu"
          className="lg:hidden print:hidden fixed inset-0 bg-black/40 z-40"
        />
      )}

      <aside
        className={`print:hidden w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col fixed lg:static inset-y-0 left-0 z-50 transform transition-transform lg:transform-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Genius Lab Gestionale</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{attivita === "apple" ? "Assistenza Mac e iPhone" : "Laboratorio tarature F-GAS"}</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Chiudi"
            className="lg:hidden p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 pt-4 space-y-2">
          <SelettoreAttivita onCambia={cambiaDivisione} />
          {avvisiWa.map((m) => (
            <p key={m} className="text-[11px] leading-snug text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
              {m}
            </p>
          ))}
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {voci.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href + "/") && !voci.some((o) => o.href !== item.href && o.href.startsWith(item.href) && pathname.startsWith(o.href)));
            const Icon = item.icon;
            const showBadge = item.href === "/chat" && unread > 0;
            const badgeAut = item.href === "/autorizzazioni" && nInAttesa > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
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
                {badgeAut && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-semibold" title="Richieste in attesa">
                    {nInAttesa}
                  </span>
                )}
              </Link>
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
      </aside>
    </>
  );
}
