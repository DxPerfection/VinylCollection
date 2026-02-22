import streamlit as st
import pandas as pd
import requests
import time
from datetime import datetime
import json
from supabase import create_client, Client

# --- GLOBAL UI SETTINGS ---
gridImageWidth = 150
listImageWidth = 250

# --- PAGE CONFIGURATION ---
st.set_page_config(page_title="Vinyl Collection", page_icon="🎵", layout="wide")

st.markdown("""
<style>
    .stApp {background-color: #0E1117;}
    div.css-1r6slb0 {background-color: #262730; border: 1px solid #41444C; border-radius: 10px; padding: 15px;}
    div[data-testid="stMetricValue"] {color: #1DB954; font-size: 28px;}
    .stButton>button {width: 100%; border-radius: 20px;}
    .tracklist-text {font-size: 14px; color: #A0A0A0; margin-bottom: 2px;}
</style>
""", unsafe_allow_html=True)


# --- CONFIGURATION & TOKENS ---
def getSecretsData(keyName):
    """
    Retrieves secret tokens (Discogs or Supabase) from Streamlit Secrets or local JSON.
    """
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


# --- DISCOGS API ---
def searchDiscogsApi(searchQuery):
    apiToken = getSecretsData("discogs_token")
    if not apiToken:
        return []

    apiUrl = f"https://api.discogs.com/database/search?q={searchQuery}&type=release&token={apiToken}"
    headersInfo = {"User-Agent": "VinylCollectionApp/1.0"}

    try:
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
        return 0, ""

    apiUrl = f"https://api.discogs.com/releases/{releaseId}?token={apiToken}"
    headersInfo = {"User-Agent": "VinylCollectionApp/1.0"}

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
        return (totalSeconds // 60), tracklistString
    except Exception:
        return 0, ""


# --- SUPABASE DATABASE CONNECTIONS ---
@st.cache_resource
def initSupabase() -> Client:
    """
    Initializes and returns the Supabase client connection.
    """
    url = getSecretsData("supabase_url")
    key = getSecretsData("supabase_key")

    if url and key:
        return create_client(url, key)
    else:
        st.error("Supabase credentials are missing. Please check your secrets.")
        st.stop()


@st.cache_data(ttl=600)
def fetchData(tableName):
    """
    Fetches all records from the specified Supabase table.
    """
    try:
        supabase = initSupabase()
        # Fetching all data from the specific table
        response = supabase.table(tableName).select("*").execute()
        df = pd.DataFrame(response.data)

        # Ensure column structure if table is empty
        if df.empty:
            if tableName == "Inventory":
                df = pd.DataFrame(
                    columns=["ID", "Artist", "AlbumName", "Genre", "Year", "CoverURL", "Condition", "DurationMins",
                             "Tracklist"])
            elif tableName == "ListeningHistory":
                df = pd.DataFrame(columns=["id", "Date", "AlbumName", "DurationMins"])
        return df
    except Exception as e:
        st.error(f"Data could not be fetched from database: {e}")
        return pd.DataFrame()


def addNewVinyl(vinylDataDict):
    """
    Inserts a new vinyl dictionary record into the Inventory table.
    """
    supabase = initSupabase()
    supabase.table("Inventory").insert(vinylDataDict).execute()


def logListeningSession(albumName, durationMinutes):
    """
    Inserts a new listening session into the ListeningHistory table.
    """
    supabase = initSupabase()
    currentDate = datetime.now().strftime("%Y-%m-%d %H:%M")
    dataDict = {"Date": currentDate, "AlbumName": albumName, "DurationMins": durationMinutes}
    supabase.table("ListeningHistory").insert(dataDict).execute()


# --- SIDEBAR & REFRESH ---
with st.sidebar:
    st.header("Settings")
    if st.button("🔄 Refresh Data"):
        st.cache_data.clear()
        st.rerun()

# --- USER INTERFACE (UI) ---
st.title("🎵 Vinyl Collection")

vinylData = fetchData("Inventory")

# --- TOP PANEL (METRICS) ---
if not vinylData.empty:
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Vinyls", len(vinylData))
    col2.metric("Favorite Genre", vinylData['Genre'].mode()[0] if not vinylData.empty else "-")

    try:
        historyData = fetchData("ListeningHistory")
        if not historyData.empty:
            totalMinutes = pd.to_numeric(historyData["DurationMins"], errors='coerce').sum()
            totalHours = int(totalMinutes // 60)
            col3.metric("Total Listening Time", f"{totalHours} Hours")
    except:
        col3.metric("Total Listening Time", "0 Hours")

st.divider()

# --- TABS ---
tabGallery, tabAdd, tabLog = st.tabs(["💿 Collection", "➕ Add New", "🎧 Listening Log"])

# TAB 1: COLLECTION VIEW
with tabGallery:
    colFilter, colToggle = st.columns([3, 1])
    with colFilter:
        with st.expander("🔍 Filter Options", expanded=False):
            c1, c2 = st.columns(2)
            selectedGenres = c1.multiselect("Select Genre", vinylData["Genre"].unique())
            searchQuery = c2.text_input("Search Album or Artist")

    with colToggle:
        layoutMode = st.radio("View Layout", ["Grid View", "List View"], horizontal=True)

    filteredData = vinylData.copy()
    if selectedGenres:
        filteredData = filteredData[filteredData["Genre"].isin(selectedGenres)]
    if searchQuery:
        filteredData = filteredData[
            filteredData["AlbumName"].str.contains(searchQuery, case=False) |
            filteredData["Artist"].str.contains(searchQuery, case=False)
            ]

    if not filteredData.empty:
        filteredData = filteredData.sort_values(by="ID", ascending=False)

    st.write("---")

    if not filteredData.empty:
        if layoutMode == "Grid View":
            colsPerRow = 3
            gridRows = [st.columns(colsPerRow) for _ in range((len(filteredData) // colsPerRow) + 1)]

            for index, (idx, row) in enumerate(filteredData.iterrows()):
                rowIndex = index // colsPerRow
                colIndex = index % colsPerRow

                with gridRows[rowIndex][colIndex]:
                    coverUrl = row.get("CoverURL", "")
                    if coverUrl and str(coverUrl).startswith("http"):
                        st.image(coverUrl, width=gridImageWidth)
                    else:
                        st.image("https://upload.wikimedia.org/wikipedia/commons/b/b6/12in-Vinyl-LP-Record-Angle.jpg",
                                 width=gridImageWidth)

                    st.subheader(row["AlbumName"])
                    st.caption(f"🎤 {row['Artist']}")

                    displayDuration = row.get("DurationMins", 0)
                    durationStr = f" | ⏱️ {displayDuration} mins" if displayDuration else ""
                    st.write(f"📅 {row['Year']} | 🏷️ {row['Genre']}{durationStr}")

                    if st.button("I Listened to This", key=f"btnGrid_{row['ID']}"):
                        logListeningSession(row["AlbumName"], displayDuration if displayDuration else 45)
                        st.toast(f"Added {row['AlbumName']} to history!")

        elif layoutMode == "List View":
            for idx, row in filteredData.iterrows():
                colImg, colDetails = st.columns([1, 4])

                with colImg:
                    coverUrl = row.get("CoverURL", "")
                    if coverUrl and str(coverUrl).startswith("http"):
                        st.image(coverUrl, width=listImageWidth)
                    else:
                        st.image("https://upload.wikimedia.org/wikipedia/commons/b/b6/12in-Vinyl-LP-Record-Angle.jpg",
                                 width=listImageWidth)

                with colDetails:
                    st.header(row["AlbumName"])
                    st.subheader(f"🎤 {row['Artist']}")

                    tracklistData = row.get("Tracklist", "")
                    if tracklistData:
                        st.markdown("**Tracklist:**")
                        tracks = str(tracklistData).split(" | ")
                        for trackNum, trackName in enumerate(tracks, 1):
                            st.markdown(f"<div class='tracklist-text'>{trackNum}. {trackName}</div>",
                                        unsafe_allow_html=True)
                    else:
                        st.write("*No tracklist available.*")

                    st.write("---")

                    displayDuration = row.get("DurationMins", 0)
                    durationStr = f"⏱️ Total Duration: {displayDuration} mins" if displayDuration else "⏱️ Total Duration: Unknown"
                    st.write(f"**{durationStr}** | 📅 {row['Year']} | 🏷️ {row['Genre']}")

                    if st.button("I Listened to This", key=f"btnList_{row['ID']}"):
                        logListeningSession(row["AlbumName"], displayDuration if displayDuration else 45)
                        st.toast(f"Added {row['AlbumName']} to history!")

                st.write("---")

# TAB 2: ADD NEW VINYL
with tabAdd:
    st.header("Add New Vinyl")
    subTabApi, subTabManual = st.tabs(["Search via Discogs API", "Manual Entry"])

    with subTabApi:
        apiSearchInput = st.text_input("Search Artist or Album on Discogs", key="discogsSearch")

        if st.button("Search Database", key="btnSearchApi"):
            if apiSearchInput:
                with st.spinner("Searching Discogs..."):
                    st.session_state["apiResults"] = searchDiscogsApi(apiSearchInput)
            else:
                st.warning("Please enter a search term.")

        if "apiResults" in st.session_state and st.session_state["apiResults"]:
            st.markdown("### Select the Correct Release")

            resultOptions = [f"{item.get('title', 'Unknown Title')} ({item.get('year', 'Unknown Year')})" for item in
                             st.session_state["apiResults"]]

            selectedResult = st.selectbox("Matching Results", resultOptions)
            selectedIndex = resultOptions.index(selectedResult)
            selectedData = st.session_state["apiResults"][selectedIndex]

            releaseId = selectedData.get("id", selectedIndex)

            if f"details_{releaseId}" not in st.session_state:
                with st.spinner("Fetching album details and tracks..."):
                    st.session_state[f"details_{releaseId}"] = fetchReleaseDetails(releaseId)

            fetchedDuration, fetchedTracklist = st.session_state[f"details_{releaseId}"]

            if fetchedDuration == 0:
                st.info("Discogs does not have track durations for this release. You can enter it manually below.")

            st.write("---")
            st.markdown("### Preview and Edit Data")

            fullTitle = selectedData.get("title", "Unknown - Unknown")
            if " - " in fullTitle:
                parsedArtist, parsedAlbum = fullTitle.split(" - ", 1)
            else:
                parsedArtist = "Unknown Artist"
                parsedAlbum = fullTitle

            parsedYear = str(selectedData.get("year", "N/A"))
            parsedCover = selectedData.get("cover_image", "")
            parsedGenre = selectedData.get("genre", ["Unknown Genre"])[0] if selectedData.get(
                "genre") else "Unknown Genre"

            colCover, colEdit = st.columns([1, 2])
            with colCover:
                if parsedCover:
                    st.image(parsedCover, use_container_width=True)

            with colEdit:
                finalArtist = st.text_input("Artist", value=parsedArtist, key=f"apiArtist_{releaseId}")
                finalAlbum = st.text_input("Album Name", value=parsedAlbum, key=f"apiAlbum_{releaseId}")
                finalGenre = st.text_input("Genre", value=parsedGenre, key=f"apiGenre_{releaseId}")

                cYear, cDur = st.columns(2)
                with cYear:
                    finalYear = st.text_input("Year", value=parsedYear, key=f"apiYear_{releaseId}")
                with cDur:
                    finalDuration = st.number_input("Duration (Mins)", value=fetchedDuration, key=f"apiDur_{releaseId}")

                finalTracklist = st.text_area("Tracklist (Separated by |)", value=fetchedTracklist,
                                              key=f"apiTrack_{releaseId}")
                finalCondition = st.selectbox("Condition", ["New", "Used", "Mint", "Fair"],
                                              key=f"apiCondition_{releaseId}")

            if st.button("Save to Collection", type="primary", key=f"btnSaveApi_{releaseId}"):
                generatedId = int(time.time())

                # Dictionary structure for Supabase database insertion
                newVinylDict = {
                    "ID": generatedId,
                    "Artist": finalArtist,
                    "AlbumName": finalAlbum,
                    "Genre": finalGenre,
                    "Year": finalYear,
                    "CoverURL": parsedCover,
                    "Condition": finalCondition,
                    "DurationMins": finalDuration,
                    "Tracklist": finalTracklist
                }

                addNewVinyl(newVinylDict)
                st.success(f"Successfully added {finalAlbum}! Please use the Refresh button on the sidebar.")
                del st.session_state["apiResults"]
                st.rerun()

    with subTabManual:
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
            inputUrl = st.text_input("Cover Image URL", key="manUrl")
            inputStatus = st.selectbox("Condition", ["New", "Used", "Mint", "Fair"], key="manCondition")

        if st.button("Add Manually", use_container_width=True, key="btnSaveManual"):
            if inputArtist and inputAlbum:
                generatedId = int(time.time())

                newVinylDict = {
                    "ID": generatedId,
                    "Artist": inputArtist,
                    "AlbumName": inputAlbum,
                    "Genre": inputGenre,
                    "Year": inputYear,
                    "CoverURL": inputUrl,
                    "Condition": inputStatus,
                    "DurationMins": inputDuration,
                    "Tracklist": inputTracklist
                }

                addNewVinyl(newVinylDict)
                st.success(f"Successfully added {inputAlbum}! Please use the Refresh button on the sidebar.")
            else:
                st.warning("Please enter at least Artist and Album name.")

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
            logListeningSession(selectedFilterAlbum, int(albumDurationInfo))
            st.balloons()
            st.success("Session logged! Enjoy the music. Use Refresh button to update stats.")
    else:
        st.warning("Your collection is currently empty. Please add a vinyl first.")