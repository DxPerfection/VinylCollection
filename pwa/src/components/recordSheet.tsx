// The card that opens when you tap a record: cover, details, how often you have played it, and the tracklist
import type { RecordView } from "../lib/collectionView";
import { oldAppLink } from "../lib/config";
import { formatLastPlayed, minutesText, playCountText, stars, trackList, yearText } from "../lib/format";
import { BottomSheet } from "./bottomSheet";
import { CoverArt } from "./coverArt";
import { ExternalIcon } from "./icons";

export function RecordSheet({ record, onClose }: { record: RecordView; onClose: () => void }) {
  const details = [record.Genre, yearText(record.Year), minutesText(record.DurationMins)].filter(Boolean).join(" · ");
  const tracks = trackList(record.Tracklist);
  const extras = [record.SubGenre, record.Condition ? `Condition: ${record.Condition}` : ""].filter(Boolean);

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

      {extras.length > 0 && <div className="muted small">{extras.join(" · ")}</div>}

      {tracks.length > 0 && (
        <details className="trackList">
          <summary>Tracklist ({tracks.length})</summary>
          <ol>
            {tracks.map((track, index) => <li key={index}>{track}</li>)}
          </ol>
        </details>
      )}

      <a className="secondaryButton" href={oldAppLink("log")} target="_blank" rel="noreferrer">
        Log a listen in the current app <ExternalIcon />
      </a>
      <p className="muted small centered">Logging from this card, with Side A and Side B, comes in the next update.</p>
    </BottomSheet>
  );
}
