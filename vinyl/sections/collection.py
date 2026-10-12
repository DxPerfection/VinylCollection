# Collection: the grid or list of your records, with search, genre filter and sort
import pandas as pd
import streamlit as st

from vinyl.config import gridColumns
from vinyl.stats import dustiestRecords
from vinyl.ui import (coverHtml, esc, isPhone, lastPlayedHtml, logPlay, metaHtml, pillsHtml, ratingWidget,
                      showTopStats)


def render(app):
    vinylData, playsData, ratingsOn, phone = app.vinylData, app.playsData, app.ratingsOn, isPhone()

    if phone:
        showTopStats(app)

    sortOptions = ["Recently added", "Recently listened", "Artist A-Z", "Album A-Z", "Year (newest)", "Year (oldest)",
                   "Longest first"] + (["Top rated"] if ratingsOn else [])
    genreOptions = vinylData["Genre"].dropna().unique() if not vinylData.empty else []
    if phone:
        searchQuery = st.text_input("Search", placeholder="Search album or artist", label_visibility="collapsed",
                                    key="colSearch")
        with st.expander("Filter and sort"):
            selectedGenres = st.multiselect("Genre", genreOptions, placeholder="All genres", key="colGenres")
            sortChoice = st.selectbox("Sort", sortOptions, key="colSort")
            viewMode = st.segmented_control("View", ["Grid", "List"], default="Grid", key="colView") or "Grid"
    else:
        colSearch, colGenre, colSort, colToggle = st.columns([3, 2, 2, 2])
        searchQuery = colSearch.text_input("Search", placeholder="Search album or artist", label_visibility="collapsed",
                                           key="colSearch")
        selectedGenres = colGenre.multiselect("Genre", genreOptions, placeholder="All genres",
                                              label_visibility="collapsed", key="colGenres")
        sortChoice = colSort.selectbox("Sort", sortOptions, label_visibility="collapsed", key="colSort")
        viewMode = colToggle.segmented_control("View", ["Grid", "List"], default="Grid",
                                               label_visibility="collapsed", key="colView") or "Grid"

    filteredData = vinylData.copy()
    if not filteredData.empty:
        if selectedGenres:
            filteredData = filteredData[filteredData["Genre"].isin(selectedGenres)]
        if searchQuery:
            filteredData = filteredData[
                filteredData["AlbumName"].astype(str).str.contains(searchQuery, case=False, regex=False) |
                filteredData["Artist"].astype(str).str.contains(searchQuery, case=False, regex=False)
                ]

        sortKeys = {
            "Recently added": ("ID", False),
            "Recently listened": ("LastPlayed", False),
            "Artist A-Z": ("Artist", True),
            "Album A-Z": ("AlbumName", True),
            "Year (newest)": ("YearNum", False),
            "Year (oldest)": ("YearNum", True),
            "Longest first": ("DurationNum", False),
            "Top rated": ("RatingNum", False),
        }
        sortColumn, sortAscending = sortKeys[sortChoice]
        # Records that have never been played (or rated) sort last
        lastPlayedById = dustiestRecords(vinylData, playsData).set_index("ID")["LastPlayed"]
        filteredData = filteredData.assign(
            LastPlayed=filteredData["ID"].map(lastPlayedById),
            YearNum=pd.to_numeric(filteredData["Year"], errors="coerce"),
            DurationNum=pd.to_numeric(filteredData["DurationMins"], errors="coerce"),
            RatingNum=pd.to_numeric(filteredData.get("Rating"), errors="coerce"),
        ).sort_values(by=sortColumn, ascending=sortAscending, key=lambda col: col.str.lower() if pd.api.types.is_string_dtype(col) else col)

    if vinylData.empty:
        st.markdown('<div class="vc-empty">Your shelf is empty.<br>Head to <b>Add New</b> to add your first record.</div>',
                    unsafe_allow_html=True)
    elif filteredData.empty:
        st.markdown('<div class="vc-empty">No records match your search.</div>', unsafe_allow_html=True)
    else:
        st.markdown(f'<div class="vc-count">Showing {len(filteredData)} of {len(vinylData)} records</div>',
                    unsafe_allow_html=True)
        records = [row for _, row in filteredData.iterrows()]
        displayDuration = lambda row: row.get("DurationMins") if pd.notna(row.get("DurationMins")) and row.get("DurationMins") else 45
        listenLabel = "🎧 Listened" if phone else "I listened to this"

        if viewMode == "Grid":
            perRow = 2 if phone else gridColumns
            for rowStart in range(0, len(records), perRow):
                gridCols = st.container(key=f"row_grid_{rowStart}").columns(perRow)
                for gridCol, row in zip(gridCols, records[rowStart:rowStart + perRow]):
                    with gridCol.container(key=f"card_grid_{row['ID']}"):
                        st.markdown(
                            coverHtml(row.get("CoverURL")) +
                            f'<div class="vc-title" title="{esc(row["AlbumName"])}">{esc(row["AlbumName"])}</div>'
                            f'<div class="vc-artist">{esc(row["Artist"])}</div>' +
                            (metaHtml(row) if phone else pillsHtml(row)) +
                            lastPlayedHtml(row["LastPlayed"], short=phone),
                            unsafe_allow_html=True)
                        if ratingsOn:
                            ratingWidget(row, "grid")
                        if st.button(listenLabel, key=f"btnGrid_{row['ID']}"):
                            logPlay(row["AlbumName"], displayDuration(row), row["ID"])
        else:
            for row in records:
                with st.container(key=f"card_list_{row['ID']}"):
                    colImg, colDetails = st.container(key=f"row_list_{row['ID']}").columns([1, 2.4] if phone else [1, 4])
                    with colImg:
                        st.markdown(coverHtml(row.get("CoverURL")), unsafe_allow_html=True)
                    with colDetails:
                        st.markdown(
                            f'<div class="vc-title-lg">{esc(row["AlbumName"])}</div>'
                            f'<div class="vc-artist">{esc(row["Artist"])}</div>' +
                            (metaHtml(row) if phone else pillsHtml(row)) +
                            lastPlayedHtml(row["LastPlayed"], short=phone),
                            unsafe_allow_html=True)
                        if ratingsOn:
                            ratingWidget(row, "list")

                        tracklistData = row.get("Tracklist", "")
                        if tracklistData and pd.notna(tracklistData):
                            with st.expander("Tracklist"):
                                for trackNum, trackName in enumerate(str(tracklistData).split(" | "), 1):
                                    st.markdown(f"<div class='tracklist-text'>{trackNum}. {esc(trackName)}</div>",
                                                unsafe_allow_html=True)

                        if st.button(listenLabel, key=f"btnList_{row['ID']}"):
                            logPlay(row["AlbumName"], displayDuration(row), row["ID"])
