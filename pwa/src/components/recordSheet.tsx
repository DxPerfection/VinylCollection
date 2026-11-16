// The card that opens when you tap a record: details, how often you have played it, the tracklist, and logging a play
import { useState } from "react";

import type { RecordView } from "../lib/collectionView";
import { formatLastPlayed, minutesText, playCountText, stars, trackList, yearText } from "../lib/format";
import { fromLocalInputValue, minutesFor, type PlayPart, playParts, toLocalInputValue } from "../lib/plays";
import { BottomSheet } from "./bottomSheet";
import { CoverArt } from "./coverArt";

interface RecordSheetProps {
  record: RecordView;
  onClose: () => void;
  // Resolves true once the play is saved
  onLog: (record: RecordView, part: PlayPart, playedAt: Date) => Promise<boolean>;
}

export function RecordSheet({ record, onClose, onLog }: RecordSheetProps) {
  const [part, setPart] = useState<PlayPart>("Full album");
  const [earlier, setEarlier] = useState(false);
  const [earlierValue, setEarlierValue] = useState(() => toLocalInputValue(new Date(Date.now() - 60 * 60 * 1000)));
  const [saving, setSaving] = useState(false);

  const details = [record.Genre, yearText(record.Year), minutesText(record.DurationMins)].filter(Boolean).join(" · ");
  const tracks = trackList(record.Tracklist);
  const extras = [record.SubGenre, record.Condition ? `Condition: ${record.Condition}` : ""].filter(Boolean);

  const playedAt = earlier ? fromLocalInputValue(earlierValue) : new Date();
  const timeProblem = earlier && (!playedAt ? "Pick a date and time." : playedAt.getTime() > Date.now() ? "That time hasn't happened yet." : "");

  const log = async () => {
    const when = earlier ? playedAt : new Date();
    if (!when || timeProblem) return;
    setSaving(true);
    const saved = await onLog(record, part, when);
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <BottomSheet label={record.AlbumName ?? "Record"} onClose={onClose}>
      <div className="sheetHead">
        <CoverArt url={record.CoverURL} className="sheetCover" />
        <div className="sheetTitles">
          <h2 className="sheetAlbum">{record.AlbumName}</h2>
          <div className="muted">{record.Artist}</div>
          {details && <div className="muted small">{details}</div>}
          <div className="starsLine" aria-label={record.rating ? `${record.rating} out of 5 stars` : "Not rated yet"}>
            {record.rating ? stars(record.rating) : <span className="muted small">Not rated yet</span>}
          </div>
        </div>
      </div>

      <div className="sheetStats">
        <span>{playCountText(record.playCount)}</span>
        {record.lastPlayed && <span>Last played {formatLastPlayed(record.lastPlayed)}</span>}
      </div>

      <div className="segmented" role="group" aria-label="What did you play?">
        {playParts.map((option) => (
          <button key={option} type="button" className={option === part ? "segment segmentActive" : "segment"}
            aria-pressed={option === part} onClick={() => setPart(option)}>
            {option}
          </button>
        ))}
      </div>

      <div className="whenRow">
        <span className="muted small">{minutesFor(record, part)} min</span>
        <div className="whenChoice" role="group" aria-label="When">
          <button type="button" className={earlier ? "linkButton" : "linkButton linkButtonActive"} aria-pressed={!earlier}
            onClick={() => setEarlier(false)}>Just now</button>
          <button type="button" className={earlier ? "linkButton linkButtonActive" : "linkButton"} aria-pressed={earlier}
            onClick={() => setEarlier(true)}>Earlier</button>
        </div>
      </div>
      {earlier && (
        <label className="timeField">
          <span className="muted small">When did you play it?</span>
          <input type="datetime-local" value={earlierValue} max={toLocalInputValue(new Date())}
            onChange={(event) => setEarlierValue(event.target.value)} />
          {timeProblem && <span className="errorNote small" role="alert">{timeProblem}</span>}
        </label>
      )}

      <button type="button" className="primaryButton bigButton" disabled={saving || Boolean(timeProblem)} onClick={log}>
        {saving ? "Saving…" : "I listened to this"}
      </button>

      {extras.length > 0 && <div className="muted small">{extras.join(" · ")}</div>}

      {tracks.length > 0 && (
        <details className="trackList">
          <summary>Tracklist ({tracks.length})</summary>
          <ol>
            {tracks.map((track, index) => <li key={index}>{track}</li>)}
          </ol>
        </details>
      )}
    </BottomSheet>
  );
}
