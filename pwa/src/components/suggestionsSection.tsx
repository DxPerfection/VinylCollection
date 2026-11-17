// "Suggested for you" at the top of the Wants tab: records you might like, each with why, Want it and Not for me.
// Worked out once a day (or on Refresh) and kept on the phone in between.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { canonicalGenre, knownGenres } from "../lib/addRecord";
import { yearText } from "../lib/format";
import { readLink } from "../lib/lastFm";
import type { CollectionData } from "../lib/records";
import {
  asWantRow, buildSuggestions, type DismissedRow, fetchDismissed, keepForMs, liveSources, readSaved, type SavedSuggestions,
  stillToShow, type Suggestion, type SuggestionSources, writeSaved,
} from "../lib/suggestions";
import { listenUrl } from "../lib/spotify";
import { getSupabase } from "../lib/supabaseClient";
import type { Actions } from "../lib/useActions";
import { priceText } from "../lib/wants";
import { CoverArt } from "./coverArt";
import { ExternalIcon } from "./icons";

interface SuggestionsSectionProps {
  data: CollectionData;
  actions: Pick<Actions, "addWant" | "dismissSuggestion">;
  // Swapped in tests
  sources?: SuggestionSources;
  loadDismissed?: () => Promise<DismissedRow[]>;
}

const firstShown = 3;

type BuildState = { status: "idle" | "building" } | { status: "failed"; message: string };

export function SuggestionsSection({ data, actions, sources, loadDismissed }: SuggestionsSectionProps) {
  const [saved, setSaved] = useState<SavedSuggestions | null>(() => readSaved());
  const [dismissed, setDismissed] = useState<DismissedRow[] | null>(null);
  const [build, setBuild] = useState<BuildState>({ status: "idle" });
  const [showAll, setShowAll] = useState(false);
  const [busyArtist, setBusyArtist] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    let current = true;
    (loadDismissed ?? (() => fetchDismissed(getSupabase())))()
      .then((rows) => current && setDismissed(rows))
      .catch(() => current && setDismissed([])); // no table yet, or offline: nothing hidden
    return () => { current = false; };
  }, [loadDismissed]);

  const dismissedNames = useMemo(() => (dismissed ?? []).map((row) => row.Artist), [dismissed]);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) {
      setBuild({ status: "failed", message: "You're offline." });
      return;
    }
    setBuild({ status: "building" });
    try {
      const items = await buildSuggestions(data, dismissedNames, readLink()?.name ?? null, sources ?? liveSources(getSupabase()));
      writeSaved(items);
      setSaved(readSaved() ?? { builtAt: Date.now(), items });
      setBuild({ status: "idle" });
    } catch (error) {
      setBuild({ status: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  }, [data, dismissedNames, sources]);

  // Once the dismissed list is in, work the list out if there is none from the last day
  useEffect(() => {
    if (dismissed === null || started.current) return;
    started.current = true;
    if (!saved || Date.now() - saved.builtAt > keepForMs) void refresh();
  }, [dismissed, refresh, saved]);

  const items = useMemo(() => stillToShow(saved?.items ?? [], data, dismissedNames), [saved, data, dismissedNames]);
  const shown = showAll ? items : items.slice(0, firstShown);
  const known = useMemo(() => knownGenres(data.records), [data.records]);

  const want = async (item: Suggestion) => {
    setBusyArtist(item.artist);
    const row = asWantRow(item);
    await actions.addWant({ ...row, Genre: row.Genre ? canonicalGenre(row.Genre, known) : null });
    setBusyArtist(null);
  };
  const notForMe = async (item: Suggestion) => {
    setBusyArtist(item.artist);
    await actions.dismissSuggestion(item, (change) => setDismissed((rows) => change(rows ?? [])));
    setBusyArtist(null);
  };

  return (
    <section className="suggestions" aria-label="Suggested for you">
      <div className="suggestionsHeader">
        <h2 className="dayHeading">Suggested for you</h2>
        <button type="button" className="linkButton" disabled={build.status === "building"} onClick={() => { void refresh(); }}>
          {build.status === "building" ? "Looking…" : "Refresh"}
        </button>
      </div>

      {build.status === "building" && !items.length && (
        <p className="muted small">Finding records you might like from your plays, ratings and Last.fm…</p>
      )}
      {build.status === "failed" && (
        <p className="tiny errorText">Couldn't get suggestions right now: {build.message}</p>
      )}
      {build.status === "idle" && saved && !items.length && (
        <p className="muted small">Nothing new to suggest right now. Play and rate a few more records, then Refresh.</p>
      )}

      <ul className="wantList">
        {shown.map((item) => (
          <li key={item.artist} className="suggestionRow">
            <CoverArt url={item.coverUrl} className="wantCover" />
            <div className="wantText">
              <span className="playAlbum">{item.album}</span>
              <span className="muted small">{[item.artist, yearText(item.year)].filter(Boolean).join(" · ")}</span>
              {item.reason && <span className="tiny suggestionReason">{item.reason}</span>}
              {item.price !== undefined && <span className="tiny priceLine">{priceText(item.price)}</span>}
              <div className="suggestionButtons">
                <button type="button" className="smallButton smallPrimary" disabled={busyArtist === item.artist} onClick={() => { void want(item); }}>
                  Want it
                </button>
                <button type="button" className="smallButton" disabled={busyArtist === item.artist} onClick={() => { void notForMe(item); }}>
                  Not for me
                </button>
              </div>
              <a className="linkish listenLink" href={listenUrl(item.artist, item.album, item.spotifyUrl)} target="_blank" rel="noreferrer">
                Listen on Spotify <ExternalIcon />
              </a>
            </div>
          </li>
        ))}
      </ul>
      {items.length > firstShown && (
        <button type="button" className="linkButton alignStart" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show ${items.length - firstShown} more`}
        </button>
      )}
    </section>
  );
}
