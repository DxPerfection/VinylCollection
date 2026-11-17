import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VinylRecord } from "../src/lib/records";
import { fakeActions, sampleRecord, sampleRecords } from "./sampleData";

const invoke = vi.fn();
vi.mock("../src/lib/supabaseClient", () => ({ getSupabase: () => ({ functions: { invoke } }), isConfigured: () => true }));

const { collectionValue, fetchPriceRound, knownPrices, moneyText, roundSize } = await import("../src/lib/collectionValue");
const { StatsScreen } = await import("../src/screens/statsScreen");

const eur = (lowest: number | null, forSale = 3) => ({ lowest, currency: "EUR", forSale });
const priced = (ids: number[]) => async (_name: string, { body }: { body: { discogsIds: number[] } }) => ({
  data: { prices: Object.fromEntries(body.discogsIds.filter((id) => ids.includes(id)).map((id) => [String(id), eur(id / 100)])) },
  error: null,
});

beforeEach(() => { invoke.mockImplementation(priced([])); });
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("collectionValue", () => {
  const records: VinylRecord[] = [
    sampleRecord(1, { AlbumName: "Cheap", DiscogsID: 11 }),
    sampleRecord(2, { AlbumName: "Dear", DiscogsID: 22 }),
    sampleRecord(3, { AlbumName: "Second copy", DiscogsID: 22 }),
    sampleRecord(4, { AlbumName: "None for sale", DiscogsID: 33 }),
    sampleRecord(5, { AlbumName: "Not checked", DiscogsID: 44 }),
    sampleRecord(6, { AlbumName: "Unmatched" }),
  ];

  it("adds up the cheapest copies and counts what it leaves out, and why", () => {
    const value = collectionValue(records, { 11: eur(5), 22: eur(30), 33: eur(null, 0) });
    expect(value).toMatchObject({ total: 65, currency: "EUR", counted: 3, unmatched: 1, noPrice: 1, waiting: 1 });
    expect(value.top.map((item) => [item.record.AlbumName, item.price])).toEqual([["Dear", 30], ["Second copy", 30], ["Cheap", 5]]);
  });

  it("counts nothing for a release Discogs couldn't price", () => {
    expect(collectionValue([records[0]], { 11: null })).toMatchObject({ total: 0, counted: 0, noPrice: 1 });
  });

  it("writes amounts as money", () => {
    expect(moneyText(1234.5, "EUR")).toMatch(/1,235|1\.235|1 235/);
    expect(moneyText(12.5, "USD")).toMatch(/12\.50/);
  });
});

describe("price rounds", () => {
  it("asks for at most one round of prices, keeps them for a day, and leaves out releases Discogs was slow for", async () => {
    invoke.mockImplementation(priced([1, 2]));
    const ids = Array.from({ length: roundSize + 5 }, (_, index) => index + 1);
    const start = Date.UTC(2026, 10, 17, 12);
    expect(Object.keys(await fetchPriceRound({ functions: { invoke } } as never, ids, start))).toEqual(["1", "2"]);
    expect(invoke.mock.calls[0][1].body.discogsIds).toHaveLength(roundSize);
    expect(knownPrices([1, 2, 3], start + 3600000)).toEqual({ prices: { 1: eur(0.01), 2: eur(0.02) }, missing: [3] });
    expect(knownPrices([1], start + 25 * 3600000).missing).toEqual([1]);
  });
});

describe("Collection value on Stats", () => {
  const matched = [sampleRecord(7, { AlbumName: "Animals", Artist: "Pink Floyd", DiscogsID: 700 }), ...sampleRecords];

  it("shows the total, how many records are counted, and why the others aren't", async () => {
    invoke.mockImplementation(priced([700]));
    render(<StatsScreen data={{ records: matched, plays: [], wants: [] }} actions={fakeActions()} />);
    const section = within(screen.getByRole("region", { name: "Collection value" }));
    expect(section.getByText("Checking prices for 1 more…")).toBeTruthy();
    await act(async () => { await Promise.resolve(); });
    expect(section.getByText("1 of 5 records counted")).toBeTruthy();
    expect(section.getByText("4 not matched on Discogs yet")).toBeTruthy();
    expect(section.getAllByText(/7\.00/).length).toBe(2); // the total and Animals in the top list
  });

  it("says when Discogs was too slow, and opens Match on Discogs on the first unmatched record", async () => {
    render(<StatsScreen data={{ records: matched, plays: [], wants: [] }} actions={fakeActions()} />);
    await act(async () => { await Promise.resolve(); });
    const section = within(screen.getByRole("region", { name: "Collection value" }));
    expect(section.getByText("Not known yet")).toBeTruthy();
    expect(section.getByText(/1 not checked yet: Discogs was slow/)).toBeTruthy();
    fireEvent.click(section.getByRole("button", { name: "Match records on Discogs" }));
    expect(screen.getByRole("dialog", { name: /^Match .* on Discogs$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
  });
});
