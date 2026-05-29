import { createClient, SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

/** Server-only client with service-role privileges. Bypasses RLS. */
export function getServiceSupabase(): SupabaseClient {
  if (!serviceClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase URL or service role key missing");
    }
    serviceClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return serviceClient;
}
