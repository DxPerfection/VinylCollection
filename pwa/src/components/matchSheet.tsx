// Matching a record you already have to its Discogs release, to save the label, catalogue number, format,
// country and side lengths. Nothing else about the record changes.
import { useState } from "react";

import { type DiscogsHit, getRelease, isLookupTimeout } from "../lib/lookup";
import type { VinylRecord } from "../lib/records";
import { getSupabase } from "../lib/supabaseClient";
import { useDiscogsSearch } from "../lib/useDiscogsSearch";
import { BottomSheet } from "./bottomSheet";
import { DiscogsResults } from "./discogsResults";
import { SearchIcon } from "./icons";

interface MatchSheetProps {
  record: VinylRecord;
  onMatch: (record: VinylRecord, release: Awaited<ReturnType<typeof getRelease>>) => Promise<boolean>;
  onClose: () => void;
}

export function MatchSheet({ record, onMatch, onClose }: MatchSheetProps) {
  const [query, setQuery] = useState(`${record.Artist ?? ""} ${record.AlbumName ?? ""}`.trim());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [problem, setProblem] = useState("");
  const search = useDiscogsSearch(query);

  const choose = async (hit: DiscogsHit) => {
    setBusyId(hit.discogsId);
    setProblem("");
    try {
      const release = await getRelease(getSupabase(), hit.discogsId);
      if (await onMatch(record, release)) onClose();
    } catch (error) {
      setProblem(isLookupTimeout(error) ? "Discogs was too slow to answer, so nothing changed. Try again in a moment."
        : `Couldn't save it: ${error instanceof Error ? error.message : String(error)}`);
    }
    setBusyId(null);
  };

  return (
    <BottomSheet label={`Match ${record.AlbumName ?? "record"} on Discogs`} onClose={onClose}>
      <h2 className="sheetAlbum">Which pressing is yours?</h2>
      <p className="muted small">Compare the label and catalogue number with your sleeve. Only the record info is saved; the title, cover, length and tracklist stay as they are.</p>
      <label className="searchBox">
        <SearchIcon />
        <input type="search" aria-label="Search Discogs" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {problem && <p className="errorNote small" role="alert">{problem}</p>}
      <DiscogsResults search={search} idleHint="Type an artist or album."
        buttons={(hit) => (
          <button type="button" className="smallButton smallPrimary" disabled={busyId !== null} onClick={() => choose(hit)}>
            {busyId === hit.discogsId ? "Saving…" : "This one"}
          </button>
        )} />
    </BottomSheet>
  );
}
