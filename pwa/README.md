# Vinyl (phone app)

The new installable version of the vinyl app, built step by step next to the Streamlit app, which stays live until
this one covers everything. It reads the same Supabase tables, behind the same GitHub sign-in and owner-only rules.

## What is here so far

- GitHub sign-in (only the owner's account gets in) that stays signed in after closing the app
- Collection: cover grid, search, genre chips, sort, and a card per record with plays, last played and the tracklist
- Logging a play from the record card: Full album or a side (its saved length, else half the album), just now or
  earlier, with Undo
- Plays: recent plays grouped by day, each with delete (and Undo)
- Adding records (the + button): Discogs search as you type, then Add (check and change the filled-in details) or
  Want. Discogs gives the artist, album, year, genre, styles, tracklist and record info (label, catalogue number,
  format, country, side lengths); Spotify gives the cover and length. The keys live in the `recordLookup` Supabase
  function (see `../supabase/README.md`), never in this app.
- Match on Discogs: saves the record info for records added before, picked by you; a "No Discogs info yet" chip
  lists them. After matching a record that had no Discogs info, the next one without it opens straight away (Skip
  moves on, closing the sheet stops)
- A Pressing block on the record card: label, catalogue number, format, country and the pressing's own year
  (`PressingYear`, migration 007; `Year` stays the album's year)
- A note box on the record card (`Note`, migration 008): Save and Cancel appear once you change it; the Collection
  search also finds words in notes, and notes are in CSV backups and restore
- Sides A to D on the record card when a record's side lengths are saved
- What should I play (Play tab): one record picked with the Streamlit app's rules (long-unplayed and higher-rated
  records come up more, nothing played in the last 3 days, not the same artist twice), filters for time, genre,
  decade and rating, "Play it" logs the whole album, "Another one" picks again
- Manage, from the record card: tap the stars to rate, "Edit or delete" to change any detail or delete (with Undo)
- Want list (Wants tab): highest priority first, the lowest Discogs price and copies for sale (from the
  `recordLookup` function, kept for six hours), priority and "where you saw it" note, Got it (opens the Add sheet for
  that release, then takes it off the list, with Undo) and Remove (with Undo)
- Stats: streaks, days listened, never played, most listened albums (plays or minutes), hours per week, top
  artists, plays by weekday, year in review, gathering dust, genres, decades and condition, as in the Streamlit Dashboard
- Collection value at the top of Stats: the cheapest copy for sale on Discogs of each matched record, added up, with
  how many records are counted and why the rest aren't (not matched, none for sale, not checked yet), the three most
  valuable, and a button that matches unmatched records one after another. Prices are kept on the phone for a day
  and asked for at most 25 at a time, 30 seconds apart, to stay inside Discogs' rate limit
- Account: download CSV backups of records, plays and want list, in the same format the Streamlit Restore reads,
  and restore from one (add-only: rows the app already has are left alone, nothing is changed or deleted)
- Add by hand: "Not on Discogs? Add it by hand" on the Add screen, the same form without a Discogs release
- Offline: the last records, plays and want list are kept on the phone (`src/lib/offline.ts`), covers and fonts by
  the service worker, so the app opens without a signal. Plays logged offline wait on the phone and are sent when it
  can reach Supabase again (never twice). A bar above the tab bar says when it is showing the kept copy.
- The bottom tab bar
- Installing to the home screen (app manifest, icons and a service worker)

## How the code is laid out

- `src/app.tsx` sign-in gate, tab bar and which screen is open
- `src/lib/` everything that is not drawing: Supabase client, sign-in, loading rows, linking plays to records,
  search and sort, formatting
- `src/screens/` one file per screen, `src/components/` shared pieces such as the record card and bottom sheets
- `tests/` Vitest tests, run on every pull request by `.github/workflows/tests.yml`

## Running it on your own computer

```
cd pwa
cp .env.example .env.local   # then fill in the Supabase address and publishable key
npm install
npm run dev                  # opens on http://localhost:5173
npm test
```

Sign-in needs `http://localhost:5173/**` in Supabase under Authentication > URL Configuration > Redirect URLs.

## Hosting

Cloudflare Pages builds this folder on every push: root directory `pwa`, build command `npm run build`, output
directory `dist` (Node 22, pinned in `.node-version`), and the two variables from `.env.example` under Settings > Variables and Secrets. Never commit real
values: the repository is public. The publishable key is fine in the built page because Row Level Security only
answers the owner's account.
