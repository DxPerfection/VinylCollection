// The "Suggested for you" section on the Wants tab
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SuggestionsSection } from "../src/components/suggestionsSection";
import { type SuggestionSources, writeSaved } from "../src/lib/suggestions";
import { sampleRecords } from "./sampleData";

vi.mock("../src/lib/supabaseClient", () => ({ getSupabase: () => ({}) }));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const data = { records: sampleRecords, plays: [], wants: [] };
const justice = { artist: "Justice", album: "Cross", year: "2007", genre: "Electronic", coverUrl: "", discogsId: 777,
  reason: "Like Daft Punk (rated 5★)", price: { lowest: 24.5, currency: "EUR", forSale: 12 } };

const sources = (): SuggestionSources => ({
  topArtists: vi.fn(async () => []),
  similar: vi.fn(async () => ({ "Daft Punk": [{ name: "Justice", match: 1 }] })),
  topAlbums: vi.fn(async () => ({ Justice: [{ name: "Cross", count: 1, imageUrl: "" }] })),
  search: vi.fn(async () => [{ discogsId: 777, artist: "Justice", album: "Cross", year: "2007", genre: "Electronic", coverUrl: "",
    label: "", catalogNumber: "", format: "Vinyl", country: "" }]),
  prices: vi.fn(async () => ({ "777": justice.price })),
});

const actions = () => ({ addWant: vi.fn(async () => true), dismissSuggestion: vi.fn(async () => true) });

describe("SuggestionsSection", () => {
  it("works the list out the first time and shows why, the price and both buttons", async () => {
    const acts = actions();
    const from = sources();
    await act(async () => {
      render(<SuggestionsSection data={data} actions={acts} sources={from} loadDismissed={async () => []} />);
    });
    expect(from.similar).toHaveBeenCalled();
    expect(screen.getByText("Cross")).toBeTruthy();
    expect(screen.getByText(/^Like Daft Punk/)).toBeTruthy();
    expect(screen.getByText("From 24.50 EUR · 12 for sale")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Want it" })); });
    expect(acts.addWant).toHaveBeenCalledWith(expect.objectContaining({ Artist: "Justice", AlbumName: "Cross", DiscogsID: 777 }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Not for me" })); });
    expect(acts.dismissSuggestion).toHaveBeenCalledWith(expect.objectContaining({ artist: "Justice" }), expect.any(Function));
  });

  it("uses the list from the last day, without artists said no to", async () => {
    writeSaved([justice, { ...justice, artist: "Phoenix", album: "Wolfgang Amadeus Phoenix", discogsId: 778 }]);
    const from = sources();
    await act(async () => {
      render(<SuggestionsSection data={data} actions={actions()} sources={from}
        loadDismissed={async () => [{ id: 1, Artist: "Phoenix", AlbumName: null }]} />);
    });
    expect(from.similar).not.toHaveBeenCalled();
    expect(screen.getByText("Cross")).toBeTruthy();
    expect(screen.queryByText("Wolfgang Amadeus Phoenix")).toBeNull();
  });

  it("says when it couldn't get suggestions", async () => {
    const from = { ...sources(), similar: vi.fn(async () => { throw new Error("Last.fm is slow to answer right now."); }) };
    await act(async () => {
      render(<SuggestionsSection data={data} actions={actions()} sources={from} loadDismissed={async () => []} />);
    });
    expect(screen.getByText(/Couldn't get suggestions right now: Last.fm is slow/)).toBeTruthy();
  });
});
