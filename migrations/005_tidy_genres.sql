-- One-time genre cleanup: trims stray spaces (so "Metal " joins "Metal") and spells hip hop one way.
-- Run once in the Supabase SQL editor. Safe to run again.

update "Inventory" set "Genre" = regexp_replace(btrim("Genre"), '\s+', ' ', 'g')
    where "Genre" is distinct from regexp_replace(btrim("Genre"), '\s+', ' ', 'g');
update "Inventory" set "Genre" = 'Hip Hop' where lower("Genre") in ('hip-hop', 'hiphop', 'hip hop') and "Genre" <> 'Hip Hop';

update "Wantlist" set "Genre" = regexp_replace(btrim("Genre"), '\s+', ' ', 'g')
    where "Genre" is distinct from regexp_replace(btrim("Genre"), '\s+', ' ', 'g');
update "Wantlist" set "Genre" = 'Hip Hop' where lower("Genre") in ('hip-hop', 'hiphop', 'hip hop') and "Genre" <> 'Hip Hop';
