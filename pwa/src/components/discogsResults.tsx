// A list of Discogs releases, each with its pressing details and the buttons the screen asks for
import type { ReactNode } from "react";

import type { DiscogsHit } from "../lib/lookup";
import { pressingLine, type SearchState } from "../lib/useDiscogsSearch";
import { CoverArt } from "./coverArt";

interface DiscogsResultsProps {
  search: SearchState;
  idleHint: string;
  buttons: (hit: DiscogsHit) => ReactNode;
}

export function DiscogsResults({ search, idleHint, buttons }: DiscogsResultsProps) {
  if (search.status === "idle") return <p className="muted small">{idleHint}</p>;
  if (search.status === "searching") return <p className="muted small" role="status">Searching Discogs…</p>;
  if (search.status === "error") return <p className="errorNote small" role="alert">Couldn't search Discogs: {search.message}</p>;
  if (search.results.length === 0) return <p className="muted small">No matches on Discogs. Try fewer words.</p>;
  return (
    <ul className="resultList" aria-label="Discogs results">
      {search.results.map((hit) => (
        <li key={hit.discogsId} className="resultRow">
          <CoverArt url={hit.coverUrl} className="resultCover" />
          <div className="resultText">
            <div className="playAlbum">{hit.album}</div>
            <div className="muted small">{hit.artist}</div>
            <div className="muted tiny">{pressingLine(hit)}</div>
          </div>
          <div className="resultButtons">{buttons(hit)}</div>
        </li>
      ))}
    </ul>
  );
}
