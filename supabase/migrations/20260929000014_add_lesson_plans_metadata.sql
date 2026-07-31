-- Add the `lesson_plans.metadata` column that four call sites have always assumed exists.
--
-- The baseline schema defines `plan_data` but never defined `metadata`, so every read of it failed
-- with 42703 (`column lesson_plans.metadata does not exist`). That was fatal in one place and
-- silent in three:
--
--   * /api/cron/auto-generate-content selects it and returns 500 on every run. cron_run_history
--     shows 7 of 7 runs failed and not one success since monitoring began — the job has never
--     worked.
--   * src/lib/academic/readiness-automation.ts writes `auto_generate_settings` into it when a
--     class is prepared, so preparing a class could never actually enable content generation.
--   * The lesson-plan UI (src/app/dashboard/lesson-plans/[id]/page.tsx) writes
--     `metadata.auto_generate_settings`, so the teacher-facing toggle discarded its own setting.
--
-- Nullable with NO default, deliberately. auto-generate-content filters with
-- `.not('metadata', 'is', null)` to mean "plans an operator has actually configured". A
-- `'{}'::jsonb` default — matching how `plan_data` is declared — would make that filter match
-- every published plan instead, so the two columns differ on purpose.
--
-- Additive and reversible: no existing row or query changes behaviour, because nothing could read
-- this column before. Existing plans start NULL and are skipped by the sweep until an operator
-- turns generation on, which is the intended resting state.

ALTER TABLE public.lesson_plans
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN public.lesson_plans.metadata IS
  'Operator and automation settings for the plan (auto_generate_settings, academic_automation). '
  'NULL means never configured; auto-generate-content relies on that to skip unconfigured plans. '
  'Distinct from plan_data, which holds the teaching content itself.';
