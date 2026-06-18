import { confirmPasswordReset } from "./actions";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ token?: string; error?: string }>;
}

function errorMessage(code?: string): string | null {
  if (!code) return null;
  if (code === "mismatch") return "Le due password non coincidono.";
  if (code === "too_short") return "La password deve avere almeno 8 caratteri.";
  if (code === "invalid") return "Link non valido o scaduto. Richiedine uno nuovo.";
  if (code === "network") return "Errore di connessione. Riprova.";
  return "Errore. Riprova o richiedi un nuovo link.";
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token || "";
  const error = errorMessage(params.error);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center space-y-4">
          <p className="text-red-600 font-medium">Link non valido.</p>
          <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">
            Richiedi un nuovo link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-100 p-3 rounded-full mb-3">
            <ShieldCheck className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Nuova password</h1>
          <p className="text-sm text-gray-500 mt-1">AvaTech Tarature</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            {params.error === "invalid" && (
              <>
                {" "}
                <Link href="/forgot-password" className="underline font-medium">
                  Richiedi un nuovo link
                </Link>
              </>
            )}
          </div>
        )}

        <form action={confirmPasswordReset} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label htmlFor="new_password" className="block text-sm font-medium text-gray-700 mb-1">
              Nuova password
            </label>
            <input
              id="new_password"
              name="new_password"
              type="password"
              required
              minLength={8}
              autoFocus
              autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Minimo 8 caratteri"
            />
          </div>
          <div>
            <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-1">
              Conferma password
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ripeti la password"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Salva nuova password
          </button>
        </form>
      </div>
    </div>
  );
}
