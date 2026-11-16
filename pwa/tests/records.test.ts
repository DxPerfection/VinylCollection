import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { fetchAllRows } from "../src/lib/records";

// Stands in for supabase.from(table).select().order().range(), handing out rows 1000 at a time
function fakeSupabase(totalRows: number) {
  const ranges: [number, number][] = [];
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number) => {
            ranges.push([from, to]);
            const data = [];
            for (let id = from; id <= Math.min(to, totalRows - 1); id++) data.push({ id });
            return { data, error: null };
          },
        }),
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, ranges };
}

describe("fetchAllRows", () => {
  it("reads past the first 1000 rows", async () => {
    const { client, ranges } = fakeSupabase(2350);
    const rows = await fetchAllRows<{ id: number }>(client, "ListeningHistory", "id");
    expect(rows).toHaveLength(2350);
    expect(rows[2349].id).toBe(2349);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops after one request for a small table", async () => {
    const { client, ranges } = fakeSupabase(81);
    expect(await fetchAllRows(client, "Inventory", "ID")).toHaveLength(81);
    expect(ranges).toHaveLength(1);
  });
});
