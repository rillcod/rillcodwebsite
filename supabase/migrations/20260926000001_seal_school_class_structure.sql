-- Seal portal structure: every ACTIVE non-admin account must belong to a school.
-- Active students must also belong to a class.
--
-- Auth trigger historically inserted is_active=true with no school, which forced us
-- to drop Gate C. This migration fixes the trigger first, backfills what we can,
-- deactivates remaining violators (so they cannot log in until placed), then
-- restores a hard BEFORE trigger that cannot be bypassed by app code.

-- ── 1. Auth → portal_users: never activate without structure ─────────────────
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
    v_active,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── 2. Pause name-collision gate during structural backfill ─────────────────
-- Filling school_id on legacy schoolless students can collide with an existing
-- same-name student at that school. Pause the duplicate-name trigger for the
-- backfill only; conflicts remain visible in Class Heal for manual resolution.
-- Re-enable first in case a previous partial apply left it disabled.
ALTER TABLE public.portal_users ENABLE TRIGGER trg_block_duplicate_active_student_name;
ALTER TABLE public.portal_users DISABLE TRIGGER trg_block_duplicate_active_student_name;

-- ── 3. Backfill school from class (students) ────────────────────────────────
UPDATE public.portal_users pu
SET
  school_id = c.school_id,
  school_name = COALESCE(s.name, pu.school_name),
  updated_at = NOW()
FROM public.classes c
LEFT JOIN public.schools s ON s.id = c.school_id
WHERE pu.role = 'student'
  AND pu.school_id IS NULL
  AND pu.class_id IS NOT NULL
  AND pu.class_id = c.id
  AND c.school_id IS NOT NULL;

-- ── 4. Backfill school from students registry when portal is empty ──────────
UPDATE public.portal_users pu
SET
  school_id = st.school_id,
  school_name = COALESCE(st.school_name, pu.school_name),
  updated_at = NOW()
FROM public.students st
WHERE pu.id = st.user_id
  AND pu.role = 'student'
  AND pu.school_id IS NULL
  AND st.school_id IS NOT NULL;

-- ── 5. Backfill parent school from linked children ──────────────────────────
UPDATE public.portal_users p
SET
  school_id = child.school_id,
  school_name = COALESCE(child.school_name, p.school_name),
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (l.parent_id)
    l.parent_id,
    COALESCE(pu.school_id, st.school_id) AS school_id,
    COALESCE(pu.school_name, st.school_name) AS school_name
  FROM public.parent_student_links l
  LEFT JOIN public.students st ON st.id = l.student_id
  LEFT JOIN public.portal_users pu ON pu.id = st.user_id
  WHERE COALESCE(pu.school_id, st.school_id) IS NOT NULL
  ORDER BY l.parent_id, l.created_at DESC NULLS LAST
) child
WHERE p.id = child.parent_id
  AND p.role = 'parent'
  AND p.school_id IS NULL;

-- Also via students.parent_email when explicit links are missing
UPDATE public.portal_users p
SET
  school_id = child.school_id,
  school_name = COALESCE(child.school_name, p.school_name),
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (lower(st.parent_email))
    lower(st.parent_email) AS parent_email,
    st.school_id,
    st.school_name
  FROM public.students st
  WHERE st.parent_email IS NOT NULL
    AND st.school_id IS NOT NULL
  ORDER BY lower(st.parent_email), st.updated_at DESC NULLS LAST
) child
WHERE p.role = 'parent'
  AND p.school_id IS NULL
  AND lower(p.email) = child.parent_email;

-- ── 6. Backfill teacher school from teacher_schools ─────────────────────────
UPDATE public.portal_users t
SET
  school_id = ts.school_id,
  school_name = COALESCE(s.name, t.school_name),
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (teacher_id)
    teacher_id,
    school_id
  FROM public.teacher_schools
  ORDER BY teacher_id, COALESCE(is_primary, false) DESC, assigned_at ASC NULLS LAST
) ts
LEFT JOIN public.schools s ON s.id = ts.school_id
WHERE t.id = ts.teacher_id
  AND t.role = 'teacher'
  AND t.school_id IS NULL;

-- ── 7. Deactivate remaining active accounts that still violate structure ────
-- Keep the auth user; staff must place them via Class Heal before they can log in.
UPDATE public.portal_users
SET is_active = false, updated_at = NOW()
WHERE COALESCE(is_deleted, false) = false
  AND is_active = true
  AND role = 'student'
  AND (school_id IS NULL OR class_id IS NULL);

UPDATE public.portal_users
SET is_active = false, updated_at = NOW()
WHERE COALESCE(is_deleted, false) = false
  AND is_active = true
  AND role IN ('parent', 'teacher', 'school')
  AND school_id IS NULL;

ALTER TABLE public.portal_users ENABLE TRIGGER trg_block_duplicate_active_student_name;

-- ── 8. Hard gate (cannot be bypassed by app code) ───────────────────────────
CREATE OR REPLACE FUNCTION public.require_portal_structure()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Soft-deleted / inactive rows may be incomplete while being placed.
  IF COALESCE(NEW.is_deleted, false) = true OR COALESCE(NEW.is_active, false) = false THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'student' THEN
    IF NEW.school_id IS NULL THEN
      RAISE EXCEPTION 'STRUCTURE: active student % must have a school (school_id).',
        COALESCE(NEW.full_name, NEW.email, NEW.id::text);
    END IF;
    IF NEW.class_id IS NULL THEN
      RAISE EXCEPTION 'STRUCTURE: active student % must have a class (class_id).',
        COALESCE(NEW.full_name, NEW.email, NEW.id::text);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IN ('parent', 'teacher', 'school') THEN
    IF NEW.school_id IS NULL THEN
      RAISE EXCEPTION 'STRUCTURE: active % % must have a school (school_id).',
        NEW.role,
        COALESCE(NEW.full_name, NEW.email, NEW.id::text);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_portal_structure ON public.portal_users;
CREATE TRIGGER trg_require_portal_structure
  BEFORE INSERT OR UPDATE ON public.portal_users
  FOR EACH ROW
  EXECUTE FUNCTION public.require_portal_structure();

COMMENT ON FUNCTION public.require_portal_structure() IS
  'Hard structure gate: active students need school+class; active parent/teacher/school need school; admin exempt.';
