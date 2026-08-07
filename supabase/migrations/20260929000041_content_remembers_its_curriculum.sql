-- Phase 1 of sharing one generated week across the schools that adopted it.
--
-- Content is generated per class today. 26 classes across 14 schools adopted
-- the same curriculum release, so the same Week 3 lesson is written 26 times;
-- at 100 schools it would be written about a hundred. Keying content to the
-- curriculum instead of the class removes that entirely — 11 releases over 8
-- weeks is 440 generations whether there are 29 schools or 200, against roughly
-- 8,000 the current way. It also puts the volume back inside the free tier that
-- gemini-2.0-flash is already refusing with 429.
--
-- This migration is deliberately ADDITIVE ONLY and changes no behaviour.
-- assignments, flashcard_decks and lesson_materials already carry
-- curriculum_release_id; only lessons was missing it. After this every piece of
-- generated content knows which curriculum edition and which week it belongs
-- to, alongside the lesson_plan_id it still resolves by.
--
-- Nothing reads the new column yet. The routes still resolve through
-- lesson_plan_id, the uniqueness index still keys on (lesson_plan_id, week),
-- and no visibility rule has changed. That is the point: the risky half of this
-- work — moving the index and rewriting how a learner's content is found — is
-- separable, and doing the safe half first means the backfill can be inspected
-- against real data before anything depends on it.
--
-- The guards that half will need are already written and tested:
-- lib/academic/shared-content-visibility (a learner sees a week only when their
-- own class adopted that release and has reached that week) and
-- lib/academic/plan-from-release (one school's refinement never reaches
-- another).

alter table public.lessons
  add column if not exists curriculum_release_id uuid
    references public.academic_curriculum_releases(id) on delete set null;

comment on column public.lessons.curriculum_release_id is
  'The curriculum edition this lesson was generated from. Set alongside lesson_plan_id so content can later be shared by (release, week) instead of duplicated per class. Not yet read by any route.';

-- Backfill from the plan each piece of content already belongs to. A plan
-- records the release it was built from, so this asserts nothing new — it
-- copies a fact that was already one join away.
update public.lessons l
   set curriculum_release_id = p.curriculum_release_id
  from public.lesson_plans p
 where l.lesson_plan_id = p.id
   and p.curriculum_release_id is not null
   and l.curriculum_release_id is null;

update public.assignments a
   set curriculum_release_id = p.curriculum_release_id
  from public.lesson_plans p
 where a.lesson_plan_id = p.id
   and p.curriculum_release_id is not null
   and a.curriculum_release_id is null;

update public.flashcard_decks d
   set curriculum_release_id = p.curriculum_release_id
  from public.lesson_plans p
 where d.lesson_plan_id = p.id
   and p.curriculum_release_id is not null
   and d.curriculum_release_id is null;

update public.lesson_materials m
   set curriculum_release_id = p.curriculum_release_id
  from public.lesson_plans p
 where m.lesson_plan_id = p.id
   and p.curriculum_release_id is not null
   and m.curriculum_release_id is null;

-- Read paths for phase 2, when content is found by curriculum rather than by
-- plan. Harmless now; the lookup they serve does not exist yet.
create index if not exists idx_lessons_release_week
  on public.lessons (curriculum_release_id, curriculum_week_number)
  where curriculum_release_id is not null;

create index if not exists idx_assignments_release_week
  on public.assignments (curriculum_release_id, curriculum_week_number)
  where curriculum_release_id is not null;

create index if not exists idx_flashcard_decks_release_week
  on public.flashcard_decks (curriculum_release_id, curriculum_week_number)
  where curriculum_release_id is not null;

create index if not exists idx_lesson_materials_release_week
  on public.lesson_materials (curriculum_release_id, curriculum_week_number)
  where curriculum_release_id is not null;
