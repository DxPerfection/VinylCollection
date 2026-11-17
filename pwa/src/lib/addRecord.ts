// Turning a Discogs release into a record or a want, keeping genres tidy and catching duplicates
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DiscogsHit, ReleaseDetails } from "./lookup";
import type { VinylRecord, WantRow } from "./records";

// Discogs' own genre names, plus Metal, offered even before a record of that genre exists (as in vinyl/genres.py)
export const defaultGenres = ["Rock", "Metal", "Electronic", "Jazz", "Pop", "Hip Hop", "Classical", "Blues", "Funk / Soul",
  "Reggae", "Latin", "Folk, World, & Country", "Stage & Screen"];
export const conditions = ["New", "Used", "Mint", "Fair"];

// Only letters and digits count: "Hip-Hop", "hip hop" and "Hip Hop " share the key "hiphop"
export const genreKey = (text: unknown) => String(text ?? "").toLowerCase().replace(/[^0-9a-z]/g, "");
const tidy = (text: unknown) => String(text ?? "").replace(/\s+/g, " ").trim();

// The genres in use, most records first, each under its most common spelling, then the defaults not yet used
export function knownGenres(records: VinylRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const genre = tidy(record.Genre);
    if (genre) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  const spellings = new Map<string, string>();
  for (const [genre] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    if (!spellings.has(genreKey(genre))) spellings.set(genreKey(genre), genre);
  }
  for (const genre of defaultGenres) if (!spellings.has(genreKey(genre))) spellings.set(genreKey(genre), genre);
  return [...spellings.values()];
}

// A typed genre that matches a known one is saved with the known spelling; anything else is just tidied
export function canonicalGenre(text: string, known: string[]): string {
  const cleaned = tidy(text);
  return known.find((genre) => genreKey(genre) === genreKey(cleaned)) ?? cleaned;
}

const nameKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function isDuplicate(artist: string, album: string, rows: { Artist: string | null; AlbumName: string | null }[]): boolean {
  return rows.some((row) => nameKey(row.Artist) === nameKey(artist) && nameKey(row.AlbumName) === nameKey(album));
}

// Record IDs are Unix seconds, as in the Streamlit app; step past any already taken
export function newRecordId(records: VinylRecord[], now: number = Date.now()): number {
  const taken = new Set(records.map((record) => Number(record.ID)));
  let id = Math.floor(now / 1000);
  while (taken.has(id)) id += 1;
  return id;
}

export interface RecordEdits {
  artist: string;
  album: string;
  year: string;
  genre: string;
  subGenre: string;
  durationMins: number;
  condition: string;
}

export function editsFrom(release: ReleaseDetails, known: string[]): RecordEdits {
  return {
    artist: release.artist,
    album: release.album,
    year: release.year,
    genre: canonicalGenre(release.genre, known),
    subGenre: release.subGenre,
    durationMins: release.durationMins,
    condition: "New",
  };
}

// The record info a Discogs release adds to a record, whether new or matched later
export function recordInfo(release: ReleaseDetails): Pick<VinylRecord, "DiscogsID" | "Label" | "CatalogNumber" | "Format" | "Country" | "SideMins"> {
  return {
    DiscogsID: release.discogsId || null,
    Label: release.label || null,
    CatalogNumber: release.catalogNumber || null,
    Format: release.format || null,
    Country: release.country || null,
    SideMins: release.sideMins || null,
  };
}

// A record typed in by hand: no Discogs release, so the cover link and tracklist come from what was typed
export function handRelease(coverUrl: string, tracklist: string): ReleaseDetails {
  return {
    discogsId: 0, artist: "", album: "", year: "", genre: "", subGenre: "", coverUrl: coverUrl.trim(), label: "", catalogNumber: "",
    format: "", country: "", tracks: tracklist.split(/\n|\|/).map((track) => track.trim()).filter(Boolean), durationMins: 0, sideMins: "",
    coverFromSpotify: false, lengthFromSpotify: false,
  };
}

// What the search result already said, for when Discogs is too slow or fails to give the whole release: no
// tracklist, length or Discogs match, so "Match on Discogs" on the record can fill those in later
export function hitRelease(hit: DiscogsHit): ReleaseDetails {
  return { ...handRelease(hit.coverUrl, ""), artist: hit.artist, album: hit.album, year: hit.year, genre: hit.genre };
}

export const blankEdits = (artist = "", album = ""): RecordEdits =>
  ({ artist, album, year: "", genre: "", subGenre: "", durationMins: 0, condition: "New" });

export function newInventoryRow(release: ReleaseDetails, edits: RecordEdits, records: VinylRecord[], known: string[]): VinylRecord {
  return {
    ID: newRecordId(records),
    Artist: tidy(edits.artist),
    AlbumName: tidy(edits.album),
    Genre: canonicalGenre(edits.genre, known),
    SubGenre: tidy(edits.subGenre),
    Year: tidy(edits.year),
    CoverURL: release.coverUrl,
    Condition: edits.condition,
    DurationMins: Math.max(0, Math.round(edits.durationMins || 0)),
    Tracklist: release.tracks.join(" | "),
    ...recordInfo(release),
  };
}

export function newWantRow(hit: DiscogsHit, known: string[]): Omit<WantRow, "id"> {
  return {
    Artist: hit.artist,
    AlbumName: hit.album,
    Year: hit.year || null,
    Genre: hit.genre ? canonicalGenre(hit.genre, known) : null,
    CoverURL: hit.coverUrl || null,
    DiscogsID: hit.discogsId || null,
  };
}

export async function insertRecord(supabase: SupabaseClient, row: VinylRecord): Promise<VinylRecord> {
  const { data, error } = await supabase.from("Inventory").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as VinylRecord;
}

export async function deleteRecord(supabase: SupabaseClient, id: number): Promise<void> {
  const { error } = await supabase.from("Inventory").delete().eq("ID", id);
  if (error) throw new Error(error.message);
}

export async function updateRecord(supabase: SupabaseClient, id: number, change: Partial<VinylRecord>): Promise<VinylRecord> {
  const { data, error } = await supabase.from("Inventory").update(change).eq("ID", id).select().single();
  if (error) throw new Error(error.message);
  return data as VinylRecord;
}

export async function insertWant(supabase: SupabaseClient, row: Omit<WantRow, "id">): Promise<WantRow> {
  const { data, error } = await supabase.from("Wantlist").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as WantRow;
}

export async function deleteWant(supabase: SupabaseClient, id: number): Promise<void> {
  const { error } = await supabase.from("Wantlist").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
