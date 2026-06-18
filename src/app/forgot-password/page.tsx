import { requestPasswordReset } from "./actions";
import { KeyRound } from "lucide-react";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ sent?: string; error?: string }>;
}

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-100 p-3 rounded-full mb-3">
            <KeyRound className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Password dimenticata</h1>
          <p className="text-sm text-gray-500 mt-1">AvaTech Tarature</p>
        </div>

        {params.sent ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm text-center">
              Se l&apos;email è registrata, riceverai il link di reset a breve.
              <br />
              Controlla anche la cartella spam.
            </div>
            <Link
              href="/login"
              className="block text-center text-sm text-blue-600 hover:underline mt-2"
            >
              ← Torna al login
            </Link>
          </div>
        ) : (
          <>
            {params.error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                Inserisci un&apos;email valida.
              </div>
            )}
            <p className="text-sm text-gray-600 mb-5">
              Inserisci l&apos;email del tuo account. Ti invieremo un link per impostare una nuova password.
            </p>
            <form action={requestPasswordReset} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="nome@esempio.it"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                Invia link di reset
              </button>
            </form>
            <Link
              href="/login"
              className="block text-center text-sm text-gray-500 hover:text-gray-700 mt-4"
            >
              ← Torna al login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
