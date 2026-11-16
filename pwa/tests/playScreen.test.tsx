import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlayScreen } from "../src/screens/playScreen";
import { fakeActions, sampleRecords } from "./sampleData";

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

const pickTitle = () => document.querySelector(".pickAlbum")?.textContent;

describe("PlayScreen", () => {
  const show = (actions = fakeActions(), random = () => 0) =>
    render(<PlayScreen data={{ records: sampleRecords, plays: [], wants: [] }} actions={actions} random={random} />);

  it("picks a record and keeps it until you ask for another, never the same artist twice in a row", () => {
    show();
    const first = pickTitle();
    expect(first).toBeTruthy();
    expect(screen.getByText(/^You have not logged a play of this one yet\./)).toBeTruthy();
    expect(screen.getByText(/Picked from 4 records/)).toBeTruthy();

    const seen = [first];
    for (let turn = 0; turn < 3; turn += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Another one" }));
      seen.push(pickTitle());
    }
    expect(new Set(seen).size).toBe(4); // each record offered once before any comes back
  });

  it("filters by genre and time, and says when nothing matches", () => {
    show();
    fireEvent.click(within(screen.getByRole("group", { name: "Genre" })).getByRole("button", { name: "Electronic" }));
    expect(pickTitle()).toBe("Discovery");
    fireEvent.click(screen.getByRole("button", { name: "Up to 30 min" }));
    expect(screen.getByText("Nothing matches. Try fewer filters or more time.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(pickTitle()).toBeTruthy();
  });

  it("logs the whole album now with Play it", async () => {
    const logPlay = vi.fn(async () => true);
    show(fakeActions({ logPlay }));
    const title = pickTitle();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play it" })); });
    const [record, part] = logPlay.mock.calls[0] as unknown as [{ AlbumName: string }, string];
    expect(record.AlbumName).toBe(title);
    expect(part).toBe("Full album");
  });

  it("opens the record card from the cover", () => {
    show();
    const title = pickTitle() ?? "";
    fireEvent.click(screen.getByRole("button", { name: `Open ${title}` }));
    expect(screen.getByRole("dialog", { name: title })).toBeTruthy();
  });

  it("remembers the pick and filters across visits", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Up to 60 min" }));
    const title = pickTitle();
    cleanup();
    show(fakeActions(), () => 0.99);
    expect(pickTitle()).toBe(title);
    expect(screen.getByRole("button", { name: "Up to 60 min" }).getAttribute("aria-pressed")).toBe("true");
  });
});
