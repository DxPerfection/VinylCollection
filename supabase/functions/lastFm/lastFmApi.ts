// Last.fm calls for the phone app: the one-time sign-in link, swapping its token for a session key, and sending
// scrobbles. Free of Deno and Supabase imports so the phone app's tests can check it too.
// API rules: https://www.last.fm/api/scrobbling and https://www.last.fm/api/authspec

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const apiRoot = "https://ws.audioscrobbler.com/2.0/";
export const authPage = "https://www.last.fm/api/auth/";

// The same limits as the Discogs lookups: one call gets 8 seconds, a bigger job 15
export const quickLimitMs = 8000;
export const longLimitMs = 15000;

// Last.fm takes at most 50 scrobbles in one call
export const batchLimit = 50;

export interface LastFmKeys {
  apiKey: string;
  sharedSecret: string;
}

export function timeoutError(): Error {
  const error = new Error("Last.fm took too long to answer.");
  error.name = "TimeoutError";
  return error;
}

export const isTimeout = (error: unknown) => error instanceof Error && error.name === "TimeoutError";

// An error Last.fm itself sent back, with its number (https://www.last.fm/api/errorcodes)
export class LastFmError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message || `Last.fm error ${code}`);
    this.name = "LastFmError";
    this.code = code;
  }
}

// 9: the session key no longer works (access was taken back on Last.fm); 4, 14, 15: the sign-in token was bad,
// not allowed or too old. Each one means connecting again.
export const needsReconnect = (error: unknown) => error instanceof LastFmError && [4, 9, 14, 15].includes(error.code);
// 8, 11, 16: Last.fm is having trouble; 29: too many calls. Worth trying again later.
export const worthRetrying = (error: unknown) => error instanceof LastFmError && [8, 11, 16, 29].includes(error.code);

// MD5, which Last.fm signs calls with. Web Crypto doesn't offer it, so it is written out here (RFC 1321).
const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const sines = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0);

export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = bytes.length * 8;
  view.setUint32(padded.length - 8, bits >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bits / 2 ** 32), true);

  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let offset = 0; offset < padded.length; offset += 64) {
    let [a, b, c, d] = state;
    for (let step = 0; step < 64; step += 1) {
      let mixed: number;
      let word: number;
      if (step < 16) {
        mixed = (b & c) | (~b & d);
        word = step;
      } else if (step < 32) {
        mixed = (d & b) | (~d & c);
        word = (5 * step + 1) % 16;
      } else if (step < 48) {
        mixed = b ^ c ^ d;
        word = (3 * step + 5) % 16;
      } else {
        mixed = c ^ (b | ~d);
        word = (7 * step) % 16;
      }
      const shift = shifts[(step >> 4) * 4 + (step % 4)];
      const sum = (a + mixed + sines[step] + view.getUint32(offset + word * 4, true)) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
  }
  return state.map((value) => Array.from({ length: 4 }, (_, index) => ((value >>> (index * 8)) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}

// api_sig: every parameter except format and callback, sorted by name, name and value run together, then the
// shared secret on the end, all through MD5
export function signature(params: Record<string, string>, sharedSecret: string): string {
  const names = Object.keys(params).filter((name) => name !== "format" && name !== "callback").sort();
  return md5(names.map((name) => `${name}${params[name]}`).join("") + sharedSecret);
}

// One Last.fm call, given up after quickLimitMs, or sooner when finishBy (a Date.now() time) comes first.
// Signed calls are sent as a form POST, the others as a GET.
async function callLastFm(fetcher: FetchLike, params: Record<string, string>, sharedSecret: string | null,
  finishBy = Infinity): Promise<any> {
  const limitMs = Math.min(quickLimitMs, finishBy - Date.now());
  if (limitMs <= 0) throw timeoutError();
  const all = { ...params };
  if (sharedSecret) all.api_sig = signature(params, sharedSecret);
  all.format = "json";
  const body = new URLSearchParams(all);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(timeoutError()), limitMs);
  try {
    const response = sharedSecret
      ? await fetcher(apiRoot, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "VinylCollectionApp/4.0" },
        body: body.toString(),
        signal: controller.signal,
      })
      : await fetcher(`${apiRoot}?${body}`, { headers: { "User-Agent": "VinylCollectionApp/4.0" }, signal: controller.signal });
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (data && data.error) throw new LastFmError(Number(data.error), String(data.message ?? ""));
    if (!response.ok || !data) throw new LastFmError(response.status >= 500 ? 16 : 0, `Last.fm answered ${response.status}`);
    return data;
  } catch (error) {
    throw controller.signal.aborted ? timeoutError() : error;
  } finally {
    clearTimeout(timer);
  }
}

// The page on Last.fm where the owner says yes to this app. Last.fm then sends the browser back to returnTo with
// ?token=... added, which getSession swaps for a session key.
export function connectLink(apiKey: string, returnTo: string): string {
  return `${authPage}?${new URLSearchParams({ api_key: apiKey, cb: returnTo })}`;
}

// Only this app's own addresses may be the way back: https pages, or a computer's own test server
export function allowedReturn(address: string): boolean {
  try {
    const url = new URL(address);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

// Session keys don't run out; they stop working only if the owner takes this app's access back on Last.fm
export async function getSession(fetcher: FetchLike, keys: LastFmKeys, token: string): Promise<{ name: string; sessionKey: string }> {
  const data = await callLastFm(fetcher, { method: "auth.getSession", api_key: keys.apiKey, token }, keys.sharedSecret);
  const name = String(data?.session?.name ?? "");
  const sessionKey = String(data?.session?.key ?? "");
  if (!sessionKey) throw new LastFmError(0, "Last.fm didn't send a session key.");
  return { name, sessionKey };
}

export interface Scrobble {
  artist: string;
  track: string;
  album?: string;
  timestamp: number; // when the track started, in seconds since 1970 (UTC)
  duration?: number; // seconds
  trackNumber?: number;
}

export interface ScrobbleResult {
  accepted: number;
  ignored: number;
  // Last.fm's reason for each track it skipped: 1 artist or 2 track filtered, 3 too old, 4 in the future, 5 daily limit
  ignoredCodes: number[];
}

export function cleanScrobbles(list: unknown): Scrobble[] {
  if (!Array.isArray(list)) return [];
  return list.map((item: any) => ({
    artist: String(item?.artist ?? "").trim().slice(0, 300),
    track: String(item?.track ?? "").trim().slice(0, 300),
    album: String(item?.album ?? "").trim().slice(0, 300),
    timestamp: Math.floor(Number(item?.timestamp)),
    duration: Math.round(Number(item?.duration)) || undefined,
    trackNumber: Math.round(Number(item?.trackNumber)) || undefined,
  })).filter((item) => item.artist && item.track && Number.isFinite(item.timestamp) && item.timestamp > 0);
}

export function scrobbleParams(apiKey: string, sessionKey: string, scrobbles: Scrobble[]): Record<string, string> {
  const params: Record<string, string> = { method: "track.scrobble", api_key: apiKey, sk: sessionKey };
  scrobbles.slice(0, batchLimit).forEach((item, index) => {
    params[`artist[${index}]`] = item.artist;
    params[`track[${index}]`] = item.track;
    params[`timestamp[${index}]`] = String(item.timestamp);
    if (item.album) params[`album[${index}]`] = item.album;
    if (item.duration) params[`duration[${index}]`] = String(item.duration);
    if (item.trackNumber) params[`trackNumber[${index}]`] = String(item.trackNumber);
  });
  return params;
}

// Sends up to 50 scrobbles in one call
export async function sendScrobbles(fetcher: FetchLike, keys: LastFmKeys, sessionKey: string, scrobbles: Scrobble[]): Promise<ScrobbleResult> {
  if (!scrobbles.length) return { accepted: 0, ignored: 0, ignoredCodes: [] };
  const data = await callLastFm(fetcher, scrobbleParams(keys.apiKey, sessionKey, scrobbles), keys.sharedSecret);
  const attributes = data?.scrobbles?.["@attr"] ?? {};
  const rawList = data?.scrobbles?.scrobble;
  const list: any[] = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];
  const ignoredCodes = list.map((item) => Number(item?.ignoredMessage?.code ?? 0)).filter((code) => code > 0);
  return {
    accepted: Number(attributes.accepted ?? list.length - ignoredCodes.length) || 0,
    ignored: Number(attributes.ignored ?? ignoredCodes.length) || 0,
    ignoredCodes,
  };
}

// --- For want list suggestions (no sign-in needed; Last.fm has no personal recommendations API) ---

export interface NamedCount {
  name: string;
  count: number; // plays on Last.fm
}

export interface SimilarArtist {
  name: string;
  match: number; // 0 (not similar) to 1 (very similar)
}

export interface TopAlbum {
  name: string;
  count: number;
  imageUrl: string;
}

const listOf = (value: unknown): any[] => (Array.isArray(value) ? value : value ? [value] : []);

// The biggest of Last.fm's pictures, or "" (Last.fm's own grey star placeholder counts as none)
function bestImage(images: unknown): string {
  const url = String(listOf(images).at(-1)?.["#text"] ?? "");
  return url.includes("2a96cbd8b46e442fc41c2b86b821562f") ? "" : url;
}

// A user's most played artists. Period: overall, 7day, 1month, 3month, 6month or 12month.
export async function topArtists(fetcher: FetchLike, apiKey: string, user: string, period = "12month", limit = 30): Promise<NamedCount[]> {
  const data = await callLastFm(fetcher, { method: "user.gettopartists", user, period, limit: String(limit), api_key: apiKey }, null);
  return listOf(data?.topartists?.artist)
    .map((item) => ({ name: String(item?.name ?? "").trim(), count: Number(item?.playcount ?? 0) || 0 }))
    .filter((item) => item.name);
}

export async function similarArtists(fetcher: FetchLike, apiKey: string, artist: string, limit = 20, finishBy = Infinity): Promise<SimilarArtist[]> {
  const data = await callLastFm(fetcher,
    { method: "artist.getsimilar", artist, autocorrect: "1", limit: String(limit), api_key: apiKey }, null, finishBy);
  return listOf(data?.similarartists?.artist)
    .map((item) => ({ name: String(item?.name ?? "").trim(), match: Math.min(1, Math.max(0, Number(item?.match ?? 0) || 0)) }))
    .filter((item) => item.name);
}

export async function topAlbums(fetcher: FetchLike, apiKey: string, artist: string, limit = 5, finishBy = Infinity): Promise<TopAlbum[]> {
  const data = await callLastFm(fetcher,
    { method: "artist.gettopalbums", artist, autocorrect: "1", limit: String(limit), api_key: apiKey }, null, finishBy);
  return listOf(data?.topalbums?.album)
    .map((item) => ({ name: String(item?.name ?? "").trim(), count: Number(item?.playcount ?? 0) || 0, imageUrl: bestImage(item?.image) }))
    .filter((item) => item.name && item.name !== "(null)");
}

// The same call for many artists, five at a time (Last.fm asks apps to stay around five calls a second). Everything
// has to be back within longLimitMs; artists not done by then, or that failed, are left out.
export async function forEachArtist<T>(artists: string[], call: (artist: string, finishBy: number) => Promise<T>,
  limitMs = longLimitMs): Promise<Record<string, T>> {
  const finishBy = Date.now() + limitMs;
  const names = [...new Set(artists.map((name) => String(name ?? "").trim()).filter(Boolean))].slice(0, 25);
  const answers: Record<string, T> = {};
  for (let start = 0; start < names.length && Date.now() < finishBy; start += 5) {
    await Promise.all(names.slice(start, start + 5).map((name) => call(name, finishBy)
      .then((value) => { answers[name] = value; }, () => { /* slow or unknown: left out */ })));
  }
  return answers;
}
