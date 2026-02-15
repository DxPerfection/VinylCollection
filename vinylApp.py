import streamlit as st
import pandas as pd
import gspread
from datetime import datetime
import time

# --- PAGE CONFIGURATION ---
st.set_page_config(page_title="Vinyl Collection", page_icon="🎵", layout="wide")

# --- MODERN UI WITH CSS ---
st.markdown("""
<style>
    .stApp {background-color: #0E1117;}

    /* Card Design */
    div.css-1r6slb0 {background-color: #262730; border: 1px solid #41444C; border-radius: 10px; padding: 15px;}

    /* Metric Boxes */
    div[data-testid="stMetricValue"] {color: #1DB954; font-size: 28px;}

    /* Buttons */
    .stButton>button {width: 100%; border-radius: 20px;}
</style>
""", unsafe_allow_html=True)


# --- GOOGLE SHEETS CONNECTION (MODERN & CLOUD READY) ---
def connectToSheets():

    if "gcp_service_account" in st.secrets:
        creds_dict = dict(st.secrets["gcp_service_account"])
        client = gspread.service_account_from_dict(creds_dict)
    else:
        client = gspread.service_account(filename='secrets.json')

    sheet = client.open("Vinyl Collection")
    return sheet


# --- DATA OPERATIONS (Functions) ---
def fetchData(worksheetName):
    try:
        sheet = connectToSheets()
        ws = sheet.worksheet(worksheetName)
        data = ws.get_all_records()
        df = pd.DataFrame(data)

        # --- DEFINE EMPTY COLUMN NAMES---
        if df.empty:
            if worksheetName == "Inventory":
                df = pd.DataFrame(columns=["ID", "Artist", "AlbumName", "Genre", "Year", "CoverURL", "Condition"])
            elif worksheetName == "ListeningHistory":
                df = pd.DataFrame(columns=["Date", "AlbumName", "DurationMins"])
        # --------------------------------------------------

        return df
    except Exception as e:
        st.error(f"Data could not be fetched: {e}")
        return pd.DataFrame()


def addNewVinyl(vinylDataList):
    sheet = connectToSheets()
    # Sheet Name: 'Inventory'
    ws = sheet.worksheet("Inventory")
    ws.append_row(vinylDataList)


def logListeningSession(albumName, durationMinutes):
    sheet = connectToSheets()
    # Sheet Name: 'ListeningHistory'
    ws = sheet.worksheet("ListeningHistory")
    currentDate = datetime.now().strftime("%Y-%m-%d %H:%M")
    ws.append_row([currentDate, albumName, durationMinutes])


# --- USER INTERFACE (UI) ---
st.title("🎵 Vinyl Collection")

# Fetch Main Data from 'Inventory' tab
vinylData = fetchData("Inventory")

# --- HATA AYIKLAMA KODU (DEBUG) ---
# st.write("Google Sheets'ten gelen sütunlar:")
# st.write(vinylData.columns.tolist())

# --- TOP PANEL (METRICS) ---
if not vinylData.empty:
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Vinyls", len(vinylData))

    # Column Name: 'Genre'
    col2.metric("Favorite Genre", vinylData['Genre'].mode()[0] if not vinylData.empty else "-")

    # Calculate listening history
    try:
        # Sheet Name: 'ListeningHistory'
        historyData = fetchData("ListeningHistory")
        if not historyData.empty:
            # Column Name: 'DurationMins'
            totalMinutes = historyData["DurationMins"].sum()
            totalHours = totalMinutes // 60
            col3.metric("Total Listening Time", f"{totalHours} Hours")
    except:
        col3.metric("Total Listening Time", "0 Hours")

st.divider()

# --- TABS (Updated to English) ---
tabGallery, tabAdd, tabLog = st.tabs(["💿 Collection (Gallery)", "➕ Add New", "🎧 Listening Log"])

# TAB 1: GALLERY VIEW
with tabGallery:
    with st.expander("🔍 Filter Options", expanded=False):
        c1, c2 = st.columns(2)
        # Column Name: 'Genre'
        selectedGenres = c1.multiselect("Select Genre", vinylData["Genre"].unique())
        searchQuery = c2.text_input("Search Album or Artist")

    # Filtering Logic
    filteredData = vinylData.copy()
    if selectedGenres:
        filteredData = filteredData[filteredData["Genre"].isin(selectedGenres)]
    if searchQuery:
        # Column Names: 'AlbumName', 'Artist'
        filteredData = filteredData[
            filteredData["AlbumName"].str.contains(searchQuery, case=False) |
            filteredData["Artist"].str.contains(searchQuery, case=False)
            ]

    # Grid Structure
    colsPerRow = 3
    if not filteredData.empty:
        gridRows = [st.columns(colsPerRow) for _ in range((len(filteredData) // colsPerRow) + 1)]

        for index, (idx, row) in enumerate(filteredData.iterrows()):
            rowIndex = index // colsPerRow
            colIndex = index % colsPerRow

            with gridRows[rowIndex][colIndex]:
                st.markdown("---")
                # Column Name: 'CoverURL'
                coverUrl = row["CoverURL"]
                if coverUrl and str(coverUrl).startswith("http"):
                    st.image(coverUrl, use_container_width=True)
                else:
                    st.image("https://upload.wikimedia.org/wikipedia/commons/b/b6/12in-Vinyl-LP-Record-Angle.jpg",
                             use_container_width=True)

                # Display Data
                st.subheader(row["AlbumName"])
                st.caption(f"🎤 {row['Artist']}")
                st.write(f"📅 {row['Year']} | 🏷️ {row['Genre']}")

                if st.button("I Listened to This", key=f"btn_{idx}"):
                    logListeningSession(row["AlbumName"], 45)
                    st.toast(f"Added {row['AlbumName']} to history!")

# TAB 2: ADD NEW VINYL
with tabAdd:
    st.header("Add New Vinyl")
    colA, colB = st.columns(2)

    with colA:
        inputArtist = st.text_input("Artist Name")
        inputAlbum = st.text_input("Album Name")
        inputYear = st.text_input("Year")

    with colB:
        inputGenre = st.selectbox("Genre", ["Rock", "Jazz", "Pop", "Electronic", "Classical", "Hip-Hop", "Metal"])
        inputUrl = st.text_input("Cover Image URL")
        inputStatus = st.selectbox("Condition", ["New", "Used", "Mint", "Fair"])

    if st.button("Add to Collection", use_container_width=True):
        if inputArtist and inputAlbum:
            generatedId = int(time.time())
            # Columns: ID, Artist, AlbumName, Genre, Year, CoverURL, Condition
            newVinylList = [generatedId, inputArtist, inputAlbum, inputGenre, inputYear, inputUrl, inputStatus]
            addNewVinyl(newVinylList)
            st.success(f"Successfully added {inputAlbum}! Refresh to see changes.")
        else:
            st.warning("Please enter at least Artist and Album name.")

# TAB 3: LOG LISTENING SESSION
with tabLog:
    st.header("Manual Listening Entry")
    # Column Name: 'AlbumName'
    selectedAlbum = st.selectbox("Select Album", vinylData["AlbumName"].unique())
    durationSlider = st.slider("Duration (Minutes)", 10, 180, 45)

    if st.button("Log Session"):
        logListeningSession(selectedAlbum, durationSlider)
        st.balloons()
        st.success("Session logged! Enjoy the music.")