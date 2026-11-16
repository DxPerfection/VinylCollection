import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addPending, clearCache, isConnectionProblem, isPending, readCache, readPending, removePending, stillToSend, writeCache,
} from "../src/lib/offline";
import { samplePlays, sampleRecords } from "./sampleData";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const row = { Date: "2026-11-16T19:00:00+00:00", AlbumName: "The Bends", DurationMins: 48, VinylID: 1700000001 };

describe("the copy kept on the phone", () => {
  it("keeps the last load, without plays that are still waiting", () => {
    const pending = addPending(row, 1000);
    writeCache({ records: sampleRecords, plays: [...samplePlays, pending], wants: [] }, new Date("2026-11-16T18:40:00Z"));
    const cached = readCache();
    expect(cached?.savedAt).toBe("2026-11-16T18:40:00.000Z");
    expect(cached?.data.records).toHaveLength(4);
    expect(cached?.data.plays.map((play) => play.id)).toEqual([1, 2, 3]);
    clearCache();
    expect(readCache()).toBeNull();
    expect(readPending()).toHaveLength(1); // signing out keeps unsent plays
  });
});

describe("plays waiting to be sent", () => {
  it("get negative ids and can be taken back", () => {
    const first = addPending(row, 1000);
    const second = addPending(row, 1000);
    expect(first.id).toBe(-1000);
    expect(second.id).toBe(-1001);
    expect(isPending(first)).toBe(true);
    removePending(first.id);
    expect(readPending().map((play) => play.id)).toEqual([-1001]);
  });

  it("are not sent again once Supabase has them", () => {
    const pending = [addPending(row, 1), addPending(row, 2), addPending({ ...row, AlbumName: "Discovery" }, 3)];
    expect(stillToSend(pending, [{ ...row, id: 50 }]).map((play) => play.id)).toEqual([-2, -3]);
  });
});

describe("isConnectionProblem", () => {
  it("tells a lost connection from a refusal", () => {
    expect(isConnectionProblem(new Error("TypeError: Failed to fetch"))).toBe(true);
    expect(isConnectionProblem(new Error("new row violates row-level security policy"))).toBe(false);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(isConnectionProblem(new Error("anything"))).toBe(true);
  });
});
