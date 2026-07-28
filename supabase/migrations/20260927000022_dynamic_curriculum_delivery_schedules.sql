-- School/class timing is an overlay on the official curriculum release.
-- It allows one school to begin at Term 3 Week 1 and another at Term 3 Week 3
-- without rotating or rewriting the canonical academic content.

CREATE TABLE IF NOT EXISTS public.academic_curriculum_delivery_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES public.academic_curriculum_releases(id) ON DELETE RESTRICT,
  academic_term_id uuid REFERENCES public.academic_terms(id) ON DELETE SET NULL,
  entry_term_number integer NOT NULL DEFAULT 1 CHECK (entry_term_number BETWEEN 1 AND 3),
  entry_week_number integer NOT NULL DEFAULT 1 CHECK (entry_week_number BETWEEN 1 AND 12),
  curriculum_year_number integer NOT NULL DEFAULT 1 CHECK (curriculum_year_number BETWEEN 1 AND 6),
  curriculum_term_number integer NOT NULL DEFAULT 1 CHECK (curriculum_term_number BETWEEN 1 AND 3),
  curriculum_week_number integer NOT NULL DEFAULT 1 CHECK (curriculum_week_number BETWEEN 1 AND 12),
  sessions_per_week integer NOT NULL DEFAULT 1 CHECK (sessions_per_week BETWEEN 1 AND 14),
  pacing_mode text NOT NULL DEFAULT 'standard'
    CHECK (pacing_mode IN ('standard', 'accelerated', 'extended', 'custom')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed')),
  created_by uuid NOT NULL REFERENCES public.portal_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_delivery_class_course_term
  ON public.academic_curriculum_delivery_schedules(class_id, course_id, academic_term_id)
  WHERE class_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_delivery_school_course_default
  ON public.academic_curriculum_delivery_schedules(school_id, course_id)
  WHERE class_id IS NULL AND academic_term_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_academic_delivery_schedule_lookup
  ON public.academic_curriculum_delivery_schedules(school_id, class_id, course_id, status);

ALTER TABLE public.academic_curriculum_delivery_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academic_delivery_schedule_scoped_read ON public.academic_curriculum_delivery_schedules;
CREATE POLICY academic_delivery_schedule_scoped_read
  ON public.academic_curriculum_delivery_schedules FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.id = auth.uid() AND pu.school_id = academic_curriculum_delivery_schedules.school_id
    )
    OR EXISTS (
      SELECT 1 FROM public.teacher_schools ts
      WHERE ts.teacher_id = auth.uid() AND ts.school_id = academic_curriculum_delivery_schedules.school_id
    )
  );

DROP POLICY IF EXISTS academic_delivery_schedule_admin_manage ON public.academic_curriculum_delivery_schedules;
CREATE POLICY academic_delivery_schedule_admin_manage
  ON public.academic_curriculum_delivery_schedules FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.academic_curriculum_delivery_schedules TO authenticated;
GRANT ALL ON public.academic_curriculum_delivery_schedules TO service_role;

COMMENT ON TABLE public.academic_curriculum_delivery_schedules IS
  'Maps a school or class local entry term/week onto an immutable curriculum release position.';
