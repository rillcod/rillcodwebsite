-- URGENT REVERT: the require_school_for_active_student trigger (Gate C) blocked
-- student creation. Supabase's auth→portal_users handler inserts the student row as
-- active BEFORE the app assigns a school, so the trigger raised "Database error
-- creating new user" on every new student (consent, summer, bulk, signup). The
-- schoolless-student concern is covered app-side (signup validates) and by the
-- integrity sweep report — not worth blocking account creation.
DROP TRIGGER IF EXISTS trg_require_school_active_student ON public.portal_users;
DROP FUNCTION IF EXISTS public.require_school_for_active_student();
