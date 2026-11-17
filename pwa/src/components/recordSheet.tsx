// The card that opens when you tap a record: details, how often you have played it, the tracklist, and logging a play
import { useState } from "react";

import type { RecordView } from "../lib/collectionView";
import { formatLastPlayed, minutesText, playCountText, pressingDetails, trackList, yearText } from "../lib/format";
import { fromLocalInputValue, minutesFor, partsFor, type PlayPart, toLocalInputValue } from "../lib/plays";
import { BottomSheet } from "./bottomSheet";
import { CoverArt } from "./coverArt";

interface RecordSheetProps {
  record: RecordView;
  onClose: () => void;
  // Resolves true once the play is saved
  onLog: (record: RecordView, part: PlayPart, playedAt: Date) => Promise<boolean>;
  onMatch: () => void;
  onEdit: () => void;
  // Tapping the star it already has takes the rating off
  onRate: (record: RecordView, rating: number | null) => void;
  // Resolves true once the note is saved
  onSaveNote: (note: string) => Promise<boolean>;
}

export function RecordSheet({ record, onClose, onLog, onMatch, onEdit, onRate, onSaveNote }: RecordSheetProps) {
  const [part, setPart] = useState<PlayPart>("Full album");
  const [earlier, setEarlier] = useState(false);
  const [earlierValue, setEarlierValue] = useState(() => toLocalInputValue(new Date(Date.now() - 60 * 60 * 1000)));
  const [saving, setSaving] = useState(false);
  const parts = partsFor(record);

  const details = [record.Genre, yearText(record.Year), minutesText(record.DurationMins)].filter(Boolean).join(" · ");
  const tracks = trackList(record.Tracklist);
  const extras = [record.SubGenre, record.Condition ? `Condition: ${record.Condition}` : ""].filter(Boolean);
  const pressing = pressingDetails(record);

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
          <StarPicker rating={record.rating} onPick={(rating) => onRate(record, rating === record.rating ? null : rating)} />
        </div>
      </div>

      <div className="sheetStats">
        <span>{playCountText(record.playCount)}</span>
        {record.lastPlayed && <span>Last played {formatLastPlayed(record.lastPlayed)}</span>}
      </div>

      <div className="segmented" role="group" aria-label="What did you play?"
        style={{ gridTemplateColumns: `repeat(${Math.min(parts.length, 3)}, minmax(0, 1fr))` }}>
        {parts.map((option) => (
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
      {pressing.length > 0 ? (
        <section className="pressing" aria-label="Pressing">
          <h3 className="pressingTitle">Pressing</h3>
          <dl className="pressingList">
            {pressing.map(([term, value]) => (
              <div key={term} className="pressingRow"><dt>{term}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </section>
      ) : (
        <p className="muted small noPressing">No pressing details yet. Match it on Discogs to see the label, catalogue number, format,
          country and year of your copy.</p>
      )}

      <NoteBox key={record.ID} note={record.Note ?? ""} onSave={onSaveNote} />

      {tracks.length > 0 && (
        <details className="trackList">
          <summary>Tracklist ({tracks.length})</summary>
          <ol>
            {tracks.map((track, index) => <li key={index}>{track}</li>)}
          </ol>
        </details>
      )}

      <div className="sheetActions">
        <button type="button" className="secondaryButton" onClick={onEdit}>Edit or delete</button>
        <button type="button" className="secondaryButton" onClick={onMatch}>
          {record.DiscogsID ? "Change Discogs match" : "Match on Discogs"}
        </button>
      </div>
    </BottomSheet>
  );
}

function StarPicker({ rating, onPick }: { rating: number; onPick: (rating: number) => void }) {
  return (
    <div className="starPicker" role="group" aria-label={rating ? `Rating: ${rating} out of 5 stars` : "Rating: not rated yet"}>
      {[1, 2, 3, 4, 5].map((value) => (
        <button key={value} type="button" className={value <= rating ? "starButton starOn" : "starButton"}
          aria-label={`${value} ${value === 1 ? "star" : "stars"}`} aria-pressed={value === rating} onClick={() => onPick(value)}>
          {value <= rating ? "★" : "☆"}
        </button>
      ))}
      {!rating && <span className="muted tiny">Tap to rate</span>}
    </div>
  );
}

// A short note of your own: Save and Cancel show up once you change it
function NoteBox({ note, onSave }: { note: string; onSave: (note: string) => Promise<boolean> }) {
  const [text, setText] = useState(note);
  const [saving, setSaving] = useState(false);
  const changed = text.trim() !== note.trim();

  const save = async () => {
    setSaving(true);
    const saved = await onSave(text.trim());
    setSaving(false);
    if (saved) setText(text.trim());
  };

  return (
    <div className="noteBox">
      <label className="field">
        <span className="fieldLabel">Note</span>
        <textarea rows={2} maxLength={1000} value={text} placeholder="Where you bought it, how it sounds…"
          onChange={(event) => setText(event.target.value)} />
      </label>
      {changed && (
        <div className="noteActions">
          <button type="button" className="smallButton" disabled={saving} onClick={() => setText(note)}>Cancel</button>
          <button type="button" className="smallButton smallPrimary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      )}
    </div>
  );
}
