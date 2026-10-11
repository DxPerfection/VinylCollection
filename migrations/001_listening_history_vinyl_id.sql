-- Link each listening session to the record it came from.
-- Run once in the Supabase SQL editor. Safe to run again.

alter table "ListeningHistory"
    add column if not exists "VinylID" bigint;

-- Backfill old sessions. Only album names that belong to exactly one record are linked;
-- ambiguous names stay empty rather than guessing wrong.
update "ListeningHistory" h
set "VinylID" = i."ID"
from "Inventory" i
where h."VinylID" is null
  and lower(trim(h."AlbumName")) = lower(trim(i."AlbumName"))
  and (select count(*)
       from "Inventory" i2
       where lower(trim(i2."AlbumName")) = lower(trim(h."AlbumName"))) = 1;

create index if not exists listeninghistory_vinylid_idx on "ListeningHistory" ("VinylID");
