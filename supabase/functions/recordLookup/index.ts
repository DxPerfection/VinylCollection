// Supabase Edge Function: Discogs and Spotify lookups for adding records in the phone app.
// The keys stay here as function secrets (DISCOGS_TOKEN, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET), so they never
// reach the web page. Only the owner's signed-in account gets an answer: the same is_vinyl_owner() check as the
// tables (migrations/003_owner_only.sql). Every outside call gives up after 10 seconds.
//
// POST { "action": "search", "query": "rust in peace" }  ->  { "results": DiscogsHit[] }
// POST { "action": "release", "discogsId": 1234567 }      ->  { "release": ReleaseDetails }
// POST { "action": "prices", "discogsIds": [1234567] }    ->  { "prices": { "1234567": MarketPrice | null } }
// Prices are in DISCOGS_CURRENCY (a function secret), EUR when it isn't set.
import { createClient } from "jsr:@supabase/supabase-js@2";

import { marketPrices, releaseDetails, searchDiscogs } from "./lookup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Use POST." }, 405);

  // Ask the database whether the caller is the owner, using the caller's own sign-in
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
  });
  const { data: owner, error: ownerError } = await supabase.rpc("is_vinyl_owner");
  if (ownerError || owner !== true) return reply({ error: "This is private." }, 403);

  const discogsToken = Deno.env.get("DISCOGS_TOKEN");
  if (!discogsToken) return reply({ error: "The Discogs token is not set up in Supabase yet." }, 500);
  const keys = {
    discogsToken,
    spotifyClientId: Deno.env.get("SPOTIFY_CLIENT_ID") ?? undefined,
    spotifyClientSecret: Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? undefined,
  };

  let body: { action?: string; query?: string; discogsId?: number; discogsIds?: number[] };
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Send JSON." }, 400);
  }

  try {
    if (body.action === "search") {
      const query = String(body.query ?? "").trim().slice(0, 200);
      return reply({ results: query.length < 2 ? [] : await searchDiscogs(fetch, discogsToken, query) });
    }
    if (body.action === "release" && Number(body.discogsId) > 0) {
      return reply({ release: await releaseDetails(fetch, keys, Number(body.discogsId)) });
    }
    if (body.action === "prices" && Array.isArray(body.discogsIds)) {
      const currency = (Deno.env.get("DISCOGS_CURRENCY") ?? "EUR").trim().toUpperCase() || "EUR";
      return reply({ prices: await marketPrices(fetch, discogsToken, body.discogsIds, currency) });
    }
    return reply({ error: "Unknown action." }, 400);
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "Discogs took too long to answer." : String(error instanceof Error ? error.message : error);
    return reply({ error: message }, 502);
  }
});
