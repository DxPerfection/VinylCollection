import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { linkPlays } from "../src/lib/collectionView";
import { forgottenRecords, snooze } from "../src/lib/forgotten";
import type { PlayRow } from "../src/lib/records";
import { PlayScreen } from "../src/screens/playScreen";
import { fakeActions, sampleRecords } from "./sampleData";

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(cleanup);

const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const plays: PlayRow[] = [
  { id: 1, Date: daysAgo(200), AlbumName: "The Bends", DurationMins: 48, VinylID: 1700000001 },
  { id: 2, Date: daysAgo(120), AlbumName: "Discovery", DurationMins: 61, VinylID: 1700000003 },
  { id: 3, Date: daysAgo(10), AlbumName: "Rust In Peace", DurationMins: 57, VinylID: 1700000002 },
];

describe("forgotten records", () => {
  it("lists records played before but not for 3 months, longest forgotten first, and skips snoozed ones", () => {
    const records = linkPlays(sampleRecords, plays);
    expect(forgottenRecords(records).map((item) => item.record.AlbumName)).toEqual(["The Bends", "Discovery"]);
    const snoozed = snooze({}, 1700000001);
    expect(forgottenRecords(records, snoozed).map((item) => item.record.AlbumName)).toEqual(["Discovery"]);
    const later = new Date(Date.now() + 31 * 86400000);
    expect(forgottenRecords(records, snoozed, later).map((item) => item.record.AlbumName)).toContain("The Bends");
  });

  it("shows the nudge on the Play tab with Play it and Not now", () => {
    const actions = fakeActions();
    render(<PlayScreen data={{ records: sampleRecords, plays, wants: [] }} actions={actions} random={() => 0} />);
    const card = screen.getByRole("region", { name: "Forgotten records" });
    expect(card.textContent).toContain("last played 7 months ago");
    fireEvent.click(within(card).getAllByRole("button", { name: "Play it" })[0]);
    expect(actions.logPlay).toHaveBeenCalledWith(expect.objectContaining({ AlbumName: "The Bends" }), "Full album", expect.any(Date));
    fireEvent.click(within(card).getAllByRole("button", { name: "Not now" })[0]);
    expect(within(screen.getByRole("region", { name: "Forgotten records" })).queryByText("The Bends")).toBeNull();
  });

  it("stays away when everything was played recently", () => {
    render(<PlayScreen data={{ records: sampleRecords, plays: [plays[2]], wants: [] }} actions={fakeActions()} />);
    expect(screen.queryByRole("region", { name: "Forgotten records" })).toBeNull();
  });
});
