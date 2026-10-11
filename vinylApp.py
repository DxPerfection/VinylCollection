import streamlit as st
import pandas as pd
import requests
import time
from datetime import datetime
import json
import base64
from supabase import create_client, Client
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
    .vc-stat-value {color: var(--vc-text); font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 700; line-height: 1.25;}
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
    .vc-count {color: var(--vc-muted); font-size: 0.85rem; margin: 4px 0 14px 0;}
    .vc-empty {text-align: center; padding: 56px 20px; border: 1px dashed var(--vc-border); border-radius: 16px;
        color: var(--vc-muted);}
    .tracklist-text {font-size: 14px; color: var(--vc-muted); margin-bottom: 2px;}

    /* Controls */
    div[data-testid="stElementContainer"]:has(> div[data-testid="stButton"]),
    div[data-testid="stButton"], div[data-testid="stButton"] > button {width: 100% !important;}
    div[data-testid="stButton"] > button {border-radius: 999px; font-weight: 500;}
    h2, h3 {font-family: 'Playfair Display', serif;}
    @media (max-width: 640px) {.vc-hero h1 {font-size: 1.9rem;} .vc-disc {width: 56px; height: 56px;}}
</style>
""", unsafe_allow_html=True)

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
@st.cache_resource
def initSupabase() -> Client:
    url = getSecretsData("supabase_url")
    key = getSecretsData("supabase_key")

    if url and key:
        return create_client(url, key)
    else:
        st.error("Supabase credentials are missing.")
        st.stop()


@st.cache_data(ttl=600)
def fetchData(tableName):
    try:
        supabase = initSupabase()
        response = supabase.table(tableName).select("*").execute()
        df = pd.DataFrame(response.data)

        if df.empty:
            if tableName == "Inventory":
                df = pd.DataFrame(
                    columns=["ID", "Artist", "AlbumName", "Genre", "SubGenre", "Year", "CoverURL", "Condition",
                             "DurationMins", "Tracklist"])
            elif tableName == "ListeningHistory":
                df = pd.DataFrame(columns=["id", "Date", "AlbumName", "DurationMins", "VinylID"])
        return df
    except Exception as e:
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


def logListeningSession(albumName, durationMinutes, vinylId=None):
    supabase = initSupabase()
    currentDate = datetime.now().strftime("%Y-%m-%d %H:%M")
    dataDict = {"Date": currentDate, "AlbumName": albumName, "DurationMins": durationMinutes}
    if vinylId is not None:
        dataDict["VinylID"] = int(vinylId)

    try:
        supabase.table("ListeningHistory").insert(dataDict).execute()
        return True
    except Exception as e:
        # The VinylID column only exists after migrations/001_listening_history_vinyl_id.sql has been run.
        if "VinylID" not in str(e):
            raise
        dataDict.pop("VinylID")
        supabase.table("ListeningHistory").insert(dataDict).execute()
        return False


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


def logPlay(albumName, durationMinutes, vinylId):
    if logListeningSession(albumName, durationMinutes, vinylId):
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


def buildPlayTable(historyDf, inventoryDf):
    # One row per play with its record's current "Artist - Album" label, minutes and timestamp.
    if historyDf.empty:
        return historyDf

    playsDf = linkHistoryToVinyls(historyDf, inventoryDf)
    playsDf["DurationMins"] = pd.to_numeric(playsDf["DurationMins"], errors="coerce").fillna(0)
    # Dates are written as "YYYY-MM-DD HH:MM" text, but accept full ISO timestamps too
    playsDf["When"] = pd.to_datetime(playsDf["Date"], errors="coerce", format="mixed", utc=True).dt.tz_convert(None)

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

    today = today if today is not None else pd.Timestamp.now().normalize()
    longest = run = 1
    for previousDay, day in zip(days, days[1:]):
        run = run + 1 if (day - previousDay).days == 1 else 1
        longest = max(longest, run)

    current = run if (today - days[-1]).days <= 1 else 0
    return current, longest


def dustiestRecords(inventoryDf, playsDf, today=None):
    # One row per record: when it was last played and how many days ago. Never-played records come first,
    # then the ones left longest on the shelf.
    today = today if today is not None else pd.Timestamp.now().normalize()
    lastPlayedById = {}
    if not playsDf.empty:
        lastPlayed = playsDf.dropna(subset=["VinylID", "When"]).groupby("VinylID")["When"].max()
        lastPlayedById = dict(zip(lastPlayed.index.astype(int), lastPlayed))

    dustyDf = inventoryDf[["ID", "Artist", "AlbumName"]].copy()
    dustyDf["LastPlayed"] = pd.to_datetime(dustyDf["ID"].astype("int64").map(lastPlayedById))
    dustyDf["DaysAgo"] = (today - dustyDf["LastPlayed"].dt.normalize()).dt.days
    return dustyDf.sort_values(by=["DaysAgo", "ID"], ascending=[False, True], na_position="first")


# --- SIDEBAR & REFRESH ---
with st.sidebar:
    st.header("Settings")
    if st.button("🔄 Refresh Data"):
        st.cache_data.clear()
        st.rerun()

# --- USER INTERFACE (UI) ---
if "flashMessage" in st.session_state:
    flashText, flashIcon = st.session_state.pop("flashMessage")
    st.toast(flashText, icon=flashIcon)

st.markdown(
    '<div class="vc-hero"><div class="vc-disc"></div><div><h1>Vinyl Collection</h1>'
    '<p>Your records and everything you have spun.</p></div></div>',
    unsafe_allow_html=True)

vinylData = fetchData("Inventory")
historyData = fetchData("ListeningHistory")
playsData = buildPlayTable(historyData, vinylData)

# --- TOP PANEL (METRICS) ---
if not vinylData.empty:
    totalMinutes = playsData["DurationMins"].sum() if not playsData.empty else 0
    totalPlays = len(playsData)
    albumsPlayed = playsData["Album"].nunique() if not playsData.empty else 0
    topGenre = vinylData["Genre"].mode()[0] if vinylData["Genre"].notna().any() else "-"
    topGenreCount = int((vinylData["Genre"] == topGenre).sum())

    statCols = st.columns(4)
    statCols[0].markdown(statCard("Records", len(vinylData), f"{vinylData['Artist'].nunique()} artists"),
                         unsafe_allow_html=True)
    statCols[1].markdown(statCard("Listening time", formatMinutes(totalMinutes), f"{totalPlays} plays"),
                         unsafe_allow_html=True)
    statCols[2].markdown(statCard("Albums played", albumsPlayed, f"of {len(vinylData)} in the collection"),
                         unsafe_allow_html=True)
    statCols[3].markdown(statCard("Favorite genre", topGenre, f"{topGenreCount} records"), unsafe_allow_html=True)

st.write("")

# --- TABS ---
tabGallery, tabAdd, tabLog, tabManage, tabDash = st.tabs([
    "💿 Collection", "➕ Add New", "🎧 Listening Log", "⚙️ Manage", "📊 Dashboard"
])

# TAB 1: COLLECTION VIEW
with tabGallery:
    sortOptions = ["Recently added", "Recently listened", "Artist A-Z", "Album A-Z", "Year (newest)", "Year (oldest)", "Longest first"]
    colSearch, colGenre, colSort, colToggle = st.columns([3, 2, 2, 2])
    searchQuery = colSearch.text_input("Search", placeholder="Search album or artist", label_visibility="collapsed")
    selectedGenres = colGenre.multiselect("Genre", vinylData["Genre"].dropna().unique() if not vinylData.empty else [],
                                          placeholder="All genres", label_visibility="collapsed")
    sortChoice = colSort.selectbox("Sort", sortOptions, label_visibility="collapsed")
    layoutMode = colToggle.segmented_control("Layout", ["Grid", "List"], default="Grid",
                                             label_visibility="collapsed") or "Grid"

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
        }
        sortColumn, sortAscending = sortKeys[sortChoice]
        # Records that have never been played sort last under "Recently listened"
        lastPlayedById = dustiestRecords(vinylData, playsData).set_index("ID")["LastPlayed"]
        filteredData = filteredData.assign(
            LastPlayed=filteredData["ID"].map(lastPlayedById),
            YearNum=pd.to_numeric(filteredData["Year"], errors="coerce"),
            DurationNum=pd.to_numeric(filteredData["DurationMins"], errors="coerce"),
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

        if layoutMode == "Grid":
            for rowStart in range(0, len(records), gridColumns):
                gridCols = st.columns(gridColumns)
                for gridCol, row in zip(gridCols, records[rowStart:rowStart + gridColumns]):
                    with gridCol.container(key=f"card_grid_{row['ID']}"):
                        st.markdown(
                            coverHtml(row.get("CoverURL")) +
                            f'<div class="vc-title" title="{esc(row["AlbumName"])}">{esc(row["AlbumName"])}</div>'
                            f'<div class="vc-artist">{esc(row["Artist"])}</div>' + pillsHtml(row),
                            unsafe_allow_html=True)
                        if st.button("I listened to this", key=f"btnGrid_{row['ID']}"):
                            logPlay(row["AlbumName"], displayDuration(row), row["ID"])
        else:
            for row in records:
                with st.container(key=f"card_list_{row['ID']}"):
                    colImg, colDetails = st.columns([1, 4])
                    with colImg:
                        st.markdown(coverHtml(row.get("CoverURL")), unsafe_allow_html=True)
                    with colDetails:
                        st.markdown(
                            f'<div class="vc-title-lg">{esc(row["AlbumName"])}</div>'
                            f'<div class="vc-artist">{esc(row["Artist"])}</div>' + pillsHtml(row),
                            unsafe_allow_html=True)

                        tracklistData = row.get("Tracklist", "")
                        if tracklistData and pd.notna(tracklistData):
                            with st.expander("Tracklist"):
                                for trackNum, trackName in enumerate(str(tracklistData).split(" | "), 1):
                                    st.markdown(f"<div class='tracklist-text'>{trackNum}. {esc(trackName)}</div>",
                                                unsafe_allow_html=True)

                        if st.button("I listened to this", key=f"btnList_{row['ID']}"):
                            logPlay(row["AlbumName"], displayDuration(row), row["ID"])

# TAB 2: ADD NEW VINYL
with tabAdd:
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

                if st.button("Save to Collection", type="primary", key=f"btnSaveApi_{releaseId}"):
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

# TAB 3: LOG LISTENING SESSION
with tabLog:
    st.header("Automatic Listening Entry")

    if not vinylData.empty:
        selectedFilterArtist = st.selectbox("Select Artist", vinylData["Artist"].unique(), key="logArtist")
        artistAlbumsData = vinylData[vinylData["Artist"] == selectedFilterArtist]
        selectedFilterAlbum = st.selectbox("Select Album", artistAlbumsData["AlbumName"].unique(), key="logAlbum")

        albumRowInfo = artistAlbumsData[artistAlbumsData["AlbumName"] == selectedFilterAlbum].iloc[0]
        albumDurationInfo = albumRowInfo.get("DurationMins", 0)

        if pd.isna(albumDurationInfo) or albumDurationInfo == "":
            albumDurationInfo = 0

        st.info(f"Duration to be logged: **{albumDurationInfo} minutes**")

        if st.button("Log Session"):
            logPlay(selectedFilterAlbum, int(albumDurationInfo), albumRowInfo["ID"])
    else:
        st.warning("Your collection is currently empty. Please add a vinyl first.")

# TAB 4: MANAGE COLLECTION
with tabManage:
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
                st.markdown(coverHtml(targetRow.get("CoverURL")), unsafe_allow_html=True)

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

# TAB 5: DASHBOARD & STATISTICS
def barChart(chartDf, category, value, valueTitle, horizontal=True, height=280):
    categoryEncoding = alt.Y if horizontal else alt.X
    valueEncoding = alt.X if horizontal else alt.Y
    return alt.Chart(chartDf).mark_bar(color=accentColor, cornerRadiusEnd=4).encode(
        categoryEncoding(f"{category}:N", sort="-x" if horizontal else None, title=None),
        valueEncoding(f"{value}:Q", title=valueTitle, axis=alt.Axis(tickMinStep=1, format="d")),
        tooltip=[category, alt.Tooltip(value, title=valueTitle)],
    ).properties(height=height)


with tabDash:
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

            insightCols = st.columns(4)
            insightCols[0].markdown(statCard("Current streak", formatDays(currentStreak), "in a row"),
                                    unsafe_allow_html=True)
            insightCols[1].markdown(statCard("Longest streak", formatDays(longestStreak), "in a row"),
                                    unsafe_allow_html=True)
            insightCols[2].markdown(statCard("Days listened", activeDays, "with at least one play"),
                                    unsafe_allow_html=True)
            insightCols[3].markdown(statCard("Never played", neverPlayed, f"of {len(vinylData)} records"),
                                    unsafe_allow_html=True)
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

            yearCols = st.columns(4)
            yearCols[0].markdown(statCard("Listening time", formatMinutes(yearPlays["DurationMins"].sum()),
                                          f"{len(yearPlays)} plays"), unsafe_allow_html=True)
            yearCols[1].markdown(statCard("Albums played", yearPlays["Album"].nunique(),
                                          "different records"), unsafe_allow_html=True)
            yearCols[2].markdown(statCard("Busiest month", pd.Timestamp(2000, int(monthMinutes.idxmax()), 1)
                                          .strftime("%B"), formatMinutes(monthMinutes.max())),
                                 unsafe_allow_html=True)
            yearCols[3].markdown(statCard("Top artist", yearArtists.idxmax() if not yearArtists.empty else "-",
                                          formatMinutes(yearArtists.max()) if not yearArtists.empty else ""),
                                 unsafe_allow_html=True)
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
