import streamlit as st
import pandas as pd
import requests
import time
from datetime import datetime
import json
import base64
from supabase import create_client, Client
import re

# --- NEW IMPORTS FOR BARCODE SCANNER ---
try:
    from PIL import Image
    from pyzbar.pyzbar import decode
except ImportError:
    pass  # Handled in requirements.txt

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


# --- SPOTIFY API (FOR HD COVERS & EXACT DURATION) ---
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


# --- DISCOGS API (UPDATED FOR BARCODE SEARCH) ---
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


# --- SUPABASE DATABASE CONNECTIONS ---
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
                df = pd.DataFrame(columns=["id", "Date", "AlbumName", "DurationMins"])
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


def logListeningSession(albumName, durationMinutes):
    supabase = initSupabase()
    currentDate = datetime.now().strftime("%Y-%m-%d %H:%M")
    dataDict = {"Date": currentDate, "AlbumName": albumName, "DurationMins": durationMinutes}
    supabase.table("ListeningHistory").insert(dataDict).execute()


# --- HELPER FUNCTION: DUPLICATE CHECK ---
def isDuplicate(artistName, albumName, existingDataDf):
    """
    Checks if the album by the specific artist already exists in the collection.
    Case-insensitive comparison.
    """
    if existingDataDf.empty:
        return False

    # Convert inputs and dataframe columns to lower case and strip whitespace
    targetArtist = str(artistName).strip().lower()
    targetAlbum = str(albumName).strip().lower()

    match = existingDataDf[
        (existingDataDf['Artist'].astype(str).str.strip().str.lower() == targetArtist) &
        (existingDataDf['AlbumName'].astype(str).str.strip().str.lower() == targetAlbum)
        ]

    return not match.empty


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
            remainingMinutes = int(totalMinutes % 60)

            if totalHours > 0:
                displayTime = f"{totalHours}h {remainingMinutes}m"
            else:
                displayTime = f"{remainingMinutes} Mins"

            col3.metric("Total Listening Time", displayTime)
        else:
            col3.metric("Total Listening Time", "0 Mins")
    except:
        col3.metric("Total Listening Time", "0 Mins")

st.divider()

# --- TABS ---
tabGallery, tabAdd, tabLog, tabManage = st.tabs(
    ["💿 Collection", "➕ Add New", "🎧 Listening Log", "⚙️ Manage Collection"])

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

                    subGenreStr = f" ({row.get('SubGenre', '')})" if pd.notna(row.get('SubGenre')) and row.get(
                        'SubGenre') else ""

                    st.write(f"📅 {row['Year']} | 🏷️ {row['Genre']}{subGenreStr}{durationStr}")

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

                    subGenreStr = f" ({row.get('SubGenre', '')})" if pd.notna(row.get('SubGenre')) and row.get(
                        'SubGenre') else ""

                    st.write(f"**{durationStr}** | 📅 {row['Year']} | 🏷️ {row['Genre']}{subGenreStr}")

                    if st.button("I Listened to This", key=f"btnList_{row['ID']}"):
                        logListeningSession(row["AlbumName"], displayDuration if displayDuration else 45)
                        st.toast(f"Added {row['AlbumName']} to history!")

                st.write("---")

# TAB 2: ADD NEW VINYL (UPDATED UI & DUPLICATE CHECK)
with tabAdd:
    st.header("Add New Vinyl")

    # 1. Clean UI: Radio buttons instead of sub-tabs. Default is Text Search.
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
        st.info("Take a clear picture of the barcode on the back of your vinyl. Ensure good lighting.")
        barcodeImg = st.camera_input("Scan Barcode", key="barcodeCam")

        if barcodeImg is not None:
            with st.spinner("Analyzing image..."):
                try:
                    imgToDecode = Image.open(barcodeImg)
                    decodedObjects = decode(imgToDecode)

                    if decodedObjects:
                        scannedBarcode = decodedObjects[0].data.decode('utf-8')
                        st.success(f"Barcode Detected: **{scannedBarcode}**")

                        with st.spinner("Searching Discogs for barcode..."):
                            st.session_state["apiResults"] = searchDiscogsApi(barcodeQuery=scannedBarcode)
                    else:
                        st.error("No barcode detected. Please try again with a clearer angle or better lighting.")
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
                # Duplicate Check for Manual Entry
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
                    st.success(f"Successfully added {inputAlbum}! Please use the Refresh button.")
            else:
                st.warning("Please enter at least Artist and Album name.")

    # 2. Display API Results (Applies to both Text and Barcode search)
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
                    # Duplicate Check for API Entry
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
                        st.success(f"Successfully added {finalAlbum}! Please use the Refresh button.")
                        del st.session_state["apiResults"]
                        st.rerun()

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

# TAB 4: MANAGE COLLECTION (EDIT/DELETE)
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
                coverUrlMng = targetRow.get("CoverURL", "")
                if coverUrlMng and str(coverUrlMng).startswith("http"):
                    st.image(coverUrlMng, use_container_width=True)
                else:
                    st.image("https://upload.wikimedia.org/wikipedia/commons/b/b6/12in-Vinyl-LP-Record-Angle.jpg",
                             use_container_width=True)

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
                        updateVinyl(selectedId, updatedDataDict)
                        st.success("Record updated successfully! Please refresh.")

                with colBtnDelete:
                    if st.button("🗑️ Delete Record", use_container_width=True):
                        deleteVinyl(selectedId)
                        st.error(f"{updAlbum} has been deleted! Please refresh.")
    else:
        st.info("Your collection is currently empty.")