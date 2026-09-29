-- Walkable path graph + building entrances (Feature 5).
-- Apply with:  supabase db push        (or paste into the SQL editor)
--
-- Same posture as 0002: public to read so guest mode and the server-side A*
-- can both use the graph, admin-only to write so the survey stays authoritative.

alter table public.entrances  enable row level security;
alter table public.path_nodes enable row level security;
alter table public.path_edges enable row level security;

create policy "entrances are public read" on public.entrances
  for select using (true);

create policy "path_nodes are public read" on public.path_nodes
  for select using (true);

create policy "path_edges are public read" on public.path_edges
  for select using (true);

-- The graph is edited from the admin CMS (Feature 10) after a physical survey,
-- so writes are staff-only.
create policy "admins write entrances" on public.entrances
  for all
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "admins write path_nodes" on public.path_nodes
  for all
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "admins write path_edges" on public.path_edges
  for all
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Step-free preference (Feature 5). The app reads this for a signed-in user;
-- the unique constraint on id is already the primary key, so no index needed.
alter table public.profiles
  add column if not exists pref_step_free boolean not null default false;

-- RLS rows are only half the story: 0001 revokes UPDATE on profiles and grants
-- three columns back, so this one has to join that list or every mirror write in
-- lib/prefs.ts fails on the column privilege — silently, because the write is
-- fire-and-forget and AsyncStorage is the source of truth.
grant update (pref_step_free) on public.profiles to authenticated;
