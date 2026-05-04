// Pagina admin Tarature: gestione utenti app_users (admin/operator).
// Server component: fetcha la lista lato server con il JWT del cookie httpOnly.
// Il proxy Next.js (proxy.ts) gia' redirige a / se non admin.
import { headers } from "next/headers";
import { Users } from "lucide-react";
import { listUsersAction } from "./actions";
import UsersTable from "./UsersTable";

type AppUser = {
  id: string;
  email: string;
  role: "admin" | "operator";
  full_name?: string | null;
  active: boolean;
  last_login_at?: string | null;
  created_at: string;
};

export default async function UtentiPage() {
  const h = await headers();
  const currentUserId = h.get("x-user-id");

  let users: AppUser[] = [];
  let loadError: string | null = null;
  try {
    users = (await listUsersAction()) as AppUser[];
  } catch (e: unknown) {
    loadError = e instanceof Error ? e.message : "Errore caricamento";
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-600" />
          Gestione utenti
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Crea, modifica e disattiva gli account staff. Solo admin puo' accedere a questa pagina.
        </p>
      </div>

      {loadError ? (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {loadError}
        </div>
      ) : (
        <UsersTable initialUsers={users} currentUserId={currentUserId} />
      )}
    </div>
  );
}
