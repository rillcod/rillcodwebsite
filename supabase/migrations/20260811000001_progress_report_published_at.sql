-- publish-service stamps published_at when a report goes live. The column was
-- never added to student_progress_reports, so PostgREST rejected every publish
-- with "Could not find the 'published_at' column … in the schema cache".

ALTER TABLE public.student_progress_reports
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

COMMENT ON COLUMN public.student_progress_reports.published_at IS
  'When the report was first published to parents/students. Cleared on unpublish.';

-- Existing published drafts: best-effort stamp from updated_at so history isn't blank.
UPDATE public.student_progress_reports
SET published_at = COALESCE(updated_at, created_at, now())
WHERE is_published = true
  AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_spr_published_at
  ON public.student_progress_reports (published_at)
  WHERE published_at IS NOT NULL;
