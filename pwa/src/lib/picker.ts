// What should I play: the same rules as the Streamlit picker (vinyl/stats.py pickCandidates). The longer a record has
// waited the likelier it comes up, never-played ones most of all, and higher ratings tip the scale. Records played in
// the last 3 days, and records by the artist you just played or passed on, sit out unless nothing else is left.
import type { RecordView } from "./collectionView";
import { toNumber } from "./format";

export interface PickFilter {
  genres: string[];
  maxMinutes: number | null;
  decades: string[];
  minRating: number | null;
}

export const noFilter: PickFilter = { genres: [], maxMinutes: null, decades: [], minRating: null };

export const lengthLimits: { label: string; value: number | null }[] = [
  { label: "Any length", value: null },
  { label: "Up to 30 min", value: 30 },
  { label: "Up to 45 min", value: 45 },
  { label: "Up to 60 min", value: 60 },
];

export const ratingLimits: { label: string; value: number | null }[] = [
  { label: "Any rating", value: null },
  { label: "3 stars and up", value: 3 },
  { label: "4 stars and up", value: 4 },
  { label: "5 stars only", value: 5 },
];

export interface Candidate {
  record: RecordView;
  daysAgo: number | null; // null when never played
  weight: number;
}

// 1997 -> "1990s"; null when the year is missing or not a number
export function decadeOf(year: unknown): string | null {
  const value = toNumber(year);
  return value && value > 0 ? `${Math.floor(value / 10) * 10}s` : null;
}

export function decadesInUse(records: { Year: unknown }[]): string[] {
  return [...new Set(records.map((record) => decadeOf(record.Year)).filter((decade): decade is string => Boolean(decade)))].sort();
}

// Whole calendar days between the day of the last play and today, in this phone's time zone
export function daysSince(when: Date | null, now: Date = new Date()): number | null {
  if (!when) return null;
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((day(now) - day(when)) / 86400000);
}

// The artist of the most recently played record, so the next pick is someone else
export function lastPlayedArtist(records: RecordView[]): string | null {
  let latest: RecordView | null = null;
  for (const record of records) {
    if (record.lastPlayed && (!latest?.lastPlayed || record.lastPlayed > latest.lastPlayed)) latest = record;
  }
  return latest?.Artist ?? null;
}

const artistKey = (value: unknown) => String(value ?? "").trim().toLowerCase();
const ratingBoost: Record<number, number> = { 5: 1.6, 4: 1.3, 3: 1.0, 2: 0.7, 1: 0.4 };

export function pickCandidates(records: RecordView[], filter: PickFilter, avoidArtists: (string | null)[] = [],
  now: Date = new Date()): Candidate[] {
  let pool = records.map((record) => ({ record, daysAgo: daysSince(record.lastPlayed, now) }));
  if (filter.genres.length) pool = pool.filter(({ record }) => filter.genres.includes(String(record.Genre ?? "").trim()));
  if (filter.maxMinutes) {
    const limit = filter.maxMinutes;
    pool = pool.filter(({ record }) => {
      const minutes = toNumber(record.DurationMins);
      return minutes === null || minutes <= 0 || minutes <= limit;
    });
  }
  if (filter.decades.length) pool = pool.filter(({ record }) => filter.decades.includes(decadeOf(record.Year) ?? ""));
  if (filter.minRating) {
    const least = filter.minRating;
    pool = pool.filter(({ record }) => record.rating >= least);
  }

  const rested = pool.filter(({ daysAgo }) => daysAgo === null || daysAgo >= 3);
  if (rested.length) pool = rested;
  const avoid = new Set(avoidArtists.filter(Boolean).map(artistKey));
  if (avoid.size) {
    const varied = pool.filter(({ record }) => !avoid.has(artistKey(record.Artist)));
    if (varied.length) pool = varied;
  }
  if (!pool.length) return [];

  const played = pool.map(({ daysAgo }) => daysAgo).filter((days): days is number => days !== null);
  const neverDays = played.length ? Math.max(60, Math.max(...played) + 14) : 60;
  return pool.map(({ record, daysAgo }) => ({
    record,
    daysAgo,
    weight: (Math.min(daysAgo ?? neverDays, 365) + 7) * (ratingBoost[record.rating] ?? 1.0),
  }));
}

// One candidate, drawn with the weights; random is passed in so the tests can fix it
export function weightedPick(candidates: Candidate[], random: () => number = Math.random): Candidate | null {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (!candidates.length || total <= 0) return candidates[0] ?? null;
  let point = random() * total;
  for (const candidate of candidates) {
    point -= candidate.weight;
    if (point < 0) return candidate;
  }
  return candidates[candidates.length - 1];
}

export function daysText(days: number): string {
  if (days === 1) return "1 day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

export function pickReason({ record, daysAgo }: Candidate): string {
  let reason = daysAgo === null ? "You have not logged a play of this one yet."
    : daysAgo === 0 ? "You played it earlier today." : `Last played ${daysText(daysAgo)} ago.`;
  if (record.rating >= 4) reason += ` You gave it ${record.rating} stars.`;
  return reason;
}
