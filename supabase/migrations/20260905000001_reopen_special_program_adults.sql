-- Reopen featured special-programme registration; welcome adults & individuals.
UPDATE public.special_program_pages
SET
  registration_deadline = '2026-09-07',
  ends_on = COALESCE(ends_on, '2026-09-07'),
  is_published = true,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'ages_label', 'Ages 8+ · Kids, teens & adults',
    'age_min', 8,
    'age_max', 99,
    'next_path_heading', 'After this cohort',
    'next_path_intro', 'Kids, teens, adults, and individual learners are all welcome. We help you continue into Young Innovators or Teen Developers (school-age), or specialist tracks for older teens and adults.'
  ),
  updated_at = now()
WHERE is_featured = true
   OR slug = 'ai-summer-school-2026';
