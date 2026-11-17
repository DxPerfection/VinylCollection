// One want: change its priority and note, mark it as bought (Got it), or take it off the list
import { useEffect, useState } from "react";

import type { WantRow } from "../lib/records";
import { cachedLink, fetchSpotifyLinks, linkKey, listenUrl } from "../lib/spotify";
import { getSupabase } from "../lib/supabaseClient";
import { addedText, discogsLink, priceText, priorities, priorityOf, type MarketPrice } from "../lib/wants";
import { yearText } from "../lib/format";
import { BottomSheet } from "./bottomSheet";
import { CoverArt } from "./coverArt";
import { ExternalIcon, TrashIcon } from "./icons";

interface WantSheetProps {
  want: WantRow;
  price: MarketPrice | null | undefined;
  inCollection: boolean;
  onSave: (want: WantRow, change: Partial<WantRow>) => Promise<boolean>;
  onGotIt: () => void;
  onRemove: (want: WantRow) => Promise<boolean>;
  onClose: () => void;
}

export function WantSheet({ want, price, inCollection, onSave, onGotIt, onRemove, onClose }: WantSheetProps) {
  const [priority, setPriority] = useState(priorityOf(want));
  const [note, setNote] = useState(want.Note ?? "");
  const [busy, setBusy] = useState(false);
  const changed = priority !== priorityOf(want) || note.trim() !== (want.Note ?? "").trim();
  const details = [yearText(want.Year), want.Genre].filter(Boolean).join(" · ");
  const prices = priceText(price);
  const spotifyUrl = useSpotifyLink(want.Artist ?? "", want.AlbumName ?? "");

  const run = async (work: () => Promise<boolean>) => {
    setBusy(true);
    const done = await work();
    setBusy(false);
    if (done) onClose();
  };

  return (
    <BottomSheet label={want.AlbumName ?? "Want"} onClose={onClose}>
      <div className="sheetHead">
        <CoverArt url={want.CoverURL} className="sheetCover" />
        <div className="sheetTitles">
          <h2 className="sheetAlbum">{want.AlbumName}</h2>
          <div className="muted">{want.Artist}</div>
          {details && <div className="muted small">{details}</div>}
          <div className="muted tiny">{addedText(want)}</div>
        </div>
      </div>

      <a className="discogsLine" href={discogsLink(want)} target="_blank" rel="noreferrer">
        <span>{prices || "Prices on Discogs"}</span>
        <span className="linkish">{want.DiscogsID ? "See it on Discogs" : "Find it on Discogs"} <ExternalIcon /></span>
      </a>

      <a className="discogsLine" href={listenUrl(want.Artist ?? "", want.AlbumName ?? "", spotifyUrl)} target="_blank" rel="noreferrer">
        <span>Listen before you buy</span>
        <span className="linkish">Listen on Spotify <ExternalIcon /></span>
      </a>

      <div className="fieldGroup">
        <span className="fieldLabel">Priority</span>
        <div className="segmented" role="group" aria-label="Priority">
          {priorities.map((option) => (
            <button key={option.value} type="button" className={option.value === priority ? "segment segmentActive" : "segment"}
              aria-pressed={option.value === priority} onClick={() => setPriority(option.value)}>{option.label}</button>
          ))}
        </div>
      </div>
      <label className="field"><span>Where you saw it</span>
        <input value={note} placeholder="Shop, price, pressing…" onChange={(event) => setNote(event.target.value)} /></label>
      {changed && (
        <button type="button" className="secondaryButton" disabled={busy}
          onClick={() => run(() => onSave(want, { Priority: priority, Note: note.trim() }))}>Save priority and note</button>
      )}

      {inCollection && <p className="muted small">This one is already in your collection.</p>}
      <button type="button" className="primaryButton bigButton" disabled={busy}
        onClick={inCollection ? () => run(() => onRemove(want)) : onGotIt}>
        {inCollection ? "Take it off the list" : "Got it"}
      </button>
      {!inCollection && (
        <button type="button" className="secondaryButton dangerButton" disabled={busy} onClick={() => run(() => onRemove(want))}>
          <TrashIcon /> Remove from the list
        </button>
      )}
    </BottomSheet>
  );
}

// The album's Spotify page once found; until then (or if Spotify doesn't have it) the link is a Spotify search
function useSpotifyLink(artist: string, album: string): string | null {
  const [link, setLink] = useState<string | null>(() => cachedLink({ artist, album }) ?? null);
  useEffect(() => {
    if (!artist || !album || cachedLink({ artist, album }) !== undefined) return;
    let current = true;
    fetchSpotifyLinks(getSupabase(), [{ artist, album }])
      .then((links) => current && setLink(links[linkKey({ artist, album })] ?? null))
      .catch(() => { /* the search link still works */ });
    return () => { current = false; };
  }, [artist, album]);
  return link;
}
