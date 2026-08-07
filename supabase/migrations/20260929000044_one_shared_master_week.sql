-- One shared row of truth per curriculum week.
--
-- 20260929000041..43 made a week generated once and copied to every class that
-- adopted the release. That removed the cost — 26 AI calls became one — but not
-- the drift. The 26 rows are independent from the moment they are written, so
-- correcting a typo in the master corrects it for nobody. The teaching is one
-- thing; it was stored as twenty-six.
--
-- The alternative considered was a genuinely shared row that every class reads.
-- src/lib/academic/shared-content-visibility.ts was written for exactly that and
-- states the cost plainly: a shared row carries no class_id, so visibility stops
-- being readable off the row and has to be resolved instead. Ninety-one places
-- in this codebase read these tables by class_id or lesson_plan_id. Every one of
-- them would have to resolve visibility correctly, and the failure mode of
-- getting one wrong is a learner in one school seeing another school's work.
--
-- So the row is shared where sharing is safe and stays per-class where it is
-- not:
--
--   The BODY is shared. One master holds the teaching, and every class row
--   mirrors it. Fix the master and the fix reaches all of them.
--
--   IDENTITY and STATE stay per class. school_id, term_id, the offering pair,
--   due dates, publish state and locks are what make a row that class's own,
--   and lockScopeForSharedWeek() in that module is explicit that a lock must
--   never widen beyond one class.
--
-- Every existing read keeps working untouched, because every class still has
-- its own row exactly where it looked for it.
--
-- A class that edits its week stops mirroring. is_customized already means "a
-- teacher changed this" — content-reuse.ts refuses to copy such a row — and it
-- now also means "do not overwrite this". One school's rewrite must never be
-- reverted by a correction to the master, and must never leak to the others.

alter table public.lessons
  add column if not exists shared_master_id uuid
  references public.lessons(id) on delete set null;

alter table public.assignments
  add column if not exists shared_master_id uuid
  references public.assignments(id) on delete set null;

-- Finding the mirrors of a master is the whole of the propagation query.
create index if not exists idx_lessons_shared_master
  on public.lessons (shared_master_id)
  where shared_master_id is not null;

create index if not exists idx_assignments_shared_master
  on public.assignments (shared_master_id)
  where shared_master_id is not null;

comment on column public.lessons.shared_master_id is
  'The lesson this one mirrors. Corrections to the master reach every mirror that a teacher has not customised. Null means this row is a master, or is class-local content with no curriculum lineage.';

-- ── Propagation ─────────────────────────────────────────────────────────────
--
-- Body columns only. The deny-list is the point of the whole design, so it is
-- written out rather than derived: anything not named here is per-class and
-- must survive a correction to the master untouched.

create or replace function public.propagate_lesson_master()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A mirror is never itself a master, so this cannot cascade.
  if new.shared_master_id is not null then return new; end if;

  update public.lessons m
     set title            = new.title,
         description      = new.description,
         content          = new.content,
         content_layout   = new.content_layout,
         lesson_notes     = new.lesson_notes,
         video_url        = new.video_url,
         duration_minutes = new.duration_minutes,
         lesson_type      = new.lesson_type,
         updated_at       = now()
   where m.shared_master_id = new.id
     -- A teacher's own edit outranks the curriculum. Reverting it would undo
     -- work in front of a class that has already been taught the changed week.
     and coalesce(m.metadata->>'is_customized', '') <> 'true'
     -- A class that has published the week to learners is frozen by its own
     -- lock. Rewriting content underneath learners mid-week is the failure
     -- lockScopeForSharedWeek exists to prevent.
     and m.content_locked_at is null;

  return new;
end;
$$;

drop trigger if exists lessons_propagate_master on public.lessons;
create trigger lessons_propagate_master
  after update of title, description, content, content_layout, lesson_notes,
                  video_url, duration_minutes, lesson_type
  on public.lessons
  for each row execute function public.propagate_lesson_master();

create or replace function public.propagate_assignment_master()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shared_master_id is not null then return new; end if;

  update public.assignments m
     set title        = new.title,
         description  = new.description,
         instructions = new.instructions,
         questions    = new.questions,
         max_points   = new.max_points,
         updated_at   = now()
   where m.shared_master_id = new.id
     and coalesce(m.metadata->>'is_customized', '') <> 'true'
     -- due_date, is_active, weight and grading_mode are deliberately absent:
     -- each class sets its own deadline and decides when the work goes live.
     and m.is_active is not true;

  return new;
end;
$$;

drop trigger if exists assignments_propagate_master on public.assignments;
create trigger assignments_propagate_master
  after update of title, description, instructions, questions, max_points
  on public.assignments
  for each row execute function public.propagate_assignment_master();

comment on function public.propagate_lesson_master() is
  'Pushes a master lesson body to every mirror that is neither customised nor locked. Identity, timing and publish state are never touched.';

-- ── Backfill ────────────────────────────────────────────────────────────────
--
-- Copies already made by 20260929000041..43 recorded their source in metadata.
-- Promoting it to a column is what makes them reachable by the trigger; without
-- this, every week copied before today would keep drifting forever and the
-- change would only apply to content generated from now on.

-- The cast is guarded by a uuid shape test, the same way 20260929000005 guards
-- its own. metadata is free-form jsonb that many writers touch; a single row
-- holding anything that is not a uuid makes `::uuid` throw, and one malformed
-- value would abort this migration and every statement in it. Postgres also
-- does not promise to evaluate the WHERE before the SET, so testing for
-- not-null is not enough on its own.
update public.lessons m
   set shared_master_id = (m.metadata->>'copied_from_content_id')::uuid
 where m.shared_master_id is null
   and m.metadata->>'copied_from_content_id'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and exists (
     select 1 from public.lessons s
      where s.id = (m.metadata->>'copied_from_content_id')::uuid
   );

update public.assignments m
   set shared_master_id = (m.metadata->>'copied_from_content_id')::uuid
 where m.shared_master_id is null
   and m.metadata->>'copied_from_content_id'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   and exists (
     select 1 from public.assignments s
      where s.id = (m.metadata->>'copied_from_content_id')::uuid
   );

-- A copy of a copy is still a mirror of the original. decideReuse picks the
-- oldest source, so chains are shallow, but flattening them means a correction
-- reaches every generation rather than only the first.
update public.lessons m
   set shared_master_id = s.shared_master_id
  from public.lessons s
 where m.shared_master_id = s.id
   and s.shared_master_id is not null;

update public.assignments m
   set shared_master_id = s.shared_master_id
  from public.assignments s
 where m.shared_master_id = s.id
   and s.shared_master_id is not null;
