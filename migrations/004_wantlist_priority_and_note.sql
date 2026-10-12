-- Want list extras: a priority (1 high, 2 medium, 3 low) and a note on where you saw the record.
-- Run once in the Supabase SQL editor. Safe to run again. The table's "Owner only" rule (003) already covers
-- the new columns.

alter table "Wantlist"
    add column if not exists "Priority" smallint not null default 2 check ("Priority" between 1 and 3),
    add column if not exists "Note" text;
