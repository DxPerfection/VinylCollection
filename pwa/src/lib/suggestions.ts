// Records you might like, for the want list. Last.fm has no personal recommendations to ask for, so they are
// worked out here: your taste (the artists you play most, recent plays counting more, the ones you rate highest,
// and your Last.fm top artists), Last.fm's similar artists for each, then each new artist's best known album
// found on Discogs as a vinyl release with its lowest price. Each suggestion says why in one line.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { NamedCount, SimilarArtist, TopAlbum } from "../../../supabase/functions/lastFm/lastFmApi";
import { callLastFm, longWaitMs } from "./lastFm";
import { type DiscogsHit, searchReleases } from "./lookup";
import { recentPlays } from "./plays";
import { type AlbumAsk, fetchSpotifyLinks, linkKey } from "./spotify";
import type { CollectionData, WantRow } from "./records";
import { fetchPrices, type MarketPrice } from "./wants";

export type { NamedCount, SimilarArtist, TopAlbum };

// --- Names ---

// "The Beatles", "Beatles" and "beatles " are the same artist; "Sigur Rós" and "Sigur Ros" too
export function artistKey(name: unknown): string {
  return String(name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, "and").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");
}

// --- Your taste ---

export interface Seed {
  name: string;
  key: string;
  weight: number;
  reason: string; // "14 plays", "rated 5★", "in your collection" or "on your Last.fm"
}

// Recent plays count more: a play loses half its weight every 90 days
const halfLifeDays = 90;
export const seedCount = 10;

export function tasteSeeds(data: CollectionData, lastFmTop: NamedCount[] = [], now: number = Date.now()): Seed[] {
  const byKey = new Map<string, { name: string; weight: number; plays: number; bestRating: number }>();
  const entry = (name: string) => {
    const key = artistKey(name);
    if (!key) return null;
    if (!byKey.has(key)) byKey.set(key, { name: name.trim(), weight: 0, plays: 0, bestRating: 0 });
    return byKey.get(key)!;
  };

  for (const record of data.records) {
    const item = entry(String(record.Artist ?? ""));
    if (!item) continue;
    item.weight += 0.3; // owning it says something too
    const rating = Number(record.Rating ?? 0);
    if (rating >= 4) item.weight += rating - 3; // 4 stars +1, 5 stars +2
    item.bestRating = Math.max(item.bestRating, rating || 0);
  }
  for (const { record, when } of recentPlays(data.plays, data.records)) {
    const item = record ? entry(String(record.Artist ?? "")) : null;
    if (!item) continue;
    const ageDays = when ? Math.max(0, (now - when.getTime()) / 86400000) : 365;
    item.weight += 0.5 ** (ageDays / halfLifeDays);
    item.plays += 1;
  }
  // Last.fm adds what you stream too: the top artist counts 2, fading to almost nothing down the list
  lastFmTop.slice(0, 30).forEach((artist, rank, list) => {
    const item = entry(artist.name);
    if (item) item.weight += 2 * (1 - rank / list.length);
  });

  return [...byKey.entries()]
    .map(([key, item]) => ({
      name: item.name,
      key,
      weight: item.weight,
      reason: item.plays ? `${item.plays} ${item.plays === 1 ? "play" : "plays"}`
        : item.bestRating >= 4 ? `rated ${item.bestRating}★`
          : data.records.some((record) => artistKey(record.Artist) === key) ? "in your collection" : "on your Last.fm",
    }))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
    .slice(0, seedCount);
}

// --- New artists ---

export interface Candidate {
  name: string;
  key: string;
  score: number;
  because: Seed[]; // the seeds it is most similar to, strongest first
}

// Each similar artist scores the seed's weight times how similar Last.fm says it is, added up over the seeds.
// Artists you own, want or said "Not for me" to are left out.
export function rankCandidates(seeds: Seed[], similar: Record<string, SimilarArtist[]>, leaveOut: Set<string>, limit = 12): Candidate[] {
  const byKey = new Map<string, { name: string; score: number; parts: { seed: Seed; part: number }[] }>();
  for (const seed of seeds) {
    for (const artist of similar[seed.name] ?? []) {
      const key = artistKey(artist.name);
      if (!key || leaveOut.has(key) || key === seed.key) continue;
      const part = seed.weight * artist.match;
      if (part <= 0) continue;
      const item = byKey.get(key) ?? { name: artist.name, score: 0, parts: [] };
      item.score += part;
      item.parts.push({ seed, part });
      byKey.set(key, item);
    }
  }
  return [...byKey.entries()]
    .map(([key, item]) => ({
      name: item.name, key, score: item.score,
      because: item.parts.sort((a, b) => b.part - a.part).slice(0, 2).map(({ seed }) => seed),
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// "Like Daft Punk (14 plays) and Air (rated 5★)"
export function reasonText(because: Seed[]): string {
  const parts = because.map((seed) => `${seed.name} (${seed.reason})`);
  return parts.length ? `Like ${parts.join(" and ")}` : "";
}

// The artist's best known album, passing over hits collections and live albums when there is anything else
export function pickAlbum(albums: TopAlbum[]): TopAlbum | null {
  const studio = albums.filter((album) => !/greatest hits|best of|collection|anthology|essential|live\b|remix|deluxe/i.test(album.name));
  return studio[0] ?? albums[0] ?? null;
}

// Prefer a vinyl release among Discogs' answers
export function pickRelease(hits: DiscogsHit[], artist: string): DiscogsHit | null {
  const sameArtist = hits.filter((hit) => artistKey(hit.artist) === artistKey(artist));
  const pool = sameArtist.length ? sameArtist : hits;
  return pool.find((hit) => /vinyl|lp/i.test(hit.format)) ?? pool[0] ?? null;
}

// --- The suggestions ---

export interface Suggestion {
  artist: string;
  album: string;
  year: string;
  genre: string;
  coverUrl: string;
  discogsId: number | null;
  reason: string;
  price?: MarketPrice | null; // undefined: not checked
  spotifyUrl?: string | null; // the album on Spotify; missing or null: the card links to a Spotify search instead
}

export function asWantRow(suggestion: Suggestion): Omit<WantRow, "id"> {
  return {
    Artist: suggestion.artist,
    AlbumName: suggestion.album,
    Year: suggestion.year || null,
    Genre: suggestion.genre || null,
    CoverURL: suggestion.coverUrl || null,
    DiscogsID: suggestion.discogsId,
  };
}

export interface SuggestionSources {
  topArtists: (user: string) => Promise<NamedCount[]>;
  similar: (artists: string[]) => Promise<Record<string, SimilarArtist[]>>;
  topAlbums: (artists: string[]) => Promise<Record<string, TopAlbum[]>>;
  search: (query: string) => Promise<DiscogsHit[]>;
  prices: (discogsIds: number[]) => Promise<Record<string, MarketPrice | null>>;
  spotify: (albums: AlbumAsk[]) => Promise<Record<string, string | null>>;
}

export function liveSources(supabase: SupabaseClient): SuggestionSources {
  return {
    topArtists: async (user) => (await callLastFm<{ artists: NamedCount[] }>(supabase, { action: "topArtists", user })).artists ?? [],
    similar: async (artists) => (await callLastFm<{ similar: Record<string, SimilarArtist[]> }>(supabase, { action: "similar", artists },
      longWaitMs)).similar ?? {},
    topAlbums: async (artists) => (await callLastFm<{ albums: Record<string, TopAlbum[]> }>(supabase, { action: "topAlbums", artists },
      longWaitMs)).albums ?? {},
    search: (query) => searchReleases(supabase, query),
    prices: (discogsIds) => fetchPrices(supabase, discogsIds),
    spotify: (albums) => fetchSpotifyLinks(supabase, albums),
  };
}

export const suggestionCount = 10;

// Works the whole list out. Steps that fail or are slow leave things out rather than stopping: no Last.fm name means
// no Last.fm top artists, an artist Discogs can't find keeps Last.fm's picture and no price.
export async function buildSuggestions(data: CollectionData, dismissed: string[], lastFmUser: string | null,
  sources: SuggestionSources, now: number = Date.now()): Promise<Suggestion[]> {
  const lastFmTop = lastFmUser ? await sources.topArtists(lastFmUser).catch(() => []) : [];
  const seeds = tasteSeeds(data, lastFmTop, now);
  if (!seeds.length) return [];
  const similar = await sources.similar(seeds.map((seed) => seed.name));
  const leaveOut = new Set([
    ...data.records.map((record) => artistKey(record.Artist)),
    ...data.wants.map((want) => artistKey(want.Artist)),
    ...dismissed.map(artistKey),
  ]);
  const candidates = rankCandidates(seeds, similar, leaveOut, suggestionCount + 2);
  if (!candidates.length) return [];
  const albums = await sources.topAlbums(candidates.map((candidate) => candidate.name)).catch(() => ({} as Record<string, TopAlbum[]>));

  const picked = candidates
    .map((candidate) => ({ candidate, album: pickAlbum(albums[candidate.name] ?? []) }))
    .filter((item): item is { candidate: Candidate; album: TopAlbum } => item.album !== null)
    .slice(0, suggestionCount);

  // Discogs searches three at a time (each gives up after 8 seconds)
  const suggestions: Suggestion[] = [];
  for (let start = 0; start < picked.length; start += 3) {
    const found = await Promise.all(picked.slice(start, start + 3).map(async ({ candidate, album }) => {
      const hit = await sources.search(`${candidate.name} ${album.name}`).then((hits) => pickRelease(hits, candidate.name)).catch(() => null);
      return {
        artist: candidate.name,
        album: album.name,
        year: hit?.year ?? "",
        genre: hit?.genre ?? "",
        coverUrl: hit?.coverUrl || album.imageUrl,
        discogsId: hit?.discogsId || null,
        reason: reasonText(candidate.because),
      } satisfies Suggestion;
    }));
    suggestions.push(...found);
  }

  // Prices and Spotify links at the same time; either one being slow only leaves it out
  const ids = suggestions.map((item) => item.discogsId).filter((id): id is number => Boolean(id));
  const asks = suggestions.map((item) => ({ artist: item.artist, album: item.album }));
  const [prices, links] = await Promise.all([
    ids.length ? sources.prices(ids).catch(() => ({} as Record<string, MarketPrice | null>)) : Promise.resolve({} as Record<string, MarketPrice | null>),
    sources.spotify(asks).catch(() => ({} as Record<string, string | null>)),
  ]);
  return suggestions.map((item) => ({
    ...item,
    ...(item.discogsId && String(item.discogsId) in prices ? { price: prices[String(item.discogsId)] } : {}),
    spotifyUrl: links[linkKey({ artist: item.artist, album: item.album })] ?? null,
  }));
}

// --- Kept on the phone for a day ---

const cacheKey = "vinylSuggestions";
export const keepForMs = 24 * 60 * 60 * 1000;

export interface SavedSuggestions {
  builtAt: number;
  items: Suggestion[];
}

export function readSaved(): SavedSuggestions | null {
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as SavedSuggestions | null;
    return saved && Array.isArray(saved.items) && Number(saved.builtAt) > 0 ? saved : null;
  } catch {
    return null;
  }
}

export function writeSaved(items: Suggestion[], builtAt: number = Date.now()) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ builtAt, items }));
  } catch {
    // worked out again next time
  }
}

// What to show: saved suggestions, less any artist you own, want or turned down since
export function stillToShow(items: Suggestion[], data: CollectionData, dismissed: string[]): Suggestion[] {
  const leaveOut = new Set([
    ...data.records.map((record) => artistKey(record.Artist)),
    ...data.wants.map((want) => artistKey(want.Artist)),
    ...dismissed.map(artistKey),
  ]);
  return items.filter((item) => !leaveOut.has(artistKey(item.artist)));
}

// --- "Not for me", kept in Supabase so they never come back ---

export interface DismissedRow {
  id: number;
  Artist: string;
  AlbumName: string | null;
  DismissedAt?: string;
}

export async function fetchDismissed(supabase: SupabaseClient): Promise<DismissedRow[]> {
  const { data, error } = await supabase.from("DismissedSuggestions").select("*").order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as DismissedRow[];
}

export async function insertDismissed(supabase: SupabaseClient, suggestion: Suggestion): Promise<DismissedRow> {
  const { data, error } = await supabase.from("DismissedSuggestions")
    .insert({ Artist: suggestion.artist, AlbumName: suggestion.album }).select().single();
  if (error) throw new Error(error.message);
  return data as DismissedRow;
}

export async function deleteDismissed(supabase: SupabaseClient, id: number): Promise<void> {
  const { error } = await supabase.from("DismissedSuggestions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
