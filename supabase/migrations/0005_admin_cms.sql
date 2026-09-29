-- Admin CMS: corrections + audit log (Feature 10).
-- Apply with:  supabase db push        (or paste into the SQL editor)
--
-- `db:push` creates the tables; this file adds the security policies and the
-- audit trigger, which Drizzle cannot express.

-- ─── Soft delete (Feature 10) ─────────────────────────────────────────────────
-- Admin "unpublish" is a soft delete: the row stays so its entrances, path
-- edges and moderation history keep their foreign keys.
alter table public.buildings
  add column if not exists deleted_at timestamptz;

-- ─── Public corrections ───────────────────────────────────────────────────────

alter table public.corrections enable row level security;

-- A reporter may see their own submissions; the moderation queue is admin-only.
create policy "read own corrections" on public.corrections
  for select using (auth.uid() = user_id);

-- Guests report with no user_id, so a signed-out user contributes too. The
-- alternative — forcing a sign-in to fix a typo — defeats the point of a
-- contribution workflow in a guest-first app.
create policy "insert corrections" on public.corrections
  for insert with check (user_id is null or auth.uid() = user_id);

-- Nothing else: an update would let a reporter mark their own row approved.
create policy "admins read all corrections" on public.corrections
  for select using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "admins moderate corrections" on public.corrections
  for all
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- ─── Audit log ────────────────────────────────────────────────────────────────

alter table public.audit_log enable row level security;

-- Read-only for staff, and writable by staff. There is deliberately no update
-- or delete policy: an audit trail that can be rewritten is not one.
create policy "admins read audit log" on public.audit_log
  for select using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "admins write audit log" on public.audit_log
  for insert
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- ─── Audit trigger (belt and braces) ──────────────────────────────────────────
--
-- The trigger is the only writer to `audit_log`. lib/api/admin.ts deliberately
-- does not insert rows itself: two writers would double every entry, and the
-- trigger sees strictly more — an edit made from the SQL editor or a script is
-- captured too. `auth.uid()` is the JWT subject, so a change made outside a
-- request (a migration, a cron) is recorded with a null actor rather than a
-- forged one.
create or replace function public.trg_audit_buildings()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, action, entity, entity_id, diff)
    values (
      auth.uid(),
      'building.create',
      'buildings',
      new.id,
      jsonb_build_object('after', to_jsonb(new))
    );
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (actor_id, action, entity, entity_id, diff)
    values (
      auth.uid(),
      'building.delete',
      'buildings',
      old.id,
      jsonb_build_object('before', to_jsonb(old))
    );
  else
    insert into public.audit_log (actor_id, action, entity, entity_id, diff)
    values (
      auth.uid(),
      'building.update',
      'buildings',
      new.id,
      jsonb_build_object(
        'before', to_jsonb(old),
        'after', to_jsonb(new),
        -- Only the columns that actually moved: a diff of two full rows is
        -- unreadable in the dashboard and hides the one field that changed.
        'changed', (
          select coalesce(
            jsonb_object_agg(
              after_row.key,
              jsonb_build_object('before', before_row.value, 'after', after_row.value)
            ),
            '{}'::jsonb
          )
          from jsonb_each(to_jsonb(new)) as after_row(key, value)
          join jsonb_each(to_jsonb(old)) as before_row(key, value)
            on before_row.key = after_row.key
          where after_row.value is distinct from before_row.value
        )
      )
    );
  end if;
  -- Written out rather than `coalesce(new, old)`: coalesce needs a concrete
  -- type, and there is no `record` overload for it.
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit_buildings
  after insert or update or delete on public.buildings
  for each row execute function public.trg_audit_buildings();

-- Moderation decisions belong in the trail too, and they are not buildings
-- writes, so the trigger above cannot see them.
create or replace function public.trg_audit_corrections()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.audit_log (actor_id, action, entity, entity_id, diff)
    values (
      auth.uid(),
      'correction.' || new.status,
      'corrections',
      new.id,
      jsonb_build_object(
        'buildingId', new.building_id,
        'field', new.field,
        'newValue', new.new_value,
        'note', new.note,
        'reviewNote', new.review_note,
        'from', old.status,
        'to', new.status
      )
    );
  end if;
  return new;
end;
$$;

create trigger audit_corrections
  after update on public.corrections
  for each row execute function public.trg_audit_corrections();
