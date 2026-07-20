-- Persist per-report layout and design preferences (preview + PDF).

ALTER TABLE public.school_performance_reports
  ADD COLUMN IF NOT EXISTS design jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.school_performance_reports.design IS
  'Staff-controlled layout: accent color, section visibility, density, preview device, header style.';
