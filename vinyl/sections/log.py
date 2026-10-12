# Log a listen, and the list of recent plays
from datetime import datetime

import pandas as pd
import streamlit as st

from vinyl.clock import localNow
from vinyl.db import deletePlay
from vinyl.ui import esc, isPhone, logPlay, saveAndRefresh


def render(app):
    vinylData, playsData, phone = app.vinylData, app.playsData, isPhone()

    st.header("Log a listen")

    if not vinylData.empty:
        colArtist, colAlbum = st.columns(2)
        selectedFilterArtist = colArtist.selectbox("Artist", vinylData["Artist"].unique(), key="logArtist")
        artistAlbumsData = vinylData[vinylData["Artist"] == selectedFilterArtist]
        selectedFilterAlbum = colAlbum.selectbox("Album", artistAlbumsData["AlbumName"].unique(), key="logAlbum")

        albumRowInfo = artistAlbumsData[artistAlbumsData["AlbumName"] == selectedFilterAlbum].iloc[0]
        albumDurationInfo = pd.to_numeric(albumRowInfo.get("DurationMins", 0), errors="coerce")
        albumDurationInfo = 0 if pd.isna(albumDurationInfo) else int(albumDurationInfo)

        colPart, colMinutes = st.columns(2)
        playedPart = colPart.radio("What did you play?", ["Full album", "Side A", "Side B"], horizontal=True,
                                   key="logPart")
        # A side is taken as half the album; the minutes can be adjusted
        suggestedMinutes = albumDurationInfo if playedPart == "Full album" else round(albumDurationInfo / 2)
        playedMinutes = colMinutes.number_input("Minutes", min_value=0, value=suggestedMinutes,
                                                key=f"logMinutes_{albumRowInfo['ID']}_{playedPart}")

        playedNow = st.toggle("Played just now", value=True, key="logNow")
        playedAt = localNow()
        if not playedNow:
            colDate, colTime = st.columns(2)
            playedDate = colDate.date_input("Date", value=playedAt.date(), max_value=playedAt.date(), key="logDate")
            playedTime = colTime.time_input("Time", value=playedAt.time().replace(second=0, microsecond=0),
                                            key="logTime")
            playedAt = datetime.combine(playedDate, playedTime)

        if st.button("Log listen", type="primary"):
            if playedAt > localNow():
                st.warning("That time is in the future. Pick a time that has already passed.")
            else:
                logPlay(selectedFilterAlbum, int(playedMinutes), albumRowInfo["ID"], playedAt)
    else:
        st.warning("Your collection is currently empty. Please add a vinyl first.")

    st.subheader("Recent listening")
    if not playsData.empty:
        recentPlays = playsData.sort_values(by="When", ascending=False, na_position="last").head(15)
        st.markdown(f'<div class="vc-count">Showing the latest {len(recentPlays)} of {len(playsData)} plays</div>',
                    unsafe_allow_html=True)
        for _, play in recentPlays.iterrows():
            if pd.notna(play["When"]):
                whenText = f'{play["When"].strftime("%a %d %b %Y")} <span class="vc-hist-muted">at ' \
                           f'{play["When"].strftime("%H:%M")}</span>'
            else:
                whenText = esc(play["Date"])
            if phone:
                colPlay, colDelete = st.container(key=f"row_play_{play['id']}").columns([4, 1.3],
                                                                                       vertical_alignment="center")
                colPlay.markdown(f'<div class="vc-hist">{esc(play["Album"])}<br><span class="vc-hist-muted">'
                                 f'{whenText} · {int(play["DurationMins"])} min</span></div>', unsafe_allow_html=True)
            else:
                colWhen, colAlbumName, colLength, colDelete = st.columns([3, 5, 1.3, 1.3], vertical_alignment="center")
                colWhen.markdown(f'<div class="vc-hist">{whenText}</div>', unsafe_allow_html=True)
                colAlbumName.markdown(f'<div class="vc-hist">{esc(play["Album"])}</div>', unsafe_allow_html=True)
                colLength.markdown(f'<div class="vc-hist vc-hist-muted">{int(play["DurationMins"])} min</div>',
                                   unsafe_allow_html=True)
            if "id" in play and pd.notna(play["id"]) and colDelete.button("Delete", key=f"delPlay_{play['id']}"):
                deletePlay(play["id"])
                saveAndRefresh(f"Removed the play of {play['Album']}", "🗑️")
    else:
        st.info("No listening sessions yet. Log one above, or use \"I listened to this\" on the Collection tab.")
