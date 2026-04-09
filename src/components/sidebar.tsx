"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Users,
  Wrench,
  FileText,
  CalendarClock,
  BarChart3,
  Settings,
  QrCode,
  UserPlus,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Registro", icon: ClipboardList },
  { href: "/sessioni", label: "Sessioni", icon: Wrench },
  { href: "/clienti", label: "Clienti", icon: Users },
  { href: "/nuovi-clienti", label: "Nuovi Clienti", icon: UserPlus },
  { href: "/rapporti", label: "Rapporti", icon: FileText },
  { href: "/scadenzario", label: "Scadenzario", icon: CalendarClock },
  { href: "/statistiche", label: "Statistiche", icon: BarChart3 },
  { href: "/qrcode", label: "QR Code", icon: QrCode },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

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
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-200">
        <p className="text-xs text-gray-400">AvaTech Tarature Certificazioni</p>
        <p className="text-xs text-gray-400">Viale Somalia, 246 — Roma</p>
      </div>
    </aside>
  );
}
