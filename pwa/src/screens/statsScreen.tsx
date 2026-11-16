// Stats: your listening and your shelf, as in the Streamlit Dashboard
import { useMemo, useState } from "react";

import { formatLastPlayed } from "../lib/format";
import type { CollectionData } from "../lib/records";
import {
  averageRating, type Bar, conditionBars, decadeBars, gatheringDust, genreBars, minutesLabel, neverPlayedCount, playFacts,
  playsByWeekday, reviewYears, streaks, topAlbums, topArtists, weeklyHours, yearInReview,
} from "../lib/stats";

const dayText = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

export function StatsScreen({ data }: { data: CollectionData }) {
  const facts = useMemo(() => playFacts(data.records, data.plays), [data]);
  const years = useMemo(() => reviewYears(facts), [facts]);
  const [rankBy, setRankBy] = useState<"Plays" | "Minutes">("Plays");
  const [year, setYear] = useState<number | null>(null);
  const shownYear = year !== null && years.includes(year) ? year : years[0];

  const runs = streaks(facts);
  const never = neverPlayedCount(data.records, facts);
  const review = shownYear !== undefined ? yearInReview(facts, shownYear) : null;
  const dusty = gatheringDust(data.records, facts);
  const rating = averageRating(data.records);

  if (!data.records.length) {
    return (
      <div className="screen">
        <header className="screenHeader"><h1>Stats</h1></header>
        <div className="scrollArea"><p className="emptyNote">Add some records first, then your stats show up here.</p></div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screenHeader">
        <h1>Stats</h1>
      </header>
      <div className="scrollArea statsArea">
        {facts.length === 0 ? (
          <p className="emptyNote">Log some plays to see your listening stats.</p>
        ) : (
          <>
            <div className="statGrid">
              <StatTile label="Current streak" value={dayText(runs.current)} note="in a row" />
              <StatTile label="Longest streak" value={dayText(runs.longest)} note="in a row" />
              <StatTile label="Days listened" value={String(runs.days)} note="with at least one play" />
              <StatTile label="Never played" value={String(never)} note={`of ${data.records.length} records`} />
            </div>

            <section className="statSection" aria-label="Most listened albums">
              <div className="sectionHead">
                <h2>Most listened albums</h2>
                <div className="miniSwitch" role="group" aria-label="Rank by">
                  {(["Plays", "Minutes"] as const).map((option) => (
                    <button key={option} type="button" className={option === rankBy ? "segment segmentActive" : "segment"}
                      aria-pressed={option === rankBy} onClick={() => setRankBy(option)}>{option}</button>
                  ))}
                </div>
              </div>
              <BarList bars={topAlbums(facts, rankBy)} format={(value) => rankBy === "Plays" ? `${value}×` : minutesLabel(value)} />
            </section>

            <section className="statSection" aria-label="Hours per week">
              <h2>Hours per week</h2>
              <p className="muted tiny">The last 12 weeks</p>
              <ColumnChart bars={weeklyHours(facts)} unit="h" labelEvery={3} />
            </section>

            <section className="statSection" aria-label="Top artists">
              <h2>Top artists</h2>
              <p className="muted tiny">By minutes listened</p>
              {topArtists(facts).length
                ? <BarList bars={topArtists(facts)} format={minutesLabel} />
                : <p className="muted small">Plays need to be linked to records to rank artists.</p>}
            </section>

            <section className="statSection" aria-label="When you listen">
              <h2>When you listen</h2>
              <p className="muted tiny">Plays by day of the week</p>
              <ColumnChart bars={playsByWeekday(facts)} unit=" plays" />
            </section>

            {review && (
              <section className="statSection" aria-label="Year in review">
                <div className="sectionHead">
                  <h2>Year in review</h2>
                  {years.length > 1 && (
                    <label className="sortPicker">
                      <span className="visuallyHidden">Year</span>
                      <select value={shownYear} onChange={(event) => setYear(Number(event.target.value))}>
                        {years.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div className="statGrid">
                  <StatTile label="Listening time" value={minutesLabel(review.minutes)} note={`${review.plays} plays`} />
                  <StatTile label="Albums played" value={String(review.albums)} note="different records" />
                  <StatTile label="Busiest month" value={review.busiestMonth} note={minutesLabel(review.busiestMinutes)} />
                  <StatTile label="Top artist" value={review.topArtist ?? "-"} note={review.topArtist ? minutesLabel(review.topArtistMinutes) : ""} />
                </div>
                {review.topAlbum && <p className="small">Most played album of {shownYear}: <strong className="accentText">{review.topAlbum}</strong></p>}
                <ColumnChart bars={review.months} unit="h" labelEvery={1} compactLabels />
              </section>
            )}

            <section className="statSection" aria-label="Gathering dust">
              <h2>Gathering dust</h2>
              <p className="muted tiny">Never played first, then the ones left longest on the shelf</p>
              <ul className="dustList">
                {dusty.map(({ record, lastPlayed }) => (
                  <li key={record.ID}>
                    <span className="dustText">
                      <span className="playAlbum">{record.AlbumName}</span>
                      <span className="muted small">{record.Artist}</span>
                    </span>
                    <span className="muted small dustWhen">{lastPlayed ? formatLastPlayed(lastPlayed) : "Never"}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <section className="statSection" aria-label="Genres">
          <h2>Genres</h2>
          <p className="muted tiny">{data.records.length} records{rating ? ` · average rating ${rating} stars` : ""}</p>
          <BarList bars={genreBars(data.records)} format={(value) => String(value)} />
        </section>

        <section className="statSection" aria-label="Decades">
          <h2>Decades</h2>
          {decadeBars(data.records).length
            ? <ColumnChart bars={decadeBars(data.records)} unit=" records" labelEvery={1} compactLabels />
            : <p className="muted small">Add release years to see your decades.</p>}
        </section>

        <section className="statSection" aria-label="Condition">
          <h2>Condition</h2>
          <BarList bars={conditionBars(data.records)} format={(value) => String(value)} />
        </section>
      </div>
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="statTile">
      <span className="muted tiny">{label}</span>
      <span className="statValue">{value}</span>
      <span className="muted tiny">{note}</span>
    </div>
  );
}

// A ranked list: name, a bar for its share of the largest, and the value in text
function BarList({ bars, format }: { bars: Bar[]; format: (value: number) => string }) {
  const most = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <ol className="barList">
      {bars.map((bar) => (
        <li key={bar.label} className="barItem">
          <div className="barLabels">
            <span className="barName">{bar.label}</span>
            <span className="barValue">{format(bar.value)}{bar.extra ? <span className="muted"> · {bar.extra}</span> : null}</span>
          </div>
          <div className="barTrack" aria-hidden="true"><div className="barFill" style={{ width: `${(bar.value / most) * 100}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}

// Columns over time or days; tap a column to read its value
function ColumnChart({ bars, unit, labelEvery = 1, compactLabels = false }:
  { bars: Bar[]; unit: string; labelEvery?: number; compactLabels?: boolean }) {
  const [picked, setPicked] = useState<number | null>(null);
  const most = Math.max(...bars.map((bar) => bar.value), 0);
  const shown = picked !== null ? bars[picked] : null;
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);
  return (
    <div className="columnChart">
      <div className="columnReadout" aria-live="polite">
        {shown ? <><strong>{shown.label}</strong>: {shown.value}{unit}</> : <span className="muted">Tap a bar · total {Math.round(total * 10) / 10}{unit}</span>}
      </div>
      <div className="columns" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
        {bars.map((bar, index) => (
          <button key={bar.label + index} type="button" className={index === picked ? "column columnPicked" : "column"}
            aria-label={`${bar.label}: ${bar.value}${unit}`} aria-pressed={index === picked}
            onClick={() => setPicked(index === picked ? null : index)}>
            <span className="columnFill" style={{ height: most ? `${Math.max(bar.value > 0 ? 3 : 0, (bar.value / most) * 100)}%` : "0%" }} />
          </button>
        ))}
      </div>
      <div className="columns columnLabels" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {bars.map((bar, index) => (
          <span key={bar.label + index} className={compactLabels ? "columnLabel compact" : "columnLabel"}>
            {index % labelEvery === 0 ? bar.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
