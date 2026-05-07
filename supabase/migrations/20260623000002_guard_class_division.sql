-- Permanently divides students between teachers at the DB level.
--
-- primary_teacher_id: authoritative teacher for each student. Once set,
-- any attempt to move the student to a different teacher's class is BLOCKED
-- unless primary_teacher_id is also being updated in the same statement
-- (which only admin heal operations do).
--
-- Backfill order (highest trust first):
--   1. Student progress reports (most reports authored by a teacher)
--   2. Registration batch creator (who ran the CSV upload)
--   3. students.created_by (who individually registered them)

ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS primary_teacher_id uuid
    REFERENCES public.portal_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_portal_users_primary_teacher
  ON public.portal_users(primary_teacher_id)
  WHERE primary_teacher_id IS NOT NULL;

-- ── Backfill 1: progress reports (most authoritative) ───────────────────────
UPDATE public.portal_users pu
SET primary_teacher_id = (
  SELECT teacher_id
  FROM public.student_progress_reports
  WHERE student_id = pu.id AND teacher_id IS NOT NULL
  GROUP BY teacher_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE pu.role = 'student'
  AND pu.is_deleted = false
  AND pu.primary_teacher_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.student_progress_reports
    WHERE student_id = pu.id AND teacher_id IS NOT NULL
  );

-- ── Backfill 2: registration batch creator ──────────────────────────────────
UPDATE public.portal_users pu
SET primary_teacher_id = rb.created_by
FROM public.registration_results rr
JOIN public.registration_batches rb ON rb.id = rr.batch_id
WHERE lower(pu.email) = lower(rr.email)
  AND pu.role = 'student'
  AND pu.is_deleted = false
  AND pu.primary_teacher_id IS NULL
  AND rb.created_by IS NOT NULL;

-- ── Backfill 3: students.created_by ─────────────────────────────────────────
UPDATE public.portal_users pu
SET primary_teacher_id = s.created_by
FROM public.students s
WHERE pu.id = s.user_id
  AND pu.role = 'student'
  AND pu.is_deleted = false
  AND pu.primary_teacher_id IS NULL
  AND s.created_by IS NOT NULL;

-- ── Guard trigger ────────────────────────────────────────────────────────────
-- Blocks class_id changes that would move a student to a different teacher's
-- class WITHOUT also updating primary_teacher_id in the same statement.
-- This means:
--   - Regular bulk-register / enroll routes: BLOCKED (they only change class_id)
--   - Admin heal tool moves: ALLOWED (they update class_id + primary_teacher_id together)
CREATE OR REPLACE FUNCTION public.guard_student_class_division()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_class_teacher uuid;
BEGIN
  -- Only act when class_id is actually changing
  IF NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN
    RETURN NEW;
  END IF;

  -- Not a student row — skip
  IF COALESCE(OLD.role, NEW.role) != 'student' THEN
    RETURN NEW;
  END IF;

  -- No primary teacher recorded yet — student is unprotected, allow any move
  IF OLD.primary_teacher_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admin explicitly updating primary_teacher_id in the same statement
  -- (heal tool always does this when doing authorized transfers)
  IF NEW.primary_teacher_id IS DISTINCT FROM OLD.primary_teacher_id THEN
    RETURN NEW;
  END IF;

  -- Moving to no class (unenrolling) — always allowed
  IF NEW.class_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the destination class's teacher
  SELECT teacher_id INTO v_new_class_teacher
  FROM public.classes WHERE id = NEW.class_id;

  -- Same teacher as recorded owner → allow
  IF v_new_class_teacher IS NOT DISTINCT FROM OLD.primary_teacher_id THEN
    RETURN NEW;
  END IF;

  -- Different teacher without ownership transfer → BLOCK
  RAISE EXCEPTION
    'Class division violation: % is protected under their primary teacher. '
    'Use the Class Health & Repair tool to perform an authorized transfer.',
    COALESCE(OLD.full_name, OLD.id::text);
END;
$$;

-- Drop if exists so re-running migration is safe
DROP TRIGGER IF EXISTS guard_student_class_division ON public.portal_users;

CREATE TRIGGER guard_student_class_division
  BEFORE UPDATE OF class_id ON public.portal_users
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_class_division();
