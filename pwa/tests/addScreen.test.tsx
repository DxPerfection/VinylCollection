import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiscogsHit, ReleaseDetails } from "../src/lib/lookup";
import { sampleRecords } from "./sampleData";

vi.mock("../src/lib/supabaseClient", () => ({ getSupabase: () => ({}), isConfigured: () => true }));
const searchReleases = vi.fn();
const getRelease = vi.fn();
vi.mock("../src/lib/lookup", () => ({
  searchReleases: (...args: unknown[]) => searchReleases(...args),
  getRelease: (...args: unknown[]) => getRelease(...args),
}));

const { AddScreen } = await import("../src/screens/addScreen");
const { MatchSheet } = await import("../src/components/matchSheet");

const hits: DiscogsHit[] = [
  { discogsId: 1, artist: "Pink Floyd", album: "Animals", year: "1977", genre: "Rock", coverUrl: "", label: "Harvest",
    catalogNumber: "SHVL 815", format: "Vinyl, LP, Album", country: "UK" },
  { discogsId: 2, artist: "Radiohead", album: "The Bends", year: "1995", genre: "Rock", coverUrl: "", label: "Parlophone",
    catalogNumber: "PCS 7372", format: "Vinyl, LP", country: "UK" },
];
const animals: ReleaseDetails = {
  ...hits[0], subGenre: "Prog Rock", tracks: ["Pigs On The Wing 1", "Dogs"], durationMins: 41, sideMins: "A:18|B:23",
  coverFromSpotify: true, lengthFromSpotify: true,
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  searchReleases.mockResolvedValue(hits);
  getRelease.mockResolvedValue(animals);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function typeAndWait(input: HTMLElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
}

describe("AddScreen", () => {
  const show = () => {
    const actions = { addRecord: vi.fn(async (_row: unknown) => true), addWant: vi.fn(async (_row: unknown) => true) };
    render(<AddScreen data={{ records: sampleRecords, plays: [], wants: [] }} actions={actions} onClose={() => {}} />);
    return actions;
  };

  it("searches Discogs after a pause and shows the pressing details", async () => {
    show();
    await typeAndWait(screen.getByLabelText("Search Discogs"), "floyd");
    expect(searchReleases).toHaveBeenCalledWith({}, "floyd");
    expect(screen.getByText("Harvest · SHVL 815 · Vinyl, LP, Album · UK · 1977")).toBeTruthy();
  });

  it("adds a record after checking the filled-in details", async () => {
    const actions = show();
    await typeAndWait(screen.getByLabelText("Search Discogs"), "animals");
    const row = screen.getByText("Animals").closest("li")!;
    await act(async () => { fireEvent.click(within(row).getByRole("button", { name: "Add" })); });
    const sheet = screen.getByRole("dialog", { name: "Add Animals" });
    expect((within(sheet).getByLabelText("Length (min)") as HTMLInputElement).value).toBe("41");
    fireEvent.click(within(sheet).getByRole("button", { name: "Used" }));
    await act(async () => { fireEvent.click(within(sheet).getByRole("button", { name: "Add to collection" })); });
    expect(actions.addRecord).toHaveBeenCalledTimes(1);
    expect(actions.addRecord.mock.calls[0][0]).toMatchObject({
      Artist: "Pink Floyd", AlbumName: "Animals", Genre: "Rock", Condition: "Used", DurationMins: 41, DiscogsID: 1,
      SideMins: "A:18|B:23", Tracklist: "Pigs On The Wing 1 | Dogs",
    });
  });

  it("adds a record by hand without Discogs", async () => {
    const actions = show();
    fireEvent.click(screen.getByRole("button", { name: "Not on Discogs? Add it by hand" }));
    const sheet = screen.getByRole("dialog", { name: "Add a record by hand" });
    const add = within(sheet).getByRole("button", { name: "Add to collection" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(within(sheet).getByLabelText("Artist"), { target: { value: " Barış Manço " } });
    fireEvent.change(within(sheet).getByLabelText("Album"), { target: { value: "Sözüm Meclisten Dışarı" } });
    fireEvent.change(within(sheet).getByLabelText("Year"), { target: { value: "1981" } });
    fireEvent.change(within(sheet).getByLabelText("Length (min)"), { target: { value: "38" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Rock" }));
    fireEvent.change(within(sheet).getByLabelText("Tracklist (optional, one per line)"), { target: { value: "Alla Beni Pulla Beni\nArkadaşım Eşek\n" } });
    await act(async () => { fireEvent.click(add); });
    expect(getRelease).not.toHaveBeenCalled();
    expect(actions.addRecord.mock.calls[0][0]).toMatchObject({
      Artist: "Barış Manço", AlbumName: "Sözüm Meclisten Dışarı", Year: "1981", Genre: "Rock", DurationMins: 38, CoverURL: "",
      Tracklist: "Alla Beni Pulla Beni | Arkadaşım Eşek", DiscogsID: null, SideMins: null,
    });
  });

  it("blocks adding a record that is already in the collection", async () => {
    getRelease.mockResolvedValue({ ...animals, ...hits[1], discogsId: 2 });
    const actions = show();
    await typeAndWait(screen.getByLabelText("Search Discogs"), "bends");
    const row = screen.getByText("The Bends").closest("li")!;
    await act(async () => { fireEvent.click(within(row).getByRole("button", { name: "Add" })); });
    const sheet = screen.getByRole("dialog", { name: "Add The Bends" });
    expect(within(sheet).getByRole("alert").textContent).toContain("already in your collection");
    expect((within(sheet).getByRole("button", { name: "Add to collection" }) as HTMLButtonElement).disabled).toBe(true);
    expect(actions.addRecord).not.toHaveBeenCalled();
  });

  it("adds to the want list, but not a record you already own", async () => {
    const actions = show();
    await typeAndWait(screen.getByLabelText("Search Discogs"), "rock");
    await act(async () => { fireEvent.click(within(screen.getByText("Animals").closest("li")!).getByRole("button", { name: "Want" })); });
    expect(actions.addWant).toHaveBeenCalledWith({ Artist: "Pink Floyd", AlbumName: "Animals", Year: "1977", Genre: "Rock", CoverURL: null, DiscogsID: 1 });
    await act(async () => { fireEvent.click(within(screen.getByText("The Bends").closest("li")!).getByRole("button", { name: "Want" })); });
    expect(screen.getByRole("alert").textContent).toBe("The Bends is already in your collection.");
    expect(actions.addWant).toHaveBeenCalledTimes(1);
  });

  it("says why when Discogs can't be reached", async () => {
    searchReleases.mockRejectedValue(new Error("The Discogs token is not set up in Supabase yet."));
    show();
    await typeAndWait(screen.getByLabelText("Search Discogs"), "floyd");
    expect(screen.getByRole("alert").textContent).toContain("The Discogs token is not set up in Supabase yet.");
  });
});

describe("MatchSheet", () => {
  it("searches for the record and saves the chosen pressing", async () => {
    const onMatch = vi.fn(async () => true);
    const onClose = vi.fn();
    render(<MatchSheet record={sampleRecords[0]} onMatch={onMatch} onClose={onClose} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(searchReleases).toHaveBeenCalledWith({}, "Radiohead The Bends");
    await act(async () => {
      fireEvent.click(within(screen.getByText("The Bends").closest("li")!).getByRole("button", { name: "This one" }));
    });
    expect(getRelease).toHaveBeenCalledWith({}, 2);
    expect(onMatch).toHaveBeenCalledWith(sampleRecords[0], animals);
    expect(onClose).toHaveBeenCalled();
  });
});
