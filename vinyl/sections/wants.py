# Want list: records you would like to buy
import time

import pandas as pd
import streamlit as st

from vinyl.apis import fetchReleaseDetails, fetchSpotifyData
from vinyl.clock import displayTimezone
from vinyl.db import addNewVinyl, addWant, deleteWant, migrationHint
from vinyl.stats import isDuplicate, toNumber
from vinyl.ui import coverHtml, esc, isPhone, metaHtml, saveAndRefresh


def moveWantToCollection(item):
    # Adds a wanted record to the collection with what Discogs and Spotify know, then takes it off the list
    artist, album = str(item["Artist"]), str(item["AlbumName"])
    textOf = lambda value: "" if value is None or pd.isna(value) else str(value)
    discogsId = toNumber(item.get("DiscogsID"))
    minutes, tracklist, subGenre = fetchReleaseDetails(discogsId) if isinstance(discogsId, int) else (0, "", "")
    spotifyCover, spotifyMinutes = fetchSpotifyData(artist, album)
    record = {"ID": int(time.time()), "Artist": artist, "AlbumName": album, "Genre": textOf(item.get("Genre")),
              "SubGenre": subGenre, "Year": textOf(item.get("Year")),
              "CoverURL": spotifyCover or textOf(item.get("CoverURL")), "Condition": "New",
              "DurationMins": spotifyMinutes or minutes, "Tracklist": tracklist}
    addNewVinyl(record)
    deleteWant(item["id"])
    return record


def render(app):
    vinylData, wantData, phone = app.vinylData, app.wantData, isPhone()

    st.header("Want list")
    if wantData is None:
        st.info(migrationHint)
    else:
        with st.expander("Add a record you want", expanded=wantData.empty):
            st.caption("Tip: search Discogs in Add New and choose Add to want list to keep the cover and details.")
            colWantArtist, colWantAlbum = st.columns(2)
            wantArtist = colWantArtist.text_input("Artist", key="wantArtist")
            wantAlbum = colWantAlbum.text_input("Album", key="wantAlbum")
            colWantYear, colWantGenre = st.columns(2)
            wantYear = colWantYear.text_input("Year (optional)", key="wantYear")
            wantGenre = colWantGenre.text_input("Genre (optional)", key="wantGenre")
            wantCover = st.text_input("Cover image URL (optional)", key="wantCover")
            if st.button("Add to want list", type="primary", key="btnAddWant"):
                if not (wantArtist.strip() and wantAlbum.strip()):
                    st.warning("Enter at least the artist and the album.")
                elif isDuplicate(wantArtist, wantAlbum, vinylData):
                    st.warning(f"{wantAlbum} by {wantArtist} is already in your collection.")
                elif isDuplicate(wantArtist, wantAlbum, wantData):
                    st.warning(f"{wantAlbum} by {wantArtist} is already on your want list.")
                else:
                    addWant({"Artist": wantArtist.strip(), "AlbumName": wantAlbum.strip(), "Year": wantYear.strip(),
                             "Genre": wantGenre.strip(), "CoverURL": wantCover.strip()})
                    for fieldKey in ("wantArtist", "wantAlbum", "wantYear", "wantGenre", "wantCover"):
                        st.session_state.pop(fieldKey, None)
                    saveAndRefresh(f"Added {wantAlbum.strip()} to your want list", "🛒")

        if wantData.empty:
            st.markdown('<div class="vc-empty">Nothing on your want list yet.</div>', unsafe_allow_html=True)
        else:
            st.markdown(f'<div class="vc-count">{len(wantData)} records you want</div>', unsafe_allow_html=True)
            addedAt = (pd.to_datetime(wantData["AddedAt"], errors="coerce", format="mixed", utc=True)
                       .dt.tz_convert(displayTimezone()))
            for _, item in wantData.assign(Added=addedAt).sort_values("id", ascending=False).iterrows():
                with st.container(key=f"card_want_{item['id']}"):
                    colWantCover, colWantInfo = st.container(key=f"row_want_{item['id']}").columns(
                        [1, 2.4] if phone else [1, 6])
                    colWantCover.markdown(coverHtml(item.get("CoverURL")), unsafe_allow_html=True)
                    addedText = f"Added {item['Added'].strftime('%d %b %Y')}" if pd.notna(item["Added"]) else ""
                    with colWantInfo:
                        st.markdown(
                            f'<div class="vc-title-lg">{esc(item["AlbumName"])}</div>'
                            f'<div class="vc-artist">{esc(item["Artist"])}</div>' + metaHtml(item) +
                            f'<div class="vc-last">{esc(addedText)}</div>', unsafe_allow_html=True)
                        colGotIt, colRemove = st.container(key=f"row_wantbtn_{item['id']}").columns(2)
                        if colGotIt.button("✅ Got it", key=f"gotWant_{item['id']}",
                                           help="Moves it into your collection"):
                            if isDuplicate(item["Artist"], item["AlbumName"], vinylData):
                                deleteWant(item["id"])
                                saveAndRefresh(f"{item['AlbumName']} was already in your collection, so it was "
                                               "taken off the list", "✅")
                            with st.spinner("Looking up the tracklist and cover..."):
                                newRecord = moveWantToCollection(item)
                            st.session_state["section"] = "manage"
                            st.session_state["manageSelect"] = \
                                f"{newRecord['Artist']} - {newRecord['AlbumName']} (ID: {newRecord['ID']})"
                            saveAndRefresh(f"Moved {newRecord['AlbumName']} into your collection. "
                                           "Check its details here.", "🎉")
                        if colRemove.button("Remove", key=f"delWant_{item['id']}"):
                            deleteWant(item["id"])
                            saveAndRefresh(f"Took {item['AlbumName']} off your want list", "🗑️")
