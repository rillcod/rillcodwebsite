-- Make the auth -> portal_users sync trigger agree with the enrollment-type guard.
--
-- `handle_new_auth_user` copies role/school_id/class_id out of the new auth user's
-- metadata into portal_users, but it never wrote `enrollment_type`. Once
-- `guard_portal_student_class_pathway` landed (20260927000045) it began rejecting any
-- student row that has a class but no enrollment type, so every auth account created
-- with `class_id` in its metadata failed at the database level. Supabase surfaces that
-- as the opaque "Database error creating new user", which is what broke summer-school
-- onboarding: the student account could never be created.
--
-- Two changes, both strictly widening (an insert that succeeded before still succeeds):
--   1. Carry `enrollment_type` through from the metadata when it is supplied.
--   2. When a student has no resolvable enrollment type, leave `class_id` NULL rather
--      than writing a row the guard must reject. The caller assigns class and
--      enrollment type together in the portal_users upsert that immediately follows,
--      which satisfies the guard.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_school_id uuid;
  v_class_id uuid;
  v_enrollment_type text;
  v_active boolean;
BEGIN
  v_role := lower(COALESCE(NEW.raw_user_meta_data->>'role', 'student'));
  BEGIN
    v_school_id := NULLIF(NEW.raw_user_meta_data->>'school_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_school_id := NULL;
  END;
  BEGIN
    v_class_id := NULLIF(NEW.raw_user_meta_data->>'class_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_class_id := NULL;
  END;

  -- Normalise through the same helper the guard uses, so "special"/"school"/... all
  -- resolve identically on both sides. NULL when absent or unrecognised.
  BEGIN
    v_enrollment_type := public.canonical_academic_enrollment_type(
      NULLIF(NEW.raw_user_meta_data->>'enrollment_type', '')
    );
  EXCEPTION WHEN others THEN
    v_enrollment_type := NULL;
  END;

  -- A student with a class but no enrollment type is exactly what
  -- guard_portal_student_class_pathway rejects. Defer the class assignment to the
  -- caller's upsert instead of failing the whole auth signup.
  IF v_role = 'student' AND v_class_id IS NOT NULL AND v_enrollment_type IS NULL THEN
    v_class_id := NULL;
  END IF;

  -- Admins are platform-scoped. Everyone else starts inactive unless metadata
  -- already carries the required school (and class for students).
  IF v_role = 'admin' THEN
    v_active := true;
  ELSIF v_role = 'student' THEN
    v_active := (v_school_id IS NOT NULL AND v_class_id IS NOT NULL);
  ELSIF v_role IN ('parent', 'teacher', 'school') THEN
    v_active := (v_school_id IS NOT NULL);
  ELSE
    v_active := false;
  END IF;

  INSERT INTO public.portal_users (
    id,
    email,
    full_name,
    role,
    school_id,
    class_id,
    enrollment_type,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    v_role,
    v_school_id,
    v_class_id,
    v_enrollment_type,
    v_active,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;
