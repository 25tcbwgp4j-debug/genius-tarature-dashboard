"use client";

import { useState, useTransition } from "react";
import { Power, Shield, KeyRound, Plus, User as UserIcon } from "lucide-react";
import {
  changeRoleAction,
  createUserAction,
  resetPasswordAction,
  toggleActiveAction,
} from "./actions";

type AppUser = {
  id: string;
  email: string;
  role: "admin" | "operator";
  full_name?: string | null;
  active: boolean;
  last_login_at?: string | null;
  created_at: string;
};

export default function UsersTable({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AppUser[];
  currentUserId: string | null;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onCreate = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await createUserAction(formData);
        setShowCreate(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Errore");
      }
    });
  };

  const onToggle = (id: string, active: boolean) => {
    setError(null);
    startTransition(async () => {
      try {
        await toggleActiveAction(id, active);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Errore");
      }
    });
  };

  const onChangeRole = (id: string, role: "admin" | "operator") => {
    setError(null);
    startTransition(async () => {
      try {
        await changeRoleAction(id, role);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Errore");
      }
    });
  };

  const onReset = (id: string, email: string) => {
    const newPwd = prompt(`Nuova password per ${email} (min 8 caratteri):`);
    if (!newPwd || newPwd.length < 8) {
      setError("Password deve avere almeno 8 caratteri");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await resetPasswordAction(id, newPwd);
        alert(`Password aggiornata per ${email}`);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Errore");
      }
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {initialUsers.length} utente{initialUsers.length === 1 ? "" : "i"} configurati
        </p>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          Nuovo utente
        </button>
      </div>

      {showCreate && (
        <form
          action={onCreate}
          className="bg-white border border-gray-200 rounded-xl p-5 space-y-3"
        >
          <h3 className="font-semibold text-gray-900">Nuovo utente</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              name="email"
              type="email"
              required
              placeholder="email@esempio.it"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              name="full_name"
              type="text"
              placeholder="Nome completo (opzionale)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Password (min 8 caratteri)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              name="role"
              defaultValue="operator"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="operator">Operatore (no DELETE)</option>
              <option value="admin">Admin (tutto)</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? "Creazione..." : "Crea utente"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Utente</th>
              <th className="px-4 py-3 font-medium">Ruolo</th>
              <th className="px-4 py-3 font-medium">Stato</th>
              <th className="px-4 py-3 font-medium">Ultimo login</th>
              <th className="px-4 py-3 font-medium text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {initialUsers.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
                        <UserIcon size={16} />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {u.full_name || u.email.split("@")[0]}
                        </div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => onChangeRole(u.id, e.target.value as "admin" | "operator")}
                      disabled={isSelf || isPending}
                      className="border border-gray-300 rounded px-2 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="operator">Operatore</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {u.active ? "Attivo" : "Disattivato"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString("it-IT") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => onReset(u.id, u.email)}
                        disabled={isPending}
                        title="Reset password"
                        className="p-2 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-50"
                      >
                        <KeyRound size={14} />
                      </button>
                      <button
                        onClick={() => onToggle(u.id, !u.active)}
                        disabled={isSelf || isPending}
                        title={u.active ? "Disattiva" : "Riattiva"}
                        className="p-2 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-50"
                      >
                        <Power size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {initialUsers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                  Nessun utente. Crea il primo cliccando &quot;Nuovo utente&quot; in alto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
        <Shield size={14} className="mt-0.5 text-blue-600" />
        <div>
          <strong className="text-gray-700">Permessi:</strong> Admin = tutto. Operatore = tutto
          eccetto cancellazioni (clienti, sessioni, strumenti, rapporti). Non puoi
          declassare/disattivare il tuo stesso account o l&apos;ultimo admin attivo.
        </div>
      </div>
    </div>
  );
}
