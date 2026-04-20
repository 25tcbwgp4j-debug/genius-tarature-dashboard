import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase browser per Realtime subscriptions.
 *
 * Richiede NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Le policy RLS della tabella whatsapp_messages permettono SELECT all'anon
 * (vedi migration 20260420120000_chat_dashboard_whatsapp.sql) solo per subscribe.
 */
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.warn("[supabase-browser] NEXT_PUBLIC_SUPABASE_* mancanti — realtime disabilitato");
    return null;
  }
  _client = createBrowserClient(url, anon);
  return _client;
}
