// Linking plays to records, and the search, genre filter and sort on the Collection screen
import { parseStoredTime, ratingOf, toNumber } from "./format";
import type { PlayRow, VinylRecord } from "./records";

export interface RecordView extends VinylRecord {
  playCount: number;
  lastPlayed: Date | null;
  rating: number;
}

const nameKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

// Plays logged since migration 001 carry VinylID. Older plays fall back to an album name match, used only when
// exactly one record has that name (the same rule as the Streamlit app).
export function linkPlays(records: VinylRecord[], plays: PlayRow[]): RecordView[] {
  const nameCounts = new Map<string, number>();
  for (const record of records) nameCounts.set(nameKey(record.AlbumName), (nameCounts.get(nameKey(record.AlbumName)) ?? 0) + 1);
  const idByName = new Map<string, number>();
  for (const record of records) {
    if (nameCounts.get(nameKey(record.AlbumName)) === 1) idByName.set(nameKey(record.AlbumName), Number(record.ID));
  }

  const statsById = new Map<number, { playCount: number; lastPlayed: Date | null }>();
  for (const play of plays) {
    const vinylId = toNumber(play.VinylID) ?? idByName.get(nameKey(play.AlbumName));
    if (vinylId === undefined || vinylId === null) continue;
    const stats = statsById.get(vinylId) ?? { playCount: 0, lastPlayed: null };
    stats.playCount += 1;
    const when = parseStoredTime(play.Date);
    if (when && (!stats.lastPlayed || when > stats.lastPlayed)) stats.lastPlayed = when;
    statsById.set(vinylId, stats);
  }

  return records.map((record) => ({
    ...record,
    playCount: statsById.get(Number(record.ID))?.playCount ?? 0,
    lastPlayed: statsById.get(Number(record.ID))?.lastPlayed ?? null,
    rating: ratingOf(record.Rating),
  }));
}

// Genres in use, most records first
export function genresInUse(records: VinylRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const genre = String(record.Genre ?? "").trim();
    if (genre) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([genre]) => genre);
}

export const sortOptions = [
  "Recently added",
  "Recently listened",
  "Artist A-Z",
  "Album A-Z",
  "Year (newest)",
  "Year (oldest)",
  "Longest first",
  "Top rated",
] as const;
export type SortOption = (typeof sortOptions)[number];

type SortValue = string | number | null;
const sortKeys: Record<SortOption, [(record: RecordView) => SortValue, "asc" | "desc"]> = {
  "Recently added": [(r) => Number(r.ID), "desc"],
  "Recently listened": [(r) => r.lastPlayed?.getTime() ?? null, "desc"],
  "Artist A-Z": [(r) => nameKey(r.Artist) || null, "asc"],
  "Album A-Z": [(r) => nameKey(r.AlbumName) || null, "asc"],
  "Year (newest)": [(r) => toNumber(r.Year), "desc"],
  "Year (oldest)": [(r) => toNumber(r.Year), "asc"],
  "Longest first": [(r) => toNumber(r.DurationMins), "desc"],
  "Top rated": [(r) => r.rating || null, "desc"],
};

export interface CollectionFilter {
  search: string;
  genre: string | null;
  sort: SortOption;
  // Only records not matched to a Discogs release yet
  unmatchedOnly?: boolean;
}

// Records with nothing to sort by (never played, no year, not rated) always go last
export function filterAndSort(records: RecordView[], filter: CollectionFilter): RecordView[] {
  const query = filter.search.trim().toLowerCase();
  const shown = records.filter((record) => {
    if (filter.genre && String(record.Genre ?? "").trim() !== filter.genre) return false;
    if (filter.unmatchedOnly && record.DiscogsID) return false;
    if (!query) return true;
    return nameKey(record.AlbumName).includes(query) || nameKey(record.Artist).includes(query) || nameKey(record.Note).includes(query);
  });
  const [keyOf, direction] = sortKeys[filter.sort];
  return shown
    .map((record, index) => ({ record, index, key: keyOf(record) }))
    .sort((a, b) => {
      if (a.key === null && b.key === null) return a.index - b.index;
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      const order = typeof a.key === "string" ? a.key.localeCompare(String(b.key)) : Number(a.key) - Number(b.key);
      return (direction === "asc" ? order : -order) || a.index - b.index;
    })
    .map(({ record }) => record);
}
