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
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { getStats } from "@/lib/chat-api";

const navItems = [
  { href: "/", label: "Registro", icon: ClipboardList },
  { href: "/chat", label: "Chat WhatsApp", icon: MessageSquare },
  { href: "/rubrica", label: "Rubrica", icon: BookUser },
  { href: "/sessioni", label: "Sessioni", icon: Wrench },
  { href: "/clienti", label: "Clienti", icon: Users },
  { href: "/nuovi-clienti", label: "Nuovi Clienti", icon: UserPlus },
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
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">AvaTech Tarature</h1>
        <p className="text-sm text-gray-500 mt-1">Tarature Certificazioni</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
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
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
      <div className="p-4 border-t border-gray-200 space-y-3">
        <form action={logout}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Esci
          </button>
        </form>
        <div>
          <p className="text-xs text-gray-400">AvaTech Tarature Certificazioni</p>
          <p className="text-xs text-gray-400">Viale Somalia, 246 — Roma</p>
        </div>
      </div>
    </aside>
  );
}
