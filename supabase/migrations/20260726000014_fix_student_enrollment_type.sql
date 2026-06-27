-- Partner-school students were mislabelled enrollment_type='in_person' (the generic
-- onboarding default) instead of 'school' — 555 records, so the resend-credentials
-- page and "Partner School" counts were wrong. Fix the DATA and guard it on the DB so
-- it stays correct regardless of which path writes the row (parity with the app fix in
-- onboard-from-prospect.ts).
--
-- Rule: a student attached to a real school gets 'school' (or 'online' for the online
-- school). Only the generic default (NULL / 'in_person') is corrected — explicit types
-- (summer_school, bootcamp, online) are respected.

-- ── 1. Backfill existing rows ────────────────────────────────────────────────
UPDATE public.students s
SET enrollment_type = CASE WHEN sc.name ILIKE '%online%' THEN 'online' ELSE 'school' END,
    updated_at = now()
FROM public.schools sc
WHERE s.school_id = sc.id
  AND (s.enrollment_type IS NULL OR s.enrollment_type = 'in_person');

UPDATE public.portal_users p
SET enrollment_type = CASE WHEN sc.name ILIKE '%online%' THEN 'online' ELSE 'school' END,
    updated_at = now()
FROM public.schools sc
WHERE p.school_id = sc.id
  AND p.role = 'student'
  AND (p.enrollment_type IS NULL OR p.enrollment_type = 'in_person');

-- ── 2. DB guard: derive enrollment_type from the attached school on write ─────
CREATE OR REPLACE FUNCTION public.fix_student_enrollment_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_school_name text;
BEGIN
  -- Only correct the generic default; respect any explicit type.
  IF (NEW.enrollment_type IS NULL OR NEW.enrollment_type = 'in_person') AND NEW.school_id IS NOT NULL THEN
    SELECT name INTO v_school_name FROM public.schools WHERE id = NEW.school_id;
    IF v_school_name IS NOT NULL THEN
      NEW.enrollment_type := CASE WHEN v_school_name ILIKE '%online%' THEN 'online' ELSE 'school' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- students: every row is a student.
DROP TRIGGER IF EXISTS trg_fix_student_enrollment_type ON public.students;
CREATE TRIGGER trg_fix_student_enrollment_type
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.fix_student_enrollment_type();

-- portal_users: only the student role.
CREATE OR REPLACE FUNCTION public.fix_portal_user_enrollment_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_school_name text;
BEGIN
  IF NEW.role = 'student'
     AND (NEW.enrollment_type IS NULL OR NEW.enrollment_type = 'in_person')
     AND NEW.school_id IS NOT NULL THEN
    SELECT name INTO v_school_name FROM public.schools WHERE id = NEW.school_id;
    IF v_school_name IS NOT NULL THEN
      NEW.enrollment_type := CASE WHEN v_school_name ILIKE '%online%' THEN 'online' ELSE 'school' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fix_portal_user_enrollment_type ON public.portal_users;
CREATE TRIGGER trg_fix_portal_user_enrollment_type
  BEFORE INSERT OR UPDATE ON public.portal_users
  FOR EACH ROW EXECUTE FUNCTION public.fix_portal_user_enrollment_type();
