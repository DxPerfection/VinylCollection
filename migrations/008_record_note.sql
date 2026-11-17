-- A short note on each record (where you bought it, how it sounds, anything else), typed on the record card in the
-- phone app. The new column starts empty; nothing already saved changes.
-- Run once in the Supabase SQL editor. Safe to run again. The table's "Owner only" rule (003) and its existing
-- grants already cover new columns.

alter table "Inventory"
    add column if not exists "Note" text;

-- To undo:
-- alter table "Inventory" drop column if exists "Note";
