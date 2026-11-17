import { describe, expect, it } from "vitest";

import { formatLastPlayed, minutesText, parseStoredTime, playCountText, pressingDetails, ratingOf, stars, trackList, yearText }
  from "../src/lib/format";

describe("parseStoredTime", () => {
  it("reads older naive times as UTC", () => {
    expect(parseStoredTime("2026-10-11 13:04:00")?.toISOString()).toBe("2026-10-11T13:04:00.000Z");
    expect(parseStoredTime("2026-02-22 20:17")?.toISOString()).toBe("2026-02-22T20:17:00.000Z");
  });
  it("reads times with an offset", () => {
    expect(parseStoredTime("2026-10-25T15:17:00+03:00")?.toISOString()).toBe("2026-10-25T12:17:00.000Z");
  });
  it("gives null for empty or broken values", () => {
    expect(parseStoredTime(null)).toBeNull();
    expect(parseStoredTime("not a date")).toBeNull();
  });
});

describe("formatLastPlayed", () => {
  const now = new Date(2026, 10, 16, 12, 0);
  it("uses words for the last week", () => {
    expect(formatLastPlayed(new Date(2026, 10, 16, 8, 0), now)).toBe("Today");
    expect(formatLastPlayed(new Date(2026, 10, 15, 23, 0), now)).toBe("Yesterday");
    expect(formatLastPlayed(new Date(2026, 10, 13, 9, 0), now)).toBe("3 days ago");
  });
  it("uses a date after that, with the year only when it differs", () => {
    expect(formatLastPlayed(new Date(2026, 9, 25, 9, 0), now)).toBe("25 Oct");
    expect(formatLastPlayed(new Date(2025, 9, 25, 9, 0), now)).toBe("25 Oct 2025");
  });
  it("says so when never played", () => {
    expect(formatLastPlayed(null, now)).toBe("Not played yet");
  });
});

describe("small formatters", () => {
  it("formats ratings, years, minutes, tracks and play counts", () => {
    expect(ratingOf("4")).toBe(4);
    expect(ratingOf(9)).toBe(0);
    expect(stars(3)).toBe("★★★☆☆");
    expect(stars(0)).toBe("");
    expect(yearText(1990.0)).toBe("1990");
    expect(yearText("")).toBe("");
    expect(minutesText("47.0")).toBe("47 min");
    expect(minutesText(0)).toBe("");
    expect(trackList("One | Two |  ")).toEqual(["One", "Two"]);
    expect(playCountText(0)).toBe("Not played yet");
    expect(playCountText(1)).toBe("Played once");
    expect(playCountText(5)).toBe("Played 5 times");
  });
});

describe("pressingDetails", () => {
  it("lists the pressing in sleeve order and leaves out what is empty", () => {
    expect(pressingDetails({ Label: "Harvest", CatalogNumber: "SHVL 815", Format: "Vinyl, LP, Album", Country: " ", PressingYear: "1977" }))
      .toEqual([["Label", "Harvest"], ["Cat. no.", "SHVL 815"], ["Format", "Vinyl, LP, Album"], ["Year", "1977"]]);
    expect(pressingDetails({})).toEqual([]);
  });
});
