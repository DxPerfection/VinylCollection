import { afterEach, describe, expect, it, vi } from "vitest";

import type { WantRow } from "../src/lib/records";
import { addedText, discogsLink, fetchPrices, priceText, priorityOf, sortWants, wantAsHit } from "../src/lib/wants";

const want = (id: number, overrides: Partial<WantRow> = {}): WantRow => ({
  id, Artist: `Artist ${id}`, AlbumName: `Album ${id}`, Year: "1977", Genre: "Rock", CoverURL: "", DiscogsID: 1000 + id, ...overrides,
});

afterEach(() => sessionStorage.clear());

describe("want list helpers", () => {
  it("sorts by priority, then newest first, treating a missing priority as medium", () => {
    const sorted = sortWants([want(1, { Priority: 3 }), want(2), want(3, { Priority: 1 }), want(4, { Priority: 2 })]);
    expect(sorted.map((item) => item.id)).toEqual([3, 4, 2, 1]);
    expect(priorityOf({ Priority: 7 })).toBe(2);
  });

  it("links to the release's marketplace page, or a search when there is no Discogs id", () => {
    expect(discogsLink(want(1))).toBe("https://www.discogs.com/sell/release/1001");
    expect(discogsLink(want(1, { DiscogsID: null, Artist: "Pink Floyd", AlbumName: "Animals" })))
      .toBe("https://www.discogs.com/search/?q=Pink+Floyd+Animals&type=all");
  });

  it("describes prices like the Streamlit app", () => {
    expect(priceText({ lowest: 12.5, currency: "EUR", forSale: 7 })).toBe("From 12.50 EUR · 7 for sale");
    expect(priceText({ lowest: null, currency: "EUR", forSale: 0 })).toBe("None for sale on Discogs right now");
    expect(priceText(null)).toBe("");
  });

  it("says when it was added, and turns a want into a Discogs result for Got it", () => {
    expect(addedText({ AddedAt: "2026-11-02T10:00:00+00:00" }, new Date(2026, 10, 16))).toBe("Added 2 Nov");
    expect(addedText({ AddedAt: "2025-03-02T10:00:00+00:00" }, new Date(2026, 10, 16))).toBe("Added 2 Mar 2025");
    expect(wantAsHit(want(1))?.discogsId).toBe(1001);
    expect(wantAsHit(want(1, { DiscogsID: null }))).toBeNull();
  });
});

describe("fetchPrices", () => {
  it("asks only for prices it hasn't kept in the last six hours", async () => {
    const invoke = vi.fn(async (_name: string, { body }: { body: { discogsIds: number[] } }) => ({
      data: { prices: Object.fromEntries(body.discogsIds.map((id) => [String(id), { lowest: id, currency: "EUR", forSale: 1 }])) },
      error: null,
    }));
    const supabase = { functions: { invoke } } as never;
    const start = Date.UTC(2026, 10, 16, 12);
    expect(await fetchPrices(supabase, [1, 2], start)).toEqual({
      "1": { lowest: 1, currency: "EUR", forSale: 1 }, "2": { lowest: 2, currency: "EUR", forSale: 1 },
    });
    await fetchPrices(supabase, [1, 2, 3], start + 3600000);
    expect(invoke.mock.calls[1][1].body.discogsIds).toEqual([3]);
    await fetchPrices(supabase, [1], start + 7 * 3600000);
    expect(invoke.mock.calls[2][1].body.discogsIds).toEqual([1]);
  });

  it("keeps only the prices that came back, and asks again for the rest", async () => {
    sessionStorage.clear();
    const invoke = vi.fn(async () => ({ data: { prices: { "11": null } }, error: null }));
    const supabase = { functions: { invoke } } as never;
    const start = Date.UTC(2026, 10, 17, 12);
    expect(await fetchPrices(supabase, [11, 12], start)).toEqual({ "11": null });
    expect((invoke.mock.calls[0] as unknown[])[1]).toMatchObject({ timeout: 17000 });
    await fetchPrices(supabase, [11, 12], start + 60000);
    expect((invoke.mock.calls[1] as unknown as [string, { body: { discogsIds: number[] } }])[1].body.discogsIds).toEqual([12]);
  });
});
