# CSV backups and planning an add-only restore
import io
from collections import Counter

import pandas as pd

from vinyl.stats import isDuplicate, toNumber


def backupCsv(tableDf):
    # utf-8-sig lets Excel read accented names; convert_dtypes keeps IDs as whole numbers (no "12.0")
    return tableDf.convert_dtypes().to_csv(index=False).encode("utf-8-sig")


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
