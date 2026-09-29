-- Auth + profiles bootstrap for Supabase.
-- Apply with:  supabase db push        (or paste into the SQL editor)
--
-- This file is the SQL that Drizzle cannot express: the auth.users foreign key,
-- the signup trigger, and row level security.

-- ─── profiles is 1:1 with an auth user ────────────────────────────────────────
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

-- Auto-create a profile on signup so the client never has to.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Row level security: deny by default ─────────────────────────────────────
alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Admin reads/edits every profile. The role lives in app_metadata, which only
-- the Supabase Admin API can set — clients cannot forge it.
create policy "admins read all profiles" on public.profiles
  for select using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "admins write all profiles" on public.profiles
  for all
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- RLS is row-level, so block privilege escalation with column privileges:
-- a signed-in user may edit their own display name and saved home, never role.
revoke update on public.profiles from authenticated;
grant update (display_name, home_lat, home_lng) on public.profiles to authenticated;
