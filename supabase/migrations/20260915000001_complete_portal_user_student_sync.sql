-- Migration: Complete Portal User to Student Registry Auto-Sync
-- Goal: Make portal_users the authoritative single source of truth and automatically
-- cascade all edits (full_name, email, school_id, section_class, gender, is_active, is_deleted)
-- to the students registry table and progress reports.

CREATE OR REPLACE FUNCTION public.cascade_portal_user_to_student()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'student' THEN
    UPDATE public.students
       SET full_name     = COALESCE(NEW.full_name, full_name),
           name          = COALESCE(NEW.full_name, name),
           email         = COALESCE(NEW.email, email),
           student_email = COALESCE(NEW.email, student_email),
           school_id     = COALESCE(NEW.school_id, school_id),
           school_name   = COALESCE(NEW.school_name, school_name),
           section       = COALESCE(NEW.section_class, section),
           current_class = COALESCE(NEW.section_class, current_class),
           gender        = COALESCE(NEW.gender, gender),
           is_active     = COALESCE(NEW.is_active, is_active),
           is_deleted    = COALESCE(NEW.is_deleted, is_deleted),
           status        = CASE WHEN NEW.is_deleted = true THEN 'inactive' ELSE status END,
           updated_at    = now()
     WHERE user_id = NEW.id;

    -- Also update student_name snapshot on student_progress_reports if name changed
    IF NEW.full_name IS DISTINCT FROM OLD.full_name AND NEW.full_name IS NOT NULL THEN
      UPDATE public.student_progress_reports
         SET student_name = NEW.full_name, updated_at = now()
       WHERE student_id = NEW.id
         AND student_name IS DISTINCT FROM NEW.full_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Replace the previous name-only trigger with full sync trigger
DROP TRIGGER IF EXISTS trg_cascade_student_name ON public.portal_users;
DROP TRIGGER IF EXISTS trg_cascade_portal_user_to_student ON public.portal_users;

CREATE TRIGGER trg_cascade_portal_user_to_student
  AFTER UPDATE ON public.portal_users
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_portal_user_to_student();
