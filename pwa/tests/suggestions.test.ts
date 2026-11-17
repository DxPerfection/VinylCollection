// Working out want list suggestions from plays, ratings and Last.fm, with Last.fm and Discogs faked
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  artistKey, asWantRow, buildSuggestions, pickAlbum, pickRelease, rankCandidates, readSaved, reasonText, stillToShow, tasteSeeds,
  writeSaved, type Seed, type SuggestionSources,
} from "../src/lib/suggestions";
import type { CollectionData } from "../src/lib/records";
import { sampleRecord } from "./sampleData";

afterEach(() => localStorage.clear());

const now = Date.parse("2026-11-17T12:00:00Z");
const daysAgo = (days: number) => new Date(now - days * 86400000).toISOString().replace(/\.\d+Z$/, "+00:00");

const data: CollectionData = {
  records: [
    sampleRecord(1, { Artist: "Daft Punk", AlbumName: "Discovery", Rating: 5 }),
    sampleRecord(2, { Artist: "Pink Floyd", AlbumName: "Meddle", Rating: 4 }),
    sampleRecord(3, { Artist: "Sezen Aksu", AlbumName: "Gülümse", Rating: null }),
  ],
  plays: [
    ...Array.from({ length: 6 }, (_, index) => ({ id: index + 1, Date: daysAgo(2 + index), AlbumName: "Discovery", DurationMins: 61, VinylID: 1 })),
    ...Array.from({ length: 6 }, (_, index) => ({ id: index + 20, Date: daysAgo(400 + index), AlbumName: "Meddle", DurationMins: 46, VinylID: 2 })),
  ],
  wants: [{ id: 9, Artist: "Air", AlbumName: "Moon Safari", Year: "1998", Genre: null, CoverURL: null, DiscogsID: null }],
};

describe("names", () => {
  it("treats spelling differences as the same artist", () => {
    expect(artistKey("The Beatles")).toBe(artistKey("beatles "));
    expect(artistKey("Sigur Rós")).toBe(artistKey("Sigur Ros"));
    expect(artistKey("Simon & Garfunkel")).toBe(artistKey("Simon and Garfunkel"));
    expect(artistKey(null)).toBe("");
  });
});

describe("your taste", () => {
  it("weighs recent plays more than old ones, and adds ratings", () => {
    const seeds = tasteSeeds(data, [], now);
    expect(seeds.map((seed) => seed.name)).toEqual(["Daft Punk", "Pink Floyd", "Sezen Aksu"]);
    expect(seeds[0].reason).toBe("6 plays");
    expect(seeds[2].reason).toBe("in your collection");
    // six plays over a year ago count for less than six this month
    expect(seeds[0].weight - 2).toBeGreaterThan(seeds[1].weight - 1);
  });

  it("adds Last.fm top artists, and says when that's the only reason", () => {
    const seeds = tasteSeeds(data, [{ name: "Massive Attack", count: 300 }, { name: "Daft Punk", count: 100 }], now);
    expect(seeds.find((seed) => seed.name === "Massive Attack")?.reason).toBe("on your Last.fm");
    expect(seeds.filter((seed) => seed.key === artistKey("Daft Punk"))).toHaveLength(1);
  });

  it("says rated when there are no plays", () => {
    const rated = { ...data, plays: [] };
    expect(tasteSeeds(rated, [], now)[0]).toMatchObject({ name: "Daft Punk", reason: "rated 5★" });
  });
});

const seed = (name: string, weight: number, reason: string): Seed => ({ name, key: artistKey(name), weight, reason });

describe("new artists", () => {
  it("adds up similarity over your artists and leaves out what you have", () => {
    const seeds = [seed("Daft Punk", 4, "14 plays"), seed("Pink Floyd", 2, "rated 5★")];
    const similar = {
      "Daft Punk": [{ name: "Justice", match: 1 }, { name: "Air", match: 0.9 }, { name: "Cassius", match: 0.5 }],
      "Pink Floyd": [{ name: "Cassius", match: 0.6 }, { name: "Camel", match: 0.8 }, { name: "Daft Punk", match: 0.1 }],
    };
    const ranked = rankCandidates(seeds, similar, new Set([artistKey("Air"), artistKey("Daft Punk")]));
    expect(ranked.map((item) => [item.name, Number(item.score.toFixed(2))])).toEqual([["Justice", 4], ["Cassius", 3.2], ["Camel", 1.6]]);
    expect(reasonText(ranked[1].because)).toBe("Like Daft Punk (14 plays) and Pink Floyd (rated 5★)");
  });

  it("passes over hits collections and prefers a vinyl release by that artist", () => {
    expect(pickAlbum([{ name: "Greatest Hits", count: 9, imageUrl: "" }, { name: "Cross", count: 5, imageUrl: "" }])?.name).toBe("Cross");
    expect(pickAlbum([])).toBeNull();
    const hit = (artist: string, format: string, discogsId: number) => ({
      discogsId, artist, album: "Cross", year: "2007", genre: "Electronic", coverUrl: "", label: "", catalogNumber: "", format, country: "",
    });
    expect(pickRelease([hit("Someone Else", "Vinyl", 1), hit("Justice", "CD", 2), hit("Justice", "Vinyl, LP", 3)], "Justice")?.discogsId).toBe(3);
  });
});

function fakeSources(overrides: Partial<SuggestionSources> = {}): SuggestionSources {
  return {
    topArtists: vi.fn(async () => [{ name: "Massive Attack", count: 200 }]),
    similar: vi.fn(async () => ({
      "Daft Punk": [{ name: "Justice", match: 1 }, { name: "Air", match: 0.9 }],
      "Massive Attack": [{ name: "Portishead", match: 0.95 }],
    })),
    topAlbums: vi.fn(async () => ({
      Justice: [{ name: "Cross", count: 10, imageUrl: "https://lastfm/cross.jpg" }],
      Portishead: [{ name: "Dummy", count: 10, imageUrl: "https://lastfm/dummy.jpg" }],
    })),
    search: vi.fn(async (query: string) => query.startsWith("Justice") ? [{
      discogsId: 777, artist: "Justice", album: "†", year: "2007", genre: "Electronic", coverUrl: "https://discogs/cross.jpg", label: "",
      catalogNumber: "", format: "Vinyl, LP, Album", country: "France",
    }] : []),
    prices: vi.fn(async () => ({ "777": { lowest: 24.5, currency: "EUR", forSale: 12 } })),
    spotify: vi.fn(async () => ({ "Justice|Cross": "https://open.spotify.com/album/cross", "Portishead|Dummy": null })),
    ...overrides,
  };
}

describe("the whole list", () => {
  it("comes back with a release, price and reason for each new artist", async () => {
    const sources = fakeSources();
    const list = await buildSuggestions(data, [], "harunemre", sources, now);
    expect(sources.topArtists).toHaveBeenCalledWith("harunemre");
    expect(list.map((item) => item.artist)).toEqual(["Justice", "Portishead"]); // Daft Punk outweighs a Last.fm-only artist
    const justice = list.find((item) => item.artist === "Justice")!;
    expect(justice).toMatchObject({ album: "Cross", discogsId: 777, year: "2007", coverUrl: "https://discogs/cross.jpg",
      price: { lowest: 24.5, currency: "EUR", forSale: 12 } });
    expect(justice.reason).toMatch(/^Like Daft Punk \(6 plays\)/);
    // Discogs couldn't find it: Last.fm's picture, no price
    expect(list.find((item) => item.artist === "Portishead")).toMatchObject({ discogsId: null, coverUrl: "https://lastfm/dummy.jpg" });
    expect(list.find((item) => item.artist === "Air")).toBeUndefined(); // already wanted
    expect(justice.spotifyUrl).toBe("https://open.spotify.com/album/cross");
    expect(list.find((item) => item.artist === "Portishead")?.spotifyUrl).toBeNull();
  });

  it("leaves out artists said no to, and carries on without Last.fm top artists", async () => {
    const sources = fakeSources({ topArtists: vi.fn(async () => { throw new Error("slow"); }) });
    const list = await buildSuggestions(data, ["justice"], null, sources, now);
    expect(sources.topArtists).not.toHaveBeenCalled();
    expect(list.map((item) => item.artist)).toEqual([]);
  });

  it("is kept on the phone and filtered as things change", () => {
    const item = { artist: "Justice", album: "Cross", year: "2007", genre: "", coverUrl: "", discogsId: 777, reason: "" };
    writeSaved([item], 1234);
    expect(readSaved()).toEqual({ builtAt: 1234, items: [item] });
    expect(stillToShow([item], data, [])).toHaveLength(1);
    expect(stillToShow([item], data, ["Justice"])).toHaveLength(0);
    expect(stillToShow([item], { ...data, wants: [...data.wants, { ...data.wants[0], id: 10, Artist: "Justice" }] }, [])).toHaveLength(0);
    expect(asWantRow(item)).toEqual({ Artist: "Justice", AlbumName: "Cross", Year: "2007", Genre: null, CoverURL: null, DiscogsID: 777 });
  });
});
