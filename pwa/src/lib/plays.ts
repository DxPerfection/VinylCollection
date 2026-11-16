// Logging plays, taking them back, and the list of recent plays
import type { SupabaseClient } from "@supabase/supabase-js";

import { parseStoredTime, toNumber } from "./format";
import type { PlayRow, VinylRecord } from "./records";

export type PlayPart = "Full album" | "Side A" | "Side B";
export const playParts: PlayPart[] = ["Full album", "Side A", "Side B"];

// Used when a record has no length saved, the same as the Streamlit app
export const fallbackMinutes = 45;

// A side counts as half the album until real side lengths come from Discogs
export function minutesFor(record: VinylRecord, part: PlayPart): number {
  const full = toNumber(record.DurationMins);
  const albumMinutes = full && full > 0 ? Math.round(full) : fallbackMinutes;
  return part === "Full album" ? albumMinutes : Math.max(1, Math.round(albumMinutes / 2));
}

// Plays are stored in UTC, to the minute, in the same shape the Streamlit app writes
export function toStoredTime(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())}T` +
    `${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}:00+00:00`;
}

export function newPlayRow(record: VinylRecord, part: PlayPart, playedAt: Date): Omit<PlayRow, "id"> {
  return {
    Date: toStoredTime(playedAt),
    AlbumName: record.AlbumName,
    DurationMins: minutesFor(record, part),
    VinylID: Number(record.ID),
  };
}

export async function insertPlay(supabase: SupabaseClient, row: Omit<PlayRow, "id">): Promise<PlayRow> {
  const { data, error } = await supabase.from("ListeningHistory").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as PlayRow;
}

export async function deletePlay(supabase: SupabaseClient, playId: number): Promise<void> {
  const { error } = await supabase.from("ListeningHistory").delete().eq("id", playId);
  if (error) throw new Error(error.message);
}

export interface PlayView {
  play: PlayRow;
  when: Date | null;
  record: VinylRecord | undefined;
  partLabel: string;
}

// Which part was played is not stored, so it is read from the minutes: the whole album or half of it
export function partLabel(play: PlayRow, record: VinylRecord | undefined): string {
  const minutes = toNumber(play.DurationMins);
  if (!record || minutes === null) return "";
  if (minutes === minutesFor(record, "Full album")) return "Full album";
  if (minutes === minutesFor(record, "Side A")) return "One side";
  return "";
}

const nameKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

// Newest first. Plays without a usable time go last.
export function recentPlays(plays: PlayRow[], records: VinylRecord[]): PlayView[] {
  const byId = new Map(records.map((record) => [Number(record.ID), record]));
  const nameCounts = new Map<string, number>();
  for (const record of records) nameCounts.set(nameKey(record.AlbumName), (nameCounts.get(nameKey(record.AlbumName)) ?? 0) + 1);
  const byName = new Map(records.filter((record) => nameCounts.get(nameKey(record.AlbumName)) === 1)
    .map((record) => [nameKey(record.AlbumName), record]));

  return plays
    .map((play) => {
      const vinylId = toNumber(play.VinylID);
      const record = vinylId !== null ? byId.get(vinylId) : byName.get(nameKey(play.AlbumName));
      return { play, when: parseStoredTime(play.Date), record, partLabel: partLabel(play, record) };
    })
    .sort((a, b) => (b.when?.getTime() ?? -Infinity) - (a.when?.getTime() ?? -Infinity) || Number(b.play.id) - Number(a.play.id));
}

// "Today", "Yesterday", then "Sat 14 Nov" (with the year once it is not this year)
export function dayHeading(when: Date | null, now: Date = new Date()): string {
  if (!when) return "Unknown date";
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(when)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
  if (when.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return when.toLocaleDateString("en-GB", options).replace(",", "");
}

export function timeOfDay(when: Date | null): string {
  return when ? when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
}

// The value for an <input type="datetime-local"> showing this moment on the phone's clock
export function toLocalInputValue(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

export function fromLocalInputValue(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
