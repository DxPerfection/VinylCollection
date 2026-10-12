# Reading and writing the Supabase tables. Every call goes through the signed-in client for this visit.
import pandas as pd
import streamlit as st
from supabase import create_client, Client, ClientOptions

from vinyl.clock import localNow, toStoredTime
from vinyl.config import getSecretsData


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
