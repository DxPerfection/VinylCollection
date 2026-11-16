import { describe, expect, it } from "vitest";

import { playColumns, recordColumns, toCsv, wantColumns } from "../src/lib/backup";
import { backupKind, parseCsv, planPlayRestore, planRecordRestore, planSummary, planWantRestore } from "../src/lib/restore";
import { samplePlays, sampleRecord, sampleRecords } from "./sampleData";

describe("parseCsv", () => {
  it("reads quoted cells with commas, quotes and line breaks, and skips the byte order mark", () => {
    const { columns, rows } = parseCsv('﻿ID,Note\r\n1,"Kadıköy, ""2xLP""\nsecond line"\r\n2,plain\r\n');
    expect(columns).toEqual(["ID", "Note"]);
    expect(rows).toEqual([{ ID: "1", Note: 'Kadıköy, "2xLP"\nsecond line' }, { ID: "2", Note: "plain" }]);
  });

  it("reads back what the backup writes", () => {
    const records = [sampleRecord(1, { AlbumName: 'Say "Hi", again', Tracklist: "A | B" })];
    const { columns, rows } = parseCsv(toCsv(records, recordColumns));
    expect(backupKind(columns)).toBe("records");
    expect(rows[0].AlbumName).toBe('Say "Hi", again');
  });
});

describe("backupKind", () => {
  it("tells the three files apart by their columns", () => {
    expect(backupKind(recordColumns)).toBe("records");
    expect(backupKind(playColumns)).toBe("plays");
    expect(backupKind(wantColumns)).toBe("wants");
    expect(backupKind(["Name", "Email"])).toBeNull();
  });
});

describe("planRecordRestore", () => {
  it("adds only missing records and leaves the rest alone", () => {
    const { rows } = parseCsv(toCsv([
      ...sampleRecords.slice(0, 2),
      sampleRecord(5, { Artist: "Radiohead", AlbumName: "the bends " }), // same album under another ID
      sampleRecord(6, { AlbumName: "New One", Rating: 4, DiscogsID: 99, Label: "Harvest", DurationMins: 41 }),
    ], recordColumns));
    rows.push({ ID: "abc", Artist: "X", AlbumName: "Y" });
    const plan = planRecordRestore(rows, sampleRecords);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toAdd[0]).toMatchObject({ ID: 6, AlbumName: "New One", Rating: 4, DiscogsID: 99, Label: "Harvest", DurationMins: 41 });
    expect([plan.have, plan.sameAlbum, plan.unusable]).toEqual([2, 1, 1]);
    expect(planSummary(plan)).toBe("5 records in the file: 1 to restore, 2 already in the app, 1 with the same artist and album under another ID, 1 without what a row needs");
  });
});

describe("planPlayRestore", () => {
  it("counts identical plays, so two in the file need two in the app", () => {
    const twice = [samplePlays[1], { ...samplePlays[1], id: 9 }, samplePlays[2]];
    const { rows } = parseCsv(toCsv(twice, playColumns));
    const plan = planPlayRestore(rows, samplePlays);
    expect(plan.have).toBe(2);
    expect(plan.toAdd).toEqual([{ Date: "2026-10-25T12:17:00+00:00", AlbumName: "Rust In Peace", DurationMins: 57, VinylID: 1700000002 }]);
  });
});

describe("planWantRestore", () => {
  it("skips wants already on the list and keeps priority, note and when it was added", () => {
    const current = [{ id: 1, Artist: "Tool", AlbumName: "Lateralus", Year: null, Genre: null, CoverURL: null, DiscogsID: null }];
    const { rows } = parseCsv(toCsv([
      { ...current[0], id: 7 },
      { id: 8, Artist: "Miles Davis", AlbumName: "Kind Of Blue", Year: "1959", Genre: "Jazz", CoverURL: "", DiscogsID: 503,
        AddedAt: "2026-09-01T10:00:00+00:00", Priority: 1, Note: "Mono" },
    ], wantColumns));
    const plan = planWantRestore(rows, current);
    expect(plan.have).toBe(1);
    expect(plan.toAdd).toEqual([{ Artist: "Miles Davis", AlbumName: "Kind Of Blue", Year: "1959", Genre: "Jazz", CoverURL: null,
      DiscogsID: 503, Note: "Mono", Priority: 1, AddedAt: "2026-09-01T10:00:00+00:00" }]);
  });
});
