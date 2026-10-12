# Draws every section in both layouts with sample data and checks nothing breaks
from pathlib import Path

import pytest
import streamlit as st
from streamlit.testing.v1 import AppTest

from fakes import FakeSupabase, sampleTables

appFile = str(Path(__file__).resolve().parent.parent / "vinylApp.py")
sectionNames = ["collection", "play", "log", "wants", "add", "manage", "stats"]


def openApp(section, layout, supabase=None):
    st.cache_data.clear()  # fetchData is cached by table name, so one test's tables would leak into the next
    app = AppTest.from_file(appFile, default_timeout=30)
    app.session_state["supabase"] = supabase or FakeSupabase()
    app.session_state["section"] = section
    app.session_state["viewLayout"] = layout
    app.session_state["displayTz"] = "Europe/Istanbul"
    return app.run()


@pytest.mark.parametrize("layout", ["Web", "Phone"])
@pytest.mark.parametrize("section", sectionNames)
def test_every_section_draws(section, layout):
    app = openApp(section, layout)
    assert not app.exception, app.exception[0].value
    assert app.session_state["section"] == section


@pytest.mark.parametrize("section", sectionNames)
def test_every_section_draws_with_an_empty_collection(section):
    app = openApp(section, "Web", FakeSupabase({"Inventory": [], "ListeningHistory": [], "Wantlist": []}))
    assert not app.exception, app.exception[0].value


def test_dashboard_shows_the_listening_stats():
    app = openApp("stats", "Web")
    labels = " ".join(element.value for element in app.markdown)
    assert "Current streak" in labels and "Never played" in labels


def test_most_listened_albums_can_be_ranked_by_plays_or_minutes():
    app = openApp("stats", "Web")
    switch = app.button_group(key="topAlbumsBy")
    assert switch.value == "Plays"
    app = switch.set_value("Minutes").run()
    assert not app.exception and app.button_group(key="topAlbumsBy").value == "Minutes"


def test_want_list_shows_priority_and_note():
    app = openApp("wants", "Web")
    text = " ".join(element.value for element in app.markdown)
    assert "High priority" in text and "Record fair in Kadıköy" in text
    # The high priority record is listed first
    assert text.index("Geogaddi") < text.index("Pastel Blues")


def test_genre_pick_list_offers_genres_in_use():
    app = openApp("add", "Web")
    app = app.radio[0].set_value("✍️ Manual Entry").run()
    genres = app.selectbox(key="manGenre")
    assert genres.value == genres.options[0] == "Jazz"  # one record each, so the first one listed
    assert {"Rock", "Electronic", "Metal", "Other…"} <= set(genres.options)


def test_want_list_works_before_the_priority_migration():
    tables = dict(sampleTables, Wantlist=[{key: value for key, value in want.items() if key not in ("Priority", "Note")}
                                          for want in sampleTables["Wantlist"]])
    app = openApp("wants", "Phone", FakeSupabase(tables))
    assert not app.exception, app.exception[0].value
    assert any("004_wantlist_priority_and_note" in caption.value for caption in app.caption)
