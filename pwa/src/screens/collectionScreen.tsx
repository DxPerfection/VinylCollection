// Collection: your records as a cover grid, with search, genre chips and a sort
import { useMemo, useState } from "react";

import { CoverArt } from "../components/coverArt";
import { SearchIcon, SortIcon, UserIcon } from "../components/icons";
import { RecordSheet } from "../components/recordSheet";
import {
  type CollectionFilter, filterAndSort, genresInUse, linkPlays, type RecordView, type SortOption, sortOptions,
} from "../lib/collectionView";
import { stars, yearText } from "../lib/format";
import type { PlayPart } from "../lib/plays";
import type { CollectionData } from "../lib/records";

interface CollectionScreenProps {
  data: CollectionData;
  onOpenAccount: () => void;
  onLog: (record: RecordView, part: PlayPart, playedAt: Date) => Promise<boolean>;
}

export function CollectionScreen({ data, onOpenAccount, onLog }: CollectionScreenProps) {
  const [filter, setFilter] = useState<CollectionFilter>({ search: "", genre: null, sort: "Recently added" });
  const [openId, setOpenId] = useState<number | null>(null);

  const records = useMemo(() => linkPlays(data.records, data.plays), [data]);
  const genres = useMemo(() => genresInUse(data.records), [data]);
  const shown = useMemo(() => filterAndSort(records, filter), [records, filter]);
  const openRecord = openId === null ? undefined : records.find((record) => Number(record.ID) === openId);

  const total = records.length;
  const countText = shown.length === total
    ? `${total} ${total === 1 ? "record" : "records"}`
    : `Showing ${shown.length} of ${total}`;

  return (
    <div className="screen">
      <header className="screenHeader">
        <div className="titleRow">
          <div>
            <h1>Collection</h1>
            <div className="muted small">{countText}</div>
          </div>
          <button type="button" className="roundButton" aria-label="Account" onClick={onOpenAccount}>
            <UserIcon />
          </button>
        </div>

        <label className="searchBox">
          <SearchIcon />
          <input type="search" placeholder="Search artist or album" aria-label="Search artist or album"
            value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} />
        </label>

        <div className="chipRow" role="group" aria-label="Genre">
          {[null, ...genres].map((genre) => (
            <button key={genre ?? "all"} type="button" className={filter.genre === genre ? "chip chipActive" : "chip"}
              aria-pressed={filter.genre === genre} onClick={() => setFilter({ ...filter, genre })}>
              {genre ?? "All"}
            </button>
          ))}
        </div>

        <label className="sortPicker">
          <SortIcon />
          <span className="visuallyHidden">Sort</span>
          <select value={filter.sort} onChange={(event) => setFilter({ ...filter, sort: event.target.value as SortOption })}>
            {sortOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </header>

      <div className="scrollArea">
        {total === 0 && <p className="emptyNote">Your shelf is empty. Add your first record in the current app.</p>}
        {total > 0 && shown.length === 0 && <p className="emptyNote">No records match your search.</p>}
        <div className="recordGrid">
          {shown.map((record) => (
            <RecordTile key={record.ID} record={record} onOpen={() => setOpenId(Number(record.ID))} />
          ))}
        </div>
      </div>

      {openRecord && <RecordSheet record={openRecord} onClose={() => setOpenId(null)} onLog={onLog} />}
    </div>
  );
}

function RecordTile({ record, onOpen }: { record: RecordView; onOpen: () => void }) {
  const year = yearText(record.Year);
  return (
    <button type="button" className="recordTile" onClick={onOpen}>
      <div className="tileCoverWrap">
        <CoverArt url={record.CoverURL} />
        {year && <span className="yearBadge">{year}</span>}
      </div>
      <span className="tileAlbum">{record.AlbumName}</span>
      <span className="tileArtist">{record.Artist}</span>
      {record.rating > 0 && (
        <span className="tileStars" aria-label={`${record.rating} out of 5 stars`}>{stars(record.rating)}</span>
      )}
    </button>
  );
}
