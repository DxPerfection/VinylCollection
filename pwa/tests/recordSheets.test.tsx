import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiscogsHit, ReleaseDetails } from "../src/lib/lookup";
import type { VinylRecord } from "../src/lib/records";
import { fakeActions, sampleRecords } from "./sampleData";

vi.mock("../src/lib/supabaseClient", () => ({ getSupabase: () => ({}), isConfigured: () => true }));
const searchReleases = vi.fn();
const getRelease = vi.fn();
vi.mock("../src/lib/lookup", async (actual) => ({
  ...(await actual<typeof import("../src/lib/lookup")>()),
  searchReleases: (...args: unknown[]) => searchReleases(...args),
  getRelease: (...args: unknown[]) => getRelease(...args),
}));

const { CollectionScreen } = await import("../src/screens/collectionScreen");
const { nextUnmatched } = await import("../src/components/recordSheets");

const hit: DiscogsHit = { discogsId: 7, artist: "Any", album: "Any", year: "1977", genre: "Rock", coverUrl: "", label: "Harvest",
  catalogNumber: "SHVL 815", format: "Vinyl, LP", country: "UK" };
const release: ReleaseDetails = { ...hit, subGenre: "", tracks: [], durationMins: 40, sideMins: "", coverFromSpotify: false,
  lengthFromSpotify: false };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  searchReleases.mockResolvedValue([hit]);
  getRelease.mockResolvedValue(release);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("nextUnmatched", () => {
  const records = [1, 2, 3, 4].map((id) => ({ ...sampleRecords[0], ID: id, DiscogsID: id === 3 ? 9 : null }) as VinylRecord);
  it("goes on in screen order, skips matched and left-out records, and wraps round", () => {
    expect(nextUnmatched(records, [1, 2, 3, 4], 1, [])).toBe(2);
    expect(nextUnmatched(records, [1, 2, 3, 4], 2, [])).toBe(4);
    expect(nextUnmatched(records, [1, 2, 3, 4], 4, [])).toBe(1);
    expect(nextUnmatched(records, [1, 2, 3, 4], 4, [1, 2])).toBeNull();
  });
});

describe("record card pressing details", () => {
  it("shows the pressing once a record is matched, and says how to get it when not", () => {
    const matched = { ...sampleRecords[0], DiscogsID: 7, Label: "Parlophone", CatalogNumber: "PCS 7372", Format: "Vinyl, LP",
      Country: "UK", PressingYear: "2016" };
    render(<CollectionScreen data={{ records: [matched, ...sampleRecords.slice(1)], plays: [], wants: [] }} onOpenAccount={() => {}}
      onOpenAdd={() => {}} actions={fakeActions()} />);
    fireEvent.click(screen.getByText("The Bends"));
    const pressing = within(screen.getByRole("region", { name: "Pressing" }));
    expect(pressing.getByText("PCS 7372")).toBeTruthy();
    expect(pressing.getByText("2016")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close"));
    fireEvent.click(screen.getByText("Discovery"));
    expect(screen.queryByRole("region", { name: "Pressing" })).toBeNull();
    expect(screen.getByText(/No pressing details yet/)).toBeTruthy();
  });
});

describe("matching one record after another", () => {
  it("moves on to the next record without Discogs info after a match, Skip moves on without saving", async () => {
    const matchRecord = vi.fn(async () => true);
    render(<CollectionScreen data={{ records: sampleRecords, plays: [], wants: [] }} onOpenAccount={() => {}} onOpenAdd={() => {}}
      actions={fakeActions({ matchRecord })} />);
    // Newest first: Hybrid Theory, Discovery, Rust In Peace, The Bends
    fireEvent.click(screen.getByText("Discovery"));
    fireEvent.click(screen.getByRole("button", { name: "Match on Discogs" }));
    expect(screen.getByText("4 records still without Discogs info")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "This one" })); });
    expect(matchRecord).toHaveBeenCalledWith(expect.objectContaining({ AlbumName: "Discovery" }), release);
    expect(screen.getByRole("dialog", { name: "Match Rust In Peace on Discogs" })).toBeTruthy();
    expect(screen.getByText(/1 matched/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("dialog", { name: "Match The Bends on Discogs" })).toBeTruthy();
    expect(matchRecord).toHaveBeenCalledTimes(1);
  });

  it("closes after changing a match on a record that already had one", async () => {
    const matchRecord = vi.fn(async () => true);
    const records = [{ ...sampleRecords[0], DiscogsID: 3 }, ...sampleRecords.slice(1)];
    render(<CollectionScreen data={{ records, plays: [], wants: [] }} onOpenAccount={() => {}} onOpenAdd={() => {}}
      actions={fakeActions({ matchRecord })} />);
    fireEvent.click(screen.getByText("The Bends"));
    fireEvent.click(screen.getByRole("button", { name: "Change Discogs match" }));
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "This one" })); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("notes on records", () => {
  it("saves a note from the record card, and Cancel puts back what was there", async () => {
    const editRecord = vi.fn(async () => true);
    const records = [{ ...sampleRecords[0], Note: "Bought in Kadıköy" }, ...sampleRecords.slice(1)];
    render(<CollectionScreen data={{ records, plays: [], wants: [] }} onOpenAccount={() => {}} onOpenAdd={() => {}}
      actions={fakeActions({ editRecord })} />);
    fireEvent.click(screen.getByText("The Bends"));
    const box = screen.getByLabelText("Note") as HTMLTextAreaElement;
    expect(box.value).toBe("Bought in Kadıköy");
    expect(screen.queryByRole("button", { name: "Save note" })).toBeNull();
    fireEvent.change(box, { target: { value: "Something else" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(box.value).toBe("Bought in Kadıköy");
    fireEvent.change(box, { target: { value: "  Bought in Kadıköy, plays a bit noisy on side B  " } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save note" })); });
    expect(editRecord).toHaveBeenCalledWith(expect.objectContaining({ AlbumName: "The Bends" }),
      { Note: "Bought in Kadıköy, plays a bit noisy on side B" }, records);
  });

  it("saves an emptied note as no note", async () => {
    const editRecord = vi.fn(async () => true);
    render(<CollectionScreen data={{ records: [{ ...sampleRecords[0], Note: "Old" }], plays: [], wants: [] }} onOpenAccount={() => {}}
      onOpenAdd={() => {}} actions={fakeActions({ editRecord })} />);
    fireEvent.click(screen.getByText("The Bends"));
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: " " } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save note" })); });
    expect((editRecord.mock.calls[0] as unknown[])[1]).toEqual({ Note: null });
  });

  it("finds records by words in their note", () => {
    const records = [{ ...sampleRecords[0], Note: "From the Kadıköy flea market" }, ...sampleRecords.slice(1)];
    render(<CollectionScreen data={{ records, plays: [], wants: [] }} onOpenAccount={() => {}} onOpenAdd={() => {}} actions={fakeActions()} />);
    fireEvent.change(screen.getByLabelText("Search artist, album or note"), { target: { value: "flea" } });
    expect(Array.from(document.querySelectorAll(".tileAlbum")).map((tile) => tile.textContent)).toEqual(["The Bends"]);
  });
});
