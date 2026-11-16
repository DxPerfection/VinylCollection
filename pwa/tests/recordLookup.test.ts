// @vitest-environment node
// The Supabase function's Discogs and Spotify logic, with Discogs and Spotify faked
import { describe, expect, it } from "vitest";

import { releaseDetails, searchDiscogs, sideMinutes, sideOf, splitTitle, toDiscogsHit, toSeconds } from "../../supabase/functions/recordLookup/lookup";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("small helpers", () => {
  it("splits Discogs titles and tidies artist numbers", () => {
    expect(splitTitle("Sertab (2) - Sertab")).toEqual({ artist: "Sertab", album: "Sertab" });
    expect(splitTitle("Megadeth - Rust In Peace")).toEqual({ artist: "Megadeth", album: "Rust In Peace" });
    expect(splitTitle("Untitled")).toEqual({ artist: "", album: "Untitled" });
  });
  it("reads track times and side letters", () => {
    expect(toSeconds("4:05")).toBe(245);
    expect(toSeconds("1:02:03")).toBe(3723);
    expect(toSeconds("")).toBe(0);
    expect(sideOf("A1")).toBe("A");
    expect(sideOf("D")).toBe("D");
    expect(sideOf("1-B2")).toBe("B");
    expect(sideOf("3")).toBe("");
    expect(sideOf("CD1-3")).toBe("");
  });
  it("reads a search result", () => {
    expect(toDiscogsHit({
      id: 123, title: "Pink Floyd - Meddle", year: "1971", genre: ["Rock"], cover_image: "https://img/x.jpg",
      label: ["Harvest", "EMI"], catno: "SHVL 795", format: ["Vinyl", "LP", "Album", "Vinyl"], country: "UK",
    })).toEqual({
      discogsId: 123, artist: "Pink Floyd", album: "Meddle", year: "1971", genre: "Rock", coverUrl: "https://img/x.jpg",
      label: "Harvest", catalogNumber: "SHVL 795", format: "Vinyl, LP, Album", country: "UK",
    });
  });
});

describe("sideMinutes", () => {
  const tracks = [
    { position: "A1", duration: "10:00" }, { position: "A2", duration: "10:00" },
    { position: "B1", duration: "30:00" }, { position: "", title: "Bonus", type_: "heading" },
  ];
  it("shares the album length by Discogs side times", () => {
    expect(sideMinutes(tracks, 48)).toBe("A:19|B:29"); // 20 of 50 minutes, and 30 of 50
    expect(sideMinutes([{ position: "A1", duration: "15:00" }, { position: "B1", duration: "45:00" }], 40)).toBe("A:10|B:30");
  });
  it("uses track counts when a time is missing, and handles four sides", () => {
    expect(sideMinutes([{ position: "A1" }, { position: "B1" }, { position: "C1" }, { position: "D1", duration: "5:00" }], 80))
      .toBe("A:20|B:20|C:20|D:20");
  });
  it("gives nothing for CD-style numbering or a single side", () => {
    expect(sideMinutes([{ position: "1" }, { position: "2" }], 40)).toBe("");
    expect(sideMinutes([{ position: "A1" }, { position: "A2" }], 40)).toBe("");
  });
});

describe("searchDiscogs", () => {
  it("sends the token and returns at most ten results", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      seen.push({ url, auth: new Headers(init?.headers).get("Authorization") });
      return json({ results: Array.from({ length: 12 }, (_, index) => ({ id: index + 1, title: `A - B${index}` })) });
    };
    const results = await searchDiscogs(fetcher, "tok", "rust in peace");
    expect(results).toHaveLength(10);
    expect(seen[0].url).toContain("q=rust+in+peace");
    expect(seen[0].auth).toBe("Discogs token=tok");
  });
  it("reports a refusal", async () => {
    await expect(searchDiscogs(async () => json({}, 429), "tok", "x")).rejects.toThrow("api.discogs.com answered 429");
  });
});

describe("releaseDetails", () => {
  const release = {
    title: "Rust In Peace", artists_sort: "Megadeth", year: 1990, genres: ["Rock"], styles: ["Thrash", "Speed Metal"],
    images: [{ uri: "https://discogs/cover.jpg" }], labels: [{ name: "Capitol Records", catno: "C1-91935" }],
    formats: [{ name: "Vinyl", descriptions: ["LP", "Album"], text: "180g" }], country: "US",
    tracklist: [
      { position: "A1", title: "Holy Wars", duration: "6:30" }, { position: "A2", title: "Hangar 18", duration: "5:10" },
      { position: "B1", title: "Tornado Of Souls", duration: "5:20" }, { position: "B2", title: "Dawn Patrol", duration: "1:50" },
    ],
  };

  it("takes the cover and length from Spotify, everything else from Discogs", async () => {
    const fetcher = async (url: string) => {
      if (url.includes("api.discogs.com/releases/99")) return json(release);
      if (url.includes("accounts.spotify.com")) return json({ access_token: "sp", expires_in: 3600 });
      if (url.includes("/v1/search")) return json({ albums: { items: [{ id: "abc", images: [{ url: "https://spotify/hd.jpg" }] }] } });
      if (url.includes("/v1/albums/abc")) {
        return json({ tracks: { items: Array.from({ length: 9 }, () => ({ duration_ms: 380000 })), next: null } });
      }
      throw new Error(`unexpected ${url}`);
    };
    const details = await releaseDetails(fetcher, { discogsToken: "t", spotifyClientId: "i", spotifyClientSecret: "s" }, 99);
    expect(details).toMatchObject({
      discogsId: 99, artist: "Megadeth", album: "Rust In Peace", year: "1990", genre: "Rock", subGenre: "Thrash, Speed Metal",
      coverUrl: "https://spotify/hd.jpg", label: "Capitol Records", catalogNumber: "C1-91935", format: "Vinyl, LP, Album, 180g",
      country: "US", tracks: ["Holy Wars", "Hangar 18", "Tornado Of Souls", "Dawn Patrol"], durationMins: 57,
      coverFromSpotify: true, lengthFromSpotify: true,
    });
    // Discogs says side A is 11:40 of 18:50; that share of Spotify's 57 minutes
    expect(details.sideMins).toBe("A:35|B:22");
  });

  it("falls back to Discogs when Spotify fails or has no keys", async () => {
    const fetcher = async (url: string) => (url.includes("api.discogs.com") ? json(release) : json({}, 500));
    const details = await releaseDetails(fetcher, { discogsToken: "t", spotifyClientId: "i", spotifyClientSecret: "s" }, 99);
    expect(details.coverUrl).toBe("https://discogs/cover.jpg");
    expect(details.durationMins).toBe(18);
    expect(details.lengthFromSpotify).toBe(false);
    const noKeys = await releaseDetails(async () => json(release), { discogsToken: "t" }, 99);
    expect(noKeys.durationMins).toBe(18);
  });
});
