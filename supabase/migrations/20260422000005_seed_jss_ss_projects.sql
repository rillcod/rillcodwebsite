-- Stage 2d: seed platform projects for JSS 1-3 and SS 1-2 progression tracks
-- Idempotent: upserts by project_key.

with target_programs as (
  select p.id
  from public.programs p
  where p.program_scope = 'regular_school'
    and p.school_progression_enabled = true
),
track_catalog as (
  select *
  from (values
    ('jss_web_app'::text, 'JSS Web App Studio'::text),
    ('ss_uiux_mobile'::text, 'SS UI/UX + Mobile Lab'::text)
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
  concat(tc.label, ' Week ', sw.seq) as title,
  tc.track,
  case
    when tc.track = 'jss_web_app' then array[
      'react',
      'typescript',
      'tailwind',
      'components',
      'state-management'
    ]::text[]
    else array[
      'ui-ux',
      'mobile-design',
      'capacitor',
      'prototype',
      'usability-testing'
    ]::text[]
  end as concept_tags,
  least(10, 2 + ((sw.seq - 1) / 10))::int as difficulty_level,
  case
    when tc.track = 'jss_web_app'
      then concat('Build a React + Tailwind + TypeScript mini web app for week ', sw.seq, ' and present architecture choices.')
    else concat('Design UI/UX flow and package a Capacitor mobile app prototype for week ', sw.seq, '.')
  end as classwork_prompt,
  (45 + ((sw.seq - 1) % 6) * 5)::int as estimated_minutes,
  jsonb_build_object(
    'seed_source', 'platform_jss_ss',
    'scope', 'jss_ss',
    'sequence', sw.seq,
    'session_hint', ((sw.seq - 1) / 36) + 1,
    'term_hint', (((sw.seq - 1) % 36) / 12) + 1,
    'stack', case
      when tc.track = 'jss_web_app' then jsonb_build_array('react', 'tailwind', 'typescript')
      else jsonb_build_array('ui_ux', 'capacitor', 'mobile_app')
    end
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
