// The phone's side of the Discogs and Spotify lookups: how long it waits, and how it tells a slow answer apart
import { describe, expect, it, vi } from "vitest";

import { albumWaitMs, callLookup, getRelease, isLookupTimeout, LookupTimeout, searchReleases, searchWaitMs } from "../src/lib/lookup";

const fakeSupabase = (answer: { data?: unknown; error?: unknown }) => {
  const invoke = vi.fn(async () => ({ data: null, error: null, ...answer }));
  return { supabase: { functions: { invoke } } as never, invoke };
};

describe("lookup time limits", () => {
  it("waits about 10 seconds for a search and about 17 for a whole album", async () => {
    expect(searchWaitMs).toBe(10000);
    expect(albumWaitMs).toBe(17000);
    const { supabase, invoke } = fakeSupabase({ data: { results: [] } });
    await searchReleases(supabase, "meddle");
    expect((invoke.mock.calls[0] as unknown[])[1]).toEqual({ body: { action: "search", query: "meddle" }, timeout: 10000 });
    const { supabase: albumSupabase, invoke: albumInvoke } = fakeSupabase({ data: { release: {} } });
    await getRelease(albumSupabase, 7);
    expect((albumInvoke.mock.calls[0] as unknown[])[1]).toEqual({ body: { action: "release", discogsId: 7 }, timeout: 17000 });
  });

  it("calls it a timeout when the phone stops waiting", async () => {
    const aborted = Object.assign(new Error("signal is aborted"), { name: "AbortError" });
    const { supabase } = fakeSupabase({ error: Object.assign(new Error("Failed to send a request"), { context: aborted }) });
    const failure = (await callLookup(supabase, {}).catch((error: unknown) => error)) as Error;
    expect(isLookupTimeout(failure)).toBe(true);
    expect(failure.message).toBe("Discogs is slow to answer right now.");
  });

  it("calls it a timeout when the function gave up on Discogs", async () => {
    const context = new Response(JSON.stringify({ error: "Discogs took too long to answer.", timedOut: true }), { status: 504 });
    const { supabase } = fakeSupabase({ error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context }) });
    await expect(callLookup(supabase, {})).rejects.toBeInstanceOf(LookupTimeout);
  });

  it("passes other problems on in the function's own words", async () => {
    const context = new Response(JSON.stringify({ error: "The Discogs token is not set up in Supabase yet." }), { status: 500 });
    const { supabase } = fakeSupabase({ error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context }) });
    const failure = (await callLookup(supabase, {}).catch((error: unknown) => error)) as Error;
    expect(isLookupTimeout(failure)).toBe(false);
    expect(failure.message).toBe("The Discogs token is not set up in Supabase yet.");
  });
});
