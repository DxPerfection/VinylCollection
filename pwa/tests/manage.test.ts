import { describe, expect, it } from "vitest";

import { recordColumns, toCsv } from "../src/lib/backup";
import { changesFrom, editFormFrom, editProblem, needsPlayLink, rescaleSides } from "../src/lib/manage";
import { sampleRecord, sampleRecords } from "./sampleData";

const known = ["Rock", "Metal", "Electronic", "Hip Hop"];

describe("editing a record", () => {
  it("shows the tracklist one track per line and saves only what changed", () => {
    const record = sampleRecord(1, { Tracklist: "One | Two | Three", Year: 1990, Rating: 4 });
    const form = editFormFrom(record);
    expect(form.tracks).toBe("One\nTwo\nThree");
    expect(form.year).toBe("1990");
    expect(changesFrom(form, record, known)).toEqual({});
    expect(changesFrom({ ...form, tracks: "One\n Two \n\nFour", genre: "hip-hop", subGenre: "  Trip  Hop " }, record, known))
      .toEqual({ Tracklist: "One | Two | Four", Genre: "Hip Hop", SubGenre: "Trip Hop" });
  });

  it("scales side lengths when the album length changes", () => {
    expect(rescaleSides("A:20|B:20", 40, 50)).toBe("A:25|B:25");
    expect(rescaleSides("A:19|B:29", 48, 48)).toBe("A:19|B:29");
    expect(rescaleSides(null, 40, 50)).toBeNull();
    const record = sampleRecord(1, { DurationMins: 40, SideMins: "A:20|B:20" });
    expect(changesFrom({ ...editFormFrom(record), durationMins: "50" }, record, known)).toEqual({ DurationMins: 50, SideMins: "A:25|B:25" });
  });

  it("refuses an empty name or a duplicate of another record, but not of itself", () => {
    const record = sampleRecords[0];
    expect(editProblem(editFormFrom(record), record, sampleRecords)).toBe("");
    expect(editProblem({ ...editFormFrom(record), album: " " }, record, sampleRecords)).toBe("The artist and album can't be empty.");
    expect(editProblem({ ...editFormFrom(record), artist: "Megadeth", album: "rust in peace" }, record, sampleRecords))
      .toBe("rust in peace by Megadeth is already in your collection.");
  });

  it("links old plays before a rename only when the old name is unique", () => {
    const twins = [sampleRecord(1, { AlbumName: "Greatest Hits" }), sampleRecord(2, { AlbumName: "greatest hits" })];
    expect(needsPlayLink(sampleRecords[0], "The Bends (Remaster)", sampleRecords)).toBe(true);
    expect(needsPlayLink(sampleRecords[0], "the bends ", sampleRecords)).toBe(false);
    expect(needsPlayLink(twins[0], "Hits", twins)).toBe(false);
  });
});

describe("CSV backups", () => {
  it("writes a byte order mark, the known columns first, and quotes where needed", () => {
    const csv = toCsv([{ ID: 1, AlbumName: 'Say "Hi", Bye', Artist: null, Extra: "x" }], ["ID", "Artist", "AlbumName"]);
    expect(csv).toBe('﻿ID,Artist,AlbumName,Extra\n1,,"Say ""Hi"", Bye",x\n');
  });

  it("keeps every known column for an empty table, and skips ones the rows don't have", () => {
    expect(toCsv([], ["id", "Date"])).toBe("﻿id,Date\n");
    expect(toCsv([sampleRecord(1)], recordColumns).split("\n")[0])
      .toBe("﻿ID,Artist,AlbumName,Genre,SubGenre,Year,CoverURL,Condition,DurationMins,Tracklist,Rating");
  });
});
