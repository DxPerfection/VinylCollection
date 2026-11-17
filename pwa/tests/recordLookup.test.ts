// @vitest-environment node
// The Supabase function's Discogs and Spotify logic, with Discogs and Spotify faked
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  albumLimitMs, marketPrices, quickLimitMs, releaseDetails, searchDiscogs, sideMinutes, sideOf, splitTitle, toDiscogsHit, toSeconds,
} from "../../supabase/functions/recordLookup/lookup";

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

describe("marketPrices", () => {
  it("asks Discogs once per release in the chosen currency, and gives null where Discogs can't say", async () => {
    const asked: string[] = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      asked.push(url);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Discogs token=t");
      if (url.includes("/stats/2")) return json({}, 404);
      if (url.includes("/stats/3")) return json({ lowest_price: null, num_for_sale: 0 });
      return json({ lowest_price: { value: 21.5, currency: "TRY" }, num_for_sale: 7 });
    };
    const prices = await marketPrices(fetcher, "t", [1, 2, 3, 1, -4], "TRY");
    expect(asked).toHaveLength(3);
    expect(asked[0]).toBe("https://api.discogs.com/marketplace/stats/1?curr_abbr=TRY");
    expect(prices).toEqual({ "1": { lowest: 21.5, currency: "TRY", forSale: 7 }, "2": null, "3": { lowest: null, currency: "TRY", forSale: 0 } });
  });
});

// An answer that takes waitMs to arrive, or never comes (Infinity), and stops when the lookup gives up
function slowly(init: RequestInit | undefined, waitMs: number, answer: () => Response) {
  return new Promise<Response>((resolve, reject) => {
    const timer = Number.isFinite(waitMs) ? setTimeout(() => resolve(answer()), waitMs) : undefined;
    init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(init.signal?.reason); });
  });
}

describe("time limits", () => {
  afterEach(() => vi.useRealTimers());

  const release = { title: "Meddle", artists_sort: "Pink Floyd", images: [{ uri: "https://discogs/m.jpg" }],
    tracklist: [{ position: "A1", title: "One Of These Days", duration: "6:00" }, { position: "B1", title: "Echoes", duration: "23:30" }] };

  it("gives up on a search after 8 seconds", async () => {
    vi.useFakeTimers();
    const found = searchDiscogs((_url, init) => slowly(init, Infinity, () => json({})), "t", "meddle");
    const outcome = expect(found).rejects.toMatchObject({ name: "TimeoutError", message: "Discogs took too long to answer." });
    await vi.advanceTimersByTimeAsync(quickLimitMs);
    await outcome;
    expect(quickLimitMs).toBe(8000);
  });

  it("gives up on the release itself after 8 seconds", async () => {
    vi.useFakeTimers();
    const found = releaseDetails((_url, init) => slowly(init, Infinity, () => json(release)),
      { discogsToken: "t" }, 7);
    const outcome = expect(found).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(quickLimitMs);
    await outcome;
  });

  it("stops waiting for a slow Spotify at 15 seconds and keeps the Discogs cover and length", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    // Discogs answers at once; each Spotify call takes 6 seconds, so the third would end past the limit
    const fetcher = (url: string, init?: RequestInit) => {
      if (url.includes("api.discogs.com")) return Promise.resolve(json(release));
      if (url.includes("accounts.spotify.com")) return slowly(init, 6000, () => json({ access_token: "sp" }));
      if (url.includes("/v1/search")) return slowly(init, 6000, () => json({ albums: { items: [{ id: "x", images: [{ url: "https://spotify/hd.jpg" }] }] } }));
      return slowly(init, 6000, () => json({ tracks: { items: [{ duration_ms: 2820000 }], next: null } }));
    };
    let details: Awaited<ReturnType<typeof releaseDetails>> | undefined;
    void releaseDetails(fetcher, { discogsToken: "t", spotifyClientId: "i", spotifyClientSecret: "s" }, 7).then((found) => { details = found; });
    await vi.advanceTimersByTimeAsync(albumLimitMs);
    expect(Date.now() - start).toBe(albumLimitMs);
    expect(details).toMatchObject({ coverUrl: "https://discogs/m.jpg", durationMins: 29, coverFromSpotify: false, lengthFromSpotify: false });
    expect(albumLimitMs).toBe(15000);
  });

  it("leaves out want list prices Discogs is too slow for, and stops at 15 seconds", async () => {
    vi.useFakeTimers();
    const asked: string[] = [];
    const fetcher = (url: string, init?: RequestInit) => {
      asked.push(url);
      if (url.includes("/stats/1?")) return Promise.resolve(json({ lowest_price: { value: 10, currency: "EUR" }, num_for_sale: 2 }));
      return slowly(init, Infinity, () => json({}));
    };
    let prices: Record<string, unknown> | undefined;
    void marketPrices(fetcher, "t", [1, 2, 3, 4, 5, 6, 7, 8, 9], "EUR").then((found) => { prices = found; });
    await vi.advanceTimersByTimeAsync(albumLimitMs);
    // First four at once (2 to 4 hang for 8 s), next four get the 7 s left, and 9 is never asked
    expect(prices).toEqual({ "1": { lowest: 10, currency: "EUR", forSale: 2 } });
    expect(asked).toHaveLength(8);
  });
});
