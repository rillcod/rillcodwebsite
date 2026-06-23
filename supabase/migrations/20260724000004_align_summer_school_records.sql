-- Align existing summer school records
-- 1. Resolve the "Rillcod Online School" school_id
DO $$
DECLARE
  v_online_school_id uuid;
  v_summer_class_id  uuid;
BEGIN
  -- Find the canonical online school
  SELECT id INTO v_online_school_id
    FROM public.schools
    WHERE LOWER(name) LIKE '%online%'
      AND is_active = true
    LIMIT 1;

  IF v_online_school_id IS NULL THEN
    RAISE NOTICE 'No Online School found. Skipping alignment.';
    RETURN;
  END IF;

  -- Find the canonical "Summer School 2026" class in that school
  SELECT id INTO v_summer_class_id
    FROM public.classes
    WHERE school_id = v_online_school_id
      AND name = 'Summer School 2026'
    LIMIT 1;

  IF v_summer_class_id IS NULL THEN
    RAISE NOTICE 'No "Summer School 2026" class found. Skipping class alignment.';
  END IF;

  -- 2. Update portal_users: set school_id for summer students who are missing it
  UPDATE public.portal_users
    SET school_id = v_online_school_id,
        updated_at = now()
    WHERE role = 'student'
      AND enrollment_type = 'summer_school'
      AND is_active = true
      AND (school_id IS NULL OR school_id != v_online_school_id);

  -- 3. Update portal_users: set class_id for summer students who are missing it
  IF v_summer_class_id IS NOT NULL THEN
    UPDATE public.portal_users
      SET class_id = v_summer_class_id,
          updated_at = now()
      WHERE role = 'student'
        AND enrollment_type = 'summer_school'
        AND is_active = true
        AND class_id IS NULL;
  END IF;

  -- 4. Fix students table: set enrollment_type where it is missing or wrong
  --    for students that look like summer school but enrollment_type is not set
  UPDATE public.students
    SET enrollment_type = 'summer_school'
    WHERE enrollment_type IS DISTINCT FROM 'summer_school'
      AND (
        LOWER(current_class) LIKE '%summer%'
        OR LOWER(grade_level) LIKE '%summer%'
        OR LOWER(COALESCE(section, '')) LIKE '%summer%'
      );

  -- 5. Ensure students.school_id is aligned to the online school
  UPDATE public.students
    SET school_id = v_online_school_id,
        school_name = 'ONLINE SCHOOL'
    WHERE enrollment_type = 'summer_school'
      AND (school_id IS NULL OR school_id != v_online_school_id);

  RAISE NOTICE 'Summer school alignment complete. School: %, Class: %', v_online_school_id, v_summer_class_id;
END;
$$;
