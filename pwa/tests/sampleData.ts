// A small made-up collection for the tests
import type { PlayRow, VinylRecord } from "../src/lib/records";

export function sampleRecord(id: number, overrides: Partial<VinylRecord> = {}): VinylRecord {
  return {
    ID: id, Artist: `Artist ${id}`, AlbumName: `Album ${id}`, Genre: "Rock", SubGenre: "", Year: "1990",
    CoverURL: "", Condition: "Mint", DurationMins: 40, Tracklist: "One | Two", Rating: null, ...overrides,
  };
}

export const sampleRecords: VinylRecord[] = [
  sampleRecord(1700000001, { Artist: "Radiohead", AlbumName: "The Bends", Year: "1995", DurationMins: 48, Rating: 4 }),
  sampleRecord(1700000002, { Artist: "Megadeth", AlbumName: "Rust In Peace", Genre: "Metal", Year: 1990, DurationMins: 57, Rating: 5 }),
  sampleRecord(1700000003, { Artist: "Daft Punk", AlbumName: "Discovery", Genre: "Electronic", Year: "2001", DurationMins: 61 }),
  sampleRecord(1700000004, { Artist: "Linkin Park", AlbumName: "Hybrid Theory", Genre: "Metal", Year: "2000", DurationMins: null }),
];

export const samplePlays: PlayRow[] = [
  { id: 1, Date: "2026-10-11 13:04:00", AlbumName: "The Bends", DurationMins: 48, VinylID: null },
  { id: 2, Date: "2026-10-25T12:17:00+00:00", AlbumName: "Rust In Peace", DurationMins: 57, VinylID: 1700000002 },
  { id: 3, Date: "2026-10-20T09:00:00+00:00", AlbumName: "Rust In Peace", DurationMins: 28, VinylID: 1700000002 },
];
