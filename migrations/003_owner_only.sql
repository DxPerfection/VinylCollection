-- Turns on Row Level Security so only your GitHub account (signed in through the app) can read or change
-- the collection, listening history and want list. Anyone holding just the Supabase key gets nothing.
-- Run once in the Supabase SQL editor, AFTER the sign-in version of the app is live and you have signed in once.
-- Safe to run again.

-- True when the request comes from someone signed in with the GitHub account whose numeric id is below
-- (26037275 = DxPerfection). GitHub's id stays the same even if the username changes.
create or replace function public.is_vinyl_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from auth.identities
        where user_id = auth.uid() and provider = 'github' and provider_id = '26037275'
    );
$$;

revoke execute on function public.is_vinyl_owner() from public, anon;
grant execute on function public.is_vinyl_owner() to authenticated;

alter table "Inventory" enable row level security;
alter table "ListeningHistory" enable row level security;
alter table "Wantlist" enable row level security;

drop policy if exists "Owner only" on "Inventory";
create policy "Owner only" on "Inventory" for all to authenticated
    using ((select public.is_vinyl_owner())) with check ((select public.is_vinyl_owner()));

drop policy if exists "Owner only" on "ListeningHistory";
create policy "Owner only" on "ListeningHistory" for all to authenticated
    using ((select public.is_vinyl_owner())) with check ((select public.is_vinyl_owner()));

drop policy if exists "Owner only" on "Wantlist";
create policy "Owner only" on "Wantlist" for all to authenticated
    using ((select public.is_vinyl_owner())) with check ((select public.is_vinyl_owner()));

-- To undo (the app keeps working, just without the database lock):
-- alter table "Inventory" disable row level security;
-- alter table "ListeningHistory" disable row level security;
-- alter table "Wantlist" disable row level security;
