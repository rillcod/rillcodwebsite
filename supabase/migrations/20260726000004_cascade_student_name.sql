-- Make a student NAME correction propagate everywhere automatically. portal_users
-- is the single source of truth for identity; when full_name changes there, cascade
-- it to the denormalised copies in the same database (students shadow row + the
-- student_name snapshot on every progress report). The login (auth) metadata is
-- synced by the edit endpoint (PATCH /api/portal-users/[id]) since triggers can't
-- reach the auth schema.
--
-- Net effect: edit a student's name ONCE in the Students page and it shows
-- correctly on their account, the students table, and all their report cards.
CREATE OR REPLACE FUNCTION public.cascade_student_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'student'
     AND NEW.full_name IS DISTINCT FROM OLD.full_name
     AND NEW.full_name IS NOT NULL THEN
    UPDATE public.students
       SET full_name = NEW.full_name, name = NEW.full_name, updated_at = now()
     WHERE user_id = NEW.id
       AND (full_name IS DISTINCT FROM NEW.full_name OR name IS DISTINCT FROM NEW.full_name);

    UPDATE public.student_progress_reports
       SET student_name = NEW.full_name, updated_at = now()
     WHERE student_id = NEW.id
       AND student_name IS DISTINCT FROM NEW.full_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_student_name ON public.portal_users;
CREATE TRIGGER trg_cascade_student_name
  AFTER UPDATE OF full_name ON public.portal_users
  FOR EACH ROW EXECUTE FUNCTION public.cascade_student_name();
