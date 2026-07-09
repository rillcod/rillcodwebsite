-- Tie a class recording to a specific lesson (like a lesson resource), so the replay can
-- surface under that lesson in the learning path. Nullable — a recording may be general.
ALTER TABLE public.session_recordings
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_recordings_lesson
  ON public.session_recordings(lesson_id) WHERE lesson_id IS NOT NULL;
