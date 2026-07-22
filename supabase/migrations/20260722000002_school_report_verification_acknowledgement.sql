ALTER TABLE public.school_performance_reports
  ADD COLUMN IF NOT EXISTS verification_code text,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acknowledgement_name text,
  ADD COLUMN IF NOT EXISTS acknowledgement_note text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_performance_reports_verification_code
  ON public.school_performance_reports (verification_code)
  WHERE verification_code IS NOT NULL;
