import { describe, expect, it } from "vitest";

import { canonicalGenre, editsFrom, isDuplicate, knownGenres, newInventoryRow, newRecordId, newWantRow, recordInfo } from "../src/lib/addRecord";
import type { ReleaseDetails } from "../src/lib/lookup";
import { sampleRecord, sampleRecords } from "./sampleData";

const release: ReleaseDetails = {
  discogsId: 555, artist: "Daft Punk", album: "Homework", year: "1997", genre: "electronic", subGenre: "House, Techno",
  coverUrl: "https://spotify/cover.jpg", label: "Virgin", catalogNumber: "V 2821", format: "Vinyl, LP, Album", country: "UK",
  tracks: ["Daftendirekt", "Revolution 909"], durationMins: 74, sideMins: "A:19|B:18|C:19|D:18",
  coverFromSpotify: true, lengthFromSpotify: true,
};

describe("genres", () => {
  it("lists genres in use first, then Discogs' defaults, one spelling each", () => {
    const records = [sampleRecord(1, { Genre: "Metal" }), sampleRecord(2, { Genre: "Metal" }), sampleRecord(3, { Genre: "Hip-Hop" })];
    const known = knownGenres(records);
    expect(known.slice(0, 3)).toEqual(["Metal", "Hip-Hop", "Rock"]);
    expect(known.filter((genre) => genre.toLowerCase().replace(/[^a-z]/g, "") === "hiphop")).toHaveLength(1);
  });
  it("saves a typed genre under the known spelling", () => {
    expect(canonicalGenre(" hip hop ", ["Hip Hop", "Rock"])).toBe("Hip Hop");
    expect(canonicalGenre("Shoegaze ", ["Rock"])).toBe("Shoegaze");
  });
});

describe("isDuplicate", () => {
  it("matches artist and album ignoring case and spaces", () => {
    expect(isDuplicate(" radiohead", "the bends ", sampleRecords)).toBe(true);
    expect(isDuplicate("Radiohead", "Kid A", sampleRecords)).toBe(false);
  });
});

describe("new rows", () => {
  it("gives a new record an unused Unix-seconds ID", () => {
    expect(newRecordId([sampleRecord(1700000000)], 1700000000500)).toBe(1700000001);
  });

  it("builds the record from the release and your edits, with the record info", () => {
    const known = knownGenres(sampleRecords);
    const edits = { ...editsFrom(release, known), condition: "Used", year: "1997 " };
    expect(edits.genre).toBe("Electronic");
    const row = newInventoryRow(release, edits, sampleRecords, known);
    expect(row).toMatchObject({
      Artist: "Daft Punk", AlbumName: "Homework", Genre: "Electronic", SubGenre: "House, Techno", Year: "1997",
      CoverURL: "https://spotify/cover.jpg", Condition: "Used", DurationMins: 74, Tracklist: "Daftendirekt | Revolution 909",
      DiscogsID: 555, Label: "Virgin", CatalogNumber: "V 2821", Format: "Vinyl, LP, Album", Country: "UK",
      SideMins: "A:19|B:18|C:19|D:18", PressingYear: "1997",
    });
  });

  it("leaves empty record info as empty", () => {
    expect(recordInfo({ ...release, label: "", sideMins: "" })).toMatchObject({ Label: null, SideMins: null, DiscogsID: 555 });
    expect(recordInfo({ ...release, year: "" }).PressingYear).toBeNull();
  });

  it("builds a want from a search result", () => {
    expect(newWantRow({ discogsId: 7, artist: "Duran Duran", album: "Rio", year: "1982", genre: "Pop", coverUrl: "",
      label: "EMI", catalogNumber: "", format: "", country: "" }, ["Pop"])).toEqual({
      Artist: "Duran Duran", AlbumName: "Rio", Year: "1982", Genre: "Pop", CoverURL: null, DiscogsID: 7,
    });
  });
});
