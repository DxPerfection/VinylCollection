import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatsScreen } from "../src/screens/statsScreen";
import { fakeActions, samplePlays, sampleRecords } from "./sampleData";

afterEach(cleanup);

describe("StatsScreen", () => {
  it("shows listening and shelf stats, and switches the album ranking", () => {
    render(<StatsScreen data={{ records: sampleRecords, plays: samplePlays, wants: [] }} actions={fakeActions()} />);
    expect(screen.getByText("Longest streak")).toBeTruthy();
    const albums = screen.getByRole("region", { name: "Most listened albums" });
    expect(within(albums).getAllByText("Megadeth - Rust In Peace")).toHaveLength(1);
    expect(within(albums).getByText("2×")).toBeTruthy();
    fireEvent.click(within(albums).getByRole("button", { name: "Minutes" }));
    expect(within(albums).getByText("1h 25m")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Genres" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Gathering dust" })).getAllByText("Never").length).toBeGreaterThan(0);
  });

  it("reads a column's value when tapped", () => {
    render(<StatsScreen data={{ records: sampleRecords, plays: samplePlays, wants: [] }} actions={fakeActions()} />);
    const days = screen.getByRole("region", { name: "When you listen" });
    fireEvent.click(within(days).getByRole("button", { name: /^Sun:/ }));
    expect(days.querySelector(".columnReadout")?.textContent).toBe("Sun: 2 plays");
  });

  it("asks for plays when there are none yet", () => {
    render(<StatsScreen data={{ records: sampleRecords, plays: [], wants: [] }} actions={fakeActions()} />);
    expect(screen.getByText("Log some plays to see your listening stats.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Decades" })).toBeTruthy();
  });

  it("opens the year in vinyl page from Stats", () => {
    render(<StatsScreen data={{ records: sampleRecords, plays: samplePlays, wants: [] }} actions={fakeActions()} />);
    fireEvent.click(screen.getByRole("button", { name: "See your year" }));
    const page = screen.getByRole("dialog", { name: "2026 in vinyl" });
    expect(within(page).getByText("Metal")).toBeTruthy();
    const top = within(page).getByRole("region", { name: "Top records" });
    expect(within(top).getAllByRole("listitem")[0].textContent).toContain("Rust In Peace");
    expect(within(page).getByRole("region", { name: "Never played this year" }).textContent).toContain("Hybrid Theory");
    fireEvent.click(within(page).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

