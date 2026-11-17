// "Listen on Spotify" for records you don't own yet: the album's own Spotify page when the recordLookup function
// finds it, else a Spotify search for the artist and album (which always works). Found links are kept on the phone.
import type { SupabaseClient } from "@supabase/supabase-js";

import { type AlbumAsk, linkKey } from "../../../supabase/functions/recordLookup/lookup";
import { albumWaitMs, callLookup } from "./lookup";

export type { AlbumAsk };
export { linkKey };

const cacheKey = "vinylSpotifyLinks";

export function spotifySearchUrl(artist: string, album: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${album}`.trim())}`;
}

type LinkCache = Record<string, string | null>;

function readCache(): LinkCache {
  try {
    return JSON.parse(localStorage.getItem(cacheKey) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function cachedLink(ask: AlbumAsk): string | null | undefined {
  return readCache()[linkKey(ask)];
}

// Album pages for these albums: from the phone's copy, else asked for (null when Spotify doesn't have it; left out
// when Spotify was too slow, to ask again next time)
export async function fetchSpotifyLinks(supabase: SupabaseClient, asks: AlbumAsk[]): Promise<Record<string, string | null>> {
  const cache = readCache();
  const missing = asks.filter((ask) => !(linkKey(ask) in cache));
  if (missing.length) {
    const { links } = await callLookup<{ links: Record<string, string | null> }>(supabase, { action: "spotifyLinks", albums: missing }, albumWaitMs);
    Object.assign(cache, links ?? {});
    try {
      localStorage.setItem(cacheKey, JSON.stringify(cache));
    } catch {
      // asked for again next time
    }
  }
  return Object.fromEntries(asks.filter((ask) => linkKey(ask) in cache).map((ask) => [linkKey(ask), cache[linkKey(ask)]]));
}

// The link to show: the album page if known, else the search
export function listenUrl(artist: string, album: string, found?: string | null): string {
  return found || spotifySearchUrl(artist, album);
}
