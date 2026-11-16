// Editing, rating and deleting a record you already have (the Manage section of the Streamlit app)
import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalGenre, isDuplicate } from "./addRecord";
import { toNumber } from "./format";
import type { VinylRecord } from "./records";

export interface EditForm {
  artist: string;
  album: string;
  year: string;
  durationMins: string;
  genre: string;
  subGenre: string;
  condition: string;
  coverUrl: string;
  tracks: string; // one track per line on screen, joined with " | " in the table
}

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const tidy = (value: unknown) => text(value).replace(/\s+/g, " ").trim();

export function editFormFrom(record: VinylRecord): EditForm {
  return {
    artist: text(record.Artist),
    album: text(record.AlbumName),
    year: text(record.Year),
    durationMins: toNumber(record.DurationMins) ? String(toNumber(record.DurationMins)) : "",
    genre: text(record.Genre).trim(),
    subGenre: text(record.SubGenre),
    condition: text(record.Condition),
    coverUrl: text(record.CoverURL),
    tracks: text(record.Tracklist).split(" | ").map((track) => track.trim()).filter(Boolean).join("\n"),
  };
}

// Side lengths are shares of the album, so a new album length scales them to match: "A:20|B:20" at 50 min is "A:25|B:25"
export function rescaleSides(sideMins: string | null | undefined, oldTotal: number, newTotal: number): string | null {
  if (!sideMins) return sideMins ?? null;
  const sides = sideMins.split("|").map((part) => part.split(":")).filter((pair) => pair.length === 2);
  const weights = sides.map(([, minutes]) => Number(minutes));
  const totalWeight = weights.reduce((sum, minutes) => sum + minutes, 0);
  if (!sides.length || weights.some((minutes) => !Number.isFinite(minutes)) || totalWeight <= 0 || newTotal <= 0
    || newTotal === oldTotal) return sideMins;
  return sides.map(([side], index) => `${side}:${Math.max(1, Math.round((newTotal * weights[index]) / totalWeight))}`).join("|");
}

// What the form says that differs from the record: only changed columns are sent, so an edit never blanks a column
// the form doesn't show (rating, Discogs info)
export function changesFrom(form: EditForm, record: VinylRecord, known: string[]): Partial<VinylRecord> {
  const minutes = Math.max(0, Math.round(Number(form.durationMins) || 0));
  const oldMinutes = toNumber(record.DurationMins) ?? 0;
  const next: Partial<VinylRecord> = {
    Artist: tidy(form.artist),
    AlbumName: tidy(form.album),
    Year: tidy(form.year),
    DurationMins: minutes,
    Genre: canonicalGenre(form.genre, known),
    SubGenre: tidy(form.subGenre),
    Condition: form.condition,
    CoverURL: form.coverUrl.trim(),
    Tracklist: form.tracks.split("\n").map((track) => track.trim()).filter(Boolean).join(" | "),
  };
  if (minutes !== oldMinutes && record.SideMins) next.SideMins = rescaleSides(record.SideMins, oldMinutes, minutes);

  const changes: Partial<VinylRecord> = {};
  for (const [key, value] of Object.entries(next) as [keyof VinylRecord, unknown][]) {
    const before = record[key];
    const same = key === "DurationMins" ? (toNumber(before) ?? 0) === value : text(before) === text(value);
    if (!same) (changes as Record<string, unknown>)[key] = value;
  }
  return changes;
}

export function editProblem(form: EditForm, record: VinylRecord, records: VinylRecord[]): string {
  if (!form.artist.trim() || !form.album.trim()) return "The artist and album can't be empty.";
  const others = records.filter((item) => Number(item.ID) !== Number(record.ID));
  if (isDuplicate(form.artist, form.album, others)) return `${form.album.trim()} by ${form.artist.trim()} is already in your collection.`;
  return "";
}

const nameKey = (value: unknown) => text(value).trim().toLowerCase();

// Plays logged before migration 001 only know the album name. Renaming a record whose name is unique pins those
// plays to it first, so the rename doesn't cut them off (as the Streamlit app does).
export function needsPlayLink(record: VinylRecord, newAlbum: string, records: VinylRecord[]): boolean {
  if (nameKey(newAlbum) === nameKey(record.AlbumName)) return false;
  return records.filter((item) => nameKey(item.AlbumName) === nameKey(record.AlbumName)).length === 1;
}

export async function linkPastPlays(supabase: SupabaseClient, record: VinylRecord): Promise<void> {
  const { error } = await supabase.from("ListeningHistory").update({ VinylID: Number(record.ID) })
    .eq("AlbumName", text(record.AlbumName)).is("VinylID", null);
  if (error) throw new Error(error.message);
}
