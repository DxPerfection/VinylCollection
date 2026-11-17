// Supabase Edge Function: Last.fm for the phone app. The API key and shared secret stay here as function secrets
// (LASTFM_API_KEY, LASTFM_SHARED_SECRET), so they never reach the web page; without the shared secret the session
// key the phone keeps can't sign anything. Only the owner's signed-in account gets an answer: the same
// is_vinyl_owner() check as the tables (migrations/003_owner_only.sql). Each Last.fm call gives up after 8 seconds.
//
// POST { "action": "connectLink", "returnTo": "https://..." }   ->  { "url": "https://www.last.fm/api/auth/?..." }
// POST { "action": "session", "token": "..." }                  ->  { "name": "harunemre", "sessionKey": "..." }
// POST { "action": "scrobble", "sessionKey": "...", "scrobbles": Scrobble[] (at most 50) }
//                                                               ->  { "accepted": 12, "ignored": 0, "ignoredCodes": [] }
// For want list suggestions (all within 15 seconds; artists not done by then are left out):
// POST { "action": "topArtists", "user": "harunemre" }          ->  { "artists": [{ "name", "count" }] }
// POST { "action": "similar", "artists": ["Air", ...] (25 at most) }  ->  { "similar": { "Air": [{ "name", "match" }] } }
// POST { "action": "topAlbums", "artists": ["Phoenix", ...] }  ->  { "albums": { "Phoenix": [{ "name", "count", "imageUrl" }] } }
// When it goes wrong the answer says what to do: { reconnect: true } (connect again), { retryLater: true },
// { timedOut: true } or { notSetUp: true } (the secrets are missing).
import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  allowedReturn, batchLimit, cleanScrobbles, connectLink, forEachArtist, getSession, isTimeout, LastFmError, needsReconnect,
  sendScrobbles, similarArtists, topAlbums, topArtists, worthRetrying,
} from "./lastFmApi.ts";

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

  const apiKey = Deno.env.get("LASTFM_API_KEY")?.trim();
  const sharedSecret = Deno.env.get("LASTFM_SHARED_SECRET")?.trim();
  if (!apiKey || !sharedSecret) {
    return reply({ error: "The Last.fm key and secret are not set up in Supabase yet.", notSetUp: true }, 500);
  }
  const keys = { apiKey, sharedSecret };

  let body: { action?: string; returnTo?: string; token?: string; sessionKey?: string; scrobbles?: unknown; user?: string; artists?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Send JSON." }, 400);
  }

  try {
    if (body.action === "connectLink") {
      const returnTo = String(body.returnTo ?? "");
      if (!allowedReturn(returnTo)) return reply({ error: "That return address isn't allowed." }, 400);
      return reply({ url: connectLink(apiKey, returnTo) });
    }
    if (body.action === "session") {
      const token = String(body.token ?? "").trim();
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return reply({ error: "That sign-in token doesn't look right.", reconnect: true }, 400);
      return reply(await getSession(fetch, keys, token));
    }
    if (body.action === "scrobble") {
      const sessionKey = String(body.sessionKey ?? "").trim();
      if (!sessionKey) return reply({ error: "Connect Last.fm first.", reconnect: true }, 400);
      const scrobbles = cleanScrobbles(body.scrobbles);
      if (scrobbles.length > batchLimit) return reply({ error: `Send at most ${batchLimit} scrobbles at a time.` }, 400);
      return reply(await sendScrobbles(fetch, keys, sessionKey, scrobbles));
    }
    if (body.action === "topArtists") {
      const user = String(body.user ?? "").trim().slice(0, 64);
      if (!user) return reply({ artists: [] });
      return reply({ artists: await topArtists(fetch, apiKey, user) });
    }
    const artists = Array.isArray(body.artists) ? body.artists.map(String) : [];
    if (body.action === "similar") {
      return reply({ similar: await forEachArtist(artists, (artist, finishBy) => similarArtists(fetch, apiKey, artist, 20, finishBy)) });
    }
    if (body.action === "topAlbums") {
      return reply({ albums: await forEachArtist(artists, (artist, finishBy) => topAlbums(fetch, apiKey, artist, 5, finishBy)) });
    }
    return reply({ error: "Unknown action." }, 400);
  } catch (error) {
    if (isTimeout(error)) return reply({ error: "Last.fm took too long to answer.", timedOut: true }, 504);
    if (needsReconnect(error)) return reply({ error: (error as Error).message, reconnect: true }, 401);
    if (worthRetrying(error)) return reply({ error: (error as Error).message, retryLater: true }, 503);
    const code = error instanceof LastFmError ? error.code : undefined;
    return reply({ error: String(error instanceof Error ? error.message : error), code }, 502);
  }
});
