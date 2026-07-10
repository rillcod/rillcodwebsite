-- Every class must have one active, school-authorized primary owner.
-- Historical report authors remain unchanged; ownership represents current responsibility.

UPDATE public.classes
SET teacher_id = '5fe242a9-947d-4ce1-856c-7352f5223680', updated_at = now()
WHERE id = '12bf6ea6-0f6e-4389-ac04-03e469c2c7cc' AND teacher_id IS NULL;

-- Quincy has one active historical class teacher but no teacher-school assignment.
-- Authorize Osahon for Quincy so the report-ranked owner backfill below can select him.
INSERT INTO public.teacher_schools (teacher_id, school_id, is_primary)
SELECT 'be33bb53-a7e0-4e04-98af-e40e8e88e520', '1f13ab3e-cbe9-4b8d-8c33-acae904b7ae5', true
WHERE EXISTS (
  SELECT 1 FROM public.portal_users
  WHERE id = 'be33bb53-a7e0-4e04-98af-e40e8e88e520' AND role = 'teacher'
    AND coalesce(is_active, true) AND NOT coalesce(is_deleted, false)
)
AND NOT EXISTS (
  SELECT 1 FROM public.teacher_schools
  WHERE teacher_id = 'be33bb53-a7e0-4e04-98af-e40e8e88e520'
    AND school_id = '1f13ab3e-cbe9-4b8d-8c33-acae904b7ae5'
);

WITH ranked AS (
  SELECT c.id AS class_id, spr.teacher_id,
         row_number() OVER (PARTITION BY c.id ORDER BY count(*) DESC, max(spr.created_at) DESC) AS rn
  FROM public.classes c
  JOIN public.student_progress_reports spr
    ON spr.school_id = c.school_id
   AND lower(btrim(coalesce(spr.section_class, ''))) = lower(btrim(c.name))
  JOIN public.portal_users teacher ON teacher.id = spr.teacher_id
  WHERE c.teacher_id IS NULL
    AND teacher.role = 'teacher' AND coalesce(teacher.is_active, true) AND NOT coalesce(teacher.is_deleted, false)
    AND (teacher.school_id = c.school_id OR EXISTS (
      SELECT 1 FROM public.teacher_schools ts WHERE ts.teacher_id = teacher.id AND ts.school_id = c.school_id
    ))
  GROUP BY c.id, spr.teacher_id
)
UPDATE public.classes c SET teacher_id = ranked.teacher_id, updated_at = now()
FROM ranked WHERE c.id = ranked.class_id AND ranked.rn = 1 AND c.teacher_id IS NULL;

WITH ranked AS (
  SELECT c.id AS class_id, rb.created_by AS teacher_id,
         row_number() OVER (PARTITION BY c.id ORDER BY rb.created_at DESC) AS rn
  FROM public.classes c
  JOIN public.registration_batches rb ON rb.class_id = c.id
  JOIN public.portal_users teacher ON teacher.id = rb.created_by
  WHERE c.teacher_id IS NULL
    AND teacher.role = 'teacher' AND coalesce(teacher.is_active, true) AND NOT coalesce(teacher.is_deleted, false)
    AND (teacher.school_id = c.school_id OR EXISTS (
      SELECT 1 FROM public.teacher_schools ts WHERE ts.teacher_id = teacher.id AND ts.school_id = c.school_id
    ))
)
UPDATE public.classes c SET teacher_id = ranked.teacher_id, updated_at = now()
FROM ranked WHERE c.id = ranked.class_id AND ranked.rn = 1 AND c.teacher_id IS NULL;

WITH ranked AS (
  SELECT c.id AS class_id, ts.teacher_id,
         row_number() OVER (PARTITION BY c.id ORDER BY coalesce(ts.is_primary, false) DESC, ts.assigned_at ASC, ts.teacher_id) AS rn
  FROM public.classes c
  JOIN public.teacher_schools ts ON ts.school_id = c.school_id
  JOIN public.portal_users teacher ON teacher.id = ts.teacher_id
  WHERE c.teacher_id IS NULL
    AND teacher.role = 'teacher' AND coalesce(teacher.is_active, true) AND NOT coalesce(teacher.is_deleted, false)
)
UPDATE public.classes c SET teacher_id = ranked.teacher_id, updated_at = now()
FROM ranked WHERE c.id = ranked.class_id AND ranked.rn = 1 AND c.teacher_id IS NULL;

WITH ranked AS (
  SELECT c.id AS class_id, teacher.id AS teacher_id,
         row_number() OVER (PARTITION BY c.id ORDER BY teacher.created_at ASC, teacher.id) AS rn
  FROM public.classes c
  JOIN public.portal_users teacher ON teacher.school_id = c.school_id
  WHERE c.teacher_id IS NULL
    AND teacher.role = 'teacher' AND coalesce(teacher.is_active, true) AND NOT coalesce(teacher.is_deleted, false)
)
UPDATE public.classes c SET teacher_id = ranked.teacher_id, updated_at = now()
FROM ranked WHERE c.id = ranked.class_id AND ranked.rn = 1 AND c.teacher_id IS NULL;

DO $$
DECLARE unresolved text;
BEGIN
  SELECT string_agg(format('%s (%s)', name, id), ', ' ORDER BY name) INTO unresolved
  FROM public.classes WHERE teacher_id IS NULL OR school_id IS NULL;
  IF unresolved IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot enforce class ownership; assign a school and active teacher to: %', unresolved;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_class_primary_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.teacher_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23502', message = 'Every class must have a primary teacher owner.';
  END IF;
  IF NEW.school_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '23502', message = 'Every class must belong to a school.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portal_users teacher
    WHERE teacher.id = NEW.teacher_id AND teacher.role = 'teacher'
      AND coalesce(teacher.is_active, true) AND NOT coalesce(teacher.is_deleted, false)
      AND (teacher.school_id = NEW.school_id OR EXISTS (
        SELECT 1 FROM public.teacher_schools ts WHERE ts.teacher_id = teacher.id AND ts.school_id = NEW.school_id
      ))
  ) THEN
    RAISE EXCEPTION USING errcode = '23514', message = 'Class owner must be an active teacher assigned to the class school.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_class_primary_owner ON public.classes;
CREATE TRIGGER trg_guard_class_primary_owner
BEFORE INSERT OR UPDATE OF teacher_id, school_id ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.guard_class_primary_owner();

ALTER TABLE public.classes ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.classes ALTER COLUMN teacher_id SET NOT NULL;
