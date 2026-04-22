-- Courses: add a `metadata` JSONB column for soft tagging.
--
-- Uses cases:
--   metadata.grade_levels : text[]  — e.g. ["JSS1","JSS2","JSS3"]
--     Tells the system which school grades this course is designed for.
--     Used to pre-filter class choices when creating lesson plans and
--     to give schools a quick-at-a-glance label on the catalogue.
--   metadata.subject      : text    — e.g. "Computer Science"
--   metadata.tags         : text[]  — free-form tags for search.
--
-- Why metadata instead of dedicated columns?
--   - Keeps future tagging needs additive (no migrations per tag).
--   - Mirrors the pattern used by other tables in the schema.
--   - Supabase generated types will expose it as `Json | null`.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Lightweight index so we can filter "courses for JSS1" cheaply later.
CREATE INDEX IF NOT EXISTS idx_courses_metadata_grade_levels
  ON public.courses USING gin ((metadata -> 'grade_levels'));

COMMENT ON COLUMN public.courses.metadata IS
  'Soft tagging payload. Known keys: grade_levels (text[]), subject (text), tags (text[]).';
