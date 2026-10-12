# Keeping genre names consistent, so "Hip-Hop", "hip hop" and "Hip Hop " all count as one genre
import re

import pandas as pd

# Discogs' own genre names, plus Metal, offered even before a record of that genre exists
defaultGenres = ["Rock", "Metal", "Electronic", "Jazz", "Pop", "Hip Hop", "Classical", "Blues", "Funk / Soul",
                 "Reggae", "Latin", "Folk, World, & Country", "Stage & Screen"]


def genreKey(text):
    # Only letters and digits count: "Hip-Hop", "hip hop" and "Hip Hop " share the key "hiphop"
    return re.sub(r"[^0-9a-z]", "", str(text).lower())


def tidyGenre(text):
    # Trims the ends and squeezes repeated spaces
    return re.sub(r"\s+", " ", "" if text is None or pd.isna(text) else str(text)).strip()


def knownGenres(inventoryDf):
    # The genres in use, most records first, each under its most common spelling, then the defaults not yet used
    spellings = {}
    if not inventoryDf.empty and "Genre" in inventoryDf:
        for genre, count in inventoryDf["Genre"].map(tidyGenre).value_counts().items():
            if genre and genreKey(genre) not in spellings:
                spellings[genreKey(genre)] = genre
    for genre in defaultGenres:
        spellings.setdefault(genreKey(genre), genre)
    return list(spellings.values())


def canonicalGenre(text, known):
    # A typed genre that matches a known one is saved with the known spelling; anything else is just tidied
    tidy = tidyGenre(text)
    matches = {genreKey(genre): genre for genre in known}
    return matches.get(genreKey(tidy), tidy) if tidy else ""
