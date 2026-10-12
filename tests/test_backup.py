import io

import pandas as pd

from fakes import sampleTables
from vinyl.backup import backupCsv, planPlayRestore, planRecordRestore, readBackupCsv

inventory = pd.DataFrame(sampleTables["Inventory"])
history = pd.DataFrame(sampleTables["ListeningHistory"])


class Upload:
    def __init__(self, data):
        self.data = data

    def getvalue(self):
        return self.data


def roundTrip(table, requiredColumns, noun):
    fileDf, problem = readBackupCsv(Upload(backupCsv(table)), requiredColumns, noun)
    assert problem is None
    return fileDf


def test_restoring_a_fresh_backup_adds_nothing():
    records = roundTrip(inventory, ["ID", "Artist", "AlbumName"], "records")
    toAdd, skipped = planRecordRestore(records, inventory)
    assert toAdd == [] and skipped["have"] == 3

    playsFile = roundTrip(history, ["Date", "AlbumName"], "plays")
    toAdd, skipped = planPlayRestore(playsFile, history)
    assert toAdd == [] and skipped["have"] == 3


def test_restore_brings_back_only_what_is_missing():
    records = roundTrip(inventory, ["ID", "Artist", "AlbumName"], "records")
    toAdd, _ = planRecordRestore(records, inventory.iloc[1:])
    assert [row["ID"] for row in toAdd] == [1700000001]
    assert toAdd[0]["DurationMins"] == 46 and toAdd[0]["Rating"] == 5

    playsFile = roundTrip(history, ["Date", "AlbumName"], "plays")
    toAdd, _ = planPlayRestore(playsFile, history.iloc[:1])
    assert [row["AlbumName"] for row in toAdd] == ["Kind of Blue", "Discovery"]
    assert toAdd[1]["VinylID"] == 1700000002


def test_same_album_under_another_id_is_not_added_twice():
    records = roundTrip(inventory.assign(ID=inventory["ID"] + 1000), ["ID", "Artist", "AlbumName"], "records")
    toAdd, skipped = planRecordRestore(records, inventory)
    assert toAdd == [] and skipped["sameAlbum"] == 3


def test_a_file_that_is_not_a_backup_is_refused():
    fileDf, problem = readBackupCsv(Upload(b"Name,Price\nx,1\n"), ["ID", "Artist", "AlbumName"], "records")
    assert fileDf is None and "no ID or Artist or AlbumName column" in problem


def test_backup_keeps_ids_as_whole_numbers():
    text = backupCsv(inventory).decode("utf-8-sig")
    assert "1700000001," in text and "1700000001.0" not in text
    assert pd.read_csv(io.StringIO(text))["ID"].tolist() == inventory["ID"].tolist()
