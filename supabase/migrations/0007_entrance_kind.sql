-- Entrance kinds: entrance / exit / gate (admin entrance management).
--
-- The entrances table predates any admin UI — rows were written by survey
-- scripts. `kind` classifies each door so the dashboard can count them and the
-- entrance editor can label them; existing rows are all real doors, so they
-- default to 'entrance' rather than being left null.

alter table public.entrances
  add column if not exists kind varchar(16) not null default 'entrance';

-- Dropped first so the file can be re-run after `npm run db:push` (which adds
-- the column but not the CHECK) without tripping over an existing constraint.
alter table public.entrances
  drop constraint if exists entrances_kind_check;

alter table public.entrances
  add constraint entrances_kind_check
  check (kind in ('entrance', 'exit', 'gate'));

-- RLS already covers this table ("admins write entrances", 0003), and the
-- column grant model in 0001 was per-column for profiles only — nothing else
-- to update.
