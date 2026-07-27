-- ============================================================================
-- Remove tables that exist in the schema but are not part of the product.
-- ============================================================================
-- Each of the six below is EMPTY, referenced by no application code, and has
-- nothing depending on it. Verified against the live catalog before writing:
-- no rows, no inbound foreign keys, not named in any view, function or RLS
-- policy outside this drop set.
--
--   generated_reports   empty; no code. Paired with report_templates.
--   report_templates    empty; its only inbound FK was generated_reports.
--   grade_reports       empty; no code. Progress reporting uses
--                       student_progress_reports instead.
--   leaderboards        empty; SUPERSEDED. The leaderboard page computes
--                       rankings live from assignment_submissions + attendance
--                       (src/app/dashboard/leaderboard/page.tsx), so this table
--                       was never written to.
--   student_progress    empty; no code. Superseded by enrollments.progress_pct
--                       and student_progress_reports.
--   user_profiles       empty; SUPERSEDED by portal_users, which is referenced
--                       in 407 source files.
--
-- DELIBERATELY KEPT -- these looked orphaned but are alive:
--   enrollment_term_grades      written via RPC upsert_enrollment_term_grade,
--                               called from src/services/grades.service.ts
--   flashcard_card_statistics   maintained automatically by the trigger
--                               trigger_update_flashcard_statistics on
--                               flashcard_reviews (10 rows and growing)
--   announcement_reads          holds 4 rows; the read-tracking feature was
--                               built but never wired to the UI. Kept so it can
--                               be finished rather than rebuilt.
--   admin_dashboard_stats       materialized view holding stale data;
--                               refresh_dashboard_stats() still references it.
--
-- RECOVERY: every dropped table's full definition (columns, constraints,
-- policies, indexes) is preserved in 00000000000000_baseline_schema.sql. Nothing
-- is unrecoverable, and no data is lost because all six are empty.
-- ============================================================================

-- generated_reports first: it holds the foreign key to report_templates.
DROP TABLE IF EXISTS "public"."generated_reports";
DROP TABLE IF EXISTS "public"."report_templates";

DROP TABLE IF EXISTS "public"."grade_reports";
DROP TABLE IF EXISTS "public"."leaderboards";
DROP TABLE IF EXISTS "public"."student_progress";
DROP TABLE IF EXISTS "public"."user_profiles";

-- ============================================================================
-- VERIFY -- expect zero rows
-- ============================================================================
--   SELECT c.relname FROM pg_class c
--     JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND c.relname IN ('generated_reports','report_templates','grade_reports',
--                        'leaderboards','student_progress','user_profiles');
--
-- Table count should drop from 192 to 186:
--   SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind IN ('r','p');
-- ============================================================================
