-- Record info from Discogs for records added from now on: which Discogs release it is, the pressing details,
-- and how long each side plays. All new columns start empty; nothing already saved changes.
-- Run once in the Supabase SQL editor. Safe to run again. The table's "Owner only" rule (003) and its existing
-- grants already cover new columns.

alter table "Inventory"
    add column if not exists "DiscogsID" bigint,
    add column if not exists "Label" text,
    add column if not exists "CatalogNumber" text,
    add column if not exists "Format" text,        -- for example "Vinyl, LP, Album, Reissue, 180g"
    add column if not exists "Country" text,
    add column if not exists "SideMins" text;      -- minutes per side, for example "A:24|B:25" or "A:19|B:18|C:20|D:17"

-- To undo:
-- alter table "Inventory" drop column if exists "DiscogsID", drop column if exists "Label",
--     drop column if exists "CatalogNumber", drop column if exists "Format", drop column if exists "Country",
--     drop column if exists "SideMins";
