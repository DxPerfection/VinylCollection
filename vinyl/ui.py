# Display helpers shared by the sections: HTML snippets, stat cards, stars, charts and save feedback
import html

import altair as alt
import pandas as pd
import streamlit as st

from vinyl.clock import localNow
from vinyl.config import accentColor
from vinyl.db import logListeningSession, updateVinyl
from vinyl.genres import canonicalGenre
from vinyl.stats import formatMinutes, ratingOf
from vinyl.styles import placeholderCover


def isPhone():
    return st.session_state.get("viewLayout") == "Phone"


# --- WRITE FEEDBACK ---
def saveAndRefresh(message, icon="✅"):
    # Drop the cached reads so the page shows the change, and show the message after the rerun.
    st.cache_data.clear()
    st.session_state["flashMessage"] = (message, icon)
    st.rerun()


def logPlay(albumName, durationMinutes, vinylId, playedAt=None):
    playedAt = playedAt or localNow()
    linked, playId = logListeningSession(albumName, durationMinutes, vinylId, playedAt)
    if playId is not None:
        st.session_state["lastPlay"] = {"id": playId, "label": albumName, "when": playedAt.strftime("%H:%M")}

    if linked:
        saveAndRefresh(f"Logged {albumName}. Enjoy the music!", "🎧")
    else:
        saveAndRefresh(f"Logged {albumName}, but it is not linked to the record yet. "
                       "Run migrations/001_listening_history_vinyl_id.sql in Supabase.", "⚠️")


# --- DISPLAY HELPERS ---
def esc(value):
    return html.escape("" if value is None or (not isinstance(value, str) and pd.isna(value)) else str(value))


def coverHtml(coverUrl):
    url = str(coverUrl) if coverUrl is not None and pd.notna(coverUrl) else ""
    src = url if url.startswith("http") else placeholderCover
    return f'<div class="vc-cover"><img src="{html.escape(src, quote=True)}" loading="lazy" alt=""></div>'


def pillsHtml(row):
    pills = []
    if esc(row.get("Year")):
        pills.append(f'<span class="vc-pill">{esc(row.get("Year"))}</span>')
    if esc(row.get("Genre")):
        pills.append(f'<span class="vc-pill vc-pill-accent">{esc(row.get("Genre"))}</span>')
    if esc(row.get("SubGenre")):
        pills.append(f'<span class="vc-pill">{esc(row.get("SubGenre"))}</span>')
    duration = pd.to_numeric(row.get("DurationMins"), errors="coerce")
    if pd.notna(duration) and duration > 0:
        pills.append(f'<span class="vc-pill">{int(duration)} min</span>')
    return f'<div class="vc-pills">{"".join(pills)}</div>'


def lastPlayedHtml(lastPlayed, short=False):
    if pd.isna(lastPlayed):
        return '<div class="vc-last">Not played yet</div>'
    if short:
        return f'<div class="vc-last">▶ {lastPlayed.strftime("%d %b, %H:%M")}</div>'
    return f'<div class="vc-last">▶ Last played {lastPlayed.strftime("%d %b %Y, %H:%M")}</div>'


def metaHtml(row):
    # One compact line of year and length, used where pills would not fit
    parts = [esc(row.get("Year"))] if esc(row.get("Year")) else []
    duration = pd.to_numeric(row.get("DurationMins"), errors="coerce")
    if pd.notna(duration) and duration > 0:
        parts.append(f"{int(duration)} min")
    return f'<div class="vc-meta">{" · ".join(parts)}</div>'


def statCard(label, value, sub=""):
    # Long values such as a month or artist name get a smaller font so they stay on one line
    sizeClass = " vc-stat-value-sm" if len(str(value)) > 7 else ""
    return (f'<div class="vc-stat"><div class="vc-stat-label">{esc(label)}</div>'
            f'<div class="vc-stat-value{sizeClass}" title="{esc(value)}">{esc(value)}</div>'
            f'<div class="vc-stat-sub">{esc(sub)}</div></div>')


def statRow(cards):
    # Web: one column per card. Phone: a two-by-two grid, because columns stack on a narrow screen.
    if isPhone():
        st.markdown(f'<div class="vc-stat-grid">{"".join(cards)}</div>', unsafe_allow_html=True)
    else:
        for column, card in zip(st.columns(len(cards)), cards):
            column.markdown(card, unsafe_allow_html=True)


def saveRating(vinylId, widgetKey):
    # Runs when stars are tapped; the page reruns right after
    picked = st.session_state.get(widgetKey)
    try:
        updateVinyl(int(vinylId), {"Rating": None if picked is None else picked + 1})
    except Exception as e:
        st.session_state["flashMessage"] = (f"The rating could not be saved: {e}", "⚠️")
        return
    st.cache_data.clear()
    st.session_state["flashMessage"] = ("Rating saved" if picked is not None else "Rating cleared", "⭐")


def ratingWidget(row, place):
    # Stars that save as soon as they are tapped. The key carries the stored rating, so the widget always
    # starts from what the database holds.
    rating = ratingOf(row)
    widgetKey = f"rate_{place}_{row['ID']}_{rating}"
    st.feedback("stars", key=widgetKey, default=None if rating is None else rating - 1,
                on_change=saveRating, args=(row["ID"], widgetKey))


def barChart(chartDf, category, value, valueTitle, horizontal=True, height=280):
    categoryEncoding = alt.Y if horizontal else alt.X
    valueEncoding = alt.X if horizontal else alt.Y
    return alt.Chart(chartDf).mark_bar(color=accentColor, cornerRadiusEnd=4).encode(
        categoryEncoding(f"{category}:N", sort="-x" if horizontal else None, title=None),
        valueEncoding(f"{value}:Q", title=valueTitle, axis=alt.Axis(tickMinStep=1, format="d")),
        tooltip=[category, alt.Tooltip(value, title=valueTitle)],
    ).properties(height=height)


def showTopStats(app):
    vinylData, playsData = app.vinylData, app.playsData
    if vinylData.empty:
        return
    totalMinutes = playsData["DurationMins"].sum() if not playsData.empty else 0
    albumsPlayed = playsData["Album"].nunique() if not playsData.empty else 0
    topGenre = vinylData["Genre"].mode()[0] if vinylData["Genre"].notna().any() else "-"
    topGenreCount = int((vinylData["Genre"] == topGenre).sum())
    statRow([statCard("Records", len(vinylData), f"{vinylData['Artist'].nunique()} artists"),
             statCard("Listening time", formatMinutes(totalMinutes), f"{len(playsData)} plays"),
             statCard("Albums played", albumsPlayed, f"of {len(vinylData)} in the collection"),
             statCard("Favorite genre", topGenre, f"{topGenreCount} records")])


otherGenre = "Other…"


def genrePicker(label, current, known, key, column=None):
    # A pick-list of the genres already in use, with Other… for a new one. Returns the genre to save.
    place = column or st
    current = canonicalGenre(current, known)
    choices = known + ([current] if current and current not in known else []) + [otherGenre]
    picked = place.selectbox(label, choices, index=choices.index(current) if current else 0, key=key)
    if picked != otherGenre:
        return picked
    return canonicalGenre(place.text_input("New genre", key=f"{key}_new"), known)
