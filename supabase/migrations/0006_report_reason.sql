-- Report reasons + note-only reports (Feature 10 §7.6, public report modal).

-- Why the report was filed, in the reporter's words from a fixed list:
-- wrong_location, wrong_name, wrong_description, wrong_category, wrong_hours,
-- other. Cosmetic metadata for the moderation queue — approval still writes
-- through `field`, which remains the only column that decides what gets edited.
alter table public.corrections
  add column if not exists reason varchar(32);

-- `other` is a "something's wrong but I can't say what to change" note: it has
-- no column to write, so `field` can no longer be NOT NULL. Approving a
-- row with a null field only flips its status (handled in lib/api/corrections.ts).
alter table public.corrections
  alter column field drop not null;

-- The insert policy is table-level ("for all" with a USING/WHEN on user_id),
-- so guests can still file reasons without a new policy. The audit trigger in
-- 0005 is an AFTER UPDATE trigger over the row diff and is unaffected.
