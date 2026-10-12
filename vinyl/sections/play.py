# What should I play: picks a record you have not played for a while
import random

import pandas as pd
import streamlit as st

from vinyl.stats import decadeOf, lastPlayedArtist, pickCandidates, pickReason
from vinyl.ui import coverHtml, esc, logPlay, pillsHtml


def render(app):
    vinylData, playsData = app.vinylData, app.playsData

    st.header("What should I play?")
    if vinylData.empty:
        st.info("Add some records first, then come back for a suggestion.")
    else:
        lengthLimits = {"Any length": None, "Up to 30 min": 30, "Up to 45 min": 45, "Up to 60 min": 60}
        ratingLimits = {"Any rating": None, "3 stars and up": 3, "4 stars and up": 4, "5 stars only": 5}
        colPickGenre, colPickLength = st.columns(2)
        pickGenres = colPickGenre.multiselect("Genre", vinylData["Genre"].dropna().unique(), placeholder="Any genre",
                                              key="pickGenres")
        pickLength = colPickLength.selectbox("Time you have", list(lengthLimits), key="pickLength")
        colPickDecade, colPickRating = st.columns(2)
        decadeChoices = sorted({d for d in vinylData.get("Year", pd.Series(dtype=object)).map(decadeOf) if d})
        pickDecades = colPickDecade.multiselect("Decade", decadeChoices, placeholder="Any decade", key="pickDecades")
        pickRating = colPickRating.selectbox("Rating", list(ratingLimits), key="pickRating")

        # The pick stays put across reruns until you ask for another one or change the filters
        pickFilters = (tuple(pickGenres), pickLength, tuple(pickDecades), pickRating)
        if st.session_state.get("pickFilters") != pickFilters:
            st.session_state.update(pickFilters=pickFilters, pickId=None, pickSkipped=[], pickSkippedArtist=None)
        # Skip the artist you played last and the one you just passed on, so two picks in a row differ
        avoidArtists = [lastPlayedArtist(vinylData, playsData), st.session_state.get("pickSkippedArtist")]
        candidates = pickCandidates(vinylData, playsData, pickGenres, lengthLimits[pickLength],
                                    decades=pickDecades, minRating=ratingLimits[pickRating], avoidArtists=avoidArtists)
        fresh = candidates[~candidates["ID"].isin(st.session_state["pickSkipped"])] if not candidates.empty else candidates
        if not candidates.empty and fresh.empty:
            st.session_state["pickSkipped"] = []  # every record has been offered once; start over
            fresh = candidates
        freshIds = set(fresh["ID"]) if not fresh.empty else set()
        if st.session_state.get("pickId") not in freshIds:
            st.session_state["pickId"] = (int(random.choices(list(fresh["ID"]), weights=list(fresh["Weight"]))[0])
                                          if freshIds else None)

        if st.session_state["pickId"] is None:
            st.markdown('<div class="vc-empty">Nothing matches. Try fewer filters or more time.</div>',
                        unsafe_allow_html=True)
        else:
            pick = candidates[candidates["ID"] == st.session_state["pickId"]].iloc[0]
            colPickCover, colPickInfo = st.columns([1, 2])
            colPickCover.markdown(f'<div class="vc-pick-cover">{coverHtml(pick.get("CoverURL"))}</div>',
                                  unsafe_allow_html=True)
            with colPickInfo:
                st.markdown(
                    f'<div class="vc-title-lg">{esc(pick["AlbumName"])}</div>'
                    f'<div class="vc-artist">{esc(pick["Artist"])}</div>' + pillsHtml(pick) +
                    f'<div class="vc-reason">{esc(pickReason(pick))}</div>', unsafe_allow_html=True)
                colPlayIt, colAnother = st.container(key="row_pick").columns(2)
                if colPlayIt.button("🎧 Play it", type="primary", key="pickPlay",
                                    help="Logs a play of this record now"):
                    pickMinutes = pd.to_numeric(pick.get("DurationMins"), errors="coerce")
                    logPlay(pick["AlbumName"], int(pickMinutes) if pd.notna(pickMinutes) and pickMinutes > 0 else 45,
                            pick["ID"])
                if colAnother.button("🔀 Another one", key="pickAnother"):
                    st.session_state["pickSkipped"].append(st.session_state["pickId"])
                    st.session_state["pickSkippedArtist"] = str(pick["Artist"])
                    st.session_state["pickId"] = None
                    st.rerun()
            st.caption(f"Picked from {len(candidates)} records. Ones you have not played for a while come up more "
                       "often, and higher ratings count extra.")
