// Asking the recordLookup Supabase function for Discogs search results and release details
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DiscogsHit, ReleaseDetails } from "../../../supabase/functions/recordLookup/lookup";

export type { DiscogsHit, ReleaseDetails };

export async function callLookup<T>(supabase: SupabaseClient, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke("recordLookup", { body });
  if (error) {
    // The function says what went wrong in its JSON answer; show that rather than a bare status code
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        message = (await context.json())?.error ?? message;
      } catch {
        // keep the general message
      }
    }
    throw new Error(message);
  }
  return data as T;
}

export async function searchReleases(supabase: SupabaseClient, query: string): Promise<DiscogsHit[]> {
  return (await callLookup<{ results: DiscogsHit[] }>(supabase, { action: "search", query })).results ?? [];
}

export async function getRelease(supabase: SupabaseClient, discogsId: number): Promise<ReleaseDetails> {
  return (await callLookup<{ release: ReleaseDetails }>(supabase, { action: "release", discogsId })).release;
}
