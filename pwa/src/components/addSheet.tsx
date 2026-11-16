// Checking a Discogs release before adding it: the filled-in details can be changed, then Add to collection
import { useEffect, useMemo, useState } from "react";

import { conditions, editsFrom, isDuplicate, knownGenres, newInventoryRow, type RecordEdits } from "../lib/addRecord";
import { type DiscogsHit, getRelease, type ReleaseDetails } from "../lib/lookup";
import type { VinylRecord } from "../lib/records";
import { getSupabase } from "../lib/supabaseClient";
import { pressingLine } from "../lib/useDiscogsSearch";
import { BottomSheet } from "./bottomSheet";
import { CoverArt } from "./coverArt";

interface AddSheetProps {
  hit: DiscogsHit;
  records: VinylRecord[];
  onAdd: (row: VinylRecord) => Promise<boolean>;
  onClose: () => void;
}

export function AddSheet({ hit, records, onAdd, onClose }: AddSheetProps) {
  const known = useMemo(() => knownGenres(records), [records]);
  const [release, setRelease] = useState<ReleaseDetails | null>(null);
  const [problem, setProblem] = useState("");
  const [edits, setEdits] = useState<RecordEdits | null>(null);
  const [otherGenre, setOtherGenre] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    getRelease(getSupabase(), hit.discogsId)
      .then((details) => {
        if (!current) return;
        setRelease(details);
        const filled = editsFrom(details, known);
        setEdits(filled);
        setOtherGenre(Boolean(filled.genre) && !known.includes(filled.genre));
      })
      .catch((error) => current && setProblem(error instanceof Error ? error.message : String(error)));
    return () => { current = false; };
  }, [hit.discogsId, known]);

  const change = (field: keyof RecordEdits, value: string | number) => edits && setEdits({ ...edits, [field]: value });
  const duplicate = edits ? isDuplicate(edits.artist, edits.album, records) : false;
  const ready = Boolean(release && edits && edits.artist.trim() && edits.album.trim() && !duplicate);

  const add = async () => {
    if (!release || !edits || !ready) return;
    setSaving(true);
    const added = await onAdd(newInventoryRow(release, edits, records, known));
    setSaving(false);
    if (added) onClose();
  };

  return (
    <BottomSheet label={`Add ${hit.album}`} onClose={onClose}>
      <div className="sheetHead">
        <CoverArt url={release?.coverUrl ?? hit.coverUrl} className="sheetCover" />
        <div className="sheetTitles">
          <h2 className="sheetAlbum">{edits?.album ?? hit.album}</h2>
          <div className="muted">{edits?.artist ?? hit.artist}</div>
          <div className="muted tiny">{pressingLine(release ?? hit)}</div>
          {release && (
            <div className="muted tiny">
              {release.coverFromSpotify ? "Cover from Spotify" : "Cover from Discogs"} · {release.lengthFromSpotify ? "length from Spotify" : "length from Discogs"}
            </div>
          )}
        </div>
      </div>

      {!release && !problem && <p className="muted small" role="status">Getting the tracklist, cover and length…</p>}
      {problem && <p className="errorNote small" role="alert">Couldn't get the details: {problem}</p>}

      {release && edits && (
        <>
          <div className="formGrid">
            <label className="field"><span>Artist</span>
              <input value={edits.artist} onChange={(event) => change("artist", event.target.value)} /></label>
            <label className="field"><span>Album</span>
              <input value={edits.album} onChange={(event) => change("album", event.target.value)} /></label>
            <label className="field"><span>Year</span>
              <input inputMode="numeric" value={edits.year} onChange={(event) => change("year", event.target.value)} /></label>
            <label className="field"><span>Length (min)</span>
              <input type="number" min={0} inputMode="numeric" value={edits.durationMins || ""}
                onChange={(event) => change("durationMins", Number(event.target.value))} /></label>
          </div>

          <div className="fieldGroup" role="group" aria-label="Genre">
            <span className="fieldLabel">Genre</span>
            <div className="chipWrap">
              {known.map((genre) => (
                <button key={genre} type="button" className={!otherGenre && edits.genre === genre ? "chip chipActive" : "chip"}
                  aria-pressed={!otherGenre && edits.genre === genre} onClick={() => { setOtherGenre(false); change("genre", genre); }}>
                  {genre}
                </button>
              ))}
              <button type="button" className={otherGenre ? "chip chipActive" : "chip"} aria-pressed={otherGenre}
                onClick={() => { setOtherGenre(true); change("genre", ""); }}>Other…</button>
            </div>
            {otherGenre && (
              <label className="field"><span>Other genre</span>
                <input value={edits.genre} onChange={(event) => change("genre", event.target.value)} /></label>
            )}
          </div>

          <label className="field"><span>Sub-genre</span>
            <input value={edits.subGenre} onChange={(event) => change("subGenre", event.target.value)} /></label>

          <div className="fieldGroup" role="group" aria-label="Condition">
            <span className="fieldLabel">Condition</span>
            <div className="chipWrap">
              {conditions.map((condition) => (
                <button key={condition} type="button" className={edits.condition === condition ? "chip chipActive" : "chip"}
                  aria-pressed={edits.condition === condition} onClick={() => change("condition", condition)}>{condition}</button>
              ))}
            </div>
          </div>

          <div className="muted small">
            {release.tracks.length} tracks{release.sideMins ? ` · sides ${release.sideMins.replace(/\|/g, ", ").replace(/:/g, " ")} min` : ""}
          </div>

          {duplicate && <p className="errorNote small" role="alert">{edits.album} by {edits.artist} is already in your collection.</p>}
          <button type="button" className="primaryButton bigButton" disabled={!ready || saving} onClick={add}>
            {saving ? "Adding…" : "Add to collection"}
          </button>
        </>
      )}
    </BottomSheet>
  );
}
