import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlaysScreen } from "../src/screens/playsScreen";
import { samplePlays, sampleRecords } from "./sampleData";

afterEach(cleanup);

describe("PlaysScreen", () => {
  it("lists plays newest first, grouped by day, and deletes one", () => {
    const onDelete = vi.fn();
    render(<PlaysScreen data={{ records: sampleRecords, plays: samplePlays, wants: [] }} onDelete={onDelete} />);
    expect(screen.getByText(/3 plays/)).toBeTruthy();
    const albums = Array.from(document.querySelectorAll(".playAlbum")).map((item) => item.textContent);
    expect(albums).toEqual(["Rust In Peace", "Rust In Peace", "The Bends"]);
    expect(document.querySelectorAll(".dayHeading")).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete the play of Rust In Peace" })[0]);
    expect(onDelete).toHaveBeenCalledWith(samplePlays[1]);
  });

  it("shows older plays on request", () => {
    const plays = Array.from({ length: 45 }, (_, index) => ({
      id: index + 1, Date: `2026-10-${String((index % 28) + 1).padStart(2, "0")}T10:00:00+00:00`, AlbumName: "The Bends",
      DurationMins: 48, VinylID: 1700000001,
    }));
    render(<PlaysScreen data={{ records: sampleRecords, plays, wants: [] }} onDelete={() => {}} />);
    expect(document.querySelectorAll(".playRow")).toHaveLength(40);
    fireEvent.click(screen.getByRole("button", { name: "Show older plays" }));
    expect(document.querySelectorAll(".playRow")).toHaveLength(45);
  });

  it("explains how to log when there are no plays", () => {
    render(<PlaysScreen data={{ records: sampleRecords, plays: [], wants: [] }} onDelete={() => {}} />);
    expect(screen.getByText("Tap a record in Collection to log a listen.")).toBeTruthy();
  });
});
