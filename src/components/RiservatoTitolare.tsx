"use client";

// «Riservato al titolare» (02/10/2026): quello che vede l'operatore se apre a mano una sezione del titolare.
// GuardiaTitolare avvolge le pagine nel layout: il proxy riscrive già l'URL su /riservato al caricamento,
// questa copre anche la navigazione lato client (link vecchi, cronologia).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { usePermessi } from "@/components/permessi";
import { paginaDelTitolare } from "@/lib/riservate";

export function RiservatoTitolare() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
      <Lock className="mx-auto mb-3 h-10 w-10 text-gray-400" />
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Riservato al titolare</h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Questa sezione è visibile solo all&apos;amministratore. Se ti serve qualcosa da qui, chiedi a Christian.
      </p>
      <Link href="/" className="mt-5 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
        Torna al registro
      </Link>
    </div>
  );
}

export function GuardiaTitolare({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, caricato } = usePermessi();
  if (caricato && !admin && paginaDelTitolare(pathname)) return <RiservatoTitolare />;
  return <>{children}</>;
}
