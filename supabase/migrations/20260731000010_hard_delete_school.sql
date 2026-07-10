-- Total, irreversible removal of a school and everything scoped to it — "as though it never
-- existed". Two phases:
--   1. Every user of the school (student / teacher / school account) is removed via the tested
--      hard_delete_portal_user(), which cascades each user's data (reports, submissions, cards,
--      enrolments, XP, …) AND their auth.users login.
--   2. Every remaining row keyed by school_id, across ALL public tables, is deleted. FK ordering
--      is bypassed (session_replication_role=replica) because the whole school is going at once,
--      so inter-references among its own rows don't matter. Global rows (school_id NULL) are
--      never touched.
-- Finally the schools row itself is removed.
--
-- NOTE: object storage (R2) for recordings/cards/files is NOT reachable from SQL — the calling
-- API deletes those objects BEFORE invoking this function.
CREATE OR REPLACE FUNCTION public.hard_delete_school(p_school uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  u record;
  users_removed int := 0;
  tables_swept int := 0;
BEGIN
  IF p_school IS NULL THEN
    RAISE EXCEPTION 'p_school is required';
  END IF;

  -- Phase 1 — remove every user of the school (cascades their data + auth login).
  FOR u IN SELECT id FROM portal_users WHERE school_id = p_school LOOP
    PERFORM hard_delete_portal_user(u.id);
    users_removed := users_removed + 1;
  END LOOP;

  -- Phase 2 — sweep every remaining school-scoped row across all public tables.
  SET LOCAL session_replication_role = replica;
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'school_id'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE school_id = $1', r.table_name) USING p_school;
    tables_swept := tables_swept + 1;
  END LOOP;
  SET LOCAL session_replication_role = default;

  -- The school record itself.
  DELETE FROM schools WHERE id = p_school;

  RETURN jsonb_build_object('users_removed', users_removed, 'tables_swept', tables_swept);
END;
$$;
