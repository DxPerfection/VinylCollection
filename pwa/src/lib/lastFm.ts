// Scrobbling plays to Last.fm. A logged play becomes one scrobble per track, timed back from when it was logged,
// and waits on the phone until the Undo message has closed, so Undo never reaches Last.fm. Scrobbles that can't
// get through (no signal, Last.fm slow or down) stay in the waiting list and go out later. The Last.fm key and
// secret live in the lastFm Supabase function; the phone only keeps the session key Last.fm gave this app.
import type { SupabaseClient } from "@supabase/supabase-js";

import { batchLimit, quickLimitMs, type Scrobble, type ScrobbleResult } from "../../../supabase/functions/lastFm/lastFmApi";
import { playKey } from "./offline";
import { minutesFor, sidesOf, type PlayPart } from "./plays";
import type { PlayRow, VinylRecord } from "./records";

export type { Scrobble, ScrobbleResult };

const linkKey = "lastFmLink";
const queueKey = "lastFmQueue";
const sentKey = "lastFmSent";

// Last.fm turns away scrobbles older than two weeks; an hour is kept spare for a slow send
export const oldestMs = 14 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;
// The Undo message shows for 6 seconds; scrobbles wait a little longer than that
export const undoWindowMs = 8000;
// After this many refusals (not counting a lost signal) a play is given up on
const maxTries = 3;
// The phone waits a little longer than the function's own 8 second limit, for the trip there and back
export const sendWaitMs = quickLimitMs + 2000;

function read<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage only means scrobbles may not wait
  }
}

// --- The link to Last.fm ---

export interface LastFmLink {
  name: string;
  sessionKey: string;
  connectedAt: string;
  needsReconnect?: boolean; // Last.fm stopped taking the session key (access taken back there)
}

export function readLink(): LastFmLink | null {
  const link = read<LastFmLink>(linkKey);
  return link && link.sessionKey ? link : null;
}

export const saveLink = (link: LastFmLink | null) => write(linkKey, link);

export function profileUrl(name: string): string {
  return `https://www.last.fm/user/${encodeURIComponent(name)}`;
}

// That day's scrobbles in the owner's Last.fm library, where a scrobble can be deleted by hand
export function libraryDayUrl(name: string, when: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  return `${profileUrl(name)}/library?${new URLSearchParams({ from: day, rangetype: "1day" })}`;
}

// --- Turning a play into scrobbles ---

export function tracksOf(record: VinylRecord): string[] {
  return String(record.Tracklist ?? "").split("|").map((track) => track.trim()).filter(Boolean);
}

// The tracks of one part. The tracklist has no side letters, so each side gets its share of the tracks by its
// share of the album's minutes: the saved Discogs side lengths, or two halves.
export function tracksForPart(record: VinylRecord, part: PlayPart): { track: string; number: number }[] {
  const tracks = tracksOf(record).map((track, index) => ({ track, number: index + 1 }));
  if (part === "Full album" || !tracks.length) return tracks;
  const sides = sidesOf(record);
  const side = part.replace(/^Side /, "");
  const at = sides.findIndex((entry) => entry.side === side);
  if (at < 0) return tracks;
  const total = sides.reduce((sum, entry) => sum + entry.minutes, 0);
  const before = sides.slice(0, at).reduce((sum, entry) => sum + entry.minutes, 0);
  const start = Math.round((tracks.length * before) / total);
  const end = at === sides.length - 1 ? tracks.length : Math.round((tracks.length * (before + sides[at].minutes)) / total);
  return tracks.slice(start, Math.max(end, start + 1));
}

// The logged time is when the record (or side) was put on: the tracks follow one another from it, spread evenly
// over the minutes the play counts for, each stamped with when it started
export function scrobblesFor(record: VinylRecord, part: PlayPart, playedAt: Date): Scrobble[] {
  const tracks = tracksForPart(record, part);
  const artist = String(record.Artist ?? "").trim();
  if (!tracks.length || !artist) return [];
  const trackSeconds = Math.max(31, Math.floor((minutesFor(record, part) * 60) / tracks.length));
  const start = Math.floor(playedAt.getTime() / 1000);
  const album = String(record.AlbumName ?? "").trim();
  return tracks.map(({ track, number }, index) => ({
    artist,
    track,
    album: album || undefined,
    timestamp: start + index * trackSeconds,
    duration: trackSeconds,
    trackNumber: number,
  }));
}

// Last.fm's rule: a track counts once half of it has played (or 4 minutes, whichever comes first), and it refuses
// times in the future. So a play logged "just now" goes out track by track as the record spins.
export const hasPlayed = (item: Scrobble, now: number = Date.now()) =>
  item.timestamp * 1000 + Math.min(240, (item.duration ?? 60) / 2) * 1000 <= now;

// Too old for Last.fm: the first track started more than two weeks ago
export const tooOld = (scrobbles: Scrobble[], now: number = Date.now()) =>
  scrobbles.length > 0 && scrobbles[0].timestamp * 1000 < now - oldestMs;

// --- The waiting list ---

export interface QueuedPlay {
  id: string;
  playId: number; // the play's id when it was logged (negative for one logged offline)
  playKey: string; // the play's date, album, minutes and record, to find it again once it has a real id
  label: string;
  playedAt: string;
  scrobbles: Scrobble[];
  sendAfter: number; // Date.now() time; before this the Undo message may still be up
  tries: number;
}

export function readQueue(): QueuedPlay[] {
  const list = read<QueuedPlay[]>(queueKey);
  return Array.isArray(list) ? list.filter((item) => item && Array.isArray(item.scrobbles)) : [];
}

const writeQueue = (list: QueuedPlay[]) => write(queueKey, list.length ? list : null);

export function queuePlay(item: Omit<QueuedPlay, "id" | "tries">, now: number = Date.now()): QueuedPlay {
  const queued: QueuedPlay = { ...item, id: `${now}-${Math.random().toString(36).slice(2, 8)}`, tries: 0 };
  writeQueue([...readQueue(), queued]);
  return queued;
}

// Puts a play back on the waiting list (Undo of a delete), or saves a change to one already there, in its place
export function putBack(item: QueuedPlay) {
  const list = readQueue();
  writeQueue(list.some((entry) => entry.id === item.id) ? list.map((entry) => entry.id === item.id ? item : entry) : [...list, item]);
}

const removeQueued = (id: string) => writeQueue(readQueue().filter((entry) => entry.id !== id));

const samePlay = (item: QueuedPlay, play: PlayRow) => item.playId === Number(play.id) || item.playKey === playKey(play);

// Takes a play's scrobbles off the waiting list, if they are still there, and hands them back (for Undo)
export function dropQueued(play: PlayRow): QueuedPlay | null {
  const list = readQueue();
  const found = list.find((item) => samePlay(item, play)) ?? null;
  if (found) removeQueued(found.id);
  return found;
}

export const clearQueue = () => writeQueue([]);

// Which plays went to Last.fm, by playKey, so a delete can point to Last.fm.
// The newest 500 are kept.
type SentList = Record<string, number>;

export function markSent(key: string, now: number = Date.now()) {
  const sent = { ...(read<SentList>(sentKey) ?? {}), [key]: now };
  const newest = Object.entries(sent).sort((a, b) => b[1] - a[1]).slice(0, 500);
  write(sentKey, Object.fromEntries(newest));
}

export const wasSent = (play: PlayRow) => Boolean((read<SentList>(sentKey) ?? {})[playKey(play)]);

// --- Talking to the lastFm function ---

export type ProblemKind = "offline" | "timeout" | "reconnect" | "retryLater" | "notSetUp" | "refused";

export class LastFmProblem extends Error {
  kind: ProblemKind;
  constructor(kind: ProblemKind, message: string) {
    super(message);
    this.name = "LastFmProblem";
    this.kind = kind;
  }
}

export const isLastFmProblem = (error: unknown): error is LastFmProblem => error instanceof LastFmProblem;

export async function callLastFm<T>(supabase: SupabaseClient, body: object, waitMs: number = sendWaitMs): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new LastFmProblem("offline", "You're offline.");
  const { data, error } = await supabase.functions.invoke("lastFm", { body, timeout: waitMs });
  if (!error) return data as T;
  const context = (error as { context?: unknown }).context;
  if ((context as { name?: string } | undefined)?.name === "AbortError") throw new LastFmProblem("timeout", "Last.fm is slow to answer right now.");
  if (!(context instanceof Response)) {
    // No answer at all: no signal, or the function couldn't be reached
    throw new LastFmProblem("offline", error.message || "Couldn't reach Last.fm.");
  }
  let answer: { error?: string; reconnect?: boolean; retryLater?: boolean; timedOut?: boolean; notSetUp?: boolean } = {};
  try {
    answer = await context.json();
  } catch {
    // keep the general message
  }
  const message = answer.error ?? error.message;
  if (answer.timedOut || context.status === 504) throw new LastFmProblem("timeout", "Last.fm is slow to answer right now.");
  if (answer.reconnect) throw new LastFmProblem("reconnect", message);
  if (answer.notSetUp) throw new LastFmProblem("notSetUp", message);
  if (answer.retryLater || context.status >= 500 && context.status !== 502) throw new LastFmProblem("retryLater", message);
  throw new LastFmProblem("refused", message);
}

export async function getConnectLink(supabase: SupabaseClient, returnTo: string): Promise<string> {
  return (await callLastFm<{ url: string }>(supabase, { action: "connectLink", returnTo })).url;
}

export async function getSessionKey(supabase: SupabaseClient, token: string): Promise<{ name: string; sessionKey: string }> {
  return callLastFm(supabase, { action: "session", token });
}

export type SendScrobbles = (scrobbles: Scrobble[]) => Promise<ScrobbleResult>;

export function scrobbleSender(supabase: SupabaseClient, sessionKey: string): SendScrobbles {
  return (scrobbles) => callLastFm<ScrobbleResult>(supabase, { action: "scrobble", sessionKey, scrobbles });
}

export interface FlushResult {
  sentPlays: string[]; // labels of the plays whose last tracks went out
  tracks: number; // tracks Last.fm took
  ignored: number; // tracks Last.fm skipped (too old, filtered, or its daily limit)
  dropped: string[]; // labels of plays given up on
  problem: LastFmProblem | null; // why sending stopped early, if it did
}

// Sends the tracks that have played, from every play whose Undo time is over, oldest first, at most 50 tracks a
// call; tracks still to come wait. A lost signal, a slow or troubled Last.fm, or a sign-in that stopped working
// leaves the rest waiting; a play Last.fm refuses three times, or one older than two weeks, is given up on.
export async function sendQueued(send: SendScrobbles, now: number = Date.now()): Promise<FlushResult> {
  const result: FlushResult = { sentPlays: [], tracks: 0, ignored: 0, dropped: [], problem: null };
  const ready = readQueue().filter((item) => item.sendAfter <= now);
  for (const item of ready) {
    if (tooOld(item.scrobbles, now)) {
      removeQueued(item.id);
      result.dropped.push(item.label);
      continue;
    }
    let left = item.scrobbles;
    try {
      for (;;) {
        const due = left.filter((scrobble) => hasPlayed(scrobble, now)).slice(0, batchLimit);
        if (!due.length) break;
        const answer = await send(due);
        result.tracks += answer.accepted;
        result.ignored += answer.ignored;
        left = left.filter((scrobble) => !due.includes(scrobble));
        markSent(item.playKey, now);
        if (left.length) putBack({ ...item, scrobbles: left, tries: 0 });
      }
      if (!left.length) {
        removeQueued(item.id);
        result.sentPlays.push(item.label);
      }
    } catch (error) {
      const problem = isLastFmProblem(error) ? error : new LastFmProblem("refused", error instanceof Error ? error.message : String(error));
      if (problem.kind === "refused") {
        const tries = item.tries + 1;
        if (tries >= maxTries) {
          removeQueued(item.id);
          result.dropped.push(item.label);
        } else {
          putBack({ ...item, scrobbles: left, tries });
        }
        continue;
      }
      result.problem = problem;
      return result;
    }
  }
  return result;
}

// When the next track of a waiting play will have played, to try again then (null when nothing is waiting)
export function nextDueAt(queue: QueuedPlay[] = readQueue()): number | null {
  let next: number | null = null;
  for (const item of queue) {
    for (const scrobble of item.scrobbles) {
      const due = Math.max(item.sendAfter, scrobble.timestamp * 1000 + Math.min(240, (scrobble.duration ?? 60) / 2) * 1000);
      if (next === null || due < next) next = due;
    }
  }
  return next;
}
