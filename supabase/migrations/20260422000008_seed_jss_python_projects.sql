-- Stage 2g: seed JSS python path projects (additive)
-- Idempotent by project_key.

with target_programs as (
  select p.id
  from public.programs p
  where p.program_scope = 'regular_school'
    and p.school_progression_enabled = true
),
sequence_weeks as (
  select generate_series(1, 120) as seq
)
insert into public.curriculum_project_registry (
  school_id,
  program_id,
  course_id,
  project_key,
  title,
  track,
  concept_tags,
  difficulty_level,
  classwork_prompt,
  estimated_minutes,
  metadata,
  is_active
)
select
  null as school_id,
  p.id as program_id,
  null as course_id,
  concat('platform-', substr(p.id::text, 1, 8), '-jss_python-w', lpad(sw.seq::text, 3, '0')) as project_key,
  concat('JSS Python Studio Week ', sw.seq) as title,
  'jss_python' as track,
  array['python', 'algorithms', 'automation', 'debugging', 'problem-solving']::text[] as concept_tags,
  least(10, 2 + ((sw.seq - 1) / 10))::int as difficulty_level,
  concat('Build a Python practical solution for week ', sw.seq, ' and explain logic, structure, and optimization.') as classwork_prompt,
  (45 + ((sw.seq - 1) % 6) * 5)::int as estimated_minutes,
  jsonb_build_object(
    'seed_source', 'platform_jss_python',
    'scope', 'jss_ss',
    'sequence', sw.seq,
    'session_hint', ((sw.seq - 1) / 36) + 1,
    'term_hint', (((sw.seq - 1) % 36) / 12) + 1,
    'stack', jsonb_build_array('python', 'algorithms', 'automation')
  ) as metadata,
  true as is_active
from target_programs p
cross join sequence_weeks sw
on conflict (project_key) do update
set
  title = excluded.title,
  track = excluded.track,
  concept_tags = excluded.concept_tags,
  difficulty_level = excluded.difficulty_level,
  classwork_prompt = excluded.classwork_prompt,
  estimated_minutes = excluded.estimated_minutes,
  metadata = excluded.metadata,
  is_active = excluded.is_active,
  updated_at = now();
