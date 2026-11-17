-- Want list suggestions you said "Not for me" to, so that artist is never suggested again (phone app, Wants tab).
-- Owner only, like the other tables (003). Created with grants for signed-in use only, never anon (Supabase change
-- from 2026-10-30). Run once in the Supabase SQL editor. Safe to run again.

create table if not exists "DismissedSuggestions" (
    id bigint generated always as identity primary key,
    "Artist" text not null,
    "AlbumName" text,
    "DismissedAt" timestamptz not null default now()
);

alter table "DismissedSuggestions" enable row level security;

drop policy if exists "Owner only" on "DismissedSuggestions";
create policy "Owner only" on "DismissedSuggestions" for all to authenticated
    using ((select public.is_vinyl_owner())) with check ((select public.is_vinyl_owner()));

grant select, insert, update, delete on "DismissedSuggestions" to authenticated, service_role;

-- To undo:
-- drop table if exists "DismissedSuggestions";
