// @vitest-environment node
// The lastFm Supabase function's Last.fm logic, with Last.fm faked
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  allowedReturn, cleanScrobbles, connectLink, getSession, isTimeout, LastFmError, md5, needsReconnect, quickLimitMs, scrobbleParams,
  sendScrobbles, signature, worthRetrying,
} from "../../supabase/functions/lastFm/lastFmApi";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const keys = { apiKey: "key123", sharedSecret: "secret456" };

afterEach(() => {
  vi.useRealTimers();
});

describe("signing calls", () => {
  it("works out MD5 like everyone else", () => {
    expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5("The quick brown fox jumps over the lazy dog")).toBe("9e107d9d372bb6826bd81d3542a419d6");
    // Checked against Python's hashlib: Turkish letters, emoji, and lengths either side of MD5's 64-byte blocks
    expect(md5("Sezen Aksu – Gülümse")).toBe("63d5594024e04ef9277a9d07a80c7706");
    expect(md5("x".repeat(55))).toBe("04364420e25c512fd958a70738aa8f72");
    expect(md5("y".repeat(56))).toBe("6c830a5d23df58dbe0171eb5639bf3e4");
    expect(md5("z".repeat(64))).toBe("3ecc49f9d9d6c263b4f0de7fc3f38aed");
    expect(md5("Björk ☕ ".repeat(40))).toBe("1ead1255270ad521c1363115710ae559");
  });

  it("signs with sorted names, leaving out format and callback, secret on the end", () => {
    expect(signature({ token: "yyyyyy", method: "auth.getSession", api_key: "xxxxxxxxxx", format: "json" }, "ilovecher"))
      .toBe(md5("api_keyxxxxxxxxxxmethodauth.getSessiontokenyyyyyyilovecher"));
    // artist[10] sorts before artist[1], as Last.fm asks
    const params = { "artist[1]": "b", "artist[10]": "c", "artist[0]": "a" };
    expect(signature(params, "s")).toBe(md5("artist[0]aartist[10]cartist[1]bs"));
  });
});

describe("connecting", () => {
  it("links to Last.fm's yes page with the way back", () => {
    const url = new URL(connectLink("key123", "https://vinyl-records-8fp.pages.dev/"));
    expect(url.origin + url.pathname).toBe("https://www.last.fm/api/auth/");
    expect(url.searchParams.get("api_key")).toBe("key123");
    expect(url.searchParams.get("cb")).toBe("https://vinyl-records-8fp.pages.dev/");
  });

  it("only allows https pages or a computer's own test server as the way back", () => {
    expect(allowedReturn("https://vinyl-records-8fp.pages.dev/")).toBe(true);
    expect(allowedReturn("http://localhost:5173/")).toBe(true);
    expect(allowedReturn("http://example.com/")).toBe(false);
    expect(allowedReturn("javascript:alert(1)")).toBe(false);
    expect(allowedReturn("not a url")).toBe(false);
  });

  it("swaps the token for a session key with a signed call", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ session: { name: "harunemre", key: "sk-1", subscriber: 0 } }));
    expect(await getSession(fetcher, keys, "tok")).toEqual({ name: "harunemre", sessionKey: "sk-1" });
    const body = new URLSearchParams(String(fetcher.mock.calls[0][1]?.body));
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
    expect(body.get("method")).toBe("auth.getSession");
    expect(body.get("format")).toBe("json");
    expect(body.get("api_sig")).toBe(md5("api_keykey123methodauth.getSessiontokentoksecret456"));
  });

  it("says when the token was refused", async () => {
    const fetcher = async () => json({ error: 14, message: "Unauthorized Token" }, 403);
    const error = await getSession(fetcher, keys, "tok").catch((caught) => caught);
    expect(error).toBeInstanceOf(LastFmError);
    expect(needsReconnect(error)).toBe(true);
  });
});

describe("scrobbling", () => {
  const scrobbles = [
    { artist: "Daft Punk", track: "One More Time", album: "Discovery", timestamp: 1763380000, duration: 261, trackNumber: 1 },
    { artist: "Daft Punk", track: "Aerodynamic", album: "Discovery", timestamp: 1763380261, duration: 261, trackNumber: 2 },
  ];

  it("numbers each track's details", () => {
    const params = scrobbleParams("key123", "sk-1", scrobbles);
    expect(params).toMatchObject({
      method: "track.scrobble", sk: "sk-1", "artist[0]": "Daft Punk", "track[1]": "Aerodynamic", "timestamp[1]": "1763380261",
      "album[0]": "Discovery", "duration[0]": "261", "trackNumber[1]": "2",
    });
  });

  it("reads how many Last.fm took and why it skipped any", async () => {
    const fetcher = async () => json({
      scrobbles: {
        "@attr": { accepted: 1, ignored: 1 },
        scrobble: [{ ignoredMessage: { code: "0" } }, { ignoredMessage: { code: "3", "#text": "Timestamp too old" } }],
      },
    });
    expect(await sendScrobbles(fetcher, keys, "sk-1", scrobbles)).toEqual({ accepted: 1, ignored: 1, ignoredCodes: [3] });
  });

  it("reads a single answer that isn't in a list", async () => {
    const fetcher = async () => json({ scrobbles: { "@attr": { accepted: 1, ignored: 0 }, scrobble: { ignoredMessage: { code: "0" } } } });
    expect(await sendScrobbles(fetcher, keys, "sk-1", scrobbles.slice(0, 1))).toEqual({ accepted: 1, ignored: 0, ignoredCodes: [] });
  });

  it("tells a lost sign-in from Last.fm having trouble", async () => {
    const lost = await sendScrobbles(async () => json({ error: 9, message: "Invalid session key" }, 403), keys, "sk", scrobbles).catch((e) => e);
    expect(needsReconnect(lost)).toBe(true);
    const busy = await sendScrobbles(async () => json({ error: 16, message: "Try again" }, 503), keys, "sk", scrobbles).catch((e) => e);
    expect(worthRetrying(busy)).toBe(true);
    const down = await sendScrobbles(async () => new Response("Bad gateway", { status: 502 }), keys, "sk", scrobbles).catch((e) => e);
    expect(worthRetrying(down)).toBe(true);
  });

  it("gives up after 8 seconds", async () => {
    vi.useFakeTimers();
    const fetcher = (_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
    const sending = sendScrobbles(fetcher, keys, "sk", scrobbles).catch((error) => error);
    await vi.advanceTimersByTimeAsync(quickLimitMs);
    expect(isTimeout(await sending)).toBe(true);
  });

  it("cleans what the phone sends", () => {
    expect(cleanScrobbles([{ artist: " A ", track: "T", timestamp: "1763380000.7" }, { artist: "", track: "x", timestamp: 1 }, "junk"]))
      .toEqual([{ artist: "A", track: "T", album: "", timestamp: 1763380000, duration: undefined, trackNumber: undefined }]);
    expect(cleanScrobbles("nope")).toEqual([]);
  });
});
