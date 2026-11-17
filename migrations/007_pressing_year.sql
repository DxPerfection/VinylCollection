-- The year your pressing came out, from its Discogs release, filled in when you add a record from Discogs or
-- use "Match on Discogs". "Year" stays the album's own year, which the decade stats use. The new column starts
-- empty; nothing already saved changes.
-- Run once in the Supabase SQL editor. Safe to run again. The table's "Owner only" rule (003) and its existing
-- grants already cover new columns.

alter table "Inventory"
    add column if not exists "PressingYear" text;

-- To undo:
-- alter table "Inventory" drop column if exists "PressingYear";
