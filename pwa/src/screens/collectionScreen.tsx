// Collection: your records as a cover grid, with search, genre chips and a sort
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { CoverArt } from "../components/coverArt";
import { PlusIcon, SearchIcon, SortIcon, UserIcon } from "../components/icons";
import { type RecordActions, RecordSheets } from "../components/recordSheets";
import {
  type CollectionFilter, filterAndSort, genresInUse, linkPlays, type RecordView, type SortOption, sortOptions,
} from "../lib/collectionView";
import { stars, yearText } from "../lib/format";
import type { CollectionData } from "../lib/records";
import { useFoldOnScroll } from "../lib/useFoldOnScroll";

interface CollectionScreenProps {
  data: CollectionData;
  onOpenAccount: () => void;
  onOpenAdd: () => void;
  actions: RecordActions;
}

export function CollectionScreen({ data, onOpenAccount, onOpenAdd, actions }: CollectionScreenProps) {
  const [filter, setFilter] = useState<CollectionFilter>({ search: "", genre: null, sort: "Recently added" });
  const [openId, setOpenId] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useFoldOnScroll(scroller);
  const screenRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const foldRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The header floats over the list. The list starts below it, and folding slides the header up by the height of the search and genres
  useLayoutEffect(() => {
    const screen = screenRef.current, header = headerRef.current, fold = foldRef.current;
    if (!screen || !header || !fold) return;
    const measure = () => {
      screen.style.setProperty("--headerHeight", `${header.offsetHeight}px`);
      screen.style.setProperty("--foldHeight", `${fold.offsetHeight}px`);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(fold);
    return () => observer.disconnect();
  }, []);

  const openHeader = (focusSearch: boolean) => {
    setFolded(false);
    if (focusSearch) searchRef.current?.focus({ preventScroll: true });
  };

  const records = useMemo(() => linkPlays(data.records, data.plays), [data]);
  const genres = useMemo(() => genresInUse(data.records), [data]);
  const shown = useMemo(() => filterAndSort(records, filter), [records, filter]);
  const unmatchedCount = records.filter((record) => !record.DiscogsID).length;
  const matchOrder = useMemo(() => shown.map((record) => Number(record.ID)), [shown]);

  const total = records.length;
  const countText = shown.length === total
    ? `${total} ${total === 1 ? "record" : "records"}`
    : `Showing ${shown.length} of ${total}`;

  return (
    <div className="screen collectionScreen" ref={screenRef}>
      <header ref={headerRef} className={folded ? "screenHeader collectionHeader folded" : "screenHeader collectionHeader"}>
        <div className="titleRow">
          <div className="titleText">
            <h1>Collection</h1>
            <span className="muted small countText">{countText}</span>
            <span className="foldedButtons" aria-hidden={!folded || undefined} inert={!folded || undefined}>
              <button type="button" className="foldedPill" onClick={() => openHeader(false)}>{filter.genre ?? (filter.unmatchedOnly ? "No Discogs info" : "All")}</button>
              <button type="button" className="foldedPill" aria-label="Search" onClick={() => openHeader(true)}><SearchIcon /></button>
            </span>
          </div>
          <div className="headerButtons">
            <button type="button" className="roundButton" aria-label="Account" onClick={onOpenAccount}>
              <UserIcon />
            </button>
            <button type="button" className="roundButton roundPrimary" aria-label="Add a record" onClick={onOpenAdd}>
              <PlusIcon />
            </button>
          </div>
        </div>

        <div className="foldAway" ref={foldRef} aria-hidden={folded || undefined} inert={folded || undefined}>
          <div className="foldInner">
            <div className="searchRow">
              <label className="searchBox">
                <SearchIcon />
                <input ref={searchRef} type="search" placeholder="Artist, album or note" aria-label="Search artist, album or note"
                  value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} />
              </label>
              <label className="sortButton">
                <SortIcon />
                <span className="visuallyHidden">Sort</span>
                <select value={filter.sort} onChange={(event) => setFilter({ ...filter, sort: event.target.value as SortOption })}>
                  {sortOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <div className="chipRow" role="group" aria-label="Genre">
              {[null, ...genres].map((genre) => (
                <button key={genre ?? "all"} type="button" className={filter.genre === genre ? "chip chipActive" : "chip"}
                  aria-pressed={filter.genre === genre} onClick={() => setFilter({ ...filter, genre })}>
                  {genre ?? "All"}
                </button>
              ))}
              {unmatchedCount > 0 && (
                <button type="button" className={filter.unmatchedOnly ? "chip chipActive" : "chip"} aria-pressed={Boolean(filter.unmatchedOnly)}
                  onClick={() => setFilter({ ...filter, unmatchedOnly: !filter.unmatchedOnly })}>
                  No Discogs info yet ({unmatchedCount})
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="scrollArea" ref={scroller}>
        {total === 0 && <p className="emptyNote">Your shelf is empty. Tap + to add your first record.</p>}
        {total > 0 && shown.length === 0 && <p className="emptyNote">No records match your search.</p>}
        <div className="recordGrid compactGrid">
          {shown.map((record) => (
            <RecordTile key={record.ID} record={record} onOpen={() => setOpenId(Number(record.ID))} />
          ))}
        </div>
      </div>

      <RecordSheets records={records} rows={data.records} openId={openId} onClose={() => setOpenId(null)} actions={actions}
        matchOrder={matchOrder} />
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
