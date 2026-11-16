// Adding a record: search Discogs as you type, then Add (check the details first) or Want
import { useMemo, useState } from "react";

import { AddSheet } from "../components/addSheet";
import { DiscogsResults } from "../components/discogsResults";
import { CloseIcon, SearchIcon } from "../components/icons";
import { isDuplicate, knownGenres, newWantRow } from "../lib/addRecord";
import type { DiscogsHit } from "../lib/lookup";
import type { CollectionData } from "../lib/records";
import type { Actions } from "../lib/useActions";
import { useDiscogsSearch } from "../lib/useDiscogsSearch";

interface AddScreenProps {
  data: CollectionData;
  actions: Pick<Actions, "addRecord" | "addWant">;
  onClose: () => void;
}

export function AddScreen({ data, actions, onClose }: AddScreenProps) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<DiscogsHit | null>(null);
  const [byHand, setByHand] = useState(false);
  const [note, setNote] = useState("");
  const search = useDiscogsSearch(query);
  const known = useMemo(() => knownGenres(data.records), [data.records]);

  const want = async (hit: DiscogsHit) => {
    if (isDuplicate(hit.artist, hit.album, data.records)) return setNote(`${hit.album} is already in your collection.`);
    if (isDuplicate(hit.artist, hit.album, data.wants)) return setNote(`${hit.album} is already on your want list.`);
    setNote("");
    await actions.addWant(newWantRow(hit, known));
  };

  return (
    <div className="overlayScreen" role="dialog" aria-modal="true" aria-label="Add a record">
      <div className="screen">
        <header className="screenHeader">
          <div className="titleRow">
            <h1>Add a record</h1>
            <button type="button" className="roundButton" aria-label="Close" onClick={onClose}><CloseIcon /></button>
          </div>
          <label className="searchBox searchBoxStrong">
            <SearchIcon />
            <input type="search" autoFocus placeholder="Artist or album" aria-label="Search Discogs" value={query}
              onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button type="button" className="textLink" onClick={() => { setNote(""); setByHand(true); }}>
            Not on Discogs? Add it by hand
          </button>
          {note && <p className="errorNote small" role="alert">{note}</p>}
        </header>
        <div className="scrollArea">
          <DiscogsResults search={search}
            idleHint="Results come from Discogs as you type. Add fills in the tracklist, and the cover and length come from Spotify."
            buttons={(hit) => (
              <>
                <button type="button" className="smallButton smallPrimary" onClick={() => { setNote(""); setAdding(hit); }}>Add</button>
                <button type="button" className="smallButton" onClick={() => want(hit)}>Want</button>
              </>
            )} />
        </div>
      </div>
      {byHand && (
        <AddSheet hit={null} records={data.records} onAdd={actions.addRecord} onClose={() => setByHand(false)} />
      )}
      {adding && (
        <AddSheet hit={adding} records={data.records} onAdd={actions.addRecord} onClose={() => setAdding(null)} />
      )}
    </div>
  );
}
