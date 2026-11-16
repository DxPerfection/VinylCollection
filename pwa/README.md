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
  lists them
- Sides A to D on the record card when a record's side lengths are saved
- The bottom tab bar; tabs that are not built yet link to the same section of the Streamlit app
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
