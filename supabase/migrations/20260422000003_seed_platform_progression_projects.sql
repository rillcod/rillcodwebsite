-- Stage 2b: seed platform-level progression projects for Basic 1-6
-- Idempotent seed: upserts by project_key so it can be re-run safely.

with target_programs as (
  select p.id
  from public.programs p
  where p.program_scope = 'regular_school'
    and p.school_progression_enabled = true
),
track_catalog as (
  select *
  from (values
    ('young_innovator'::text, 'Young Innovator'::text),
    ('python'::text, 'Python'::text),
    ('html_css'::text, 'HTML + CSS'::text),
    ('mixed'::text, 'Cross Track'::text)
  ) as t(track, label)
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
  concat(
    'platform-',
    substr(p.id::text, 1, 8),
    '-',
    tc.track,
    '-w',
    lpad(sw.seq::text, 3, '0')
  ) as project_key,
  concat(tc.label, ' Practical Build Week ', sw.seq) as title,
  tc.track,
  case
    when tc.track = 'young_innovator' then array['blocks', 'logic', 'creativity', 'presentation']::text[]
    when tc.track = 'python' then array['python', 'algorithms', 'debugging', 'iteration']::text[]
    when tc.track = 'html_css' then array['html', 'css', 'layout', 'ui']::text[]
    else array['problem-solving', 'design-thinking', 'demo']::text[]
  end as concept_tags,
  least(10, 1 + ((sw.seq - 1) / 12))::int as difficulty_level,
  concat('Build, test, and present practical output for week ', sw.seq, ' using ', tc.label, ' concepts.') as classwork_prompt,
  (35 + ((sw.seq - 1) % 5) * 5)::int as estimated_minutes,
  jsonb_build_object(
    'seed_source', 'platform_default',
    'scope', 'basic_1_6',
    'sequence', sw.seq,
    'session_hint', ((sw.seq - 1) / 36) + 1,
    'term_hint', (((sw.seq - 1) % 36) / 12) + 1
  ) as metadata,
  true as is_active
from target_programs p
cross join track_catalog tc
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
