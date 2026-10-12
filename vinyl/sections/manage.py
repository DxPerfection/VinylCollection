# Manage: edit or delete a record, download backups and restore from one
import re

import pandas as pd
import streamlit as st

from vinyl.backup import backupCsv, planPlayRestore, planRecordRestore, readBackupCsv
from vinyl.clock import localNow
from vinyl.db import deleteVinyl, fetchData, insertInChunks, linkPastPlays, migrationHint, updateVinyl
from vinyl.stats import ratingOf
from vinyl.genres import knownGenres
from vinyl.ui import coverHtml, genrePicker, isPhone, saveAndRefresh


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


def render(app):
    vinylData, historyData, wantData = app.vinylData, app.historyData, app.wantData
    ratingsOn, phone = app.ratingsOn, isPhone()

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
                    updGenre = genrePicker("Genre", targetRow.get("Genre", ""), knownGenres(vinylData),
                                           f"updGen_{selectedId}")
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
