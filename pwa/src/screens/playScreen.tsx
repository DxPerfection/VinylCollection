// What should I play: one record picked for you, with filters for genre, time, decade and rating
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { CoverArt } from "../components/coverArt";
import { type RecordActions, RecordSheets } from "../components/recordSheets";
import { genresInUse, linkPlays } from "../lib/collectionView";
import { minutesText, stars, yearText } from "../lib/format";
import {
  decadesInUse, lastPlayedArtist, lengthLimits, noFilter, pickCandidates, type PickFilter, pickReason, ratingLimits, weightedPick,
} from "../lib/picker";
import type { CollectionData } from "../lib/records";

// The pick and filters survive switching tabs and reloading, for this browser tab only
interface PickMemory {
  filter: PickFilter;
  pickId: number | null;
  skipped: number[];
  skippedArtist: string | null;
}

const memoryKey = "vinylPick";
const freshMemory = (filter: PickFilter = noFilter): PickMemory => ({ filter, pickId: null, skipped: [], skippedArtist: null });

function readMemory(): PickMemory {
  try {
    const saved = JSON.parse(sessionStorage.getItem(memoryKey) ?? "null");
    return saved && saved.filter ? { ...freshMemory(), ...saved, filter: { ...noFilter, ...saved.filter } } : freshMemory();
  } catch {
    return freshMemory();
  }
}

function writeMemory(memory: PickMemory) {
  try {
    sessionStorage.setItem(memoryKey, JSON.stringify(memory));
  } catch {
    // Private browsing without storage: the pick just starts over next time
  }
}

interface PlayScreenProps {
  data: CollectionData;
  actions: RecordActions;
  random?: () => number;
}

export function PlayScreen({ data, actions, random = Math.random }: PlayScreenProps) {
  const [memory, setMemoryState] = useState<PickMemory>(readMemory);
  const [openId, setOpenId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const setMemory = (next: PickMemory) => { setMemoryState(next); writeMemory(next); };

  const records = useMemo(() => linkPlays(data.records, data.plays), [data]);
  const genres = useMemo(() => genresInUse(data.records), [data]);
  const decades = useMemo(() => decadesInUse(data.records), [data]);
  const { filter } = memory;

  // Skip the artist you played last and the one you just passed on, so two picks in a row differ
  const candidates = useMemo(() => pickCandidates(records, filter, [lastPlayedArtist(records), memory.skippedArtist]),
    [records, filter, memory.skippedArtist]);
  const fresh = useMemo(() => {
    const notOffered = candidates.filter((candidate) => !memory.skipped.includes(Number(candidate.record.ID)));
    return notOffered.length ? notOffered : candidates; // every record has been offered once; start over
  }, [candidates, memory.skipped]);
  // The pick stays put until you ask for another one, change the filters, or play it
  const pick = useMemo(() => fresh.find((candidate) => Number(candidate.record.ID) === memory.pickId) ?? weightedPick(fresh, random),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fresh, memory.pickId]);
  const pickId = pick ? Number(pick.record.ID) : null;
  useEffect(() => {
    if (pickId !== memory.pickId) setMemory({ ...memory, pickId, skipped: fresh === candidates ? [] : memory.skipped });
  });

  const changeFilter = (change: Partial<PickFilter>) => setMemory(freshMemory({ ...filter, ...change }));
  const toggle = (list: string[], value: string) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const another = () => {
    if (!pick) return;
    setMemory({ ...memory, skipped: [...memory.skipped, Number(pick.record.ID)], skippedArtist: pick.record.Artist ?? null, pickId: null });
  };

  const playIt = async () => {
    if (!pick) return;
    setSaving(true);
    await actions.logPlay(pick.record, "Full album", new Date());
    setSaving(false);
  };

  const filtersOn = filter.genres.length + filter.decades.length + (filter.maxMinutes ? 1 : 0) + (filter.minRating ? 1 : 0);
  const details = pick ? [pick.record.Genre, yearText(pick.record.Year), minutesText(pick.record.DurationMins)].filter(Boolean).join(" · ") : "";

  return (
    <div className="screen">
      <header className="screenHeader">
        <h1>What should I play?</h1>
      </header>
      <div className="scrollArea playArea">
        {records.length === 0 && <p className="emptyNote">Add some records first, then come back for a suggestion.</p>}
        {records.length > 0 && !pick && <p className="emptyNote">Nothing matches. Try fewer filters or more time.</p>}

        {pick && (
          <section className="pickCard" aria-label="Your pick">
            <button type="button" className="pickCoverButton" aria-label={`Open ${pick.record.AlbumName}`}
              onClick={() => setOpenId(Number(pick.record.ID))}>
              <CoverArt url={pick.record.CoverURL} className="pickCover" />
            </button>
            <div className="pickText">
              <h2 className="pickAlbum">{pick.record.AlbumName}</h2>
              <div className="muted">{pick.record.Artist}</div>
              {details && <div className="muted small">{details}</div>}
              {pick.record.rating > 0 && <div className="tileStars">{stars(pick.record.rating)}</div>}
              <p className="pickReason">{pickReason(pick)}</p>
            </div>
            <div className="pickButtons">
              <button type="button" className="primaryButton" disabled={saving} onClick={playIt}>
                {saving ? "Saving…" : "Play it"}
              </button>
              <button type="button" className="secondaryButton" onClick={another}>Another one</button>
            </div>
            <p className="muted tiny">
              "Play it" logs the whole album now. Tap the cover to log a side or an earlier time instead.
            </p>
          </section>
        )}

        {records.length > 0 && (
          <section className="pickFilters" aria-label="Filters">
            <div className="filterHead">
              <span className="fieldLabel">Narrow it down</span>
              {filtersOn > 0 && <button type="button" className="linkButton" onClick={() => setMemory(freshMemory())}>Clear filters</button>}
            </div>
            <FilterRow label="Time you have">
              {lengthLimits.map((option) => (
                <Chip key={option.label} on={filter.maxMinutes === option.value} onClick={() => changeFilter({ maxMinutes: option.value })}>
                  {option.label}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Genre">
              <Chip on={!filter.genres.length} onClick={() => changeFilter({ genres: [] })}>Any genre</Chip>
              {genres.map((genre) => (
                <Chip key={genre} on={filter.genres.includes(genre)} onClick={() => changeFilter({ genres: toggle(filter.genres, genre) })}>
                  {genre}
                </Chip>
              ))}
            </FilterRow>
            {decades.length > 1 && (
              <FilterRow label="Decade">
                <Chip on={!filter.decades.length} onClick={() => changeFilter({ decades: [] })}>Any decade</Chip>
                {decades.map((decade) => (
                  <Chip key={decade} on={filter.decades.includes(decade)} onClick={() => changeFilter({ decades: toggle(filter.decades, decade) })}>
                    {decade}
                  </Chip>
                ))}
              </FilterRow>
            )}
            <FilterRow label="Rating">
              {ratingLimits.map((option) => (
                <Chip key={option.label} on={filter.minRating === option.value} onClick={() => changeFilter({ minRating: option.value })}>
                  {option.label}
                </Chip>
              ))}
            </FilterRow>
            {candidates.length > 0 && (
              <p className="muted tiny">
                Picked from {candidates.length} {candidates.length === 1 ? "record" : "records"}. Ones you haven't played for a while
                come up more often, and higher ratings count extra.
              </p>
            )}
          </section>
        )}
      </div>

      <RecordSheets records={records} rows={data.records} openId={openId} onClose={() => setOpenId(null)} actions={actions} />
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filterRow">
      <span className="muted tiny">{label}</span>
      <div className="chipRow" role="group" aria-label={label}>{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={on ? "chip chipActive" : "chip"} aria-pressed={on} onClick={onClick}>{children}</button>
  );
}
