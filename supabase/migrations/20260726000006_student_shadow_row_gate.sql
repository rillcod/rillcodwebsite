-- HARD GATE: every student portal account has exactly one students-table row, so
-- onboarded children always appear in the students list and can be parent-linked.

-- 1. One students row per portal account. Also makes the app's
--    `upsert(..., onConflict: 'user_id')` work (it was silently failing for lack of
--    this constraint, a cause of the missing rows).
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_user_id
  ON public.students (user_id)
  WHERE user_id IS NOT NULL;

-- 2. Auto-provision the students row whenever a student portal account is created.
--    Idempotent (NOT EXISTS guard); SECURITY DEFINER to bypass RLS. App code that
--    also writes the students row will find this one and update it (no duplicate).
CREATE OR REPLACE FUNCTION public.ensure_student_shadow_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'student' AND COALESCE(NEW.is_deleted, false) = false
     AND NOT EXISTS (SELECT 1 FROM public.students WHERE user_id = NEW.id) THEN
    INSERT INTO public.students (
      user_id, full_name, name, email, student_email,
      school_id, school_name, grade, grade_level, current_class,
      gender, enrollment_type, status, is_active, is_deleted, created_at, updated_at
    ) VALUES (
      NEW.id, COALESCE(NEW.full_name, 'Student'), COALESCE(NEW.full_name, 'Student'), NEW.email, NEW.email,
      NEW.school_id, NEW.school_name, NEW.section_class, NEW.section_class, NEW.section_class,
      NEW.gender, COALESCE(NEW.enrollment_type, 'in_person'), 'approved', COALESCE(NEW.is_active, true), false, now(), now()
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_student_shadow_row ON public.portal_users;
CREATE TRIGGER trg_ensure_student_shadow_row
  AFTER INSERT ON public.portal_users
  FOR EACH ROW EXECUTE FUNCTION public.ensure_student_shadow_row();
