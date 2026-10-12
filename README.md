# Vinyl Collection

A Streamlit app for tracking a vinyl collection and everything played on it, backed by Supabase.
Live at https://vinylcollection-beta.streamlit.app.

## How the code is laid out

- `vinylApp.py` is the entry point Streamlit runs. It signs you in, draws the sidebar and menu, and hands the open
  section to its module.
- `vinyl/` holds everything else:
  - `config.py` settings and secrets, `styles.py` the page styling
  - `auth.py` GitHub sign-in, `db.py` reading and writing Supabase, `apis.py` Discogs and Spotify
  - `clock.py` timezones, `stats.py` streaks, dusty records and the "What should I play" picker,
    `backup.py` CSV backup and restore planning, `ui.py` shared display helpers
  - `sections/` one module per section: collection, play, wants, add, log, manage, dashboard
- `migrations/` the SQL changes to run in Supabase, in order.
- `tests/` checks for the stats, picker, backup and restore, plus a test that draws every section with sample data.

## Running the tests

```
pip install -r requirements.txt pytest
python -m pytest tests
```

GitHub runs the same tests on every pull request.
