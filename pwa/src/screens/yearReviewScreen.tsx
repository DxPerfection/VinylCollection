// "2026 in vinyl": a full page looking back at one year of listening
import { useMemo, useState } from "react";

import { CloseIcon } from "../components/icons";
import { CoverArt } from "../components/coverArt";
import type { CollectionData } from "../lib/records";
import { minutesLabel, playFacts, reviewYears, yearRecap } from "../lib/stats";
import { ColumnChart, StatTile } from "./statsScreen";

const shelfPreview = 12;

export function YearReviewScreen({ data, onClose, startYear }: { data: CollectionData; onClose: () => void; startYear?: number }) {
  const facts = useMemo(() => playFacts(data.records, data.plays), [data]);
  const years = useMemo(() => reviewYears(facts), [facts]);
  const [year, setYear] = useState<number>(startYear && years.includes(startYear) ? startYear : years[0] ?? new Date().getFullYear());
  const [allShelf, setAllShelf] = useState(false);
  const recap = useMemo(() => yearRecap(data.records, facts, year), [data.records, facts, year]);
  const shelf = allShelf ? recap.notPlayed : recap.notPlayed.slice(0, shelfPreview);
  const playsText = (plays: number) => `${plays} ${plays === 1 ? "play" : "plays"}`;

  return (
    <div className="overlayScreen" role="dialog" aria-modal="true" aria-label={`${year} in vinyl`}>
      <div className="screen">
        <header className="screenHeader">
          <div className="titleRow">
            <h1>{year} in vinyl</h1>
            <button type="button" className="roundButton" aria-label="Close" onClick={onClose}><CloseIcon /></button>
          </div>
          {years.length > 1 && (
            <div className="chipRow" role="group" aria-label="Year">
              {years.map((option) => (
                <button key={option} type="button" className={option === year ? "chip chipActive" : "chip"} aria-pressed={option === year}
                  onClick={() => { setYear(option); setAllShelf(false); }}>{option}</button>
              ))}
            </div>
          )}
        </header>
        <div className="scrollArea statsArea">
          {recap.plays === 0 ? <p className="emptyNote">No plays logged in {year} yet.</p> : (
            <>
              <div className="statGrid">
                <StatTile label="Minutes listened" value={Math.round(recap.minutes).toLocaleString("en-GB")} note={minutesLabel(recap.minutes)} />
                <StatTile label="Plays" value={String(recap.plays)} note={`${recap.albums} different records`} />
                <StatTile label="Top genre" value={recap.topGenre ?? "-"}
                  note={recap.topGenre ? `${minutesLabel(recap.topGenreMinutes)} · ${playsText(recap.topGenrePlays)}` : "no genres on played records"} />
                <StatTile label="Top artist" value={recap.topArtist ?? "-"} note={recap.topArtist ? minutesLabel(recap.topArtistMinutes) : ""} />
              </div>

              <section className="statSection" aria-label="Top records">
                <h2>Top records</h2>
                <p className="muted tiny">Most plays in {year}</p>
                {recap.topRecords.length ? (
                  <ol className="yearTopList">
                    {recap.topRecords.map(({ record, plays, minutes }, index) => (
                      <li key={record.ID} className="yearTopItem">
                        <span className="yearRank">{index + 1}</span>
                        <CoverArt url={record.CoverURL} className="yearCover" />
                        <span className="dustText">
                          <span className="playAlbum">{record.AlbumName}</span>
                          <span className="muted small">{record.Artist}</span>
                        </span>
                        <span className="muted small dustWhen">{playsText(plays)}<br />{minutesLabel(minutes)}</span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="muted small">Plays need to be linked to records to rank them.</p>}
              </section>

              <section className="statSection" aria-label="Month by month">
                <h2>Month by month</h2>
                <p className="muted tiny">Busiest: {recap.busiestMonth}, {minutesLabel(recap.busiestMinutes)}</p>
                <ColumnChart bars={recap.months} unit="h" labelEvery={1} compactLabels />
              </section>
            </>
          )}

          <section className="statSection" aria-label="Never played this year">
            <h2>Never played in {year}</h2>
            <p className="muted tiny">{recap.notPlayed.length} of {data.records.length} records stayed on the shelf</p>
            {recap.notPlayed.length > 0 && (
              <ul className="dustList">
                {shelf.map((record) => (
                  <li key={record.ID}>
                    <span className="dustText">
                      <span className="playAlbum">{record.AlbumName}</span>
                      <span className="muted small">{record.Artist}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {recap.notPlayed.length > shelfPreview && (
              <button type="button" className="linkButton" onClick={() => setAllShelf(!allShelf)}>
                {allShelf ? "Show fewer" : `Show all ${recap.notPlayed.length}`}
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
