// Searching Discogs as you type: waits for a short pause, and ignores answers to older searches
import { useEffect, useState } from "react";

import { type DiscogsHit, isLookupTimeout, searchReleases } from "./lookup";
import { getSupabase } from "./supabaseClient";

export type SearchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; results: DiscogsHit[] }
  | { status: "error"; message: string };

export function useDiscogsSearch(query: string, pauseMs = 500): SearchState {
  const [state, setState] = useState<SearchState>({ status: "idle" });

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setState({ status: "idle" });
      return;
    }
    let current = true;
    setState({ status: "searching" });
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchReleases(getSupabase(), text);
        if (current) setState({ status: "done", results });
      } catch (error) {
        if (!current) return;
        const message = isLookupTimeout(error) ? "Discogs is slow to answer right now. Try again in a moment."
          : `Couldn't search Discogs: ${error instanceof Error ? error.message : String(error)}`;
        setState({ status: "error", message });
      }
    }, pauseMs);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query, pauseMs]);

  return state;
}

// "Label · Cat no · Vinyl, LP, Album · Country · Year": what tells two pressings apart
export function pressingLine(hit: { label?: string; catalogNumber?: string; format?: string; country?: string; year?: string }): string {
  return [hit.label, hit.catalogNumber, hit.format, hit.country, hit.year].filter(Boolean).join(" · ");
}
