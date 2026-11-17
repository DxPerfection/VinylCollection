// Discogs and Spotify lookups for adding a record, the same split as the Streamlit app: Discogs finds the
// release and gives the artist, album, year, genre, styles, tracklist and pressing details; Spotify gives the
// cover and the length, with Discogs as the fallback. Free of Deno and Supabase imports so the phone app's
// tests can check it too.

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface DiscogsHit {
  discogsId: number;
  artist: string;
  album: string;
  year: string;
  genre: string;
  coverUrl: string;
  label: string;
  catalogNumber: string;
  format: string;
  country: string;
}

export interface ReleaseDetails extends DiscogsHit {
  subGenre: string;
  tracks: string[];
  durationMins: number;
  sideMins: string; // "A:24|B:25", or "" when the release has no sides
  coverFromSpotify: boolean;
  lengthFromSpotify: boolean;
}

// How long Discogs and Spotify get before the lookup gives up and carries on without them
export const quickLimitMs = 8000; // one search or one call
export const albumLimitMs = 15000; // a whole album (Discogs, then Spotify for the cover and length), or a want list's prices
const userAgent = "VinylCollectionApp/4.0";

export function timeoutError(): Error {
  const error = new Error("Discogs took too long to answer.");
  error.name = "TimeoutError";
  return error;
}

export const isTimeout = (error: unknown) => error instanceof Error && error.name === "TimeoutError";

// One outside call, given up after quickLimitMs, or sooner when finishBy (a Date.now() time) comes first
async function getJson(fetcher: FetchLike, url: string, init: RequestInit = {}, finishBy = Infinity): Promise<any> {
  const limitMs = Math.min(quickLimitMs, finishBy - Date.now());
  if (limitMs <= 0) throw timeoutError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(timeoutError()), limitMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
    return await response.json();
  } catch (error) {
    throw controller.signal.aborted ? timeoutError() : error;
  } finally {
    clearTimeout(timer);
  }
}

// Discogs titles read "Artist - Album"; artist names may carry a number such as "Sertab (2)"
export function splitTitle(title: string): { artist: string; album: string } {
  const at = title.indexOf(" - ");
  if (at < 0) return { artist: "", album: title.trim() };
  return { artist: tidyArtist(title.slice(0, at)), album: title.slice(at + 3).trim() };
}

export function tidyArtist(name: string): string {
  return name.replace(/\s*\(\d+\)$/, "").replace(/\*$/, "").trim();
}

const firstOf = (value: unknown) => (Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""));
const uniqueJoin = (values: unknown) => [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].join(", ");

export function toDiscogsHit(item: any): DiscogsHit {
  const { artist, album } = splitTitle(String(item?.title ?? ""));
  return {
    discogsId: Number(item?.id ?? 0),
    artist,
    album,
    year: item?.year ? String(item.year) : "",
    genre: firstOf(item?.genre),
    coverUrl: String(item?.cover_image ?? item?.thumb ?? ""),
    label: firstOf(item?.label),
    catalogNumber: String(item?.catno ?? ""),
    format: uniqueJoin(item?.format),
    country: String(item?.country ?? ""),
  };
}

export async function searchDiscogs(fetcher: FetchLike, token: string, query: string): Promise<DiscogsHit[]> {
  const url = `https://api.discogs.com/database/search?${new URLSearchParams({ q: query, type: "release", per_page: "10" })}`;
  const data = await getJson(fetcher, url, { headers: { "User-Agent": userAgent, Authorization: `Discogs token=${token}` } });
  return (data?.results ?? []).slice(0, 10).map(toDiscogsHit);
}

export function toSeconds(duration: string): number {
  const parts = String(duration ?? "").split(":").map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

interface DiscogsTrack {
  position?: string;
  title?: string;
  duration?: string;
  type_?: string;
}

// The side letter of a vinyl position such as "A1", "B", "C3" or "1-A2"; none for "1" or "CD1-3"
export function sideOf(position: string | undefined): string {
  const match = /^(?:\d+-)?([A-Z])\d*[a-z]?$/.exec(String(position ?? "").trim());
  return match ? match[1] : "";
}

// Each side's share of the album, from Discogs track times when every track has one, else from track counts,
// applied to the album length (Spotify's when it has the album). Discogs times can be off, but the shares hold.
export function sideMinutes(tracks: DiscogsTrack[], totalMins: number): string {
  const songs = tracks.filter((track) => (track.type_ ?? "track") === "track");
  const bySide = new Map<string, DiscogsTrack[]>();
  for (const track of songs) {
    const side = sideOf(track.position);
    if (!side) return "";
    bySide.set(side, [...(bySide.get(side) ?? []), track]);
  }
  if (bySide.size < 2 || totalMins <= 0) return "";
  const allTimed = songs.every((track) => toSeconds(track.duration ?? "") > 0);
  const weights = [...bySide.entries()].map(([side, list]) =>
    [side, allTimed ? list.reduce((sum, track) => sum + toSeconds(track.duration ?? ""), 0) : list.length] as const);
  const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
  return weights.map(([side, weight]) => `${side}:${Math.max(1, Math.round((totalMins * weight) / totalWeight))}`).join("|");
}

async function spotifyToken(fetcher: FetchLike, clientId: string, clientSecret: string, finishBy: number): Promise<string> {
  const data = await getJson(fetcher, "https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  }, finishBy);
  return String(data.access_token);
}

// The HD cover and the total length of the first Spotify match for this artist and album, like the Streamlit app.
// Every Spotify call has to be back by finishBy.
export async function spotifyAlbum(fetcher: FetchLike, clientId: string, clientSecret: string, artist: string, album: string,
  finishBy = Date.now() + albumLimitMs): Promise<{ coverUrl: string; durationMins: number } | null> {
  const token = await spotifyToken(fetcher, clientId, clientSecret, finishBy);
  const headers = { Authorization: `Bearer ${token}` };
  const searchUrl = `https://api.spotify.com/v1/search?${new URLSearchParams({ q: `artist:${artist} album:${album}`, type: "album", limit: "1" })}`;
  const found = (await getJson(fetcher, searchUrl, { headers }, finishBy))?.albums?.items?.[0];
  if (!found?.id) return null;
  const details = await getJson(fetcher, `https://api.spotify.com/v1/albums/${found.id}`, { headers }, finishBy);
  const tracks: { duration_ms?: number }[] = [...(details?.tracks?.items ?? [])];
  let next: string | null = details?.tracks?.next ?? null;
  while (next) {
    const page = await getJson(fetcher, next, { headers }, finishBy);
    tracks.push(...(page?.items ?? []));
    next = page?.next ?? null;
  }
  const totalMs = tracks.reduce((sum, track) => sum + Number(track.duration_ms ?? 0), 0);
  return { coverUrl: String(found?.images?.[0]?.url ?? ""), durationMins: Math.floor(totalMs / 60000) };
}

export interface Keys {
  discogsToken: string;
  spotifyClientId?: string;
  spotifyClientSecret?: string;
}

// Discogs gets quickLimitMs; Spotify gets whatever is left of albumLimitMs, and when it runs out the record still
// comes back with the Discogs cover and length
export async function releaseDetails(fetcher: FetchLike, keys: Keys, discogsId: number): Promise<ReleaseDetails> {
  const finishBy = Date.now() + albumLimitMs;
  const release = await getJson(fetcher, `https://api.discogs.com/releases/${discogsId}`, {
    headers: { "User-Agent": userAgent, Authorization: `Discogs token=${keys.discogsToken}` },
  }, finishBy);
  const tracks: DiscogsTrack[] = release?.tracklist ?? [];
  const songs = tracks.filter((track) => (track.type_ ?? "track") === "track");
  const discogsMins = Math.floor(songs.reduce((sum, track) => sum + toSeconds(track.duration ?? ""), 0) / 60);
  const artist = tidyArtist(String(release?.artists_sort ?? release?.artists?.[0]?.name ?? ""));
  const album = String(release?.title ?? "").trim();

  let spotify: { coverUrl: string; durationMins: number } | null = null;
  if (keys.spotifyClientId && keys.spotifyClientSecret && artist && album) {
    try {
      spotify = await spotifyAlbum(fetcher, keys.spotifyClientId, keys.spotifyClientSecret, artist, album, finishBy);
    } catch {
      spotify = null; // slow or failed: Discogs alone is still enough to add the record
    }
  }

  const durationMins = spotify?.durationMins || discogsMins;
  const formats: { name?: string; descriptions?: string[]; text?: string }[] = release?.formats ?? [];
  const format = uniqueJoin(formats.flatMap((item) => [item.name, ...(item.descriptions ?? []), item.text]));
  return {
    discogsId,
    artist,
    album,
    year: release?.year ? String(release.year) : "",
    genre: firstOf(release?.genres),
    subGenre: uniqueJoin(release?.styles),
    coverUrl: spotify?.coverUrl || String(release?.images?.[0]?.uri ?? ""),
    label: tidyArtist(String(release?.labels?.[0]?.name ?? "")),
    catalogNumber: String(release?.labels?.[0]?.catno ?? ""),
    format,
    country: String(release?.country ?? ""),
    tracks: songs.map((track) => String(track.title ?? "").trim()).filter(Boolean),
    durationMins,
    sideMins: sideMinutes(tracks, durationMins),
    coverFromSpotify: Boolean(spotify?.coverUrl),
    lengthFromSpotify: Boolean(spotify?.durationMins),
  };
}

export interface MarketPrice {
  lowest: number | null; // the cheapest copy for sale, in currency
  currency: string;
  forSale: number;
}

// The lowest Discogs marketplace price and how many copies are for sale, like the Streamlit want list; null when
// Discogs can't say for that release. Running out of time is not an answer, so that still throws.
export async function marketPrice(fetcher: FetchLike, token: string, discogsId: number, currency: string,
  finishBy = Infinity): Promise<MarketPrice | null> {
  try {
    const url = `https://api.discogs.com/marketplace/stats/${discogsId}?${new URLSearchParams({ curr_abbr: currency })}`;
    const data = await getJson(fetcher, url, { headers: { "User-Agent": userAgent, Authorization: `Discogs token=${token}` } }, finishBy);
    const value = Number(data?.lowest_price?.value);
    return {
      lowest: data?.lowest_price && Number.isFinite(value) ? value : null,
      currency: String(data?.lowest_price?.currency ?? currency),
      forSale: Number(data?.num_for_sale ?? 0) || 0,
    };
  } catch (error) {
    if (isTimeout(error)) throw error;
    return null;
  }
}

// Prices for a whole want list: at most 50 releases, four at a time, to stay well inside Discogs' rate limit.
// All of it has to be back within albumLimitMs; releases not checked by then are left out, to try again next time.
export async function marketPrices(fetcher: FetchLike, token: string, discogsIds: number[], currency: string):
  Promise<Record<string, MarketPrice | null>> {
  const finishBy = Date.now() + albumLimitMs;
  const ids = [...new Set(discogsIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 50);
  const prices: Record<string, MarketPrice | null> = {};
  for (let start = 0; start < ids.length && Date.now() < finishBy; start += 4) {
    const batch = ids.slice(start, start + 4);
    await Promise.all(batch.map((id) => marketPrice(fetcher, token, id, currency, finishBy)
      .then((price) => { prices[String(id)] = price; }, () => { /* too slow: left out */ })));
  }
  return prices;
}

// --- Spotify links, so a record can be listened to before buying it ---

export interface AlbumAsk {
  artist: string;
  album: string;
}

export const linkKey = (ask: AlbumAsk) => `${ask.artist.trim()}|${ask.album.trim()}`;

const plainName = (name: unknown) => String(name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");

// The album's Spotify page: the first search result by that artist (any result when none is), or null
export async function spotifyAlbumLink(fetcher: FetchLike, token: string, ask: AlbumAsk, finishBy = Infinity): Promise<string | null> {
  const url = `https://api.spotify.com/v1/search?${new URLSearchParams({ q: `album:${ask.album} artist:${ask.artist}`, type: "album", limit: "5" })}`;
  const items: { external_urls?: { spotify?: string }; artists?: { name?: string }[] }[] =
    (await getJson(fetcher, url, { headers: { Authorization: `Bearer ${token}` } }, finishBy))?.albums?.items ?? [];
  const byArtist = items.find((item) => (item.artists ?? []).some((artist) => plainName(artist.name) === plainName(ask.artist)));
  return (byArtist ?? items[0])?.external_urls?.spotify ?? null;
}

// Links for up to 20 albums, four at a time, all within albumLimitMs; albums not done by then are left out
export async function spotifyAlbumLinks(fetcher: FetchLike, clientId: string, clientSecret: string, asks: AlbumAsk[]):
  Promise<Record<string, string | null>> {
  const finishBy = Date.now() + albumLimitMs;
  const list = asks.filter((ask) => ask && String(ask.artist ?? "").trim() && String(ask.album ?? "").trim())
    .map((ask) => ({ artist: String(ask.artist).slice(0, 200), album: String(ask.album).slice(0, 200) })).slice(0, 20);
  const links: Record<string, string | null> = {};
  if (!list.length) return links;
  const token = await spotifyToken(fetcher, clientId, clientSecret, finishBy);
  for (let start = 0; start < list.length && Date.now() < finishBy; start += 4) {
    await Promise.all(list.slice(start, start + 4).map((ask) => spotifyAlbumLink(fetcher, token, ask, finishBy)
      .then((link) => { links[linkKey(ask)] = link; }, () => { /* too slow: left out */ })));
  }
  return links;
}
