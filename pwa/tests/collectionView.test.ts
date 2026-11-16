import { describe, expect, it } from "vitest";

import { filterAndSort, genresInUse, linkPlays } from "../src/lib/collectionView";
import { samplePlays, sampleRecord, sampleRecords } from "./sampleData";

const albums = (records: { AlbumName: string | null }[]) => records.map((record) => record.AlbumName);

describe("linkPlays", () => {
  it("counts plays by VinylID and by a unique album name", () => {
    const linked = linkPlays(sampleRecords, samplePlays);
    const bends = linked.find((record) => record.AlbumName === "The Bends")!;
    const rust = linked.find((record) => record.AlbumName === "Rust In Peace")!;
    expect(bends.playCount).toBe(1);
    expect(rust.playCount).toBe(2);
    expect(rust.lastPlayed?.toISOString()).toBe("2026-10-25T12:17:00.000Z");
    expect(linked.find((record) => record.AlbumName === "Discovery")!.playCount).toBe(0);
  });

  it("does not guess when two records share an album name", () => {
    const records = [sampleRecord(1, { AlbumName: "Megadeth" }), sampleRecord(2, { AlbumName: "megadeth " })];
    const linked = linkPlays(records, [{ id: 1, Date: "2026-10-01 10:00:00", AlbumName: "Megadeth", DurationMins: 40 }]);
    expect(linked.map((record) => record.playCount)).toEqual([0, 0]);
  });
});

describe("genresInUse", () => {
  it("lists genres with the most records first", () => {
    expect(genresInUse(sampleRecords)).toEqual(["Metal", "Electronic", "Rock"]);
  });
});

describe("filterAndSort", () => {
  const records = linkPlays(sampleRecords, samplePlays);

  it("searches artist and album, ignoring case", () => {
    expect(albums(filterAndSort(records, { search: "RADIO", genre: null, sort: "Recently added" }))).toEqual(["The Bends"]);
    expect(albums(filterAndSort(records, { search: "theory", genre: null, sort: "Recently added" }))).toEqual(["Hybrid Theory"]);
  });

  it("filters by genre", () => {
    expect(albums(filterAndSort(records, { search: "", genre: "Metal", sort: "Album A-Z" }))).toEqual(["Hybrid Theory", "Rust In Peace"]);
  });

  it("sorts newest added first", () => {
    expect(albums(filterAndSort(records, { search: "", genre: null, sort: "Recently added" })))
      .toEqual(["Hybrid Theory", "Discovery", "Rust In Peace", "The Bends"]);
  });

  it("puts never-played, unrated and unknown-length records last", () => {
    expect(albums(filterAndSort(records, { search: "", genre: null, sort: "Recently listened" })))
      .toEqual(["Rust In Peace", "The Bends", "Discovery", "Hybrid Theory"]);
    expect(albums(filterAndSort(records, { search: "", genre: null, sort: "Top rated" })))
      .toEqual(["Rust In Peace", "The Bends", "Discovery", "Hybrid Theory"]);
    expect(albums(filterAndSort(records, { search: "", genre: null, sort: "Longest first" })))
      .toEqual(["Discovery", "Rust In Peace", "The Bends", "Hybrid Theory"]);
  });

  it("sorts by year both ways, with mixed text and number years", () => {
    expect(albums(filterAndSort(records, { search: "", genre: null, sort: "Year (oldest)" })))
      .toEqual(["Rust In Peace", "The Bends", "Hybrid Theory", "Discovery"]);
    expect(albums(filterAndSort(records, { search: "", genre: null, sort: "Year (newest)" })))
      .toEqual(["Discovery", "Hybrid Theory", "The Bends", "Rust In Peace"]);
  });
});
