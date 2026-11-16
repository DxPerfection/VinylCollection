import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  dayHeading, deletePlay, fromLocalInputValue, insertPlay, minutesFor, newPlayRow, partLabel, recentPlays, toLocalInputValue,
  toStoredTime,
} from "../src/lib/plays";
import { samplePlays, sampleRecord, sampleRecords } from "./sampleData";

describe("minutesFor", () => {
  it("uses the album length, half of it for a side, and 45 when the length is missing", () => {
    const bends = sampleRecords[0];
    expect(minutesFor(bends, "Full album")).toBe(48);
    expect(minutesFor(bends, "Side A")).toBe(24);
    expect(minutesFor(sampleRecord(1, { DurationMins: 57 }), "Side B")).toBe(29);
    expect(minutesFor(sampleRecord(1, { DurationMins: null }), "Full album")).toBe(45);
  });
});

describe("toStoredTime", () => {
  it("stores UTC to the minute, like the Streamlit app", () => {
    expect(toStoredTime(new Date("2026-11-16T17:05:42+03:00"))).toBe("2026-11-16T14:05:00+00:00");
  });
});

describe("newPlayRow", () => {
  it("links the play to the record", () => {
    expect(newPlayRow(sampleRecords[1], "Side B", new Date("2026-11-16T10:00:00Z"))).toEqual({
      Date: "2026-11-16T10:00:00+00:00", AlbumName: "Rust In Peace", DurationMins: 29, VinylID: 1700000002,
    });
  });
});

describe("partLabel", () => {
  it("reads the part from the minutes", () => {
    const rust = sampleRecords[1];
    expect(partLabel({ id: 1, Date: "", AlbumName: "", DurationMins: 57 }, rust)).toBe("Full album");
    expect(partLabel({ id: 1, Date: "", AlbumName: "", DurationMins: 29 }, rust)).toBe("One side");
    expect(partLabel({ id: 1, Date: "", AlbumName: "", DurationMins: 12 }, rust)).toBe("");
  });
});

describe("recentPlays", () => {
  it("lists newest first and finds each record", () => {
    const list = recentPlays(samplePlays, sampleRecords);
    expect(list.map((item) => item.play.id)).toEqual([2, 3, 1]);
    expect(list[0].record?.Artist).toBe("Megadeth");
    expect(list[0].partLabel).toBe("Full album");
    expect(list[2].record?.Artist).toBe("Radiohead"); // older play found by its unique album name
  });
});

describe("dayHeading", () => {
  const now = new Date(2026, 10, 16, 12, 0);
  it("says Today and Yesterday, then the weekday and date", () => {
    expect(dayHeading(new Date(2026, 10, 16, 1, 0), now)).toBe("Today");
    expect(dayHeading(new Date(2026, 10, 15, 23, 0), now)).toBe("Yesterday");
    expect(dayHeading(new Date(2026, 10, 14, 9, 0), now)).toBe("Sat 14 Nov");
    expect(dayHeading(new Date(2025, 10, 14, 9, 0), now)).toBe("Fri 14 Nov 2025");
  });
});

describe("local time input", () => {
  it("round-trips through the date and time picker value", () => {
    const when = new Date(2026, 10, 16, 9, 5);
    expect(toLocalInputValue(when)).toBe("2026-11-16T09:05");
    expect(fromLocalInputValue("2026-11-16T09:05")?.getTime()).toBe(when.getTime());
    expect(fromLocalInputValue("")).toBeNull();
  });
});

describe("saving and deleting", () => {
  it("inserts a play and returns the saved row, and deletes by id", async () => {
    const calls: string[] = [];
    const client = {
      from: (table: string) => ({
        insert: (row: object) => ({
          select: () => ({
            single: async () => {
              calls.push(`insert ${table} ${JSON.stringify(row)}`);
              return { data: { id: 50, ...row }, error: null };
            },
          }),
        }),
        delete: () => ({
          eq: async (column: string, value: number) => {
            calls.push(`delete ${table} ${column}=${value}`);
            return { error: null };
          },
        }),
      }),
    } as unknown as SupabaseClient;
    const saved = await insertPlay(client, newPlayRow(sampleRecords[0], "Full album", new Date("2026-11-16T10:00:00Z")));
    expect(saved.id).toBe(50);
    await deletePlay(client, 50);
    expect(calls).toEqual([
      'insert ListeningHistory {"Date":"2026-11-16T10:00:00+00:00","AlbumName":"The Bends","DurationMins":48,"VinylID":1700000001}',
      "delete ListeningHistory id=50",
    ]);
  });

  it("passes on a database refusal", async () => {
    const client = {
      from: () => ({ delete: () => ({ eq: async () => ({ error: { message: "permission denied" } }) }) }),
    } as unknown as SupabaseClient;
    await expect(deletePlay(client, 1)).rejects.toThrow("permission denied");
  });
});
