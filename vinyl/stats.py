# Pure data work on the records and plays tables: linking plays to records, streaks, dusty records and the picker.
# Nothing here touches Streamlit widgets or the database, so it can be tested on its own.
import math

import pandas as pd

from vinyl.clock import displayTimezone, localNow


def toNumber(text):
    # "43" or "43.0" -> 43; empty or not a number -> None
    try:
        number = float(text)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return int(number) if number.is_integer() else number


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


def formatMinutes(totalMinutes):
    hours, minutes = int(totalMinutes // 60), int(totalMinutes % 60)
    return f"{hours}h {minutes}m" if hours > 0 else f"{minutes} mins"


def formatDays(dayCount):
    return f"{dayCount} day" if dayCount == 1 else f"{dayCount} days"


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


def buildPlayTable(historyDf, inventoryDf, timezoneName=None):
    # One row per play with its record's current "Artist - Album" label, minutes and timestamp.
    if historyDf.empty:
        return historyDf

    playsDf = linkHistoryToVinyls(historyDf, inventoryDf)
    playsDf["DurationMins"] = pd.to_numeric(playsDf["DurationMins"], errors="coerce").fillna(0)
    # Stored times are UTC. Older plays are "YYYY-MM-DD HH:MM" text written on a UTC server; newer ones are ISO
    # timestamps. Both are shown on the wall clock of the chosen timezone.
    playsDf["When"] = (pd.to_datetime(playsDf["Date"], errors="coerce", format="mixed", utc=True)
                       .dt.tz_convert(timezoneName or displayTimezone()).dt.tz_localize(None))

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


def ratingOf(row):
    # 1 to 5 stars, or None when the record has no rating or ratings are not set up yet
    rating = toNumber(row.get("Rating"))
    return rating if rating in range(1, 6) else None


def decadeOf(year):
    # 1997 -> "1990s"; None when the year is missing or not a number
    year = pd.to_numeric(year, errors="coerce")
    return f"{int(year // 10 * 10)}s" if pd.notna(year) and year > 0 else None


def lastPlayedArtist(inventoryDf, playsDf):
    # Artist of the most recently logged play that is linked to a record, or None
    if playsDf.empty or inventoryDf.empty:
        return None
    linked = playsDf.dropna(subset=["VinylID", "When"])
    if linked.empty:
        return None
    lastId = int(linked.loc[linked["When"].idxmax(), "VinylID"])
    match = inventoryDf[inventoryDf["ID"].astype("int64") == lastId]
    return str(match.iloc[0]["Artist"]) if not match.empty else None


def pickCandidates(inventoryDf, playsDf, genres=None, maxMinutes=None, today=None, decades=None, minRating=None,
                   avoidArtists=None):
    # Records worth playing next, each with a weight: the longer a record has waited the likelier it comes up,
    # never-played ones most of all, and higher ratings tip the scale. Records played in the last 3 days, and
    # records by the artists in avoidArtists (the one you just played or skipped), sit out unless nothing else is left.
    dusty = dustiestRecords(inventoryDf, playsDf, today)[["ID", "LastPlayed", "DaysAgo"]]
    pool = inventoryDf.merge(dusty, on="ID")
    if genres:
        pool = pool[pool["Genre"].isin(genres)]
    if maxMinutes:
        minutes = pd.to_numeric(pool["DurationMins"], errors="coerce")
        pool = pool[minutes.isna() | (minutes <= 0) | (minutes <= maxMinutes)]
    if decades:
        pool = pool[pool["Year"].map(decadeOf).isin(decades)] if "Year" in pool else pool.iloc[0:0]
    if minRating:
        pool = pool[[(ratingOf(row) or 0) >= minRating for _, row in pool.iterrows()]]
    rested = pool[pool["DaysAgo"].isna() | (pool["DaysAgo"] >= 3)]
    if not rested.empty:
        pool = rested
    if avoidArtists:
        avoid = {str(artist).strip().lower() for artist in avoidArtists if artist}
        varied = pool[~pool["Artist"].astype(str).str.strip().str.lower().isin(avoid)]
        if not varied.empty:
            pool = varied
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
