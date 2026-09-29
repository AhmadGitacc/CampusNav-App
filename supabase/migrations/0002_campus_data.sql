-- Campus content: campuses + buildings.
-- Apply with:  supabase db push        (or paste into the SQL editor)
--
-- Campus content is public to read (guest access stays first-class) and
-- admin-only to write. `db:push` creates the tables; this file adds the
-- security policies Drizzle cannot express.

alter table public.campuses  enable row level security;
alter table public.buildings enable row level security;

create policy "campuses are public read" on public.campuses
  for select using (true);

create policy "buildings are public read" on public.buildings
  for select using (true);

-- Admin role lives in app_metadata, which only the Supabase Admin API can set.
-- Applied to content edits (Feature 10 admin CMS).
create policy "admins write campuses" on public.campuses
  for all
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "admins write buildings" on public.buildings
  for all
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
