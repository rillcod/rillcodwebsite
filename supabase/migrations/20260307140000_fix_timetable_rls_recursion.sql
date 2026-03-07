-- =============================================
-- FIX: Infinite recursion in timetable RLS policies
-- Root cause:
--   timetable_slots → school_read_slots subquery → timetables (RLS)
--                   → teacher_read_timetables subquery → timetable_slots ← CYCLE
-- Fix:
--   1. Remove timetable_slots subquery from teacher_read_timetables
--   2. Use SECURITY DEFINER functions for slot policies that need timetable.school_id
-- =============================================

-- Helper: returns timetable IDs belonging to a given school_id
-- SECURITY DEFINER bypasses RLS so it doesn't trigger the cycle
CREATE OR REPLACE FUNCTION public.get_timetable_ids_by_school(p_school_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.timetables WHERE school_id = p_school_id;
$$;

-- ─── Fix: teacher_read_timetables ────────────────────────────────
-- Remove the OR clause that queried timetable_slots (caused the cycle).
-- Teachers see timetables for their own school only.
DROP POLICY IF EXISTS "teacher_read_timetables" ON public.timetables;
CREATE POLICY "teacher_read_timetables" ON public.timetables
  FOR SELECT TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM public.portal_users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- ─── Fix: school_read_slots ──────────────────────────────────────
-- Use SECURITY DEFINER helper so we never trigger timetable RLS inside a slot policy.
DROP POLICY IF EXISTS "school_read_slots" ON public.timetable_slots;
CREATE POLICY "school_read_slots" ON public.timetable_slots
  FOR SELECT TO authenticated
  USING (
    timetable_id IN (
      SELECT public.get_timetable_ids_by_school(pu.school_id)
      FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'school'
    )
  );

-- ─── Fix: student_read_slots ─────────────────────────────────────
DROP POLICY IF EXISTS "student_read_slots" ON public.timetable_slots;
CREATE POLICY "student_read_slots" ON public.timetable_slots
  FOR SELECT TO authenticated
  USING (
    timetable_id IN (
      SELECT public.get_timetable_ids_by_school(pu.school_id)
      FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.role = 'student'
    )
  );
