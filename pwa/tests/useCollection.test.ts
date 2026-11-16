import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { samplePlays, sampleRecords } from "./sampleData";

vi.mock("../src/lib/supabaseClient", () => ({ getSupabase: () => ({}), isConfigured: () => true }));
const fetchCollection = vi.fn();
vi.mock("../src/lib/records", () => ({ fetchCollection: (...args: unknown[]) => fetchCollection(...args) }));
const insertPlay = vi.fn();
vi.mock("../src/lib/plays", () => ({ insertPlay: (...args: unknown[]) => insertPlay(...args) }));

const { useCollection } = await import("../src/lib/useCollection");
const { addPending, readPending, writeCache } = await import("../src/lib/offline");

const fresh = { records: sampleRecords, plays: samplePlays, wants: [] };
const row = { Date: "2026-11-16T19:00:00+00:00", AlbumName: "Discovery", DurationMins: 61, VinylID: 1700000003 };

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("useCollection offline", () => {
  it("shows what was kept on the phone when Supabase can't be reached", async () => {
    writeCache({ ...fresh, plays: samplePlays.slice(0, 1) }, new Date("2026-11-16T15:00:00Z"));
    addPending(row, 5);
    fetchCollection.mockRejectedValue(new Error("TypeError: Failed to fetch"));
    const { result } = renderHook(() => useCollection());
    await waitFor(() => expect(result.current.state.status === "ready" && result.current.state.offlineSince).toBe("2026-11-16T15:00:00.000Z"));
    const state = result.current.state as { data: { plays: { id: number }[] } };
    expect(state.data.plays.map((play) => play.id)).toEqual([1, -5]);
  });

  it("sends waiting plays once it can load again", async () => {
    addPending(row, 5);
    fetchCollection.mockResolvedValue(fresh);
    insertPlay.mockResolvedValue({ ...row, id: 77 });
    const { result } = renderHook(() => useCollection());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await act(async () => {});
    expect(insertPlay).toHaveBeenCalledWith({}, row);
    expect(readPending()).toEqual([]);
    const state = result.current.state as { offlineSince: string | null; data: { plays: { id: number }[] } };
    expect(state.offlineSince).toBeNull();
    expect(state.data.plays.map((play) => play.id)).toEqual([1, 2, 3, 77]);
  });

  it("shows the problem when nothing is kept yet", async () => {
    fetchCollection.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useCollection());
    await waitFor(() => expect(result.current.state).toEqual({ status: "error", message: "boom" }));
  });
});
