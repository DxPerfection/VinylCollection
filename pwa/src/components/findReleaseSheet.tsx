// Finding the Discogs release for a want saved without one, before adding it to the collection
import { useState } from "react";

import type { DiscogsHit } from "../lib/lookup";
import { useDiscogsSearch } from "../lib/useDiscogsSearch";
import { BottomSheet } from "./bottomSheet";
import { DiscogsResults } from "./discogsResults";
import { SearchIcon } from "./icons";

interface FindReleaseSheetProps {
  initialQuery: string;
  onPick: (hit: DiscogsHit) => void;
  onClose: () => void;
}

export function FindReleaseSheet({ initialQuery, onPick, onClose }: FindReleaseSheetProps) {
  const [query, setQuery] = useState(initialQuery);
  const search = useDiscogsSearch(query);
  return (
    <BottomSheet label="Which pressing did you get?" onClose={onClose}>
      <h2 className="sheetAlbum">Which pressing did you get?</h2>
      <p className="muted small">Pick it on Discogs to fill in the tracklist, cover, length and record info.</p>
      <label className="searchBox">
        <SearchIcon />
        <input type="search" aria-label="Search Discogs" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <DiscogsResults search={search} idleHint="Type an artist or album."
        buttons={(hit) => <button type="button" className="smallButton smallPrimary" onClick={() => onPick(hit)}>This one</button>} />
    </BottomSheet>
  );
}
