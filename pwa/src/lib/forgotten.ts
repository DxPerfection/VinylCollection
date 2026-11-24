// Forgotten records: ones you have played before but not for months, offered gently on the Play tab
import type { RecordView } from "./collectionView";
import { daysSince } from "./picker";

export const forgottenAfterDays = 90;
export const snoozeDays = 30;
const snoozeKey = "vinylForgottenSnooze";

export interface ForgottenRecord {
  record: RecordView;
  daysAgo: number;
}

// Longest forgotten first; records you said "Not now" to stay hidden until their snooze runs out
export function forgottenRecords(records: RecordView[], snoozed: Record<string, number> = {}, now: Date = new Date(),
  count = 2): ForgottenRecord[] {
  return records
    .map((record) => ({ record, daysAgo: daysSince(record.lastPlayed, now) }))
    .filter((item): item is ForgottenRecord => item.daysAgo !== null && item.daysAgo >= forgottenAfterDays)
    .filter((item) => (snoozed[String(item.record.ID)] ?? 0) <= now.getTime())
    .sort((a, b) => b.daysAgo - a.daysAgo || Number(a.record.ID) - Number(b.record.ID))
    .slice(0, count);
}

export function readSnoozed(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(snoozeKey) ?? "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

export function snooze(snoozed: Record<string, number>, id: number, now: Date = new Date()): Record<string, number> {
  const next = Object.fromEntries(Object.entries(snoozed).filter(([, until]) => until > now.getTime()));
  next[String(id)] = now.getTime() + snoozeDays * 86400000;
  try {
    localStorage.setItem(snoozeKey, JSON.stringify(next));
  } catch {
    // No storage: the record just comes back next time the app opens
  }
  return next;
}
