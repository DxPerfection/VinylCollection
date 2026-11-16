// Restoring from a CSV backup, add-only like the Streamlit app's Manage → Restore (vinyl/backup.py): rows the app
// already has are left alone, nothing is ever changed or deleted. Reads the files this app and the Streamlit app
// write, and the weekly GitHub backups.
import type { SupabaseClient } from "@supabase/supabase-js";

import { isDuplicate } from "./addRecord";
import type { CollectionData, PlayRow, VinylRecord, WantRow } from "./records";

export type CsvRow = Record<string, string>;

// A small CSV reader: quoted cells may hold commas, quotes ("") and line breaks; a byte order mark is skipped
export function parseCsv(text: string): { columns: string[]; rows: CsvRow[] } {
  const source = text.replace(/^﻿/, "");
  const lines: string[][] = [];
  let line: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { line.push(value); value = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      line.push(value); value = "";
      lines.push(line); line = [];
    } else value += char;
  }
  if (value || line.length) { line.push(value); lines.push(line); }
  const nonEmpty = lines.filter((cells) => cells.some((cell) => cell.trim()));
  const columns = (nonEmpty[0] ?? []).map((column) => column.trim());
  const rows = nonEmpty.slice(1).map((cells) => Object.fromEntries(columns.map((column, at) => [column, cells[at] ?? ""])));
  return { columns, rows };
}

export type BackupKind = "records" | "plays" | "wants";

const required: Record<BackupKind, string[]> = {
  records: ["ID", "Artist", "AlbumName"],
  plays: ["Date", "AlbumName"],
  wants: ["Artist", "AlbumName", "Priority"],
};

// Which table a file is a backup of, from its columns
export function backupKind(columns: string[]): BackupKind | null {
  const has = (names: string[]) => names.every((name) => columns.includes(name));
  if (has(required.records)) return "records";
  if (has(required.plays)) return "plays";
  if (has(required.wants) || (has(["Artist", "AlbumName", "AddedAt"]))) return "wants";
  return null;
}

// "43" or "43.0" -> 43; empty or not a number -> null
export function toNumberOrNull(text: unknown): number | null {
  const cleaned = String(text ?? "").trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

const wholeNumber = (text: unknown) => {
  const number = toNumberOrNull(text);
  return number !== null && Number.isInteger(number) ? number : null;
};
const textOrNull = (text: unknown) => (String(text ?? "").trim() ? String(text) : null);

export interface RestorePlan<T> {
  kind: BackupKind;
  inFile: number;
  toAdd: T[];
  have: number; // already in the app
  sameAlbum: number; // the same artist and album under another ID
  unusable: number; // rows without what a row needs
}

const recordTextColumns = ["Artist", "AlbumName", "Genre", "SubGenre", "Year", "CoverURL", "Condition", "Tracklist"] as const;
const recordInfoColumns = ["Label", "CatalogNumber", "Format", "Country", "SideMins"] as const;

export function planRecordRestore(rows: CsvRow[], current: VinylRecord[]): RestorePlan<VinylRecord> {
  const known = new Set(current.map((record) => Number(record.ID)));
  const plan: RestorePlan<VinylRecord> = { kind: "records", inFile: rows.length, toAdd: [], have: 0, sameAlbum: 0, unusable: 0 };
  for (const raw of rows) {
    const id = wholeNumber(raw.ID);
    if (id === null || !String(raw.AlbumName ?? "").trim()) plan.unusable += 1;
    else if (known.has(id)) plan.have += 1;
    else if (isDuplicate(raw.Artist, raw.AlbumName, [...current, ...plan.toAdd])) plan.sameAlbum += 1;
    else {
      const row: VinylRecord = { ID: id, DurationMins: null } as VinylRecord;
      for (const column of recordTextColumns) (row as unknown as Record<string, unknown>)[column] = raw[column] ?? "";
      row.DurationMins = toNumberOrNull(raw.DurationMins);
      const rating = wholeNumber(raw.Rating);
      if (rating !== null && rating >= 1 && rating <= 5) row.Rating = rating;
      const discogsId = wholeNumber(raw.DiscogsID);
      if (discogsId !== null && discogsId > 0) row.DiscogsID = discogsId;
      for (const column of recordInfoColumns) if (String(raw[column] ?? "").trim()) row[column] = raw[column];
      plan.toAdd.push(row);
      known.add(id);
    }
  }
  return plan;
}

const playKey = (date: unknown, album: unknown, minutes: unknown, vinylId: unknown) =>
  [String(date ?? "").trim(), String(album ?? "").trim(), toNumberOrNull(minutes), toNumberOrNull(vinylId)].join("|");

// A play id doesn't survive a restore, so a play counts as present when the app has one with the same time, album,
// minutes and record. Two identical plays in the file need two in the app.
export function planPlayRestore(rows: CsvRow[], current: PlayRow[]): RestorePlan<Omit<PlayRow, "id">> {
  const held = new Map<string, number>();
  for (const play of current) {
    const key = playKey(play.Date, play.AlbumName, play.DurationMins, play.VinylID);
    held.set(key, (held.get(key) ?? 0) + 1);
  }
  const plan: RestorePlan<Omit<PlayRow, "id">> = { kind: "plays", inFile: rows.length, toAdd: [], have: 0, sameAlbum: 0, unusable: 0 };
  for (const raw of rows) {
    const key = playKey(raw.Date, raw.AlbumName, raw.DurationMins, raw.VinylID);
    if (!String(raw.Date ?? "").trim() || !String(raw.AlbumName ?? "").trim()) plan.unusable += 1;
    else if ((held.get(key) ?? 0) > 0) {
      held.set(key, (held.get(key) ?? 0) - 1);
      plan.have += 1;
    } else {
      const vinylId = wholeNumber(raw.VinylID);
      plan.toAdd.push({ Date: raw.Date.trim(), AlbumName: raw.AlbumName, DurationMins: toNumberOrNull(raw.DurationMins), VinylID: vinylId });
    }
  }
  return plan;
}

// A want counts as present when the want list already has the same artist and album
export function planWantRestore(rows: CsvRow[], current: WantRow[]): RestorePlan<Omit<WantRow, "id">> {
  const plan: RestorePlan<Omit<WantRow, "id">> = { kind: "wants", inFile: rows.length, toAdd: [], have: 0, sameAlbum: 0, unusable: 0 };
  for (const raw of rows) {
    if (!String(raw.Artist ?? "").trim() || !String(raw.AlbumName ?? "").trim()) plan.unusable += 1;
    else if (isDuplicate(raw.Artist, raw.AlbumName, [...current, ...plan.toAdd])) plan.have += 1;
    else {
      const priority = wholeNumber(raw.Priority);
      const discogsId = wholeNumber(raw.DiscogsID);
      const row: Omit<WantRow, "id"> = {
        Artist: raw.Artist, AlbumName: raw.AlbumName, Year: textOrNull(raw.Year), Genre: textOrNull(raw.Genre),
        CoverURL: textOrNull(raw.CoverURL), DiscogsID: discogsId !== null && discogsId > 0 ? discogsId : null, Note: textOrNull(raw.Note),
      };
      if (priority !== null && priority >= 1 && priority <= 3) row.Priority = priority;
      if (String(raw.AddedAt ?? "").trim()) row.AddedAt = raw.AddedAt.trim();
      plan.toAdd.push(row);
    }
  }
  return plan;
}

export function planRestore(kind: BackupKind, rows: CsvRow[], data: CollectionData): RestorePlan<object> {
  if (kind === "records") return planRecordRestore(rows, data.records);
  if (kind === "plays") return planPlayRestore(rows, data.plays);
  return planWantRestore(rows, data.wants);
}

export const tableFor: Record<BackupKind, string> = { records: "Inventory", plays: "ListeningHistory", wants: "Wantlist" };

export function planSummary(plan: RestorePlan<object>): string {
  const noun = plan.kind === "wants" ? "wants" : plan.kind;
  const parts = [`${plan.inFile} ${noun} in the file: ${plan.toAdd.length} to restore`];
  if (plan.have) parts.push(`${plan.have} already in the app`);
  if (plan.sameAlbum) parts.push(`${plan.sameAlbum} with the same artist and album under another ID`);
  if (plan.unusable) parts.push(`${plan.unusable} without what a row needs`);
  return parts.join(", ");
}

// Saves in chunks of 200. A chunk the database refuses is tried row by row so one bad row can't block the rest;
// a lost connection stops there, since that chunk may have been saved and trying again could add it twice.
export async function insertInChunks(supabase: SupabaseClient, table: string, rows: object[], chunkSize = 200):
  Promise<{ added: number; firstError: string | null }> {
  let added = 0;
  let firstError: string | null = null;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (!error) { added += chunk.length; continue; }
    firstError ??= error.message;
    if (!error.code) break; // no code: the request never got an answer from the database
    for (const row of chunk) {
      const single = await supabase.from(table).insert(row);
      if (!single.error) added += 1;
    }
  }
  return { added, firstError };
}
