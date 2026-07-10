-- Keep mandatory class ownership valid when a teacher-school assignment is removed.
-- Adding another teacher does not steal classes. Removing the current owner atomically
-- hands their classes to another active teacher assigned to that school, or blocks the
-- assignment removal until an administrator chooses a replacement.

CREATE OR REPLACE FUNCTION sync_class_ownership_from_teacher_schools()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  replacement_id uuid;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    RETURN NULL;
  END IF;

  -- A primary profile-school relationship is also a valid assignment.
  IF EXISTS (
    SELECT 1 FROM portal_users
    WHERE id = OLD.teacher_id AND school_id = OLD.school_id
      AND role = 'teacher' AND coalesce(is_active, true) AND NOT coalesce(is_deleted, false)
  ) THEN
    RETURN NULL;
  END IF;

  -- No ownership depends on this assignment, so deletion is safe.
  IF NOT EXISTS (
    SELECT 1 FROM classes WHERE school_id = OLD.school_id AND teacher_id = OLD.teacher_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT candidate.id INTO replacement_id
  FROM (
    SELECT teacher.id, 0 AS source_rank, coalesce(ts.is_primary, false) AS preferred, ts.assigned_at
    FROM teacher_schools ts
    JOIN portal_users teacher ON teacher.id = ts.teacher_id
    WHERE ts.school_id = OLD.school_id AND ts.teacher_id <> OLD.teacher_id
      AND teacher.role = 'teacher' AND coalesce(teacher.is_active, true) AND NOT coalesce(teacher.is_deleted, false)
    UNION ALL
    SELECT teacher.id, 1, false, teacher.created_at
    FROM portal_users teacher
    WHERE teacher.school_id = OLD.school_id AND teacher.id <> OLD.teacher_id
      AND teacher.role = 'teacher' AND coalesce(teacher.is_active, true) AND NOT coalesce(teacher.is_deleted, false)
  ) candidate
  ORDER BY candidate.source_rank, candidate.preferred DESC, candidate.assigned_at, candidate.id
  LIMIT 1;

  IF replacement_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23514',
      message = 'Cannot remove this teacher-school assignment: they still own classes and no active replacement teacher is assigned.';
  END IF;

  UPDATE portal_users
  SET primary_teacher_id = replacement_id, updated_at = now()
  WHERE role = 'student' AND primary_teacher_id = OLD.teacher_id
    AND class_id IN (
      SELECT id FROM classes WHERE school_id = OLD.school_id AND teacher_id = OLD.teacher_id
    );

  UPDATE classes
  SET teacher_id = replacement_id, updated_at = now()
  WHERE school_id = OLD.school_id AND teacher_id = OLD.teacher_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS class_ownership_on_teacher_school_ins ON teacher_schools;
DROP TRIGGER IF EXISTS class_ownership_on_teacher_school_del ON teacher_schools;
CREATE TRIGGER class_ownership_on_teacher_school_del
  AFTER DELETE ON teacher_schools
  FOR EACH ROW EXECUTE FUNCTION sync_class_ownership_from_teacher_schools();