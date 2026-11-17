// "Listen on Spotify" links on the phone
import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("../src/lib/lookup", async (actual) => ({
  ...(await actual<typeof import("../src/lib/lookup")>()),
  callLookup: (...args: unknown[]) => invoke(...args),
}));
const { cachedLink, fetchSpotifyLinks, listenUrl, spotifySearchUrl } = await import("../src/lib/spotify");

afterEach(() => {
  localStorage.clear();
  invoke.mockReset();
});

describe("Spotify links", () => {
  it("falls back to a Spotify search", () => {
    expect(spotifySearchUrl("Sezen Aksu", "Gülümse")).toBe("https://open.spotify.com/search/Sezen%20Aksu%20G%C3%BCl%C3%BCmse");
    expect(listenUrl("Justice", "Cross", "https://open.spotify.com/album/cross")).toBe("https://open.spotify.com/album/cross");
    expect(listenUrl("Justice", "Cross", null)).toBe("https://open.spotify.com/search/Justice%20Cross");
  });

  it("asks once and keeps the answer, including 'not on Spotify'", async () => {
    invoke.mockResolvedValue({ links: { "Justice|Cross": "https://open.spotify.com/album/cross", "A|B": null } });
    const asks = [{ artist: "Justice", album: "Cross" }, { artist: "A", album: "B" }];
    expect(await fetchSpotifyLinks({} as never, asks)).toEqual({ "Justice|Cross": "https://open.spotify.com/album/cross", "A|B": null });
    await fetchSpotifyLinks({} as never, asks);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(cachedLink({ artist: "A", album: "B" })).toBeNull();
    expect(cachedLink({ artist: "C", album: "D" })).toBeUndefined();
  });
});
