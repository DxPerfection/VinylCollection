import pandas as pd

from vinyl.genres import canonicalGenre, genreKey, knownGenres, tidyGenre


def test_spelling_differences_share_one_key():
    assert genreKey("Hip-Hop") == genreKey("hip hop") == genreKey(" Hip Hop ") == "hiphop"


def test_tidy_trims_and_squeezes_spaces():
    assert tidyGenre("  Metal  ") == "Metal"
    assert tidyGenre("Folk,  World, & Country") == "Folk, World, & Country"
    assert tidyGenre(None) == ""


def test_known_genres_put_the_most_used_first_under_their_usual_spelling():
    inventory = pd.DataFrame({"Genre": ["Rock", "Metal", "Metal ", "Metal", "Hip Hop", "Rock", "Rock"]})
    known = knownGenres(inventory)
    assert known[:3] == ["Rock", "Metal", "Hip Hop"]
    assert known.count("Metal") == 1 and "Metal " not in known
    assert "Jazz" in known  # the defaults are offered too


def test_a_typed_genre_takes_the_known_spelling():
    known = ["Rock", "Hip Hop", "Folk, World, & Country"]
    assert canonicalGenre("hip-hop", known) == "Hip Hop"
    assert canonicalGenre(" rock ", known) == "Rock"
    assert canonicalGenre("Shoegaze ", known) == "Shoegaze"
    assert canonicalGenre("", known) == ""
