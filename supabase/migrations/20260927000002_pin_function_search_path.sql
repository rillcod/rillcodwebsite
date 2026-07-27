-- ============================================================================
-- Pin search_path on every SECURITY DEFINER function.
-- ============================================================================
-- A SECURITY DEFINER function runs with the privileges of its owner (postgres).
-- If it does not pin search_path, name resolution follows the CALLER's
-- search_path, so a caller able to create objects can shadow an unqualified name
-- and have it executed as postgres. Supabase's database linter reports this as
-- `function_search_path_mutable`.
--
-- These 19 include the helpers your RLS policies depend on -- is_staff (used by
-- 37 policies), is_admin (31), is_parent (19), is_active_admin (13), get_my_role
-- (9), get_my_school_id (6) -- which makes them the highest-value targets.
--
-- SAFETY: verified against the live catalog before writing this migration.
--   * Every one of the 80 function names that exist ONLY in a non-public schema
--     was checked against all 19 bodies. None makes a bare (unqualified) call to
--     any of them, so 'public' alone is sufficient and no function loses access
--     to anything it currently resolves.
--   * References to the auth schema are always written as auth.uid() etc.
--     Schema-qualified names ignore search_path entirely.
--   * This changes name resolution only. No function logic is altered, and
--     EXECUTE privileges are untouched, so RLS policies calling these keep working.
-- ============================================================================

ALTER FUNCTION "public"."check_course_completion"(p_user_id uuid, p_course_id uuid) SET search_path = 'public';
ALTER FUNCTION "public"."check_instalment_plan_completion"() SET search_path = 'public';
ALTER FUNCTION "public"."check_timetable_conflicts"(p_slot jsonb) SET search_path = 'public';
ALTER FUNCTION "public"."create_parent_and_link"(p_email text, p_full_name text, p_phone text, p_student_id uuid, p_relationship text, p_auth_user_id uuid) SET search_path = 'public';
ALTER FUNCTION "public"."current_user_email"() SET search_path = 'public';
ALTER FUNCTION "public"."get_due_flashcards"(p_student_id uuid, p_deck_id uuid) SET search_path = 'public';
ALTER FUNCTION "public"."get_my_role"() SET search_path = 'public';
ALTER FUNCTION "public"."handle_certificate_trigger"() SET search_path = 'public';
ALTER FUNCTION "public"."increment_question_upvotes"(question_id uuid) SET search_path = 'public';
ALTER FUNCTION "public"."is_admin_or_teacher"() SET search_path = 'public';
ALTER FUNCTION "public"."is_parent"() SET search_path = 'public';
ALTER FUNCTION "public"."notify_parent_on_invoice_paid"() SET search_path = 'public';
ALTER FUNCTION "public"."notify_parent_on_report_publish"() SET search_path = 'public';
ALTER FUNCTION "public"."process_payment_atomic"(p_reference text, p_invoice_id uuid, p_amount numeric) SET search_path = 'public';
ALTER FUNCTION "public"."refresh_dashboard_stats"() SET search_path = 'public';
ALTER FUNCTION "public"."unlink_parent_from_student"(target_student_id uuid) SET search_path = 'public';
ALTER FUNCTION "public"."update_conversation_timestamp"() SET search_path = 'public';
ALTER FUNCTION "public"."update_flashcard_statistics"() SET search_path = 'public';
ALTER FUNCTION "public"."update_last_login"() SET search_path = 'public';

-- ============================================================================
-- VERIFY -- expect zero rows
-- ============================================================================
--   SELECT p.proname FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.prosecdef
--      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c
--                       WHERE c LIKE 'search_path=%');
-- ============================================================================
