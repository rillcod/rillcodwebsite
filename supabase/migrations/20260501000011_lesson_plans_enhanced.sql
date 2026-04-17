-- migration: enhance lesson_plans table for term-level plan support
-- requirements: req 15.2, nf-12.1

-- add new columns to the existing lesson_plans table.
-- all additions use "add column if not exists" so the migration is idempotent.

-- plan_data holds the week-by-week structure of the term plan as jsonb.
alter table public.lesson_plans
  add column if not exists plan_data jsonb not null default '{}';

-- status controls the publication lifecycle of a lesson plan.
alter table public.lesson_plans
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'published', 'archived'));

-- version is incremented each time a plan is edited after publishing.
alter table public.lesson_plans
  add column if not exists version int not null default 1;

-- curriculum_version_id will be linked to course_curricula once that table is
-- created in migration 20260501000012. no fk constraint is added here to avoid
-- a dependency on a table that does not yet exist; the fk will be added after
-- course_curricula is created.
alter table public.lesson_plans
  add column if not exists curriculum_version_id uuid;

-- term date range
alter table public.lesson_plans
  add column if not exists term_start date;

alter table public.lesson_plans
  add column if not exists term_end date;

-- how many teaching sessions occur per week for this plan
alter table public.lesson_plans
  add column if not exists sessions_per_week int;

-- ── term-level plan ownership / scope columns ─────────────────────────────────

-- school that owns this plan
alter table public.lesson_plans
  add column if not exists school_id uuid references public.schools(id);

-- course this plan covers
alter table public.lesson_plans
  add column if not exists course_id uuid references public.courses(id);

-- class this plan is for.
-- public.classes exists (referenced by card_studio_lifecycle migration),
-- so the fk is safe to add here.
alter table public.lesson_plans
  add column if not exists class_id uuid references public.classes(id);

-- free-text term label, e.g. "2025/2026 First Term"
alter table public.lesson_plans
  add column if not exists term text;

-- portal_user who created the plan
alter table public.lesson_plans
  add column if not exists created_by uuid references public.portal_users(id);
