-- Canonical enrollment_type: school | online | in_person | special
-- Remap legacy summer_school / bootcamp → special; then lock CHECK to 4 values.
-- Order matters: expand CHECK before writing 'special', then tighten.

-- ── 1. Expand CHECK so 'special' is allowed (keep legacy values temporarily) ─
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_enrollment_type_check;
ALTER TABLE public.students
  ADD CONSTRAINT students_enrollment_type_check
  CHECK (
    enrollment_type IS NULL
    OR enrollment_type = ANY (ARRAY[
      'school'::text,
      'online'::text,
      'in_person'::text,
      'special'::text,
      'summer_school'::text,
      'bootcamp'::text
    ])
  );

ALTER TABLE public.portal_users DROP CONSTRAINT IF EXISTS portal_users_enrollment_type_check;
ALTER TABLE public.portal_users
  ADD CONSTRAINT portal_users_enrollment_type_check
  CHECK (
    enrollment_type IS NULL
    OR enrollment_type = ANY (ARRAY[
      'school'::text,
      'online'::text,
      'in_person'::text,
      'special'::text,
      'summer_school'::text,
      'bootcamp'::text
    ])
  );

-- ── 2. Remap legacy → special ────────────────────────────────────────────────
UPDATE public.students
SET enrollment_type = 'special',
    updated_at = now()
WHERE enrollment_type IN ('summer_school', 'bootcamp');

UPDATE public.portal_users
SET enrollment_type = 'special',
    updated_at = now()
WHERE enrollment_type IN ('summer_school', 'bootcamp');

-- ── 3. Tighten CHECK to canonical four ───────────────────────────────────────
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_enrollment_type_check;
ALTER TABLE public.students
  ADD CONSTRAINT students_enrollment_type_check
  CHECK (
    enrollment_type IS NULL
    OR enrollment_type = ANY (ARRAY['school'::text, 'online'::text, 'in_person'::text, 'special'::text])
  );

ALTER TABLE public.portal_users DROP CONSTRAINT IF EXISTS portal_users_enrollment_type_check;
ALTER TABLE public.portal_users
  ADD CONSTRAINT portal_users_enrollment_type_check
  CHECK (
    enrollment_type IS NULL
    OR enrollment_type = ANY (ARRAY['school'::text, 'online'::text, 'in_person'::text, 'special'::text])
  );

-- ── 4. Guard: only rewrite generic defaults; respect special / online / school ─
CREATE OR REPLACE FUNCTION public.fix_student_enrollment_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_school_name text;
BEGIN
  IF (NEW.enrollment_type IS NULL OR NEW.enrollment_type = 'in_person') AND NEW.school_id IS NOT NULL THEN
    SELECT name INTO v_school_name FROM public.schools WHERE id = NEW.school_id;
    IF v_school_name IS NOT NULL THEN
      NEW.enrollment_type := CASE WHEN v_school_name ILIKE '%online%' THEN 'online' ELSE 'school' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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

COMMENT ON CONSTRAINT students_enrollment_type_check ON public.students IS
  'Canonical: school | online | in_person | special (special = seasonal/AI cohorts; was summer_school/bootcamp)';
