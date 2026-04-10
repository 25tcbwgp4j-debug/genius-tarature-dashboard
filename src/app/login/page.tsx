import { login } from "./actions";
import { LogIn } from "lucide-react";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; from?: string }>;
}

function errorMessage(code?: string): string | null {
  if (!code) return null;
  if (code === "invalid") return "Password non valida. Riprova.";
  if (code === "not_configured") return "Autenticazione non configurata sul server. Contattare l'amministratore.";
  return "Errore di autenticazione.";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = errorMessage(params.error);
  const from = params.from || "/";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-100 p-3 rounded-full mb-3">
            <LogIn className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">AvaTech Tarature</h1>
          <p className="text-sm text-gray-500 mt-1">Dashboard di gestione</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form action={login} className="space-y-4">
          <input type="hidden" name="from" value={from} />
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Inserisci la password"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Accedi
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          Accesso riservato allo staff. La sessione scade dopo 30 giorni.
        </p>
      </div>
    </div>
  );
}
