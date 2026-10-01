"use client";

// Schede della sezione Statistiche: tarature (sessioni) e fatturato del negozio (scontrini + fatture).
import Link from "next/link";

export function TabStatistiche({ attivo }: { attivo: "tarature" | "fatturato" }) {
  const cls = (on: boolean) => `px-3 py-1.5 rounded-md text-sm font-medium ${on ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-800"}`;
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1 gap-1">
      <Link href="/statistiche" className={cls(attivo === "tarature")}>Tarature</Link>
      <Link href="/statistiche/fatturato" className={cls(attivo === "fatturato")}>Fatturato negozio</Link>
    </div>
  );
}
