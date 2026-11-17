// CSV backups of the three tables, in the same shape as the Streamlit app's (vinyl/backup.py), so its Restore reads them:
// a byte order mark for Excel, one column per table column, empty cells for missing values, times in UTC as stored.
import type { CollectionData } from "./records";

export const recordColumns = ["ID", "Artist", "AlbumName", "Genre", "SubGenre", "Year", "CoverURL", "Condition", "DurationMins",
  "Tracklist", "Rating", "DiscogsID", "Label", "CatalogNumber", "Format", "Country", "SideMins",
  "PressingYear", "Note"];
export const playColumns = ["id", "Date", "AlbumName", "DurationMins", "VinylID"];
export const wantColumns = ["id", "Artist", "AlbumName", "Year", "Genre", "CoverURL", "DiscogsID", "AddedAt", "Priority", "Note"];

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const textValue = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
}

// The known columns first, then any column the table has that this app doesn't know about yet
export function toCsv(rows: object[], knownColumns: string[]): string {
  const extra = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((column) => !knownColumns.includes(column));
  const present = new Set(rows.flatMap((row) => Object.keys(row)));
  const columns = [...knownColumns.filter((column) => !rows.length || present.has(column)), ...extra];
  const lines = [columns.map(cell).join(",")];
  for (const row of rows) lines.push(columns.map((column) => cell((row as Record<string, unknown>)[column])).join(","));
  return "﻿" + lines.join("\n") + "\n";
}

export interface BackupFile {
  label: string;
  count: number;
  fileName: string;
  csv: () => string;
}

export function backupFiles(data: CollectionData, today: Date = new Date()): BackupFile[] {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return [
    { label: "Records", count: data.records.length, fileName: `vinyl-records-${stamp}.csv`, csv: () => toCsv(data.records, recordColumns) },
    { label: "Listening history", count: data.plays.length, fileName: `vinyl-listening-history-${stamp}.csv`, csv: () => toCsv(data.plays, playColumns) },
    { label: "Want list", count: data.wants.length, fileName: `vinyl-want-list-${stamp}.csv`, csv: () => toCsv(data.wants, wantColumns) },
  ];
}

export function downloadText(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
