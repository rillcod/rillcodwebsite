-- Migration: grading mode columns
-- Requirements: NF-22, NF-23

-- NF-22: Add grading_mode to assignments (default 'manual') and cbt_exams
--        (default 'auto') so each exam/assignment records how it will be graded.
-- NF-23: Add grading_mode, ai_suggested_grade, and ai_suggested_feedback to
--        assignment_submissions to track AI-assisted grading suggestions and
--        support the teacher review workflow.

-- assignments: grading mode determines whether the assignment is auto-graded,
-- AI-assisted, or requires full manual teacher grading.
alter table public.assignments
  add column if not exists grading_mode text not null default 'manual'
    check (grading_mode in ('auto', 'ai_assisted', 'manual'));

-- cbt_exams: default to 'auto' because objective CBT questions are machine-gradeable.
alter table public.cbt_exams
  add column if not exists grading_mode text not null default 'auto'
    check (grading_mode in ('auto', 'ai_assisted', 'manual'));

-- assignment_submissions: nullable grading_mode records which path was used for
-- this specific submission; ai_suggested_* columns hold the AI grading proposal
-- before a teacher accepts or overrides it.
alter table public.assignment_submissions
  add column if not exists grading_mode          text
    check (grading_mode in ('auto', 'ai_suggested', 'manual')),
  add column if not exists ai_suggested_grade    numeric(5,2),
  add column if not exists ai_suggested_feedback text;

-- The existing status check constraint on assignment_submissions must be
-- extended to include 'pending_review' (used while AI suggestions await
-- teacher acceptance).  PostgreSQL does not support ALTER CONSTRAINT, so we
-- drop the old constraint and recreate it with the additional value.
alter table public.assignment_submissions
  drop constraint if exists assignment_submissions_status_check;

alter table public.assignment_submissions
  add constraint assignment_submissions_status_check
    check (status in ('submitted', 'graded', 'late', 'missing', 'pending_review'));
