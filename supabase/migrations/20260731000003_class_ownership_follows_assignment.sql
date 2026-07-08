-- Role-aware class ownership: a teacher's ownership of a school's classes should FOLLOW their
-- school assignment (teacher_schools), automatically — so assigning a teacher to a school gives
-- them its classes, and removing them (reassignment) releases those classes so they no longer
-- see accounts/classes they are not connected to.
--
-- Visibility is already scoped in /api/classes by teacher_schools (own classes OR assigned-school
-- classes). This trigger keeps the underlying OWNERSHIP (classes.teacher_id) consistent with the
-- assignment, which is what was leaking: a reassigned teacher kept teacher_id on old classes and
-- still saw them via the teacher_id clause.

CREATE OR REPLACE FUNCTION sync_class_ownership_from_teacher_schools()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Newly assigned to a school: claim its UNOWNED classes (never steal one already owned
    -- by another teacher of that school).
    UPDATE classes SET teacher_id = NEW.teacher_id, updated_at = now()
      WHERE school_id = NEW.school_id AND teacher_id IS NULL;

  ELSIF TG_OP = 'DELETE' THEN
    -- Reassigned away: release this teacher's ownership of that school's classes and drop them
    -- as the students' primary teacher there — UNLESS they remain assigned to the same school
    -- via their primary profile school_id.
    IF NOT EXISTS (SELECT 1 FROM portal_users WHERE id = OLD.teacher_id AND school_id = OLD.school_id) THEN
      UPDATE portal_users SET primary_teacher_id = NULL, updated_at = now()
        WHERE role = 'student' AND primary_teacher_id = OLD.teacher_id
          AND class_id IN (SELECT id FROM classes WHERE school_id = OLD.school_id AND teacher_id = OLD.teacher_id);
      UPDATE classes SET teacher_id = NULL, updated_at = now()
        WHERE school_id = OLD.school_id AND teacher_id = OLD.teacher_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS class_ownership_on_teacher_school_ins ON teacher_schools;
CREATE TRIGGER class_ownership_on_teacher_school_ins
  AFTER INSERT ON teacher_schools
  FOR EACH ROW EXECUTE FUNCTION sync_class_ownership_from_teacher_schools();

DROP TRIGGER IF EXISTS class_ownership_on_teacher_school_del ON teacher_schools;
CREATE TRIGGER class_ownership_on_teacher_school_del
  AFTER DELETE ON teacher_schools
  FOR EACH ROW EXECUTE FUNCTION sync_class_ownership_from_teacher_schools();
