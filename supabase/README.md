# Supabase functions

Server-side helpers for the phone app in `pwa/`. They hold keys that must not be in a web page.

- `functions/recordLookup/`: Discogs search, and the details of one Discogs release for adding it: artist, album,
  year, genre, styles, tracklist, label, catalogue number, format, country and minutes per side from Discogs, the
  cover and length from Spotify (Discogs when Spotify has nothing). Only the owner's signed-in account gets an
  answer (`is_vinyl_owner()`, from `migrations/003_owner_only.sql`). A search gives up after 8 seconds. Getting a
  whole album gives up after 15: Discogs gets 8 of them, and when Spotify runs out of time the record comes back
  with the Discogs cover and length instead.
  It also gives the lowest Discogs marketplace price and copies for sale for the want list; prices not checked
  within 15 seconds are left out and asked for again next time.

It needs three function secrets, set in Supabase under Edge Functions > Secrets: `DISCOGS_TOKEN`,
`SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` (the same values as the Streamlit app's `discogs_token`,
`spotify_client_id` and `spotify_client_secret`). Never commit them: this repository is public. `DISCOGS_CURRENCY`
is optional (prices are in EUR without it; use the Streamlit app's `discogs_currency` if it has one).
