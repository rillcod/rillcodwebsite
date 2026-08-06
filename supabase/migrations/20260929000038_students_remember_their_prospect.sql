-- Tie a student to the prospect they were created from, by id.
--
-- Onboarding matches a paid prospect to its student account on
-- `students.parent_email` + `students.full_name` — two mutable strings and no
-- stable key. Rename the child and the match breaks; the 15-minute drift-repair
-- cron then sees a paid, active prospect with no account, does exactly what it
-- is built to do, and mints a second account plus a welcome email to the parent.
--
-- That happened on 2026-08-06: a student was renamed at 18:42, a duplicate
-- account appeared at 18:45, a real parent was emailed, and three payment rows
-- (one a completed 30,000) were moved onto the duplicate, splitting a payment
-- from the invoice it settles.
--
-- It was never a one-off waiting to happen to one row: 99 prospects are active
-- or paid, and 52 students are joined to them by name alone. The code comment at
-- lib/summer-school/onboard.ts records an earlier version of the same failure,
-- where a stored trailing space broke the match and the cron minted a new
-- account every run.
--
-- A name is a label. The link needs an id.

alter table public.students
  add column if not exists prospect_id uuid
    references public.prospective_students(id) on delete set null;

comment on column public.students.prospect_id is
  'The prospective_students row this student was created from. Onboarding matches on this before falling back to parent_email + full_name, so renaming a child can no longer orphan them from their prospect and trigger a duplicate account.';

-- Backfill only where the existing name+email rule identifies exactly ONE
-- prospect. Anything ambiguous keeps a null and continues to use the old
-- fallback: a wrong link here would attach a child to another family's record,
-- which is far worse than no link at all.
with candidate as (
  -- array_agg, not min: Postgres has no min() for uuid. Only the single-match
  -- case is used below, so the first element is the only element.
  select s.id as student_id, (array_agg(p.id))[1] as prospect_id, count(*) as matches
    from public.students s
    join public.prospective_students p
      on p.is_deleted = false
     and lower(btrim(p.parent_email)) = lower(btrim(coalesce(s.parent_email, '')))
     and lower(btrim(p.full_name))    = lower(btrim(coalesce(s.full_name, '')))
   where coalesce(s.is_deleted, false) = false
     and coalesce(s.parent_email, '') <> ''
     and coalesce(s.full_name, '') <> ''
   group by s.id
)
update public.students s
   set prospect_id = c.prospect_id
  from candidate c
 where s.id = c.student_id
   and c.matches = 1
   and s.prospect_id is null;

-- One prospect produces one student. A second row pointing at the same prospect
-- IS the duplicate this migration exists to prevent, so the database refuses it
-- rather than leaving the cron free to create one.
create unique index if not exists uq_students_one_per_prospect
  on public.students (prospect_id)
  where prospect_id is not null and coalesce(is_deleted, false) = false;

create index if not exists idx_students_prospect_id
  on public.students (prospect_id)
  where prospect_id is not null;
