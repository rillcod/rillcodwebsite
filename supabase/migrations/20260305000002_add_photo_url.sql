-- Add photo_url to student_progress_reports
ALTER TABLE public.student_progress_reports
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Also add it to portal_users if missing (for student profile)
ALTER TABLE public.portal_users
  ADD COLUMN IF NOT EXISTS photo_url text;
