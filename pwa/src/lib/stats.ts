// The numbers on the Stats tab, worked out the same way as the Streamlit Dashboard (vinyl/stats.py and
// vinyl/sections/dashboard.py). Times are read in this phone's time zone.
import { parseStoredTime, ratingOf, toNumber } from "./format";
import { decadeOf, daysSince } from "./picker";
import type { PlayRow, VinylRecord } from "./records";

export interface PlayFact {
  when: Date;
  minutes: number;
  vinylId: number | null;
  album: string; // "Artist - Album" for plays linked to a record, else the name it was logged with
  artist: string | null;
}

export interface Bar {
  label: string;
  value: number;
  extra?: string;
}

const nameKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

// One row per play, linked to its record by VinylID or, for old plays, a unique album name
export function playFacts(records: VinylRecord[], plays: PlayRow[]): PlayFact[] {
  const counts = new Map<string, number>();
  for (const record of records) counts.set(nameKey(record.AlbumName), (counts.get(nameKey(record.AlbumName)) ?? 0) + 1);
  const byId = new Map(records.map((record) => [Number(record.ID), record]));
  const idByName = new Map(records.filter((record) => counts.get(nameKey(record.AlbumName)) === 1)
    .map((record) => [nameKey(record.AlbumName), Number(record.ID)]));

  const facts: PlayFact[] = [];
  for (const play of plays) {
    const when = parseStoredTime(play.Date);
    if (!when) continue;
    const vinylId = toNumber(play.VinylID) ?? idByName.get(nameKey(play.AlbumName)) ?? null;
    const record = vinylId === null ? undefined : byId.get(vinylId);
    facts.push({
      when,
      minutes: Math.max(0, toNumber(play.DurationMins) ?? 0),
      vinylId,
      album: record ? `${record.Artist ?? ""} - ${record.AlbumName ?? ""}` : String(play.AlbumName ?? ""),
      artist: record ? String(record.Artist ?? "") || null : null,
    });
  }
  return facts;
}

export function minutesLabel(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = Math.round(total % 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} mins`;
}

const dayKey = (when: Date) => Date.UTC(when.getFullYear(), when.getMonth(), when.getDate()) / 86400000;

// Current and longest run of days with a play. The current streak lasts until the end of the day after the last play.
export function streaks(facts: PlayFact[], now: Date = new Date()): { current: number; longest: number; days: number } {
  const days = [...new Set(facts.map((fact) => dayKey(fact.when)))].sort((a, b) => a - b);
  if (!days.length) return { current: 0, longest: 0, days: 0 };
  let run = 1;
  let longest = 1;
  for (let index = 1; index < days.length; index += 1) {
    run = days[index] - days[index - 1] === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current: dayKey(now) - days[days.length - 1] <= 1 ? run : 0, longest, days: days.length };
}

function grouped(facts: PlayFact[], keyOf: (fact: PlayFact) => string | null) {
  const groups = new Map<string, { minutes: number; plays: number }>();
  for (const fact of facts) {
    const key = keyOf(fact);
    if (!key) continue;
    const group = groups.get(key) ?? { minutes: 0, plays: 0 };
    group.minutes += fact.minutes;
    group.plays += 1;
    groups.set(key, group);
  }
  return [...groups.entries()];
}

export function topAlbums(facts: PlayFact[], by: "Plays" | "Minutes", count = 8): Bar[] {
  const main = (g: { minutes: number; plays: number }) => (by === "Plays" ? g.plays : g.minutes);
  const other = (g: { minutes: number; plays: number }) => (by === "Plays" ? g.minutes : g.plays);
  return grouped(facts, (fact) => fact.album)
    .sort((a, b) => main(b[1]) - main(a[1]) || other(b[1]) - other(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([label, g]) => ({ label, value: main(g), extra: by === "Plays" ? minutesLabel(g.minutes) : `${g.plays} ${g.plays === 1 ? "play" : "plays"}` }));
}

export function topArtists(facts: PlayFact[], count = 8): Bar[] {
  return grouped(facts, (fact) => fact.artist)
    .sort((a, b) => b[1].minutes - a[1].minutes || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([label, g]) => ({ label, value: g.minutes, extra: `${g.plays} ${g.plays === 1 ? "play" : "plays"}` }));
}

export const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function playsByWeekday(facts: PlayFact[]): Bar[] {
  const counts = weekdayNames.map(() => 0);
  for (const fact of facts) counts[(fact.when.getDay() + 6) % 7] += 1;
  return weekdayNames.map((label, index) => ({ label, value: counts[index] }));
}

// Hours in each of the last 12 weeks (Monday to Sunday), oldest first, labelled by the Monday
export function weeklyHours(facts: PlayFact[], now: Date = new Date(), weeks = 12): Bar[] {
  const monday = dayKey(now) - ((now.getDay() + 6) % 7);
  const first = monday - (weeks - 1) * 7;
  const minutes = Array.from({ length: weeks }, () => 0);
  for (const fact of facts) {
    const index = Math.floor((dayKey(fact.when) - first) / 7);
    if (index >= 0 && index < weeks) minutes[index] += fact.minutes;
  }
  return minutes.map((total, index) => {
    const start = new Date((first + index * 7) * 86400000);
    const label = `${start.getUTCDate()} ${start.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}`;
    return { label, value: Math.round((total / 60) * 10) / 10 };
  });
}

function countBars(values: string[], count?: number): Bar[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  const bars = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }));
  return count ? bars.slice(0, count) : bars;
}

export const genreBars = (records: VinylRecord[]) => countBars(records.map((record) => String(record.Genre ?? "").trim()), 10);
export const conditionBars = (records: VinylRecord[]) => countBars(records.map((record) => String(record.Condition ?? "").trim()));
export const decadeBars = (records: VinylRecord[]) =>
  countBars(records.map((record) => decadeOf(record.Year) ?? "")).sort((a, b) => a.label.localeCompare(b.label));

export interface DustyRecord {
  record: VinylRecord;
  lastPlayed: Date | null;
  daysAgo: number | null;
}

// Never-played records first, then the ones left longest on the shelf
export function gatheringDust(records: VinylRecord[], facts: PlayFact[], now: Date = new Date(), count = 10): DustyRecord[] {
  const last = new Map<number, Date>();
  for (const fact of facts) {
    if (fact.vinylId === null) continue;
    const seen = last.get(fact.vinylId);
    if (!seen || fact.when > seen) last.set(fact.vinylId, fact.when);
  }
  return records
    .map((record) => {
      const lastPlayed = last.get(Number(record.ID)) ?? null;
      return { record, lastPlayed, daysAgo: daysSince(lastPlayed, now) };
    })
    .sort((a, b) => (b.daysAgo ?? Infinity) - (a.daysAgo ?? Infinity) || Number(a.record.ID) - Number(b.record.ID))
    .slice(0, count);
}

export const neverPlayedCount = (records: VinylRecord[], facts: PlayFact[]) =>
  gatheringDust(records, facts, new Date(), records.length).filter((item) => !item.lastPlayed).length;

export const reviewYears = (facts: PlayFact[]) => [...new Set(facts.map((fact) => fact.when.getFullYear()))].sort((a, b) => b - a);

export interface YearReview {
  minutes: number;
  plays: number;
  albums: number;
  busiestMonth: string;
  busiestMinutes: number;
  topArtist: string | null;
  topArtistMinutes: number;
  topAlbum: string | null;
  months: Bar[];
}

export function yearInReview(facts: PlayFact[], year: number): YearReview {
  const inYear = facts.filter((fact) => fact.when.getFullYear() === year);
  const monthMinutes = Array.from({ length: 12 }, () => 0);
  for (const fact of inYear) monthMinutes[fact.when.getMonth()] += fact.minutes;
  const busiest = monthMinutes.indexOf(Math.max(...monthMinutes));
  const monthName = (index: number, style: "long" | "short") => new Date(2000, index, 1).toLocaleDateString("en-GB", { month: style });
  const artist = topArtists(inYear, 1)[0];
  const album = topAlbums(inYear, "Minutes", 1)[0];
  return {
    minutes: inYear.reduce((sum, fact) => sum + fact.minutes, 0),
    plays: inYear.length,
    albums: new Set(inYear.map((fact) => fact.album)).size,
    busiestMonth: monthName(busiest, "long"),
    busiestMinutes: monthMinutes[busiest],
    topArtist: artist?.label ?? null,
    topArtistMinutes: artist?.value ?? 0,
    topAlbum: album?.label ?? null,
    months: monthMinutes.map((total, index) => ({ label: monthName(index, "short"), value: Math.round((total / 60) * 10) / 10 })),
  };
}

// Records with a rating, for the average shown under the genre chart
export function averageRating(records: VinylRecord[]): number | null {
  const ratings = records.map((record) => ratingOf(record.Rating)).filter(Boolean);
  return ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
}
