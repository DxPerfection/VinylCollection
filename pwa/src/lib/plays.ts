// Logging plays, taking them back, and the list of recent plays
import type { SupabaseClient } from "@supabase/supabase-js";

import { parseStoredTime, toNumber } from "./format";
import type { PlayRow, VinylRecord } from "./records";

// "Full album", or a side such as "Side A" or "Side D"
export type PlayPart = string;

// Used when a record has no length saved, the same as the Streamlit app
export const fallbackMinutes = 45;

function albumMinutes(record: VinylRecord): number {
  const full = toNumber(record.DurationMins);
  return full && full > 0 ? Math.round(full) : fallbackMinutes;
}

// Minutes per side: the saved side lengths from Discogs ("A:24|B:25|C:20|D:22"), or two halves of the album
export function sidesOf(record: VinylRecord): { side: string; minutes: number }[] {
  const saved = String(record.SideMins ?? "").split("|").map((entry) => {
    const [side, minutes] = entry.split(":");
    return { side: side?.trim().toUpperCase() ?? "", minutes: Number(minutes) };
  }).filter((entry) => /^[A-Z]$/.test(entry.side) && entry.minutes > 0);
  if (saved.length >= 2) return saved;
  const half = Math.max(1, Math.round(albumMinutes(record) / 2));
  return [{ side: "A", minutes: half }, { side: "B", minutes: half }];
}

export function partsFor(record: VinylRecord): PlayPart[] {
  return ["Full album", ...sidesOf(record).map(({ side }) => `Side ${side}`)];
}

export function minutesFor(record: VinylRecord, part: PlayPart): number {
  if (part === "Full album") return albumMinutes(record);
  const side = part.replace(/^Side /, "");
  return sidesOf(record).find((entry) => entry.side === side)?.minutes ?? Math.max(1, Math.round(albumMinutes(record) / 2));
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

// Which part was played is not stored, so it is read from the minutes: the whole album, a side with its own
// saved length, or "One side" when the sides are just halves (or two sides have the same length)
export function partLabel(play: PlayRow, record: VinylRecord | undefined): string {
  const minutes = toNumber(play.DurationMins);
  if (!record || minutes === null) return "";
  if (minutes === minutesFor(record, "Full album")) return "Full album";
  const matches = sidesOf(record).filter((entry) => entry.minutes === minutes);
  if (matches.length === 1 && record.SideMins) return `Side ${matches[0].side}`;
  return matches.length ? "One side" : "";
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
