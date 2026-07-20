-- Saved school-level performance report books.
-- A published report stores a frozen aggregate snapshot so later source-data
-- changes cannot silently rewrite what the school previously received.

CREATE TABLE IF NOT EXISTS public.school_performance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  period_start date NOT NULL,
  academic_term_id uuid REFERENCES public.academic_terms(id) ON DELETE SET NULL,
  academic_year text NOT NULL,
  term_label text NOT NULL,
  period_end date NOT NULL,
  curriculum_start_term integer NOT NULL DEFAULT 1 CHECK (curriculum_start_term BETWEEN 1 AND 20),
  curriculum_start_week integer NOT NULL DEFAULT 1 CHECK (curriculum_start_week BETWEEN 1 AND 60),
  curriculum_end_term integer NOT NULL DEFAULT 1 CHECK (curriculum_end_term BETWEEN 1 AND 20),
  curriculum_end_week integer NOT NULL DEFAULT 12 CHECK (curriculum_end_week BETWEEN 1 AND 60),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrative jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES public.portal_users(id),
  published_by uuid REFERENCES public.portal_users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK ((curriculum_end_term * 100 + curriculum_end_week) >= (curriculum_start_term * 100 + curriculum_start_week))
);

CREATE INDEX IF NOT EXISTS idx_school_performance_reports_school_status
  ON public.school_performance_reports(school_id, status, created_at DESC);

ALTER TABLE public.school_performance_reports ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.school_performance_reports FROM anon, authenticated;
GRANT SELECT ON public.school_performance_reports TO authenticated;
GRANT ALL ON public.school_performance_reports TO service_role;

DROP POLICY IF EXISTS school_report_read_access ON public.school_performance_reports;
CREATE POLICY school_report_read_access
ON public.school_performance_reports
FOR SELECT TO authenticated
USING (
  public.is_active_admin()
  OR EXISTS (
    SELECT 1 FROM public.portal_users pu
    WHERE pu.id = auth.uid()
      AND pu.is_active = true
      AND COALESCE(pu.is_deleted, false) = false
      AND (
        (pu.role = 'school' AND pu.school_id = school_id AND status = 'published')
        OR (
          pu.role = 'teacher'
          AND (
            pu.school_id = school_id
            OR EXISTS (
              SELECT 1 FROM public.teacher_schools ts
              WHERE ts.teacher_id = pu.id AND ts.school_id = school_id
            )
          )
        )
      )
  )
);

COMMENT ON TABLE public.school_performance_reports IS
  'Frozen, publishable school-wide performance and curriculum report snapshots with staff-curated narrative.';
