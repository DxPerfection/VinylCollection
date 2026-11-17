// Asking the recordLookup Supabase function for Discogs search results and release details
import type { SupabaseClient } from "@supabase/supabase-js";

import { albumLimitMs, quickLimitMs, type DiscogsHit, type ReleaseDetails } from "../../../supabase/functions/recordLookup/lookup";

export type { DiscogsHit, ReleaseDetails };

// The function gives up on Discogs and Spotify after quickLimitMs or albumLimitMs; the phone waits a little longer,
// for the trip to Supabase and back and for the function to wake up, so the function's own answer usually wins
const tripMs = 2000;
export const searchWaitMs = quickLimitMs + tripMs;
export const albumWaitMs = albumLimitMs + tripMs;

// Discogs, Spotify or the function itself took too long; nothing was changed
export class LookupTimeout extends Error {
  constructor(message = "Discogs is slow to answer right now.") {
    super(message);
    this.name = "LookupTimeout";
  }
}

export const isLookupTimeout = (error: unknown): error is LookupTimeout => error instanceof LookupTimeout;

export async function callLookup<T>(supabase: SupabaseClient, body: object, waitMs: number = searchWaitMs): Promise<T> {
  const { data, error } = await supabase.functions.invoke("recordLookup", { body, timeout: waitMs });
  if (error) {
    const context = (error as { context?: unknown }).context;
    // The phone stopped waiting (supabase-js aborts the request and hands back the AbortError)
    if ((context as { name?: string } | undefined)?.name === "AbortError") throw new LookupTimeout();
    // The function says what went wrong in its JSON answer; show that rather than a bare status code
    let message = error.message;
    let timedOut = false;
    if (context instanceof Response) {
      timedOut = context.status === 504;
      try {
        const answer = await context.json();
        message = answer?.error ?? message;
        timedOut ||= answer?.timedOut === true;
      } catch {
        // keep the general message
      }
    }
    throw timedOut ? new LookupTimeout() : new Error(message);
  }
  return data as T;
}

export async function searchReleases(supabase: SupabaseClient, query: string): Promise<DiscogsHit[]> {
  return (await callLookup<{ results: DiscogsHit[] }>(supabase, { action: "search", query }, searchWaitMs)).results ?? [];
}

export async function getRelease(supabase: SupabaseClient, discogsId: number): Promise<ReleaseDetails> {
  return (await callLookup<{ release: ReleaseDetails }>(supabase, { action: "release", discogsId }, albumWaitMs)).release;
}
