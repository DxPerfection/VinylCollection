# A stand-in for the Supabase client, so the app can be drawn in tests without a database or a sign-in
from types import SimpleNamespace

ownerIdentity = SimpleNamespace(provider="github", id="26037275",
                                identity_data={"user_name": "DxPerfection", "provider_id": "26037275"})

sampleTables = {
    "Inventory": [
        {"ID": 1700000001, "Artist": "Miles Davis", "AlbumName": "Kind of Blue", "Genre": "Jazz", "SubGenre": "Modal",
         "Year": "1959", "CoverURL": "", "Condition": "Used", "DurationMins": 46, "Tracklist": "So What | Blue in Green",
         "Rating": 5},
        {"ID": 1700000002, "Artist": "Daft Punk", "AlbumName": "Discovery", "Genre": "Electronic", "SubGenre": "House",
         "Year": "2001", "CoverURL": "", "Condition": "New", "DurationMins": 61, "Tracklist": "One More Time",
         "Rating": 4},
        {"ID": 1700000003, "Artist": "Radiohead", "AlbumName": "OK Computer", "Genre": "Rock", "SubGenre": "",
         "Year": "1997", "CoverURL": "", "Condition": "Mint", "DurationMins": 53, "Tracklist": "", "Rating": None},
    ],
    "ListeningHistory": [
        {"id": 1, "Date": "2026-09-01 18:00", "AlbumName": "Kind of Blue", "DurationMins": 46, "VinylID": 1700000001},
        {"id": 2, "Date": "2026-09-02T19:30:00+00:00", "AlbumName": "Kind of Blue", "DurationMins": 23,
         "VinylID": 1700000001},
        {"id": 3, "Date": "2026-10-10T20:00:00+00:00", "AlbumName": "Discovery", "DurationMins": 61,
         "VinylID": 1700000002},
    ],
    "Wantlist": [
        {"id": 1, "Artist": "Nina Simone", "AlbumName": "Pastel Blues", "Year": "1965", "Genre": "Jazz", "CoverURL": "",
         "DiscogsID": None, "AddedAt": "2026-10-01T10:00:00+00:00"},
    ],
}


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *args):
        return self

    def order(self, *args, **kwargs):
        return self

    def range(self, start, end):
        return FakeQuery(self.rows[start:end + 1])

    def execute(self):
        return SimpleNamespace(data=self.rows)


class FakeAuth:
    def get_session(self):
        return SimpleNamespace(user=SimpleNamespace(identities=[ownerIdentity]), access_token="a", refresh_token="r")


class FakeSupabase:
    def __init__(self, tables=None):
        self.tables = tables if tables is not None else sampleTables
        self.auth = FakeAuth()

    def table(self, name):
        return FakeQuery(list(self.tables.get(name, [])))
