import pandas as pd

from fakes import sampleTables
from vinyl.stats import (buildPlayTable, decadeOf, dustiestRecords, formatMinutes, isDuplicate, lastPlayedArtist,
                         listeningStreaks, pickCandidates, pickReason, ratingOf, toNumber)

inventory = pd.DataFrame(sampleTables["Inventory"])
history = pd.DataFrame(sampleTables["ListeningHistory"])
today = pd.Timestamp("2026-10-12")


def plays():
    return buildPlayTable(history, inventory, timezoneName="Europe/Istanbul")


def test_play_table_reads_both_date_formats_and_converts_to_local_time():
    table = plays()
    # "2026-09-01 18:00" is old naive UTC text; Istanbul is three hours ahead
    assert table.loc[0, "When"] == pd.Timestamp("2026-09-01 21:00")
    assert table.loc[1, "When"] == pd.Timestamp("2026-09-02 22:30")


def test_play_table_uses_the_records_current_name():
    renamed = inventory.assign(AlbumName=["Kind of Blue (Legacy)", "Discovery", "OK Computer"])
    table = buildPlayTable(history, renamed, timezoneName="UTC")
    assert table.loc[0, "Album"] == "Miles Davis - Kind of Blue (Legacy)"
    assert table.loc[0, "Artist"] == "Miles Davis"


def test_old_plays_without_a_record_id_link_by_unique_album_name():
    oldHistory = history.drop(columns=["VinylID"])
    table = buildPlayTable(oldHistory, inventory, timezoneName="UTC")
    assert list(table["VinylID"]) == [1700000001, 1700000001, 1700000002]


def test_streaks_count_consecutive_days_and_survive_until_the_next_day():
    days = pd.DataFrame({"When": pd.to_datetime(["2026-10-01 20:00", "2026-10-02 09:00", "2026-10-03 23:00",
                                                 "2026-10-10 18:00", "2026-10-11 18:00"])})
    assert listeningStreaks(days, today=today) == (2, 3)
    assert listeningStreaks(days, today=pd.Timestamp("2026-10-14")) == (0, 3)
    assert listeningStreaks(days.iloc[0:0], today=today) == (0, 0)


def test_dustiest_records_put_never_played_first():
    dusty = dustiestRecords(inventory, plays(), today=today)
    assert list(dusty["AlbumName"]) == ["OK Computer", "Kind of Blue", "Discovery"]
    assert pd.isna(dusty.iloc[0]["LastPlayed"])
    assert dusty.iloc[1]["DaysAgo"] == 40


def test_picker_skips_recent_plays_and_the_artist_to_avoid():
    pool = pickCandidates(inventory, plays(), today=today)
    assert "Discovery" not in set(pool["AlbumName"])  # played two days ago
    pool = pickCandidates(inventory, plays(), today=today, avoidArtists=["Radiohead"])
    assert list(pool["AlbumName"]) == ["Kind of Blue"]


def test_picker_filters_by_decade_rating_and_length():
    assert list(pickCandidates(inventory, plays(), today=today, decades=["1990s"])["AlbumName"]) == ["OK Computer"]
    assert list(pickCandidates(inventory, plays(), today=today, minRating=5)["AlbumName"]) == ["Kind of Blue"]
    assert pickCandidates(inventory, plays(), today=today, maxMinutes=30).empty


def test_picker_falls_back_to_recent_plays_when_nothing_else_is_left():
    pool = pickCandidates(inventory, plays(), today=today, genres=["Electronic"])
    assert list(pool["AlbumName"]) == ["Discovery"]


def test_higher_ratings_weigh_more():
    pool = pickCandidates(inventory, plays(), today=today).set_index("AlbumName")
    # Kind of Blue: 40 days ago and 5 stars. OK Computer: never played, no rating.
    assert pool.loc["Kind of Blue", "Weight"] == (40 + 7) * 1.6
    assert pool.loc["OK Computer", "Weight"] == (60 + 7) * 1.0


def test_last_played_artist():
    assert lastPlayedArtist(inventory, plays()) == "Daft Punk"


def test_pick_reason_mentions_age_and_good_ratings():
    row = pd.Series({"DaysAgo": 1, "Rating": 5})
    assert pickReason(row) == "Last played 1 day ago. You gave it 5 stars."
    assert pickReason(pd.Series({"DaysAgo": float("nan"), "Rating": None})) == \
        "You have not logged a play of this one yet."


def test_small_helpers():
    assert decadeOf("1997") == "1990s"
    assert decadeOf("") is None
    assert toNumber("43.0") == 43 and toNumber("4.5") == 4.5 and toNumber("x") is None
    assert ratingOf({"Rating": 6}) is None and ratingOf({"Rating": "4"}) == 4
    assert formatMinutes(125) == "2h 5m" and formatMinutes(45) == "45 mins"
    assert isDuplicate(" miles davis ", "KIND OF BLUE", inventory)
    assert not isDuplicate("Miles Davis", "Bitches Brew", inventory)
