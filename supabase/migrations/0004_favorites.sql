-- Favorites (Feature 7).
-- Apply with:  supabase db push        (or paste into the SQL editor)
--
-- `db:push` creates the table; this file adds the security policies Drizzle
-- cannot express. RLS enforces that a user can only touch their own rows —
-- `user_id` is compared to the caller's JWT, never trusted from the payload.

alter table public.favorites enable row level security;

create policy "own favorites" on public.favorites
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);