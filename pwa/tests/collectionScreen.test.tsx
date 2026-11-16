import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CollectionScreen } from "../src/screens/collectionScreen";
import { samplePlays, sampleRecords } from "./sampleData";

afterEach(cleanup);

const tileAlbums = () => Array.from(document.querySelectorAll(".tileAlbum")).map((tile) => tile.textContent);

describe("CollectionScreen", () => {
  const show = (onLog = vi.fn(async () => true), matchRecord = vi.fn(async () => true)) =>
    render(<CollectionScreen data={{ records: sampleRecords, plays: samplePlays, wants: [] }} onOpenAccount={() => {}}
      onOpenAdd={() => {}} actions={{ logPlay: onLog, matchRecord }} />);

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

  it("logs Side A from the record card and closes it", async () => {
    const onLog = vi.fn(async () => true);
    show(onLog);
    fireEvent.click(screen.getByText("The Bends"));
    const card = screen.getByRole("dialog", { name: "The Bends" });
    fireEvent.click(within(card).getByRole("button", { name: "Side A" }));
    expect(within(card).getByText("24 min")).toBeTruthy();
    await act(async () => { fireEvent.click(within(card).getByRole("button", { name: "I listened to this" })); });
    expect(onLog).toHaveBeenCalledTimes(1);
    const [record, part, playedAt] = onLog.mock.calls[0] as unknown as [{ AlbumName: string }, string, Date];
    expect(record.AlbumName).toBe("The Bends");
    expect(part).toBe("Side A");
    expect(Math.abs(playedAt.getTime() - Date.now())).toBeLessThan(5000);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("logs an earlier time, and refuses one in the future", async () => {
    const onLog = vi.fn(async () => true);
    show(onLog);
    fireEvent.click(screen.getByText("Discovery"));
    const card = screen.getByRole("dialog", { name: "Discovery" });
    fireEvent.click(within(card).getByRole("button", { name: "Earlier" }));
    const input = within(card).getByLabelText("When did you play it?");
    fireEvent.change(input, { target: { value: "2099-01-01T10:00" } });
    expect(within(card).getByRole("alert").textContent).toBe("That time hasn't happened yet.");
    expect((within(card).getByRole("button", { name: "I listened to this" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "2026-11-01T20:30" } });
    await act(async () => { fireEvent.click(within(card).getByRole("button", { name: "I listened to this" })); });
    const playedAt = (onLog.mock.calls[0] as unknown as [unknown, string, Date])[2];
    expect(playedAt.getTime()).toBe(new Date(2026, 10, 1, 20, 30).getTime());
  });

  it("keeps the card open when saving fails", async () => {
    show(vi.fn(async () => false));
    fireEvent.click(screen.getByText("Discovery"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "I listened to this" })); });
    expect(screen.getByRole("dialog", { name: "Discovery" })).toBeTruthy();
  });

  it("filters to records without Discogs info, and offers Match on Discogs", () => {
    render(<CollectionScreen data={{ records: [...sampleRecords.slice(1), { ...sampleRecords[0], DiscogsID: 9, Label: "Parlophone" }], plays: [], wants: [] }}
      onOpenAccount={() => {}} onOpenAdd={() => {}} actions={{ logPlay: vi.fn(), matchRecord: vi.fn() }} />);
    fireEvent.click(screen.getByRole("button", { name: "No Discogs info yet (3)" }));
    expect(tileAlbums()).not.toContain("The Bends");
    fireEvent.click(screen.getByText("Discovery"));
    fireEvent.click(screen.getByRole("button", { name: "Match on Discogs" }));
    expect(screen.getByRole("dialog", { name: "Match Discovery on Discogs" })).toBeTruthy();
  });
});
