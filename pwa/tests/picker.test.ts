import { describe, expect, it } from "vitest";

import { linkPlays } from "../src/lib/collectionView";
import {
  daysSince, decadeOf, decadesInUse, lastPlayedArtist, noFilter, pickCandidates, pickReason, weightedPick,
} from "../src/lib/picker";
import type { PlayRow } from "../src/lib/records";
import { sampleRecord, sampleRecords } from "./sampleData";

const now = new Date(2026, 10, 16, 18, 0);
const play = (id: number, vinylId: number, when: Date): PlayRow =>
  ({ id, Date: when.toISOString(), AlbumName: "", DurationMins: 40, VinylID: vinylId });
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000);
const ids = (list: { record: { ID: number } }[]) => list.map((item) => item.record.ID).sort();

describe("decades", () => {
  it("names the decade of a year, and lists those in use", () => {
    expect(decadeOf("1997")).toBe("1990s");
    expect(decadeOf(2001)).toBe("2000s");
    expect(decadeOf("")).toBeNull();
    expect(decadeOf("unknown")).toBeNull();
    expect(decadesInUse(sampleRecords)).toEqual(["1990s", "2000s"]);
  });
});

describe("daysSince", () => {
  it("counts calendar days in local time", () => {
    expect(daysSince(new Date(2026, 10, 16, 1, 0), now)).toBe(0);
    expect(daysSince(new Date(2026, 10, 15, 23, 59), now)).toBe(1);
    expect(daysSince(null, now)).toBeNull();
  });
});

describe("pickCandidates", () => {
  it("weights never-played records most, then the longest waiting, with ratings tipping the scale", () => {
    const records = linkPlays(sampleRecords, [play(1, 1700000001, daysAgo(10)), play(2, 1700000002, daysAgo(10))]);
    const byId = new Map(pickCandidates(records, noFilter, [], now).map((candidate) => [candidate.record.ID, candidate]));
    expect(byId.get(1700000001)?.weight).toBeCloseTo((10 + 7) * 1.3); // 4 stars
    expect(byId.get(1700000002)?.weight).toBeCloseTo((10 + 7) * 1.6); // 5 stars
    expect(byId.get(1700000003)?.weight).toBe(60 + 7); // never played, no rating
  });

  it("rests records played in the last 3 days unless nothing else is left", () => {
    const records = linkPlays(sampleRecords, [play(1, 1700000003, daysAgo(1))]);
    expect(ids(pickCandidates(records, noFilter, [], now))).not.toContain(1700000003);
    const onlyElectronic = pickCandidates(records, { ...noFilter, genres: ["Electronic"] }, [], now);
    expect(ids(onlyElectronic)).toEqual([1700000003]);
  });

  it("filters by genre, time, decade and rating; records without a length fit any time", () => {
    const records = linkPlays(sampleRecords, []);
    expect(ids(pickCandidates(records, { ...noFilter, genres: ["Metal"] }, [], now))).toEqual([1700000002, 1700000004]);
    expect(ids(pickCandidates(records, { ...noFilter, maxMinutes: 45 }, [], now))).toEqual([1700000004]);
    expect(ids(pickCandidates(records, { ...noFilter, decades: ["2000s"] }, [], now))).toEqual([1700000003, 1700000004]);
    expect(ids(pickCandidates(records, { ...noFilter, minRating: 5 }, [], now))).toEqual([1700000002]);
    expect(pickCandidates(records, { ...noFilter, minRating: 5, genres: ["Rock"] }, [], now)).toEqual([]);
  });

  it("skips the artists to avoid, unless they are all that is left", () => {
    const records = linkPlays([sampleRecord(1, { Artist: "Tool" }), sampleRecord(2, { Artist: "Tool" }), sampleRecord(3, { Artist: "Opeth" })], []);
    expect(ids(pickCandidates(records, noFilter, ["tool ", null], now))).toEqual([3]);
    expect(ids(pickCandidates(records, noFilter, ["Tool", "Opeth"], now))).toEqual([1, 2, 3]);
  });
});

describe("weightedPick and reasons", () => {
  it("draws by weight", () => {
    const records = linkPlays([sampleRecord(1), sampleRecord(2)], []);
    const candidates = [{ record: records[0], daysAgo: null, weight: 1 }, { record: records[1], daysAgo: null, weight: 3 }];
    expect(weightedPick(candidates, () => 0.2)?.record.ID).toBe(1);
    expect(weightedPick(candidates, () => 0.3)?.record.ID).toBe(2);
    expect(weightedPick([], () => 0.5)).toBeNull();
  });

  it("says why, and finds the last artist played", () => {
    const records = linkPlays(sampleRecords, [play(1, 1700000002, daysAgo(3)), play(2, 1700000003, daysAgo(40))]);
    expect(lastPlayedArtist(records)).toBe("Megadeth");
    const [megadeth] = records.filter((record) => record.ID === 1700000002);
    expect(pickReason({ record: megadeth, daysAgo: 3, weight: 1 })).toBe("Last played 3 days ago. You gave it 5 stars.");
    expect(pickReason({ record: records[2], daysAgo: 40, weight: 1 })).toBe("Last played 6 weeks ago.");
    expect(pickReason({ record: records[3], daysAgo: null, weight: 1 })).toBe("You have not logged a play of this one yet.");
    expect(pickReason({ record: records[3], daysAgo: 0, weight: 1 })).toBe("You played it earlier today.");
  });
});
