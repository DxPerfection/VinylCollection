import streamlit as st
import pandas as pd
import requests
import time
import io
import math
import random
from collections import Counter
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, available_timezones
import json
import base64
import secrets
from supabase import create_client, Client, ClientOptions
import re
import html
import urllib.parse
import altair as alt

# --- NEW IMPORTS FOR BARCODE SCANNER ---
try:
    from PIL import Image
    from pyzbar.pyzbar import decode
except ImportError:
    pass

# --- GLOBAL UI SETTINGS ---
gridColumns = 4
fallbackTimezone = "Europe/Istanbul"  # used when the browser does not report its timezone
accentColor = "#F5B83D"
mutedColor = "#9A9AA8"

# --- PAGE CONFIGURATION ---
st.set_page_config(page_title="Vinyl Collection", page_icon="💿", layout="wide")

st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap');

    :root {
        --vc-bg: #0B0B0F; --vc-surface: #14141A; --vc-surface-2: #1B1B23; --vc-border: #2A2A35;
        --vc-text: #ECECF1; --vc-muted: #9A9AA8; --vc-accent: #F5B83D; --vc-teal: #3DD6C3;
    }
    html, body, .stApp, [data-testid="stAppViewContainer"] {font-family: 'Inter', sans-serif;}
    .stApp {background: radial-gradient(1200px 500px at 10% -10%, #1f1a10 0%, var(--vc-bg) 60%);}
    .block-container {padding-top: 2rem; max-width: 1280px;}
    header[data-testid="stHeader"] {background: transparent;}

    /* Hero */
    .vc-hero {display: flex; align-items: center; gap: 22px; margin-bottom: 1.4rem;}
    .vc-hero h1 {font-family: 'Playfair Display', serif; font-size: 2.6rem; margin: 0; padding: 0; color: var(--vc-text);}
    .vc-hero p {margin: 4px 0 0 0; color: var(--vc-muted);}
    .vc-disc {
        width: 74px; height: 74px; flex: none; border-radius: 50%;
        background:
            radial-gradient(circle, var(--vc-bg) 0 5%, var(--vc-accent) 6% 27%, #111 28% 30%, transparent 31%),
            repeating-radial-gradient(circle, #1c1c22 0 2px, #101015 2px 4px);
        box-shadow: 0 6px 24px rgba(245, 184, 61, 0.25), inset 0 0 0 2px #2b2b33;
        animation: vc-spin 14s linear infinite;
    }
    @keyframes vc-spin {to {transform: rotate(360deg);}}
    @media (prefers-reduced-motion: reduce) {.vc-disc {animation: none;}}

    /* Stat cards */
    .vc-stat {background: var(--vc-surface); border: 1px solid var(--vc-border); border-radius: 16px; padding: 16px 20px; min-height: 118px;}
    .vc-stat-label {color: var(--vc-muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em;}
    .vc-stat-value {color: var(--vc-text); font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 700; line-height: 1.25;
        font-variant-numeric: lining-nums;}
    .vc-stat-value-sm {font-size: 1.45rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
    .vc-stat-sub {color: var(--vc-accent); font-size: 0.82rem; min-height: 1.1em;}

    /* Tabs */
    .stTabs [data-baseweb="tab-list"] {gap: 6px; border-bottom: 1px solid var(--vc-border);}
    .stTabs [data-baseweb="tab"] {border-radius: 10px 10px 0 0; padding: 10px 16px; color: var(--vc-muted);}
    .stTabs [aria-selected="true"] {color: var(--vc-accent);}

    /* Cards */
    [class*="st-key-card_"] {
        background: var(--vc-surface); border: 1px solid var(--vc-border); border-radius: 16px; padding: 12px;
        transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    [class*="st-key-card_"]:hover {
        transform: translateY(-3px); border-color: var(--vc-accent); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
    }
    .vc-cover {aspect-ratio: 1 / 1; width: 100%; border-radius: 10px; overflow: hidden; background: var(--vc-surface-2);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);}
    .vc-cover img {width: 100%; height: 100%; object-fit: cover; display: block;}
    .vc-title {font-weight: 600; font-size: 1.02rem; margin: 12px 0 2px 0; color: var(--vc-text);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
    .vc-title-lg {font-family: 'Playfair Display', serif; font-size: 1.6rem; font-weight: 700; margin: 0; color: var(--vc-text);}
    .vc-artist {color: var(--vc-muted); font-size: 0.9rem; margin-bottom: 8px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
    .vc-pills {display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;}
    .vc-pill {background: var(--vc-surface-2); border: 1px solid var(--vc-border); color: var(--vc-muted);
        border-radius: 999px; padding: 2px 10px; font-size: 0.74rem;}
    .vc-pill-accent {color: var(--vc-accent); border-color: rgba(245, 184, 61, 0.4);}
    .vc-last {color: var(--vc-muted); font-size: 0.78rem; margin: -2px 0 10px 0;}
    .vc-banner {background: var(--vc-surface); border: 1px solid rgba(245, 184, 61, 0.4); border-radius: 12px;
        padding: 9px 14px; color: var(--vc-text);}
    .vc-hist {color: var(--vc-text); font-size: 0.92rem; padding: 6px 0;}
    .vc-hist-muted {color: var(--vc-muted);}
    .vc-count {color: var(--vc-muted); font-size: 0.85rem; margin: 4px 0 14px 0;}
    .vc-empty {text-align: center; padding: 56px 20px; border: 1px dashed var(--vc-border); border-radius: 16px;
        color: var(--vc-muted);}
    .tracklist-text {font-size: 14px; color: var(--vc-muted); margin-bottom: 2px;}
    .vc-meta {color: var(--vc-muted); font-size: 0.8rem; margin-bottom: 4px;}
    .vc-reason {color: var(--vc-accent); font-size: 0.98rem; margin: 8px 0 16px 0;}
    .vc-pick-cover {max-width: 320px;}

    /* Navigation and compact stat grid */
    .st-key-nav {margin: 2px 0 14px 0;}
    .vc-stat-grid {display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px;}
    .vc-stat-grid .vc-stat {min-height: 0; padding: 10px 14px; border-radius: 12px;}
    .vc-stat-grid .vc-stat-label {font-size: 0.68rem;}
    .vc-stat-grid .vc-stat-value {font-size: 1.35rem;}
    .vc-stat-grid .vc-stat-value-sm {font-size: 1.05rem;}
    .vc-stat-grid .vc-stat-sub {font-size: 0.72rem;}

    /* Controls */
    div[data-testid="stElementContainer"]:has(> div[data-testid="stButton"]),
    div[data-testid="stButton"], div[data-testid="stButton"] > button {width: 100% !important;}
    div[data-testid="stButton"] > button, div[data-testid="stDownloadButton"] > button {border-radius: 999px; font-weight: 500;}
    h2, h3 {font-family: 'Playfair Display', serif;}
    @media (max-width: 640px) {.vc-hero h1 {font-size: 1.9rem;} .vc-disc {width: 56px; height: 56px;}}
</style>
""", unsafe_allow_html=True)

# Extra rules for the phone layout, added only when it is on
phoneCss = """
<style>
    .block-container {padding: 1rem 0.8rem 3rem 0.8rem;}
    .vc-hero {gap: 12px; margin-bottom: 0.9rem;}
    .vc-hero h1 {font-size: 1.6rem;}
    .vc-hero p {display: none;}
    .vc-disc {width: 42px; height: 42px;}
    /* Columns inside these containers stay side by side instead of stacking */
    [class*="st-key-row_"] [data-testid="stHorizontalBlock"] {flex-wrap: nowrap; gap: 0.6rem;}
    [class*="st-key-row_"] [data-testid="stColumn"] {min-width: 0 !important; width: auto !important;}
    [class*="st-key-card_"] {padding: 8px; border-radius: 12px;}
    [class*="st-key-card_"]:hover {transform: none;}
    .vc-title {font-size: 0.9rem; margin-top: 8px;}
    .vc-artist {font-size: 0.8rem; margin-bottom: 2px;}
    .vc-title-lg {font-size: 1.15rem;}
    .vc-last {font-size: 0.74rem; margin-bottom: 6px;}
    .vc-hist {font-size: 0.86rem; padding: 2px 0;}
    .vc-pick-cover {max-width: 100%;}
    div[data-testid="stButton"] > button {min-height: 2.2rem; padding: 0.2rem 0.6rem;}
</style>
"""

# Inline vinyl record shown when a release has no cover image
placeholderCover = "data:image/svg+xml;utf8," + urllib.parse.quote(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#1B1B23'/>"
    "<circle cx='50' cy='50' r='44' fill='#101015' stroke='#2A2A35' stroke-width='1'/>"
    "<circle cx='50' cy='50' r='34' fill='none' stroke='#1c1c22' stroke-width='5'/>"
    "<circle cx='50' cy='50' r='15' fill='#F5B83D'/><circle cx='50' cy='50' r='2.5' fill='#0B0B0F'/></svg>")


# --- CONFIGURATION & TOKENS ---
def getSecretsData(keyName):
    try:
        if keyName in st.secrets:
            return st.secrets[keyName]
    except Exception:
        pass

    try:
        with open("secrets.json", "r") as file:
            secretsData = json.load(file)
            if keyName in secretsData:
                return secretsData[keyName]
    except Exception:
        pass
    return None


# --- SPOTIFY API ---
def fetchSpotifyData(artistName, albumName):
    clientId = getSecretsData("spotify_client_id")
    clientSecret = getSecretsData("spotify_client_secret")

    if not clientId or not clientSecret:
        return "", 0

    try:
        authString = f"{clientId}:{clientSecret}"
        authBase64 = base64.b64encode(authString.encode("utf-8")).decode("utf-8")
        tokenUrl = "https://accounts.spotify.com/api/token"
        tokenHeaders = {"Authorization": f"Basic {authBase64}", "Content-Type": "application/x-www-form-urlencoded"}
        tokenData = {"grant_type": "client_credentials"}

        tokenResponse = requests.post(tokenUrl, headers=tokenHeaders, data=tokenData)
        tokenResponse.raise_for_status()
        accessToken = tokenResponse.json().get("access_token")

        searchQuery = f"artist:{artistName} album:{albumName}"
        searchUrl = "https://api.spotify.com/v1/search"
        searchHeaders = {"Authorization": f"Bearer {accessToken}"}
        searchParams = {"q": searchQuery, "type": "album", "limit": 1}

        searchResponse = requests.get(searchUrl, headers=searchHeaders, params=searchParams)
        searchResponse.raise_for_status()

        albumsData = searchResponse.json().get("albums", {}).get("items", [])
        if not albumsData:
            return "", 0

        targetAlbum = albumsData[0]

        imagesList = targetAlbum.get("images", [])
        spotifyCoverUrl = imagesList[0].get("url", "") if imagesList else ""

        albumId = targetAlbum.get("id")
        albumDetailsUrl = f"https://api.spotify.com/v1/albums/{albumId}"
        albumDetailsResponse = requests.get(albumDetailsUrl, headers=searchHeaders)
        albumDetailsResponse.raise_for_status()

        tracksList = albumDetailsResponse.json().get("tracks", {}).get("items", [])
        totalMilliseconds = sum(track.get("duration_ms", 0) for track in tracksList)
        spotifyDurationMins = totalMilliseconds // 60000

        return spotifyCoverUrl, spotifyDurationMins
    except Exception:
        return "", 0


# --- DISCOGS API ---
def searchDiscogsApi(searchQuery=None, barcodeQuery=None):
    apiToken = getSecretsData("discogs_token")
    if not apiToken:
        return []

    headersInfo = {"User-Agent": "VinylCollectionApp/3.0"}

    try:
        if barcodeQuery:
            apiUrl = f"https://api.discogs.com/database/search?barcode={barcodeQuery}&type=release&token={apiToken}"
        elif searchQuery:
            apiUrl = f"https://api.discogs.com/database/search?q={searchQuery}&type=release&token={apiToken}"
        else:
            return []

        apiResponse = requests.get(apiUrl, headers=headersInfo)
        apiResponse.raise_for_status()
        responseData = apiResponse.json()
        return responseData.get("results", [])[:10]
    except Exception as e:
        st.error(f"API Connection Error: {e}")
        return []


def fetchReleaseDetails(releaseId):
    apiToken = getSecretsData("discogs_token")
    if not apiToken:
        return 0, "", ""

    apiUrl = f"https://api.discogs.com/releases/{releaseId}?token={apiToken}"
    headersInfo = {"User-Agent": "VinylCollectionApp/3.0"}

    try:
        apiResponse = requests.get(apiUrl, headers=headersInfo)
        apiResponse.raise_for_status()
        responseData = apiResponse.json()

        totalSeconds = 0
        trackNames = []
        for track in responseData.get("tracklist", []):
            trackTitle = track.get("title", "")
            if trackTitle:
                trackNames.append(trackTitle)

            durationStr = track.get("duration", "")
            if durationStr and ":" in durationStr:
                try:
                    minutes, seconds = durationStr.split(":", 1)
                    totalSeconds += int(minutes) * 60 + int(seconds)
                except ValueError:
                    pass

        tracklistString = " | ".join(trackNames)

        styleList = responseData.get("styles", [])
        subGenreString = ", ".join(styleList) if styleList else ""

        return (totalSeconds // 60), tracklistString, subGenreString
    except Exception:
        return 0, "", ""


# --- SUPABASE DATABASE ---
def newSupabaseClient() -> Client:
    url = getSecretsData("supabase_url")
    key = getSecretsData("supabase_key")

    if url and key:
        # Each visit gets its own client, so the sign-in it carries is never shared with another visitor
        return create_client(url, key, ClientOptions(flow_type="pkce", auto_refresh_token=False))
    else:
        st.error("Supabase credentials are missing.")
        st.stop()


def initSupabase() -> Client:
    # The signed-in client for this visit; every read and write goes through it so Row Level Security knows it is you
    return st.session_state["supabase"]


orderColumns = {"Inventory": "ID", "ListeningHistory": "id", "Wantlist": "id"}
# Columns for a table with no rows yet. Rating is added only when the database has it (migration 002).
emptyColumns = {
    "Inventory": ["ID", "Artist", "AlbumName", "Genre", "SubGenre", "Year", "CoverURL", "Condition", "DurationMins",
                  "Tracklist"],
    "ListeningHistory": ["id", "Date", "AlbumName", "DurationMins", "VinylID"],
    "Wantlist": ["id", "Artist", "AlbumName", "Year", "Genre", "CoverURL", "DiscogsID", "AddedAt"],
}
migrationHint = "Run migrations/002_ratings_and_wantlist.sql in the Supabase SQL editor to turn this on."


def fetchAllRows(supabase, tableName):
    # Supabase hands back at most 1000 rows per request, so read page after page until one comes back empty.
    # The order keeps the pages from overlapping.
    rows = []
    while True:
        page = supabase.table(tableName).select("*").order(orderColumns[tableName]) \
            .range(len(rows), len(rows) + 999).execute().data
        if not page:
            return rows
        rows.extend(page)


def columnExists(supabase, tableName, columnName):
    try:
        supabase.table(tableName).select(columnName).range(0, 0).execute()
        return True
    except Exception:
        return False


@st.cache_data(ttl=600)
def fetchData(tableName, optional=False):
    # An optional table returns None when it cannot be read, such as before its migration has been run
    try:
        supabase = initSupabase()
        df = pd.DataFrame(fetchAllRows(supabase, tableName))
        if df.empty:
            columns = emptyColumns[tableName]
            if tableName == "Inventory" and columnExists(supabase, "Inventory", "Rating"):
                columns = columns + ["Rating"]
            return pd.DataFrame(columns=columns)
        return df
    except Exception as e:
        if optional:
            return None
        st.error(f"Data could not be fetched from database: {e}")
        return pd.DataFrame()


def addNewVinyl(vinylDataDict):
    supabase = initSupabase()
    supabase.table("Inventory").insert(vinylDataDict).execute()


def updateVinyl(vinylId, updateDataDict):
    supabase = initSupabase()
    supabase.table("Inventory").update(updateDataDict).eq("ID", vinylId).execute()


def deleteVinyl(vinylId):
    supabase = initSupabase()
    supabase.table("Inventory").delete().eq("ID", vinylId).execute()


def addWant(wantDict):
    supabase = initSupabase()
    supabase.table("Wantlist").insert(wantDict).execute()


def deleteWant(wantId):
    supabase = initSupabase()
    supabase.table("Wantlist").delete().eq("id", int(wantId)).execute()


def defaultTimezone():
    # A timezone in the page address wins, then the browser's, then the fallback
    browserTimezone = getattr(st.context, "timezone", None)
    for candidate in (st.query_params.get("tz"), browserTimezone):
        if candidate in available_timezones():
            return candidate
    return fallbackTimezone


def defaultLayout():
    # The page address wins (?layout=phone), then the device: browsers that report a phone get the phone layout
    choice = str(st.query_params.get("layout", "")).capitalize()
    if choice in ("Phone", "Web"):
        return choice
    userAgent = getattr(st.context, "headers", {}).get("User-Agent", "") or ""
    return "Phone" if re.search(r"Mobile|Android|iPhone", userAgent) else "Web"


def displayTimezone():
    return st.session_state.get("displayTz") or defaultTimezone()


def localNow():
    # The current time on the wall clock of the chosen timezone
    return datetime.now(ZoneInfo(displayTimezone())).replace(tzinfo=None)


def toStoredTime(localTime):
    # Plays are stored in UTC with an explicit offset, so they read the same wherever the app runs
    utcTime = localTime.replace(tzinfo=ZoneInfo(displayTimezone())).astimezone(timezone.utc)
    return utcTime.strftime("%Y-%m-%dT%H:%M:00+00:00")


def logListeningSession(albumName, durationMinutes, vinylId=None, playedAt=None):
    # Returns (linked to a record, id of the new history row). playedAt is local time in the chosen timezone.
    supabase = initSupabase()
    playedAt = playedAt or localNow()
    dataDict = {"Date": toStoredTime(playedAt), "AlbumName": albumName, "DurationMins": durationMinutes}
    if vinylId is not None:
        dataDict["VinylID"] = int(vinylId)

    linked = True
    try:
        response = supabase.table("ListeningHistory").insert(dataDict).execute()
    except Exception as e:
        # The VinylID column only exists after migrations/001_listening_history_vinyl_id.sql has been run.
        if "VinylID" not in str(e):
            raise
        dataDict.pop("VinylID")
        response = supabase.table("ListeningHistory").insert(dataDict).execute()
        linked = False

    return linked, (response.data[0].get("id") if response.data else None)


def deletePlay(playId):
    supabase = initSupabase()
    supabase.table("ListeningHistory").delete().eq("id", int(playId)).execute()


def linkPastPlays(vinylId, albumName):
    # Pins old plays that only know the album name to this record, so a later rename cannot orphan them.
    try:
        supabase = initSupabase()
        supabase.table("ListeningHistory").update({"VinylID": int(vinylId)}) \
            .eq("AlbumName", albumName).is_("VinylID", "null").execute()
    except Exception:
        pass  # VinylID column not created yet; nothing to link


def linkHistoryToVinyls(historyDf, inventoryDf):
    # Plays logged after the migration carry VinylID. Older plays fall back to an album name match,
    # used only when exactly one record has that name.
    if historyDf.empty:
        return historyDf

    linkedDf = historyDf.copy()
    if "VinylID" in linkedDf.columns:
        linkedDf["VinylID"] = pd.to_numeric(linkedDf["VinylID"], errors="coerce").astype("Int64")
    else:
        linkedDf["VinylID"] = pd.array([pd.NA] * len(linkedDf), dtype="Int64")

    if not inventoryDf.empty:
        nameKeys = inventoryDf["AlbumName"].astype(str).str.strip().str.lower()
        uniqueRecords = inventoryDf[nameKeys.map(nameKeys.value_counts()) == 1]
        nameToId = dict(zip(nameKeys[uniqueRecords.index], uniqueRecords["ID"]))
        guessedIds = linkedDf["AlbumName"].astype(str).str.strip().str.lower().map(nameToId)
        linkedDf["VinylID"] = linkedDf["VinylID"].fillna(pd.to_numeric(guessedIds, errors="coerce").astype("Int64"))

    return linkedDf


def isDuplicate(artistName, albumName, existingDataDf):
    if existingDataDf.empty:
        return False

    targetArtist = str(artistName).strip().lower()
    targetAlbum = str(albumName).strip().lower()

    match = existingDataDf[
        (existingDataDf['Artist'].astype(str).str.strip().str.lower() == targetArtist) &
        (existingDataDf['AlbumName'].astype(str).str.strip().str.lower() == targetAlbum)
        ]

    return not match.empty


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


def formatMinutes(totalMinutes):
    hours, minutes = int(totalMinutes // 60), int(totalMinutes % 60)
    return f"{hours}h {minutes}m" if hours > 0 else f"{minutes} mins"


def formatDays(dayCount):
    return f"{dayCount} day" if dayCount == 1 else f"{dayCount} days"


def backupCsv(tableDf):
    # utf-8-sig lets Excel read accented names; convert_dtypes keeps IDs as whole numbers (no "12.0")
    return tableDf.convert_dtypes().to_csv(index=False).encode("utf-8-sig")


def toNumber(text):
    # "43" or "43.0" -> 43; empty or not a number -> None
    try:
        number = float(text)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return int(number) if number.is_integer() else number


def readBackupCsv(uploadedFile, requiredColumns, noun):
    # Returns (table, problem). Everything stays text so IDs and years come back exactly as exported.
    try:
        table = pd.read_csv(io.BytesIO(uploadedFile.getvalue()), dtype=str, keep_default_na=False,
                            encoding="utf-8-sig")
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError):
        return None, "That file could not be read as a CSV. If you saved it from Excel, choose CSV UTF-8."
    table.columns = [str(column).strip() for column in table.columns]
    missing = [column for column in requiredColumns if column not in table.columns]
    if missing:
        return None, f"This does not look like a {noun} backup: it has no {' or '.join(missing)} column."
    return table, None


recordTextColumns = ["Artist", "AlbumName", "Genre", "SubGenre", "Year", "CoverURL", "Condition", "Tracklist"]


def planRecordRestore(fileDf, currentDf):
    # Returns (records to add, counts of rows left alone). A record counts as present when the app already holds
    # its ID, or the same artist and album under another ID (the Add New tab refuses those too).
    knownIds = {int(recordId) for recordId in pd.to_numeric(currentDf["ID"], errors="coerce").dropna()}
    toAdd, seenIds = [], set()
    skipped = {"have": 0, "sameAlbum": 0, "unusable": 0}
    for raw in fileDf.to_dict("records"):
        recordId = toNumber(raw["ID"])
        if not isinstance(recordId, int):
            skipped["unusable"] += 1
        elif recordId in knownIds or recordId in seenIds:
            skipped["have"] += 1
        elif isDuplicate(raw["Artist"], raw["AlbumName"], currentDf):
            skipped["sameAlbum"] += 1
        else:
            row = {"ID": recordId, **{column: raw.get(column, "") for column in recordTextColumns}}
            minutes = toNumber(raw.get("DurationMins"))
            if minutes is not None:
                row["DurationMins"] = minutes
            rating = toNumber(raw.get("Rating"))
            if "Rating" in currentDf.columns and rating in range(1, 6):
                row["Rating"] = rating
            toAdd.append(row)
            seenIds.add(recordId)
    return toAdd, skipped


def playKey(date, albumName, minutes, vinylId):
    return str(date).strip(), str(albumName).strip(), toNumber(minutes), toNumber(vinylId)


def planPlayRestore(fileDf, currentDf):
    # A play id does not survive a restore, so a play counts as present when the app holds one with the same
    # date, album, minutes and record link. Two identical plays in the file need two in the app.
    held = Counter(playKey(raw.get("Date"), raw.get("AlbumName"), raw.get("DurationMins"), raw.get("VinylID"))
                   for raw in currentDf.to_dict("records"))
    toAdd = []
    skipped = {"have": 0, "unusable": 0}
    for raw in fileDf.to_dict("records"):
        key = playKey(raw["Date"], raw["AlbumName"], raw.get("DurationMins"), raw.get("VinylID"))
        if not key[0] or not key[1]:
            skipped["unusable"] += 1
        elif held[key] > 0:
            held[key] -= 1
            skipped["have"] += 1
        else:
            row = {"Date": raw["Date"], "AlbumName": raw["AlbumName"]}
            if key[2] is not None:
                row["DurationMins"] = key[2]
            if key[3] is not None:
                row["VinylID"] = int(key[3])
            toAdd.append(row)
    return toAdd, skipped


def insertInChunks(tableName, rows, chunkSize=200):
    # Returns (rows added, first error message). A chunk the database rejects is retried row by row so one bad row
    # cannot block the rest. Any other failure, such as a lost connection, stops here: the chunk may have been
    # saved, and retrying it could add it twice.
    supabase = initSupabase()
    added, firstError = 0, None
    for start in range(0, len(rows), chunkSize):
        chunk = rows[start:start + chunkSize]
        try:
            supabase.table(tableName).insert(chunk).execute()
            added += len(chunk)
            continue
        except Exception as e:
            firstError = firstError or str(e)
            if not hasattr(e, "code"):  # a rejection from the database (APIError) carries a code
                break
        addedBefore = added
        for row in chunk:
            try:
                supabase.table(tableName).insert(row).execute()
                added += 1
            except Exception:
                pass
        if added == addedBefore:
            break
    return added, firstError


skipLabels = {"have": "already in the app", "sameAlbum": "same album as one already in the app",
              "unusable": "unreadable"}


def restorePanel(title, noun, tableName, requiredColumns, planRestore, currentDf):
    # Upload, preview what would be added, then add it. Restoring never changes or deletes existing rows.
    restoreRound = st.session_state.get(f"restoreRound_{tableName}", 0)
    uploaded = st.file_uploader(title, type="csv", key=f"restoreFile_{tableName}_{restoreRound}")
    if uploaded is None:
        return

    fileDf, problem = readBackupCsv(uploaded, requiredColumns, noun)
    if problem:
        st.error(problem)
        return
    if currentDf.columns.empty:
        st.error("The app could not load its current data, so it cannot tell what is missing. Press Refresh Data.")
        return

    toAdd, skipped = planRestore(fileDf, currentDf)
    summary = f"{len(fileDf)} {noun} in the file: {len(toAdd)} to restore"
    summary += "".join(f", {count} {skipLabels[reason]}" for reason, count in skipped.items() if count)
    st.caption(summary)

    if st.button(f"Restore {len(toAdd)} {noun}", key=f"restoreGo_{tableName}_{restoreRound}", disabled=not toAdd,
                 type="primary", use_container_width=True):
        # Plan again on freshly read data, so a stale page can never add something twice
        st.cache_data.clear()
        freshDf = fetchData(tableName)
        if freshDf.columns.empty:
            st.error("The app could not load its current data, so nothing was restored.")
            return
        toAdd, _ = planRestore(fileDf, freshDf)
        added, firstError = insertInChunks(tableName, toAdd)
        if added == len(toAdd) and added:
            st.session_state[f"restoreRound_{tableName}"] = restoreRound + 1  # empties the uploader
            saveAndRefresh(f"Restored {added} {noun}", "♻️")
        st.cache_data.clear()
        if added == len(toAdd):
            st.info("Nothing to restore: the app already has every row.")
        else:
            st.warning(f"Restored {added} of {len(toAdd)} {noun}. The rest could not be saved: {firstError}")


def buildPlayTable(historyDf, inventoryDf):
    # One row per play with its record's current "Artist - Album" label, minutes and timestamp.
    if historyDf.empty:
        return historyDf

    playsDf = linkHistoryToVinyls(historyDf, inventoryDf)
    playsDf["DurationMins"] = pd.to_numeric(playsDf["DurationMins"], errors="coerce").fillna(0)
    # Stored times are UTC. Older plays are "YYYY-MM-DD HH:MM" text written on a UTC server; newer ones are ISO
    # timestamps. Both are shown on the wall clock of the chosen timezone.
    playsDf["When"] = (pd.to_datetime(playsDf["Date"], errors="coerce", format="mixed", utc=True)
                       .dt.tz_convert(displayTimezone()).dt.tz_localize(None))

    # Plays follow the record's current name; plays without a record keep the name they were logged with
    idToLabel = {int(r.ID): f"{r.Artist} - {r.AlbumName}" for r in inventoryDf.itertuples()}
    idToArtist = {int(r.ID): r.Artist for r in inventoryDf.itertuples()}
    playsDf["Album"] = [idToLabel.get(int(vinylId), albumName) if pd.notna(vinylId) else albumName
                        for vinylId, albumName in zip(playsDf["VinylID"], playsDf["AlbumName"])]
    # Plays that could not be matched to a record have no known artist
    playsDf["Artist"] = [idToArtist.get(int(vinylId)) if pd.notna(vinylId) else None for vinylId in playsDf["VinylID"]]
    return playsDf


def listeningStreaks(playsDf, today=None):
    # Returns (current streak, longest streak) in days. The current streak survives until the end of the day
    # after the last play, so it does not read 0 first thing in the morning.
    days = sorted(set(playsDf["When"].dropna().dt.normalize()))
    if not days:
        return 0, 0

    today = today if today is not None else pd.Timestamp(localNow()).normalize()
    longest = run = 1
    for previousDay, day in zip(days, days[1:]):
        run = run + 1 if (day - previousDay).days == 1 else 1
        longest = max(longest, run)

    current = run if (today - days[-1]).days <= 1 else 0
    return current, longest


def dustiestRecords(inventoryDf, playsDf, today=None):
    # One row per record: when it was last played and how many days ago. Never-played records come first,
    # then the ones left longest on the shelf.
    today = today if today is not None else pd.Timestamp(localNow()).normalize()
    lastPlayedById = {}
    if not playsDf.empty:
        lastPlayed = playsDf.dropna(subset=["VinylID", "When"]).groupby("VinylID")["When"].max()
        lastPlayedById = dict(zip(lastPlayed.index.astype(int), lastPlayed))

    dustyDf = inventoryDf[["ID", "Artist", "AlbumName"]].copy()
    dustyDf["LastPlayed"] = pd.to_datetime(dustyDf["ID"].astype("int64").map(lastPlayedById))
    dustyDf["DaysAgo"] = (today - dustyDf["LastPlayed"].dt.normalize()).dt.days
    return dustyDf.sort_values(by=["DaysAgo", "ID"], ascending=[False, True], na_position="first")


def statRow(cards):
    # Web: one column per card. Phone: a two-by-two grid, because columns stack on a narrow screen.
    if phone:
        st.markdown(f'<div class="vc-stat-grid">{"".join(cards)}</div>', unsafe_allow_html=True)
    else:
        for column, card in zip(st.columns(len(cards)), cards):
            column.markdown(card, unsafe_allow_html=True)


def ratingOf(row):
    # 1 to 5 stars, or None when the record has no rating or ratings are not set up yet
    rating = toNumber(row.get("Rating"))
    return rating if rating in range(1, 6) else None


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


def pickCandidates(inventoryDf, playsDf, genres=None, maxMinutes=None, today=None):
    # Records worth playing next, each with a weight: the longer a record has waited the likelier it comes up,
    # never-played ones most of all, and higher ratings tip the scale. Records played in the last 3 days sit out
    # unless nothing else is left.
    dusty = dustiestRecords(inventoryDf, playsDf, today)[["ID", "LastPlayed", "DaysAgo"]]
    pool = inventoryDf.merge(dusty, on="ID")
    if genres:
        pool = pool[pool["Genre"].isin(genres)]
    if maxMinutes:
        minutes = pd.to_numeric(pool["DurationMins"], errors="coerce")
        pool = pool[minutes.isna() | (minutes <= 0) | (minutes <= maxMinutes)]
    rested = pool[pool["DaysAgo"].isna() | (pool["DaysAgo"] >= 3)]
    if not rested.empty:
        pool = rested
    if pool.empty:
        return pool

    neverDays = max(60, int(pool["DaysAgo"].max()) + 14) if pool["DaysAgo"].notna().any() else 60
    ratingBoost = {5: 1.6, 4: 1.3, 3: 1.0, 2: 0.7, 1: 0.4}
    boost = [ratingBoost.get(ratingOf(row), 1.0) for _, row in pool.iterrows()]
    return pool.assign(Weight=(pool["DaysAgo"].fillna(neverDays).clip(upper=365) + 7) * boost)


def pickReason(row):
    if pd.isna(row["DaysAgo"]):
        reason = "You have not logged a play of this one yet."
    elif row["DaysAgo"] == 0:
        reason = "You played it earlier today."
    else:
        reason = f"Last played {formatDays(int(row['DaysAgo']))} ago."
    rating = ratingOf(row)
    if rating and rating >= 4:
        reason += f" You gave it {rating} stars."
    return reason


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


# --- SIGN-IN ---
# Sign-in goes through Supabase Auth with GitHub. Only the GitHub account below gets in, and the database's
# Row Level Security rules (migrations/003_owner_only.sql) check the same account on every request.
ownerGithubId = str(getSecretsData("github_owner_id") or "26037275")  # DxPerfection
signInStoreKey = "signInStore"
signInParams = ("signin", "code", "error", "error_code", "error_description")


@st.cache_resource
def pendingSignIns():
    # Sign-ins waiting for GitHub to send you back. The page reloads on the way back, so the client that started
    # the sign-in (and its one-time code verifier) waits here on the server, under a random key.
    return {}


def appUrl():
    configured = getSecretsData("app_url")
    if configured:
        return configured.rstrip("/")
    parts = urllib.parse.urlsplit(st.context.url or "")
    return f"{parts.scheme}://{parts.netloc}{parts.path}".rstrip("/")


def githubLogin(user):
    for identity in user.identities or []:
        if identity.provider == "github":
            return (identity.identity_data or {}).get("user_name")
    return None


def isOwner(user):
    # Checked against what GitHub reported, which you cannot edit afterwards (unlike the profile metadata)
    for identity in user.identities or []:
        data = identity.identity_data or {}
        if identity.provider == "github" and ownerGithubId in (str(identity.id), str(data.get("provider_id")),
                                                               str(data.get("sub"))):
            return True
    return False


def signInLink():
    if "signInUrl" not in st.session_state:
        pending = pendingSignIns()
        for oldKey in [key for key, (_, startedAt) in pending.items() if time.time() - startedAt > 900]:
            pending.pop(oldKey, None)
        signInKey = secrets.token_urlsafe(16)
        client = newSupabaseClient()
        response = client.auth.sign_in_with_oauth(
            {"provider": "github", "options": {"redirect_to": f"{appUrl()}/?signin={signInKey}"}})
        pending[signInKey] = (client, time.time())
        st.session_state["signInUrl"] = response.url
    return st.session_state["signInUrl"]


def finishSignIn():
    # GitHub (through Supabase) sends you back with ?signin=<key>&code=<code>; trade the code for a session
    params = {name: st.query_params.get(name) for name in signInParams}
    for name in signInParams:
        st.query_params.pop(name, None)
    pending = pendingSignIns().pop(params["signin"], None) if params["signin"] else None
    if params["error_description"] or params["error"]:
        return None, f"GitHub sign-in did not finish: {params['error_description'] or params['error']}"
    if not params["code"] or pending is None:
        return None, "That sign-in link has expired. Please sign in again."
    client = pending[0]
    try:
        client.auth.exchange_code_for_session({"auth_code": params["code"]})
        return client, None
    except Exception as e:
        return None, f"Sign-in failed: {e}"


# The browser keeps your sign-in in its own storage, so a fresh page load does not ask again. Reading and writing
# happen in the browser and the value comes back to Python as component state. (A cookie did not work: the hosted
# app never received it.)
signInStore = st.components.v2.component("sign_in_store", js="""
export default function(component) {
    const { data, setStateValue } = component;
    try {
        if (data.save !== null) {
            if (data.save) localStorage.setItem("vc_session", data.save); else localStorage.removeItem("vc_session");
        }
        const saved = localStorage.getItem("vc_session") || "";
        // Only report a change; reporting the same value again would rerun the app in a loop
        if (saved !== data.known) setStateValue("saved", saved);
    } catch (e) {
        if (data.known !== "") setStateValue("saved", "");
    }
}
""")


def savedSignIn():
    # None until the browser has reported back, which it does right after the first page load
    return (st.session_state.get(signInStoreKey) or {}).get("saved")


def keepSignIn(token):
    # token: the sign-in to store, "" to forget it, or None to leave the browser's copy alone.
    # Supabase hands out new tokens when the old ones run out, so the stored copy is replaced when it changes.
    signInStore(key=signInStoreKey, data={"save": token, "known": savedSignIn()}, on_saved_change=lambda: None)


def restoreSignIn():
    savedToken = savedSignIn()
    if not savedToken or savedToken == st.session_state.get("tokenTried"):
        return None
    st.session_state["tokenTried"] = savedToken
    client = newSupabaseClient()
    try:
        # Saved as "<access token> <refresh token>". The refresh token is only spent once the access token has run
        # out (after an hour), so most page loads leave the saved copy as it is.
        accessToken, refreshToken = savedToken.split(" ")
        client.auth.set_session(accessToken, refreshToken)
        return client
    except Exception:
        return None


def signOut():
    client = st.session_state.pop("supabase", None)
    if client:
        try:
            client.auth.sign_out({"scope": "local"})
        except Exception:
            pass
    for name in ("signInUrl", "signedInAs", "signInToken"):
        st.session_state.pop(name, None)
    st.session_state["tokenTried"] = savedSignIn()  # the saved sign-in was just ended, so do not reuse it


def showSignInPage(message=None):
    # Until the browser says whether it has a saved sign-in (a moment after the page opens), show a neutral
    # opening screen instead of flashing the sign-in button
    checking = savedSignIn() is None and not message
    subtitle = "Opening your records…" if checking else "Sign in to open your records."
    st.markdown(
        '<div class="vc-hero"><div class="vc-disc"></div><div><h1>Vinyl Collection</h1>'
        f'<p>{subtitle}</p></div></div>',
        unsafe_allow_html=True)
    if message:
        st.warning(message)
    if not checking:
        try:
            st.link_button("Sign in with GitHub", signInLink(), type="primary")
        except Exception as e:
            st.error(f"GitHub sign-in is not available yet: {e}")
    # A saved sign-in that did not work (or was just signed out) is forgotten
    keepSignIn("" if savedSignIn() else None)
    st.stop()


def requireSignIn():
    message = None
    client = st.session_state.get("supabase")
    if any(name in st.query_params for name in ("signin", "code", "error")):
        client, message = finishSignIn()
        st.session_state.pop("signInUrl", None)
    if client is None:
        client = restoreSignIn()
    session = None
    if client is not None:
        try:
            session = client.auth.get_session()  # refreshes the session when it is about to run out
        except Exception:
            session = None
    if session is None:
        st.session_state.pop("supabase", None)
        # Kept for the next run too, since the browser's report on the saved sign-in reruns the page right away
        if message:
            st.session_state["signInMessage"] = message
        showSignInPage(st.session_state.get("signInMessage"))
    if not isOwner(session.user):
        login = githubLogin(session.user) or "that account"
        st.session_state["supabase"] = client
        signOut()
        st.session_state["signInMessage"] = f"You signed in as {login}, but this collection belongs to someone else."
        showSignInPage(st.session_state["signInMessage"])
    st.session_state.pop("signInMessage", None)
    st.session_state["supabase"] = client
    st.session_state["signedInAs"] = githubLogin(session.user) or "GitHub"
    st.session_state["signInToken"] = f"{session.access_token} {session.refresh_token}"


requireSignIn()


# --- SIDEBAR & REFRESH ---
if "displayTz" not in st.session_state:
    st.session_state["displayTz"] = defaultTimezone()
if "viewLayout" not in st.session_state:
    st.session_state["viewLayout"] = defaultLayout()

with st.sidebar:
    st.header("Settings")
    if st.button("🔄 Refresh Data"):
        st.cache_data.clear()
        st.rerun()
    st.caption(f"Signed in as **{st.session_state['signedInAs']}**")
    if st.button("Sign out"):
        signOut()
        st.rerun()
    keepSignIn(st.session_state["signInToken"])
    st.radio("Layout", ["Phone", "Web"], key="viewLayout", horizontal=True,
             help="Phone fits a narrow screen. Web is the wide desktop layout.",
             on_change=lambda: st.query_params.update(layout=st.session_state["viewLayout"].lower()))
    st.selectbox("Timezone", sorted(available_timezones()), key="displayTz",
                 help="Listening times are shown on this clock.",
                 on_change=lambda: st.query_params.update(tz=st.session_state["displayTz"]))

phone = st.session_state["viewLayout"] == "Phone"
if phone:
    st.markdown(phoneCss, unsafe_allow_html=True)

# --- USER INTERFACE (UI) ---
if "flashMessage" in st.session_state:
    flashText, flashIcon = st.session_state.pop("flashMessage")
    st.toast(flashText, icon=flashIcon)

st.markdown(
    '<div class="vc-hero"><div class="vc-disc"></div><div><h1>Vinyl Collection</h1>'
    '<p>Your records and everything you have spun.</p></div></div>',
    unsafe_allow_html=True)

if "lastPlay" in st.session_state:
    lastPlay = st.session_state["lastPlay"]
    bannerHtml = f'<div class="vc-banner">🎧 Logged <b>{esc(lastPlay["label"])}</b> at {lastPlay["when"]}</div>'
    if phone:
        st.markdown(bannerHtml, unsafe_allow_html=True)
        bannerRow = st.container(key="row_banner")
        bannerUndo, bannerClose = bannerRow.columns(2)
    else:
        bannerText, bannerUndo, bannerClose = st.columns([7, 1.4, 1.6], vertical_alignment="center")
        bannerText.markdown(bannerHtml, unsafe_allow_html=True)
    if bannerUndo.button("Undo", key="undoLastPlay"):
        deletePlay(lastPlay["id"])
        st.session_state.pop("lastPlay")
        saveAndRefresh(f"Removed the play of {lastPlay['label']}", "↩️")
    if bannerClose.button("Dismiss", key="dismissLastPlay"):
        st.session_state.pop("lastPlay")
        st.rerun()
    st.write("")

vinylData = fetchData("Inventory")
historyData = fetchData("ListeningHistory")
wantData = fetchData("Wantlist", optional=True)  # None until migrations/002 has been run
playsData = buildPlayTable(historyData, vinylData)
ratingsOn = "Rating" in vinylData.columns


# --- TOP PANEL (METRICS) ---
def showTopStats():
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


# --- NAVIGATION ---
# The open section lives in session state (and the page address), so saving something keeps you where you are.
# Only the open section is drawn, which also keeps each tap quick.
sections = {
    "collection": ("💿 Collection", "💿 Records"),
    "play": ("🎲 What to play", "🎲 Play"),
    "log": ("🎧 Listening Log", "🎧 Log"),
    "wants": ("🛒 Want list", "🛒 Wants"),
    "add": ("➕ Add New", "➕ Add"),
    "manage": ("⚙️ Manage", "⚙️ Manage"),
    "stats": ("📊 Dashboard", "📊 Stats"),
}
if "section" not in st.session_state:
    linkedSection = st.query_params.get("section")
    st.session_state["section"] = linkedSection if linkedSection in sections else "collection"


def openSection(navKey):
    # Tapping the open section again would clear the control, so it stays on the open section instead
    picked = st.session_state.get(navKey)
    if picked is None:
        st.session_state[navKey] = st.session_state["section"]
    else:
        st.session_state["section"] = picked


if not phone:
    showTopStats()
    st.write("")

navKey = f"nav_{st.session_state['viewLayout']}"
st.session_state[navKey] = st.session_state["section"]
with st.container(key="nav"):
    (st.pills if phone else st.segmented_control)(
        "Section", list(sections), key=navKey, label_visibility="collapsed", on_change=openSection, args=(navKey,),
        format_func=lambda name: sections[name][1 if phone else 0])
section = st.session_state["section"]
st.query_params["section"] = section

# COLLECTION VIEW
if section == "collection":
    if phone:
        showTopStats()

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

# WHAT SHOULD I PLAY
if section == "play":
    st.header("What should I play?")
    if vinylData.empty:
        st.info("Add some records first, then come back for a suggestion.")
    else:
        lengthLimits = {"Any length": None, "Up to 30 min": 30, "Up to 45 min": 45, "Up to 60 min": 60}
        colPickGenre, colPickLength = st.columns(2)
        pickGenres = colPickGenre.multiselect("Genre", vinylData["Genre"].dropna().unique(), placeholder="Any genre",
                                              key="pickGenres")
        pickLength = colPickLength.selectbox("Time you have", list(lengthLimits), key="pickLength")
        candidates = pickCandidates(vinylData, playsData, pickGenres, lengthLimits[pickLength])

        # The pick stays put across reruns until you ask for another one or change the filters
        pickFilters = (tuple(pickGenres), pickLength)
        if st.session_state.get("pickFilters") != pickFilters:
            st.session_state.update(pickFilters=pickFilters, pickId=None, pickSkipped=[])
        fresh = candidates[~candidates["ID"].isin(st.session_state["pickSkipped"])] if not candidates.empty else candidates
        if not candidates.empty and fresh.empty:
            st.session_state["pickSkipped"] = []  # every record has been offered once; start over
            fresh = candidates
        freshIds = set(fresh["ID"]) if not fresh.empty else set()
        if st.session_state.get("pickId") not in freshIds:
            st.session_state["pickId"] = (int(random.choices(list(fresh["ID"]), weights=list(fresh["Weight"]))[0])
                                          if freshIds else None)

        if st.session_state["pickId"] is None:
            st.markdown('<div class="vc-empty">Nothing matches. Try another genre or more time.</div>',
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
                    st.session_state["pickId"] = None
                    st.rerun()
            st.caption(f"Picked from {len(candidates)} records. Ones you have not played for a while come up more "
                       "often, and higher ratings count extra.")

# WANT LIST
if section == "wants":
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

# ADD NEW VINYL
if section == "add":
    st.header("Add New Vinyl")

    searchMethod = st.radio("Select Search Method:", ["📝 Text Search", "📷 Scan with Barcode", "✍️ Manual Entry"],
                            horizontal=True)
    st.write("---")

    if searchMethod == "📝 Text Search":
        apiSearchInput = st.text_input("Search Artist or Album on Discogs", key="discogsSearch")

        if st.button("Search Database", key="btnSearchApi", type="primary"):
            if apiSearchInput:
                with st.spinner("Searching Discogs..."):
                    st.session_state["apiResults"] = searchDiscogsApi(searchQuery=apiSearchInput)
            else:
                st.warning("Please enter a search term.")

    elif searchMethod == "📷 Scan with Barcode":
        st.info(
            "💡 **Best Practice for Mobile:** Take a clear, focused photo of the barcode using your phone's normal camera app FIRST. Then, upload it here.")

        barcodeImg = st.file_uploader("Upload or Take a Photo of the Barcode", type=['jpg', 'jpeg', 'png'],
                                      key="barcodeUploader")

        if barcodeImg is not None:
            with st.spinner("Analyzing high-resolution image..."):
                try:
                    imgToDecode = Image.open(barcodeImg)
                    imgToDecode = imgToDecode.convert('L')

                    decodedObjects = decode(imgToDecode)

                    if decodedObjects:
                        scannedBarcode = decodedObjects[0].data.decode('utf-8')
                        st.success(f"Barcode Detected: **{scannedBarcode}**")

                        with st.spinner("Searching Discogs for barcode..."):
                            st.session_state["apiResults"] = searchDiscogsApi(barcodeQuery=scannedBarcode)
                    else:
                        st.error("No barcode detected. Please ensure the lines are perfectly in focus and try again.")
                except Exception as e:
                    st.error(f"Error processing image: {e}")

    elif searchMethod == "✍️ Manual Entry":
        colA, colB = st.columns(2)
        with colA:
            inputArtist = st.text_input("Artist Name", key="manArtist")
            inputAlbum = st.text_input("Album Name", key="manAlbum")
            inputYear = st.text_input("Year", key="manYear")
            inputDuration = st.number_input("Duration (Mins)", min_value=0, value=45, key="manDur")
            inputTracklist = st.text_area("Tracklist (Optional, format: Song1 | Song2)", key="manTrack")
        with colB:
            inputGenre = st.selectbox("Genre", ["Rock", "Jazz", "Pop", "Electronic", "Classical", "Hip-Hop", "Metal"],
                                      key="manGenre")
            inputSubGenre = st.text_input("Sub-Genre (Optional)", key="manSubGenre")
            inputUrl = st.text_input("Cover Image URL", key="manUrl")
            inputStatus = st.selectbox("Condition", ["New", "Used", "Mint", "Fair"], key="manCondition")

        if st.button("Save to Collection", use_container_width=True, key="btnSaveManual", type="primary"):
            if inputArtist and inputAlbum:
                if isDuplicate(inputArtist, inputAlbum, vinylData):
                    st.error(
                        f"⚠️ **Wait!** '{inputAlbum}' by '{inputArtist}' is already in your collection. It was not added.")
                else:
                    generatedId = int(time.time())
                    newVinylDict = {
                        "ID": generatedId,
                        "Artist": inputArtist,
                        "AlbumName": inputAlbum,
                        "Genre": inputGenre,
                        "SubGenre": inputSubGenre,
                        "Year": inputYear,
                        "CoverURL": inputUrl,
                        "Condition": inputStatus,
                        "DurationMins": inputDuration,
                        "Tracklist": inputTracklist
                    }
                    addNewVinyl(newVinylDict)
                    saveAndRefresh(f"Added {inputAlbum} to your collection", "💿")
            else:
                st.warning("Please enter at least Artist and Album name.")

    if searchMethod in ["📝 Text Search", "📷 Scan with Barcode"]:
        if "apiResults" in st.session_state and st.session_state["apiResults"]:
            st.write("---")
            st.markdown("### Select the Correct Release")

            if len(st.session_state["apiResults"]) == 0:
                st.warning("No results found. Please try a different search or manual entry.")
            else:
                resultOptions = [f"{item.get('title', 'Unknown Title')} ({item.get('year', 'Unknown Year')})" for item
                                 in st.session_state["apiResults"]]

                selectedResult = st.selectbox("Matching Results", resultOptions)
                selectedIndex = resultOptions.index(selectedResult)
                selectedData = st.session_state["apiResults"][selectedIndex]

                releaseId = selectedData.get("id", selectedIndex)

                if f"details_{releaseId}" not in st.session_state:
                    with st.spinner("Fetching data from Discogs and Spotify..."):
                        tempTitle = selectedData.get("title", "Unknown - Unknown")
                        if " - " in tempTitle:
                            tempArtist, tempAlbum = tempTitle.split(" - ", 1)
                        else:
                            tempArtist, tempAlbum = "Unknown", tempTitle

                        discogsDur, fetchedTracklist, fetchedSubGenre = fetchReleaseDetails(releaseId)
                        spotifyCover, spotifyDur = fetchSpotifyData(tempArtist, tempAlbum)
                        finalDur = spotifyDur if spotifyDur > 0 else discogsDur

                        st.session_state[f"details_{releaseId}"] = {
                            "tracklist": fetchedTracklist,
                            "duration": finalDur,
                            "spotifyCover": spotifyCover,
                            "subGenre": fetchedSubGenre
                        }

                mergedData = st.session_state[f"details_{releaseId}"]

                st.write("---")
                st.markdown("### Preview and Edit Data")

                fullTitle = selectedData.get("title", "Unknown - Unknown")
                if " - " in fullTitle:
                    parsedArtist, parsedAlbum = fullTitle.split(" - ", 1)
                else:
                    parsedArtist = "Unknown Artist"
                    parsedAlbum = fullTitle

                parsedYear = str(selectedData.get("year", "N/A"))
                parsedGenre = selectedData.get("genre", ["Unknown Genre"])[0] if selectedData.get(
                    "genre") else "Unknown Genre"
                parsedCover = mergedData["spotifyCover"] if mergedData["spotifyCover"] else selectedData.get(
                    "cover_image", "")

                colCover, colEdit = st.columns([1, 2])
                with colCover:
                    if parsedCover:
                        st.image(parsedCover, use_container_width=True)
                        if mergedData["spotifyCover"]:
                            st.caption("✅ HD Cover loaded from Spotify")

                with colEdit:
                    finalArtist = st.text_input("Artist", value=parsedArtist, key=f"apiArtist_{releaseId}")
                    finalAlbum = st.text_input("Album Name", value=parsedAlbum, key=f"apiAlbum_{releaseId}")

                    cGen, cSubGen = st.columns(2)
                    with cGen:
                        finalGenre = st.text_input("Genre", value=parsedGenre, key=f"apiGenre_{releaseId}")
                    with cSubGen:
                        finalSubGenre = st.text_input("Sub-Genre", value=mergedData["subGenre"],
                                                      key=f"apiSubGenre_{releaseId}")

                    cYear, cDur = st.columns(2)
                    with cYear:
                        finalYear = st.text_input("Year", value=parsedYear, key=f"apiYear_{releaseId}")
                    with cDur:
                        finalDuration = st.number_input("Duration (Mins)", value=mergedData["duration"],
                                                        key=f"apiDur_{releaseId}")

                    finalTracklist = st.text_area("Tracklist (Separated by |)", value=mergedData["tracklist"],
                                                  key=f"apiTrack_{releaseId}")
                    finalCondition = st.selectbox("Condition", ["New", "Used", "Mint", "Fair"],
                                                  key=f"apiCondition_{releaseId}")

                colSaveApi, colWantApi = st.container(key=f"row_saveapi_{releaseId}").columns(2)
                if colWantApi.button("🛒 Add to want list", key=f"btnWantApi_{releaseId}"):
                    if wantData is None:
                        st.info(migrationHint)
                    elif isDuplicate(finalArtist, finalAlbum, vinylData):
                        st.warning(f"{finalAlbum} by {finalArtist} is already in your collection.")
                    elif isDuplicate(finalArtist, finalAlbum, wantData):
                        st.warning(f"{finalAlbum} by {finalArtist} is already on your want list.")
                    else:
                        addWant({"Artist": finalArtist, "AlbumName": finalAlbum, "Year": finalYear,
                                 "Genre": finalGenre, "CoverURL": parsedCover,
                                 "DiscogsID": int(releaseId) if str(releaseId).isdigit() else None})
                        saveAndRefresh(f"Added {finalAlbum} to your want list", "🛒")

                if colSaveApi.button("Save to Collection", type="primary", key=f"btnSaveApi_{releaseId}"):
                    if isDuplicate(finalArtist, finalAlbum, vinylData):
                        st.error(
                            f"⚠️ **Wait!** '{finalAlbum}' by '{finalArtist}' is already in your collection. It was not added.")
                    else:
                        generatedId = int(time.time())

                        newVinylDict = {
                            "ID": generatedId,
                            "Artist": finalArtist,
                            "AlbumName": finalAlbum,
                            "Genre": finalGenre,
                            "SubGenre": finalSubGenre,
                            "Year": finalYear,
                            "CoverURL": parsedCover,
                            "Condition": finalCondition,
                            "DurationMins": finalDuration,
                            "Tracklist": finalTracklist
                        }

                        addNewVinyl(newVinylDict)
                        del st.session_state["apiResults"]
                        saveAndRefresh(f"Added {finalAlbum} to your collection", "💿")

# LOG LISTENING SESSION
if section == "log":
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

# MANAGE COLLECTION
if section == "manage":
    st.header("Manage Your Collection")

    if not vinylData.empty:
        vinylOptions = [f"{row['Artist']} - {row['AlbumName']} (ID: {row['ID']})" for idx, row in vinylData.iterrows()]
        selectedVinylStr = st.selectbox("Select Vinyl to Edit or Delete", vinylOptions, key="manageSelect")

        match = re.search(r"\(ID: (\d+)\)", selectedVinylStr)
        if match:
            selectedId = int(match.group(1))
            targetRow = vinylData[vinylData["ID"] == selectedId].iloc[0]

            st.write("---")
            colImgMng, colEditMng = st.columns([1, 3])

            with colImgMng:
                st.markdown(f'<div style="max-width: {"140px" if phone else "100%"}">'
                            f'{coverHtml(targetRow.get("CoverURL"))}</div>', unsafe_allow_html=True)

            with colEditMng:
                updArtist = st.text_input("Artist", value=targetRow.get("Artist", ""), key=f"updArt_{selectedId}")
                updAlbum = st.text_input("Album Name", value=targetRow.get("AlbumName", ""), key=f"updAlb_{selectedId}")

                cGenMng, cSubGenMng = st.columns(2)
                with cGenMng:
                    updGenre = st.text_input("Genre", value=targetRow.get("Genre", ""), key=f"updGen_{selectedId}")
                with cSubGenMng:
                    currentSubGenre = targetRow.get("SubGenre", "")
                    if pd.isna(currentSubGenre):
                        currentSubGenre = ""
                    updSubGenre = st.text_input("Sub-Genre", value=currentSubGenre, key=f"updSub_{selectedId}")

                cYearMng, cDurMng = st.columns(2)
                with cYearMng:
                    updYear = st.text_input("Year", value=str(targetRow.get("Year", "")), key=f"updYear_{selectedId}")
                with cDurMng:
                    currentDur = targetRow.get("DurationMins", 0)
                    if pd.isna(currentDur) or currentDur == "":
                        currentDur = 0
                    updDuration = st.number_input("Duration (Mins)", value=int(currentDur), key=f"updDur_{selectedId}")

                updTracklist = st.text_area("Tracklist", value=targetRow.get("Tracklist", ""),
                                            key=f"updTrack_{selectedId}")

                conditionOptions = ["New", "Used", "Mint", "Fair"]
                currentCond = targetRow.get("Condition", "Used")
                if currentCond not in conditionOptions:
                    conditionOptions.append(currentCond)
                updCondition = st.selectbox("Condition", conditionOptions, index=conditionOptions.index(currentCond),
                                            key=f"updCond_{selectedId}")

                updCover = st.text_input("Cover URL", value=targetRow.get("CoverURL", ""), key=f"updCov_{selectedId}")

                if ratingsOn:
                    st.markdown('<div class="vc-meta">Rating</div>', unsafe_allow_html=True)
                    storedRating = ratingOf(targetRow)
                    updRating = st.feedback("stars", key=f"updRate_{selectedId}_{storedRating}",
                                            default=None if storedRating is None else storedRating - 1)

                colBtnUpdate, colBtnDelete = st.columns(2)
                with colBtnUpdate:
                    if st.button("💾 Update Record", use_container_width=True, type="primary"):
                        updatedDataDict = {
                            "Artist": updArtist,
                            "AlbumName": updAlbum,
                            "Genre": updGenre,
                            "SubGenre": updSubGenre,
                            "Year": updYear,
                            "DurationMins": updDuration,
                            "Tracklist": updTracklist,
                            "Condition": updCondition,
                            "CoverURL": updCover
                        }
                        if ratingsOn:
                            updatedDataDict["Rating"] = None if updRating is None else updRating + 1
                        oldName = str(targetRow["AlbumName"])
                        if updAlbum != oldName and (vinylData["AlbumName"].astype(str).str.strip().str.lower()
                                                    == oldName.strip().lower()).sum() == 1:
                            linkPastPlays(selectedId, oldName)
                        updateVinyl(selectedId, updatedDataDict)
                        saveAndRefresh(f"Updated {updAlbum}", "💾")

                with colBtnDelete:
                    if st.button("🗑️ Delete Record", use_container_width=True):
                        deleteVinyl(selectedId)
                        saveAndRefresh(f"Deleted {updAlbum}", "🗑️")
    else:
        st.info("Your collection is currently empty.")
    if (not ratingsOn and not vinylData.empty) or wantData is None:
        st.caption("Ratings and the want list: " + migrationHint)

    st.write("---")
    st.subheader("Backup")
    st.caption("Download your data as CSV files to keep safe or open in a spreadsheet. "
               "They hold what the app shows now (press Refresh Data first if you changed the tables elsewhere), "
               "and listening times are saved in UTC.")
    backupStamp = localNow().strftime("%Y-%m-%d")
    colBackupRecords, colBackupPlays, colBackupWants = st.columns(3)
    with colBackupWants:
        st.download_button(f"⬇️ Want list ({0 if wantData is None else len(wantData)})",
                           data=backupCsv(wantData if wantData is not None else pd.DataFrame()),
                           file_name=f"vinyl-want-list-{backupStamp}.csv", mime="text/csv",
                           disabled=wantData is None, use_container_width=True, key="backupWants")
    with colBackupRecords:
        st.download_button(f"⬇️ Records ({len(vinylData)})", data=backupCsv(vinylData),
                           file_name=f"vinyl-records-{backupStamp}.csv", mime="text/csv",
                           disabled=vinylData.columns.empty, use_container_width=True, key="backupRecords")
    with colBackupPlays:
        st.download_button(f"⬇️ Listening history ({len(historyData)})", data=backupCsv(historyData),
                           file_name=f"vinyl-listening-history-{backupStamp}.csv", mime="text/csv",
                           disabled=historyData.columns.empty, use_container_width=True, key="backupPlays")

    st.write("---")
    st.subheader("Restore from a backup")
    st.caption("Upload a CSV made by the buttons above. Restoring only adds what is missing: nothing in the app is "
               "changed or deleted, and uploading the same file again adds nothing.")
    colRestoreRecords, colRestorePlays = st.columns(2)
    with colRestoreRecords:
        restorePanel("Records CSV", "records", "Inventory", ["ID", "Artist", "AlbumName"],
                     planRecordRestore, vinylData)
    with colRestorePlays:
        restorePanel("Listening history CSV", "plays", "ListeningHistory", ["Date", "AlbumName"],
                     planPlayRestore, historyData)

# DASHBOARD & STATISTICS
def barChart(chartDf, category, value, valueTitle, horizontal=True, height=280):
    categoryEncoding = alt.Y if horizontal else alt.X
    valueEncoding = alt.X if horizontal else alt.Y
    return alt.Chart(chartDf).mark_bar(color=accentColor, cornerRadiusEnd=4).encode(
        categoryEncoding(f"{category}:N", sort="-x" if horizontal else None, title=None),
        valueEncoding(f"{value}:Q", title=valueTitle, axis=alt.Axis(tickMinStep=1, format="d")),
        tooltip=[category, alt.Tooltip(value, title=valueTitle)],
    ).properties(height=height)


if section == "stats":
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
                st.caption("Most listened albums")
                topListened = playsData.groupby("Album").agg(
                    Minutes=("DurationMins", "sum"), Plays=("Album", "size")).reset_index()
                topListened = topListened.sort_values(by="Minutes", ascending=False).head(8)
                st.altair_chart(
                    barChart(topListened, "Album", "Minutes", "Minutes listened").encode(
                        y=alt.Y("Album:N", sort="-x", title=None, axis=alt.Axis(labelLimit=220)),
                        tooltip=["Album", "Minutes", "Plays"]),
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
