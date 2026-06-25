-- HARD GATES for data integrity (DB-enforced, cannot be bypassed by app code).

-- ── Gate A1: school_name always matches the school FK on write ───────────────
-- Denormalised school_name can never drift from school_id, and a caller passing a
-- wrong/empty name (the old resolveOnlineSchool "Rillcod Online School" stamping)
-- is auto-corrected to the school's real name.
CREATE OR REPLACE FUNCTION public.sync_school_name_from_fk()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.school_id IS NOT NULL THEN
    SELECT name INTO NEW.school_name FROM public.schools WHERE id = NEW.school_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_school_name_pu ON public.portal_users;
CREATE TRIGGER trg_sync_school_name_pu
  BEFORE INSERT OR UPDATE OF school_id ON public.portal_users
  FOR EACH ROW EXECUTE FUNCTION public.sync_school_name_from_fk();

DROP TRIGGER IF EXISTS trg_sync_school_name_stu ON public.students;
CREATE TRIGGER trg_sync_school_name_stu
  BEFORE INSERT OR UPDATE OF school_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.sync_school_name_from_fk();

-- ── Gate A2: a school rename cascades to every denormalised copy ─────────────
CREATE OR REPLACE FUNCTION public.cascade_school_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.portal_users SET school_name = NEW.name
      WHERE school_id = NEW.id AND school_name IS DISTINCT FROM NEW.name;
    UPDATE public.students SET school_name = NEW.name
      WHERE school_id = NEW.id AND school_name IS DISTINCT FROM NEW.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_school_rename ON public.schools;
CREATE TRIGGER trg_cascade_school_rename
  AFTER UPDATE OF name ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.cascade_school_rename();

-- ── Gate C: an ACTIVE student must have a school ────────────────────────────
-- Blocks the "stray insert creates a schoolless active student" path. Pending
-- (is_active=false) students may still be schoolless until placed. All legitimate
-- activation paths already set school_id in the same statement, so this is a safety
-- backstop, not a workflow change.
CREATE OR REPLACE FUNCTION public.require_school_for_active_student()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'student' AND COALESCE(NEW.is_active, false) = true AND NEW.school_id IS NULL THEN
    RAISE EXCEPTION 'A student account must be assigned a school before activation (school_id is null for %).',
      COALESCE(NEW.full_name, NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_school_active_student ON public.portal_users;
CREATE TRIGGER trg_require_school_active_student
  BEFORE INSERT OR UPDATE ON public.portal_users
  FOR EACH ROW EXECUTE FUNCTION public.require_school_for_active_student();
