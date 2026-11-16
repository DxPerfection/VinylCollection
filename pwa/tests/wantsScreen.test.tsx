import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WantRow } from "../src/lib/records";
import { sampleRecords } from "./sampleData";

vi.mock("../src/lib/supabaseClient", () => ({ getSupabase: () => ({}), isConfigured: () => true }));
const invoke = vi.fn();
const searchReleases = vi.fn();
const getRelease = vi.fn();
vi.mock("../src/lib/lookup", () => ({
  callLookup: (...args: unknown[]) => invoke(...args),
  searchReleases: (...args: unknown[]) => searchReleases(...args),
  getRelease: (...args: unknown[]) => getRelease(...args),
}));

const { WantsScreen } = await import("../src/screens/wantsScreen");

const wants: WantRow[] = [
  { id: 1, Artist: "Pink Floyd", AlbumName: "Animals", Year: "1977", Genre: "Rock", CoverURL: "", DiscogsID: 501, Priority: 3, Note: null },
  { id: 2, Artist: "Tool", AlbumName: "Lateralus", Year: "2001", Genre: "Rock", CoverURL: "", DiscogsID: 502, Priority: 1, Note: "Kadıköy shop" },
  { id: 3, Artist: "Radiohead", AlbumName: "The Bends", Year: "1995", Genre: "Rock", CoverURL: "", DiscogsID: null, Priority: 2 },
];

const actions = () => ({ editWant: vi.fn(async () => true), removeWant: vi.fn(async () => true), gotWant: vi.fn(async () => true) });
const show = (acts = actions()) => {
  render(<WantsScreen data={{ records: sampleRecords, plays: [], wants }} actions={acts} onOpenAdd={() => {}} />);
  return acts;
};

beforeEach(() => {
  sessionStorage.clear();
  invoke.mockResolvedValue({ prices: { "501": { lowest: 30, currency: "EUR", forSale: 4 }, "502": null } });
  getRelease.mockResolvedValue({
    discogsId: 501, artist: "Pink Floyd", album: "Animals", year: "1977", genre: "Rock", coverUrl: "", label: "Harvest",
    catalogNumber: "SHVL 815", format: "Vinyl, LP", country: "UK", subGenre: "Prog Rock", tracks: ["Dogs"], durationMins: 41,
    sideMins: "A:18|B:23", coverFromSpotify: true, lengthFromSpotify: true,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const rowTitles = () => Array.from(document.querySelectorAll(".wantRow .playAlbum")).map((row) => row.textContent);

describe("WantsScreen", () => {
  it("lists wants by priority with the Discogs price", async () => {
    await act(async () => { show(); });
    expect(rowTitles()).toEqual(["Lateralus", "The Bends", "Animals"]);
    expect(screen.getByText("3 records you want")).toBeTruthy();
    expect(screen.getByText("From 30.00 EUR · 4 for sale")).toBeTruthy();
    expect(screen.getByText("Kadıköy shop")).toBeTruthy();
    expect((invoke.mock.calls[0] as unknown[])[1]).toEqual({ action: "prices", discogsIds: [501, 502] });
  });

  it("saves a new priority and note", async () => {
    let acts = actions();
    await act(async () => { acts = show(); });
    fireEvent.click(screen.getByText("Animals"));
    const sheet = screen.getByRole("dialog", { name: "Animals" });
    fireEvent.click(within(sheet).getByRole("button", { name: "High" }));
    fireEvent.change(within(sheet).getByLabelText("Where you saw it"), { target: { value: " Plak shop, 900 TL " } });
    await act(async () => { fireEvent.click(within(sheet).getByRole("button", { name: "Save priority and note" })); });
    expect((acts.editWant.mock.calls[0] as unknown[])[1]).toEqual({ Priority: 1, Note: "Plak shop, 900 TL" });
  });

  it("Got it opens the Add sheet for the saved release and adds it through gotWant", async () => {
    let acts = actions();
    await act(async () => { acts = show(); });
    fireEvent.click(screen.getByText("Animals"));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    const sheet = await screen.findByRole("dialog", { name: "Add Animals" });
    await act(async () => { fireEvent.click(await within(sheet).findByRole("button", { name: "Add to collection" })); });
    const [gotWant, row] = acts.gotWant.mock.calls[0] as unknown as [WantRow, { AlbumName: string; DiscogsID: number }];
    expect(gotWant.id).toBe(1);
    expect(row.AlbumName).toBe("Animals");
    expect(row.DiscogsID).toBe(501);
  });

  it("a want already in the collection is only taken off the list", async () => {
    let acts = actions();
    await act(async () => { acts = show(); });
    fireEvent.click(screen.getByText("The Bends"));
    expect(screen.getByText("This one is already in your collection.")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Take it off the list" })); });
    expect((acts.removeWant.mock.calls[0] as unknown as [WantRow])[0].id).toBe(3);
    expect(acts.gotWant).not.toHaveBeenCalled();
  });

  it("still lists the wants when prices can't be fetched", async () => {
    invoke.mockRejectedValue(new Error("Unknown action."));
    await act(async () => { show(); });
    expect(rowTitles()).toHaveLength(3);
    expect(screen.queryByText(/for sale/)).toBeNull();
  });
});
