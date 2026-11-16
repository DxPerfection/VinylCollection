// Turning stored values into what the screens show

// Plays are stored in UTC. Newer ones carry an offset ("2026-10-25T12:17:00+00:00"); older ones are naive
// ("2026-10-11 13:04:00") and are UTC too.
export function parseStoredTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  let text = String(value).trim().replace(" ", "T");
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += "Z";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// "Today", "Yesterday", "3 days ago", then a date such as "25 Oct" (with the year once it is not this year)
export function formatLastPlayed(when: Date | null, now: Date = new Date()): string {
  if (!when) return "Not played yet";
  const days = Math.round((startOfDay(now) - startOfDay(when)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (when.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return when.toLocaleDateString("en-GB", options);
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ratingOf(value: unknown): number {
  const rating = toNumber(value);
  return rating && rating >= 1 && rating <= 5 ? Math.round(rating) : 0;
}

export function stars(rating: number): string {
  return rating ? "★".repeat(rating) + "☆".repeat(5 - rating) : "";
}

export function yearText(value: unknown): string {
  const year = toNumber(value);
  return year ? String(Math.trunc(year)) : "";
}

export function minutesText(value: unknown): string {
  const minutes = toNumber(value);
  return minutes && minutes > 0 ? `${Math.round(minutes)} min` : "";
}

export function trackList(value: string | null | undefined): string[] {
  return (value ?? "").split(" | ").map((track) => track.trim()).filter(Boolean);
}

export function playCountText(count: number): string {
  if (count === 0) return "Not played yet";
  return count === 1 ? "Played once" : `Played ${count} times`;
}
