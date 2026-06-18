"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ClipboardList,
  Users,
  UserPlus,
  Wrench,
  FileText,
  CalendarClock,
  BarChart3,
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
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { getStats } from "@/lib/chat-api";
import { useTheme } from "@/components/theme-provider";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const navItems = [
  { href: "/", label: "Registro", icon: ClipboardList },
  { href: "/chat", label: "Chat WhatsApp", icon: MessageSquare },
  { href: "/rubrica", label: "Rubrica", icon: BookUser },
  { href: "/sessioni", label: "Sessioni", icon: Wrench },
  { href: "/clienti", label: "Clienti", icon: Users },
  { href: "/nuovi-clienti", label: "Nuovi Clienti", icon: UserPlus },
  { href: "/partner", label: "Partner B2B", icon: Handshake },
  { href: "/rapporti", label: "Rapporti", icon: FileText },
  { href: "/scadenzario", label: "Scadenzario", icon: CalendarClock },
  { href: "/automazioni", label: "Automazioni", icon: Activity },
  { href: "/enrichment", label: "Arricchimento", icon: Zap },
  { href: "/statistiche", label: "Statistiche", icon: BarChart3 },
  { href: "/qrcode", label: "QR Code", icon: QrCode },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const push = usePushNotifications();

  // Chiude il drawer mobile quando cambia rotta
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/login" || pathname.startsWith("/login/")) return;
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
  }, [pathname]);

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
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm"
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
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
        />
      )}

      <aside
        className={`w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col fixed lg:static inset-y-0 left-0 z-50 transform transition-transform lg:transform-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">AvaTech Tarature</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Tarature Certificazioni</p>
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
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            const Icon = item.icon;
            const showBadge = item.href === "/chat" && unread > 0;
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
          {push.status !== "unsupported" && (
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
            <p className="text-xs text-gray-400 dark:text-gray-500">AvaTech Tarature Certificazioni</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Viale Somalia, 246 — Roma</p>
          </div>
        </div>
      </aside>
    </>
  );
}
