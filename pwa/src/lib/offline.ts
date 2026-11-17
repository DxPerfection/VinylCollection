// Using the app without a signal: the last records, plays and want list are kept on the phone, and plays logged
// while offline wait on the phone until they can be sent. Everything here stays in this browser only.
import type { CollectionData, PlayRow } from "./records";

const cacheKey = "vinylCache";
const pendingKey = "vinylPendingPlays";

export interface CachedCollection {
  data: CollectionData;
  savedAt: string; // ISO time of the last load from Supabase
}

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
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage only means less works offline
  }
}

export function readCache(): CachedCollection | null {
  const cached = read<CachedCollection>(cacheKey);
  return cached && Array.isArray(cached.data?.records) && Array.isArray(cached.data?.plays) ? cached : null;
}

// Pending plays are not saved into the cache: they live in their own list and are added on top when shown
export function writeCache(data: CollectionData, savedAt: Date = new Date()) {
  write(cacheKey, { data: { ...data, plays: data.plays.filter((play) => !isPending(play)) }, savedAt: savedAt.toISOString() });
}

// A play logged offline: a negative id until Supabase gives it a real one
export type PendingPlay = PlayRow & { id: number };

export const isPending = (play: PlayRow) => Number(play.id) < 0;

export function readPending(): PendingPlay[] {
  const list = read<PendingPlay[]>(pendingKey);
  return Array.isArray(list) ? list.filter((play) => isPending(play)) : [];
}

export function addPending(row: Omit<PlayRow, "id">, now: number = Date.now()): PendingPlay {
  const list = readPending();
  let id = -now;
  while (list.some((play) => play.id === id)) id -= 1;
  const play = { ...row, id };
  write(pendingKey, [...list, play]);
  return play;
}

export function removePending(id: number) {
  write(pendingKey, readPending().filter((play) => play.id !== id));
}

export function clearCache() {
  try {
    localStorage.removeItem(cacheKey);
  } catch {
    // nothing kept
  }
}

// What makes a play the same play before and after it is saved: its time, album, minutes and record
export const playKey = (play: Omit<PlayRow, "id">) =>
  `${String(play.Date ?? "").trim()}|${String(play.AlbumName ?? "").trim()}|${Number(play.DurationMins ?? 0)}|${play.VinylID ?? ""}`;

// The pending plays Supabase doesn't have yet. One that already arrived (say the answer to the send got lost)
// is left out, so it is never saved twice.
export function stillToSend(pending: PendingPlay[], saved: PlayRow[]): PendingPlay[] {
  const held = new Map<string, number>();
  for (const play of saved) held.set(playKey(play), (held.get(playKey(play)) ?? 0) + 1);
  return pending.filter((play) => {
    const count = held.get(playKey(play)) ?? 0;
    if (count > 0) {
      held.set(playKey(play), count - 1);
      return false;
    }
    return true;
  });
}

// True when a save failed because there was no connection, rather than being refused
export function isConnectionProblem(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|network|load failed|fetch failed|timed? ?out/i.test(message);
}

export function savedAtText(savedAt: string, now: Date = new Date()): string {
  const when = new Date(savedAt);
  if (Number.isNaN(when.getTime())) return "earlier";
  const time = when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const sameDay = when.toDateString() === now.toDateString();
  return sameDay ? `today at ${time}` : `${when.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${time}`;
}
