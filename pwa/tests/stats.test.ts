import { describe, expect, it } from "vitest";

import type { PlayRow } from "../src/lib/records";
import {
  conditionBars, decadeBars, gatheringDust, genreBars, minutesLabel, playFacts, playsByWeekday, reviewYears, streaks, topAlbums,
  topArtists, weeklyHours, yearInReview,
} from "../src/lib/stats";
import { sampleRecords } from "./sampleData";

// Local times, so the tests hold in any time zone
const at = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h).toISOString();
const play = (id: number, when: string, album: string, minutes: number, vinylId: number | null = null): PlayRow =>
  ({ id, Date: when, AlbumName: album, DurationMins: minutes, VinylID: vinylId });

const plays = [
  play(1, at(2026, 11, 13), "The Bends", 48),                     // old play, linked by its unique name
  play(2, at(2026, 11, 14), "Rust In Peace", 57, 1700000002),
  play(3, at(2026, 11, 15), "Rust In Peace", 28, 1700000002),
  play(4, at(2026, 11, 10), "Discovery", 61, 1700000003),
  play(5, at(2025, 3, 2), "Lost Album", 30),                       // no record any more
];
const facts = playFacts(sampleRecords, plays);
const now = new Date(2026, 10, 16, 9);

describe("stats", () => {
  it("links plays to records and labels them Artist - Album", () => {
    expect(facts.map((fact) => fact.album)).toEqual(["Radiohead - The Bends", "Megadeth - Rust In Peace", "Megadeth - Rust In Peace",
      "Daft Punk - Discovery", "Lost Album"]);
    expect(facts[4].artist).toBeNull();
  });

  it("counts streaks, keeping today's streak alive until the day after the last play", () => {
    expect(streaks(facts, now)).toEqual({ current: 3, longest: 3, days: 5 });
    expect(streaks(facts, new Date(2026, 10, 18)).current).toBe(0);
    expect(streaks([], now)).toEqual({ current: 0, longest: 0, days: 0 });
  });

  it("ranks albums by plays or minutes, and artists by minutes", () => {
    expect(topAlbums(facts, "Plays").slice(0, 2)).toEqual([
      { label: "Megadeth - Rust In Peace", value: 2, extra: "1h 25m" },
      { label: "Daft Punk - Discovery", value: 1, extra: "1h 1m" },
    ]);
    expect(topAlbums(facts, "Minutes")[0]).toEqual({ label: "Megadeth - Rust In Peace", value: 85, extra: "2 plays" });
    expect(topArtists(facts).map((bar) => bar.label)).toEqual(["Megadeth", "Daft Punk", "Radiohead"]);
  });

  it("buckets plays by weekday and by week", () => {
    const days = playsByWeekday(facts);
    expect(days.find((bar) => bar.label === "Sun")?.value).toBe(2); // 15 Nov 2026 and 2 Mar 2025
    expect(days.reduce((sum, bar) => sum + bar.value, 0)).toBe(5);
    const weeks = weeklyHours(facts, now);
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toEqual({ label: "16 Nov", value: 0 });
    expect(weeks[10]).toEqual({ label: "9 Nov", value: Math.round(((61 + 48 + 57 + 28) / 60) * 10) / 10 });
  });

  it("finds records gathering dust, never-played first", () => {
    const dusty = gatheringDust(sampleRecords, facts, now);
    expect(dusty[0].record.AlbumName).toBe("Hybrid Theory");
    expect(dusty[0].lastPlayed).toBeNull();
    expect(dusty[1].record.AlbumName).toBe("Discovery");
    expect(dusty[1].daysAgo).toBe(6);
  });

  it("sums up a year", () => {
    expect(reviewYears(facts)).toEqual([2026, 2025]);
    const review = yearInReview(facts, 2026);
    expect(review).toMatchObject({ minutes: 194, plays: 4, albums: 3, busiestMonth: "November", topArtist: "Megadeth", topAlbum: "Megadeth - Rust In Peace" });
    expect(review.months).toHaveLength(12);
    expect(minutesLabel(194)).toBe("3h 14m");
    expect(minutesLabel(45)).toBe("45 mins");
  });

  it("counts genres, decades and conditions on the shelf", () => {
    expect(genreBars(sampleRecords)).toEqual([{ label: "Metal", value: 2 }, { label: "Electronic", value: 1 }, { label: "Rock", value: 1 }]);
    expect(decadeBars(sampleRecords)).toEqual([{ label: "1990s", value: 2 }, { label: "2000s", value: 2 }]);
    expect(conditionBars(sampleRecords)).toEqual([{ label: "Mint", value: 4 }]);
  });
});
