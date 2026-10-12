# Add New: Discogs search, barcode photo or manual entry
import time

import streamlit as st

from vinyl.apis import fetchReleaseDetails, fetchSpotifyData, searchDiscogsApi
from vinyl.db import addNewVinyl, addWant, migrationHint
from vinyl.stats import isDuplicate
from vinyl.ui import saveAndRefresh

try:
    from PIL import Image
    from pyzbar.pyzbar import decode
except ImportError:
    pass


def render(app):
    vinylData, wantData = app.vinylData, app.wantData

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
