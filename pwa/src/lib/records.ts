// Reading the collection and the listening history from Supabase
import type { SupabaseClient } from "@supabase/supabase-js";

// One row of the Inventory table
export interface VinylRecord {
  ID: number;
  Artist: string | null;
  AlbumName: string | null;
  Genre: string | null;
  SubGenre: string | null;
  Year: string | number | null;
  CoverURL: string | null;
  Condition: string | null;
  DurationMins: number | string | null;
  Tracklist: string | null;
  Rating?: number | null;
  // Record info from Discogs (migration 006); empty for records added before it or not matched yet
  DiscogsID?: number | null;
  Label?: string | null;
  CatalogNumber?: string | null;
  Format?: string | null;
  Country?: string | null;
  SideMins?: string | null;
}

// One row of the Wantlist table
export interface WantRow {
  id: number;
  Artist: string;
  AlbumName: string;
  Year: string | null;
  Genre: string | null;
  CoverURL: string | null;
  DiscogsID: number | null;
  AddedAt?: string;
  Priority?: number;
  Note?: string | null;
}

// One row of the ListeningHistory table. Date is UTC: either ISO with an offset, or an older naive string.
export interface PlayRow {
  id: number;
  Date: string | null;
  AlbumName: string | null;
  DurationMins: number | string | null;
  VinylID?: number | null;
}

const pageSize = 1000;

// Supabase hands back at most 1000 rows per request, so read page after page until one comes back short.
// The order keeps the pages from overlapping.
export async function fetchAllRows<T>(supabase: SupabaseClient, table: string, orderColumn: string): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderColumn)
      .range(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

export interface CollectionData {
  records: VinylRecord[];
  plays: PlayRow[];
  wants: WantRow[];
}

export async function fetchCollection(supabase: SupabaseClient): Promise<CollectionData> {
  const [records, plays, wants] = await Promise.all([
    fetchAllRows<VinylRecord>(supabase, "Inventory", "ID"),
    fetchAllRows<PlayRow>(supabase, "ListeningHistory", "id"),
    fetchAllRows<WantRow>(supabase, "Wantlist", "id"),
  ]);
  return { records, plays, wants };
}
