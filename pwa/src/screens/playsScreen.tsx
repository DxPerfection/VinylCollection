// Recent plays, newest first and grouped by day, each with a delete button
import { useMemo, useState } from "react";

import { CoverArt } from "../components/coverArt";
import { TrashIcon } from "../components/icons";
import { minutesText } from "../lib/format";
import { dayHeading, type PlayView, recentPlays, timeOfDay } from "../lib/plays";
import type { CollectionData, PlayRow } from "../lib/records";

const pageSize = 40;

interface PlaysScreenProps {
  data: CollectionData;
  onDelete: (play: PlayRow) => void;
}

export function PlaysScreen({ data, onDelete }: PlaysScreenProps) {
  const [shown, setShown] = useState(pageSize);
  const plays = useMemo(() => recentPlays(data.plays, data.records), [data]);

  const groups: { heading: string; items: PlayView[] }[] = [];
  for (const item of plays.slice(0, shown)) {
    const heading = dayHeading(item.when);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.items.push(item);
    else groups.push({ heading, items: [item] });
  }

  const total = plays.length;
  return (
    <div className="screen">
      <header className="screenHeader">
        <h1>Recent plays</h1>
        <div className="muted small">
          {total === 0 ? "Tap a record in Collection to log a listen." : `${total} ${total === 1 ? "play" : "plays"} · tap a record in Collection to log one`}
        </div>
      </header>
      <div className="scrollArea">
        {groups.map((group) => (
          <section key={group.heading} className="dayGroup" aria-label={group.heading}>
            <h2 className="dayHeading">{group.heading}</h2>
            {group.items.map(({ play, when, record, partLabel }) => (
              <div key={play.id} className="playRow">
                <CoverArt url={record?.CoverURL} className="playCover" />
                <div className="playText">
                  <div className="playAlbum">{play.AlbumName}</div>
                  <div className="muted small">
                    {[timeOfDay(when), record?.Artist, partLabel, minutesText(play.DurationMins)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button type="button" className="iconButton" aria-label={`Delete the play of ${play.AlbumName ?? "this record"}`}
                  onClick={() => onDelete(play)}>
                  <TrashIcon />
                </button>
              </div>
            ))}
          </section>
        ))}
        {shown < total && (
          <button type="button" className="secondaryButton fullWidth" onClick={() => setShown(shown + pageSize)}>
            Show older plays
          </button>
        )}
      </div>
    </div>
  );
}
