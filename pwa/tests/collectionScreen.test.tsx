import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CollectionScreen } from "../src/screens/collectionScreen";
import { samplePlays, sampleRecords } from "./sampleData";

afterEach(cleanup);

const tileAlbums = () => Array.from(document.querySelectorAll(".tileAlbum")).map((tile) => tile.textContent);

describe("CollectionScreen", () => {
  const show = () => render(<CollectionScreen data={{ records: sampleRecords, plays: samplePlays }} onOpenAccount={() => {}} />);

  it("shows every record, newest first, with the count", () => {
    show();
    expect(screen.getByText("4 records")).toBeTruthy();
    expect(tileAlbums()).toEqual(["Hybrid Theory", "Discovery", "Rust In Peace", "The Bends"]);
  });

  it("filters by search and by genre chip", () => {
    show();
    fireEvent.change(screen.getByLabelText("Search artist or album"), { target: { value: "daft" } });
    expect(tileAlbums()).toEqual(["Discovery"]);
    expect(screen.getByText("Showing 1 of 4")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search artist or album"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Metal" }));
    expect(tileAlbums()).toEqual(["Hybrid Theory", "Rust In Peace"]);
  });

  it("changes the order with the sort picker", () => {
    show();
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "Recently listened" } });
    expect(tileAlbums()[0]).toBe("Rust In Peace");
  });

  it("opens a record's card with plays and tracklist, and closes it", () => {
    show();
    fireEvent.click(screen.getByText("Rust In Peace"));
    const card = screen.getByRole("dialog", { name: "Rust In Peace" });
    expect(within(card).getByText("Played 2 times")).toBeTruthy();
    expect(within(card).getByText("Metal · 1990 · 57 min")).toBeTruthy();
    expect(within(card).getByText("Tracklist (2)")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says so when nothing matches", () => {
    show();
    fireEvent.change(screen.getByLabelText("Search artist or album"), { target: { value: "zzz" } });
    expect(screen.getByText("No records match your search.")).toBeTruthy();
  });
});
