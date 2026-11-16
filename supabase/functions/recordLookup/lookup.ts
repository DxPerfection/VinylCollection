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

const timeoutMs = 10000;
const userAgent = "VinylCollectionApp/4.0";

async function getJson(fetcher: FetchLike, url: string, init: RequestInit = {}): Promise<any> {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
  return response.json();
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

async function spotifyToken(fetcher: FetchLike, clientId: string, clientSecret: string): Promise<string> {
  const data = await getJson(fetcher, "https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  return String(data.access_token);
}

// The HD cover and the total length of the first Spotify match for this artist and album, like the Streamlit app
export async function spotifyAlbum(fetcher: FetchLike, clientId: string, clientSecret: string, artist: string, album: string):
  Promise<{ coverUrl: string; durationMins: number } | null> {
  const token = await spotifyToken(fetcher, clientId, clientSecret);
  const headers = { Authorization: `Bearer ${token}` };
  const searchUrl = `https://api.spotify.com/v1/search?${new URLSearchParams({ q: `artist:${artist} album:${album}`, type: "album", limit: "1" })}`;
  const found = (await getJson(fetcher, searchUrl, { headers }))?.albums?.items?.[0];
  if (!found?.id) return null;
  const details = await getJson(fetcher, `https://api.spotify.com/v1/albums/${found.id}`, { headers });
  const tracks: { duration_ms?: number }[] = [...(details?.tracks?.items ?? [])];
  let next: string | null = details?.tracks?.next ?? null;
  while (next) {
    const page = await getJson(fetcher, next, { headers });
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

export async function releaseDetails(fetcher: FetchLike, keys: Keys, discogsId: number): Promise<ReleaseDetails> {
  const release = await getJson(fetcher, `https://api.discogs.com/releases/${discogsId}`, {
    headers: { "User-Agent": userAgent, Authorization: `Discogs token=${keys.discogsToken}` },
  });
  const tracks: DiscogsTrack[] = release?.tracklist ?? [];
  const songs = tracks.filter((track) => (track.type_ ?? "track") === "track");
  const discogsMins = Math.floor(songs.reduce((sum, track) => sum + toSeconds(track.duration ?? ""), 0) / 60);
  const artist = tidyArtist(String(release?.artists_sort ?? release?.artists?.[0]?.name ?? ""));
  const album = String(release?.title ?? "").trim();

  let spotify: { coverUrl: string; durationMins: number } | null = null;
  if (keys.spotifyClientId && keys.spotifyClientSecret && artist && album) {
    try {
      spotify = await spotifyAlbum(fetcher, keys.spotifyClientId, keys.spotifyClientSecret, artist, album);
    } catch {
      spotify = null; // Discogs alone is still enough to add the record
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
