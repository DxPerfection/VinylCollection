// The one Supabase client for the app. The sign-in is kept in the browser, so it survives closing the app.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabasePublishableKey, supabaseUrl } from "./config";

let client: SupabaseClient | null = null;

export function isConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
