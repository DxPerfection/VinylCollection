# Dashboard: collection charts and listening stats
import altair as alt
import pandas as pd
import streamlit as st

from vinyl.config import accentColor
from vinyl.stats import dustiestRecords, formatDays, formatMinutes, listeningStreaks
from vinyl.ui import barChart, esc, statCard, statRow


def render(app):
    vinylData, playsData = app.vinylData, app.playsData

    st.header("Collection analytics")

    if not vinylData.empty:
        colChart1, colChart2 = st.columns(2)

        with colChart1:
            st.subheader("Genres")
            genreCounts = vinylData["Genre"].value_counts().head(10).rename_axis("Genre").reset_index(name="Records")
            st.altair_chart(barChart(genreCounts, "Genre", "Records", "Records"), use_container_width=True)

        with colChart2:
            st.subheader("Decades")
            decades = (pd.to_numeric(vinylData["Year"], errors="coerce") // 10 * 10).dropna().astype(int)
            decadeCounts = decades.astype(str).add("s").value_counts().rename_axis("Decade").reset_index(name="Records")
            if decadeCounts.empty:
                st.info("Add release years to see your decades.")
            else:
                st.altair_chart(barChart(decadeCounts, "Decade", "Records", "Records", horizontal=False)
                                .encode(x=alt.X("Decade:N", sort=sorted(decadeCounts["Decade"]), title=None, axis=alt.Axis(labelAngle=0))),
                                use_container_width=True)

        st.subheader("Listening")
        if not playsData.empty:
            colChart3, colChart4 = st.columns(2)

            with colChart3:
                st.caption("Hours per week, last 12 weeks")
                weeklyHours = (playsData.dropna(subset=["When"]).set_index("When")["DurationMins"]
                               .resample("W-MON").sum().tail(12) / 60).rename("Hours").reset_index()
                weeklyHours["Week"] = weeklyHours["When"].dt.strftime("%d %b")
                st.altair_chart(
                    alt.Chart(weeklyHours).mark_bar(color=accentColor, cornerRadiusEnd=4).encode(
                        alt.X("Week:N", sort=None, title=None),
                        alt.Y("Hours:Q", title="Hours"),
                        tooltip=["Week", alt.Tooltip("Hours", format=".1f")],
                    ).properties(height=280),
                    use_container_width=True)

            with colChart4:
                colAlbumsTitle, colAlbumsBy = st.columns([1, 1], vertical_alignment="center")
                colAlbumsTitle.caption("Most listened albums")
                # Times played or minutes listened; the other one stays in the tooltip
                albumsBy = colAlbumsBy.segmented_control("Rank by", ["Plays", "Minutes"], default="Plays",
                                                         key="topAlbumsBy", label_visibility="collapsed") or "Plays"
                otherMeasure = "Minutes" if albumsBy == "Plays" else "Plays"
                topListened = playsData.groupby("Album").agg(
                    Minutes=("DurationMins", "sum"), Plays=("Album", "size")).reset_index()
                topListened = topListened.sort_values(by=[albumsBy, otherMeasure], ascending=False).head(8)
                st.altair_chart(
                    barChart(topListened, "Album", albumsBy,
                             "Times played" if albumsBy == "Plays" else "Minutes listened").encode(
                        y=alt.Y("Album:N", sort=list(topListened["Album"]), title=None,
                                axis=alt.Axis(labelLimit=220)),
                        tooltip=["Album", "Plays", "Minutes"]),
                    use_container_width=True)

            currentStreak, longestStreak = listeningStreaks(playsData)
            dustyRecords = dustiestRecords(vinylData, playsData)
            neverPlayed = int(dustyRecords["LastPlayed"].isna().sum())
            activeDays = playsData["When"].dropna().dt.normalize().nunique()

            statRow([statCard("Current streak", formatDays(currentStreak), "in a row"),
                     statCard("Longest streak", formatDays(longestStreak), "in a row"),
                     statCard("Days listened", activeDays, "with at least one play"),
                     statCard("Never played", neverPlayed, f"of {len(vinylData)} records")])
            st.write("")

            colChart5, colChart6 = st.columns(2)

            with colChart5:
                st.caption("Top artists by minutes")
                topArtists = playsData.dropna(subset=["Artist"]).groupby("Artist").agg(
                    Minutes=("DurationMins", "sum"), Plays=("Artist", "size")).reset_index()
                topArtists = topArtists.sort_values(by="Minutes", ascending=False).head(8)
                if topArtists.empty:
                    st.info("Plays need to be linked to records to rank artists.")
                else:
                    st.altair_chart(
                        barChart(topArtists, "Artist", "Minutes", "Minutes listened").encode(
                            tooltip=["Artist", "Minutes", "Plays"]),
                        use_container_width=True)

            with colChart6:
                st.caption("When you listen")
                weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                weekdayCounts = (playsData["When"].dropna().dt.dayofweek.map(dict(enumerate(weekdayNames)))
                                 .value_counts().reindex(weekdayNames, fill_value=0)
                                 .rename_axis("Day").reset_index(name="Plays"))
                st.altair_chart(
                    alt.Chart(weekdayCounts).mark_bar(color=accentColor, cornerRadiusEnd=4).encode(
                        alt.X("Day:N", sort=weekdayNames, title=None, axis=alt.Axis(labelAngle=0)),
                        alt.Y("Plays:Q", axis=alt.Axis(tickMinStep=1, format="d")),
                        tooltip=["Day", "Plays"],
                    ).properties(height=280),
                    use_container_width=True)

            st.subheader("Gathering dust")
            st.caption("Records you have never played, then the ones you have not played for the longest.")
            dustyView = dustyRecords.head(10).assign(
                **{"Last played": lambda df: df["LastPlayed"].dt.strftime("%d %b %Y").fillna("Never"),
                   "Days ago": lambda df: df["DaysAgo"].map(lambda days: "-" if pd.isna(days) else str(int(days)))})
            st.dataframe(dustyView[["Artist", "AlbumName", "Last played", "Days ago"]]
                         .rename(columns={"AlbumName": "Album"}), hide_index=True, use_container_width=True)

            st.subheader("Year in review")
            reviewYears = sorted(playsData["When"].dropna().dt.year.unique(), reverse=True)
            reviewYear = st.selectbox("Year", reviewYears, label_visibility="collapsed")
            yearPlays = playsData[playsData["When"].dt.year == reviewYear]
            monthMinutes = yearPlays.groupby(yearPlays["When"].dt.month)["DurationMins"].sum()
            topYearAlbum = yearPlays.groupby("Album")["DurationMins"].sum().idxmax()
            yearArtists = yearPlays.dropna(subset=["Artist"]).groupby("Artist")["DurationMins"].sum()

            statRow([statCard("Listening time", formatMinutes(yearPlays["DurationMins"].sum()),
                              f"{len(yearPlays)} plays"),
                     statCard("Albums played", yearPlays["Album"].nunique(), "different records"),
                     statCard("Busiest month", pd.Timestamp(2000, int(monthMinutes.idxmax()), 1).strftime("%B"),
                              formatMinutes(monthMinutes.max())),
                     statCard("Top artist", yearArtists.idxmax() if not yearArtists.empty else "-",
                              formatMinutes(yearArtists.max()) if not yearArtists.empty else "")])
            st.markdown(f'<div class="vc-count">Most played album of {reviewYear}: '
                        f'<b style="color: var(--vc-accent)">{esc(topYearAlbum)}</b></div>', unsafe_allow_html=True)

            monthlyHours = (monthMinutes.reindex(range(1, 13), fill_value=0) / 60).rename("Hours").reset_index()
            monthlyHours["Month"] = monthlyHours["When"].map(lambda m: pd.Timestamp(2000, m, 1).strftime("%b"))
            st.altair_chart(
                alt.Chart(monthlyHours).mark_bar(color=accentColor, cornerRadiusEnd=4).encode(
                    alt.X("Month:N", sort=list(monthlyHours["Month"]), title=None, axis=alt.Axis(labelAngle=0)),
                    alt.Y("Hours:Q"),
                    tooltip=["Month", alt.Tooltip("Hours", format=".1f")],
                ).properties(height=220),
                use_container_width=True)
        else:
            st.info("Log some listening sessions to see your listening charts here!")

        st.subheader("Condition")
        conditionCounts = vinylData["Condition"].value_counts().rename_axis("Condition").reset_index(name="Records")
        st.altair_chart(
            alt.Chart(conditionCounts).mark_arc(innerRadius=60).encode(
                theta="Records:Q",
                color=alt.Color("Condition:N", scale=alt.Scale(
                    range=[accentColor, "#3DD6C3", "#FF6B5A", "#8B7CF6", "#6B7280"])),
                tooltip=["Condition", "Records"],
            ).properties(height=240),
            use_container_width=True)

    else:
        st.info("Not enough data to generate analytics. Start adding vinyls to your collection!")
