-- Grade-specific weekly progression seed (3 years x 3 terms x 12 weeks = 108 weeks per grade/track)
-- Covers: Basic 1-6, JSS 1-3, SS 1-2

with regular_programs as (
  select p.id as program_id
  from public.programs p
  where coalesce(p.program_scope, 'regular_school') = 'regular_school'
),
grade_track_map as (
  select * from (
    values
      ('basic_1', 'Basic 1', 'basic_1_6', 'young_innovator'),
      ('basic_2', 'Basic 2', 'basic_1_6', 'young_innovator'),
      ('basic_3', 'Basic 3', 'basic_1_6', 'young_innovator'),
      ('basic_4', 'Basic 4', 'basic_1_6', 'python'),
      ('basic_4', 'Basic 4', 'basic_1_6', 'html_css'),
      ('basic_5', 'Basic 5', 'basic_1_6', 'python'),
      ('basic_5', 'Basic 5', 'basic_1_6', 'html_css'),
      ('basic_6', 'Basic 6', 'basic_1_6', 'python'),
      ('basic_6', 'Basic 6', 'basic_1_6', 'html_css'),
      ('jss_1', 'JSS 1', 'jss_1_3', 'jss_web_app'),
      ('jss_1', 'JSS 1', 'jss_1_3', 'jss_python'),
      ('jss_2', 'JSS 2', 'jss_1_3', 'jss_web_app'),
      ('jss_2', 'JSS 2', 'jss_1_3', 'jss_python'),
      ('jss_3', 'JSS 3', 'jss_1_3', 'jss_web_app'),
      ('jss_3', 'JSS 3', 'jss_1_3', 'jss_python'),
      ('ss_1', 'SS 1', 'ss_1_2', 'ss_uiux_mobile'),
      ('ss_1', 'SS 1', 'ss_1_2', 'python'),
      ('ss_2', 'SS 2', 'ss_1_2', 'ss_uiux_mobile'),
      ('ss_2', 'SS 2', 'ss_1_2', 'python')
  ) as t(grade_key, grade_label, syllabus_phase, track)
),
week_series as (
  select
    w as week_index,
    ((w - 1) / 36) + 1 as year_number,
    (((w - 1) % 36) / 12) + 1 as term_number,
    (((w - 1) % 12) + 1) as week_number,
    ((w - 1) % 6) + 1 as difficulty
  from generate_series(1, 108) as w
),
seed_rows as (
  select
    rp.program_id,
    gtm.grade_key,
    gtm.grade_label,
    gtm.syllabus_phase,
    gtm.track,
    ws.week_index,
    ws.year_number,
    ws.term_number,
    ws.week_number,
    ws.difficulty
  from regular_programs rp
  cross join grade_track_map gtm
  cross join week_series ws
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
  s.program_id,
  null as course_id,
  'seed:' || left(s.program_id::text, 8) || ':' || s.grade_key || ':' || s.track || ':y' || s.year_number || 't' || s.term_number || 'w' || s.week_number as project_key,
  case s.track
    when 'young_innovator' then s.grade_label || ' Week ' || s.week_index || ': Creative Scratch Build'
    when 'python' then s.grade_label || ' Week ' || s.week_index || ': Python Practical Build'
    when 'html_css' then s.grade_label || ' Week ' || s.week_index || ': HTML/CSS Studio Page'
    when 'jss_web_app' then s.grade_label || ' Week ' || s.week_index || ': React/Tailwind App Sprint'
    when 'jss_python' then s.grade_label || ' Week ' || s.week_index || ': Teen Python Engineering'
    when 'ss_uiux_mobile' then s.grade_label || ' Week ' || s.week_index || ': UI/UX + Capacitor Studio'
    else s.grade_label || ' Week ' || s.week_index || ': Practical Build'
  end as title,
  s.track,
  case s.track
    when 'young_innovator' then array['scratch','logic','storytelling','blocks']
    when 'python' then array['python','algorithms','automation','problem-solving']
    when 'html_css' then array['html','css','layout','responsive']
    when 'jss_web_app' then array['javascript','react','tailwind','typescript']
    when 'jss_python' then array['python','javascript','react','ai_automation']
    when 'ss_uiux_mobile' then array['ui_ux','design_system','capacitor','mobile']
    else array['practical','project']
  end as concept_tags,
  least(10, greatest(1, s.difficulty)) as difficulty_level,
  'Class build for ' || s.grade_label || ' (Y' || s.year_number || ' T' || s.term_number || ' W' || s.week_number || ') with practical demo and reflection.' as classwork_prompt,
  case
    when s.track in ('jss_web_app', 'jss_python', 'ss_uiux_mobile') then 70
    when s.track in ('python', 'html_css') then 60
    else 45
  end as estimated_minutes,
  jsonb_build_object(
    'seed_version', 'grade_specific_v1',
    'grade_key', s.grade_key,
    'grade_label', s.grade_label,
    'syllabus_phase', s.syllabus_phase,
    'year_number', s.year_number,
    'term_number', s.term_number,
    'week_number', s.week_number,
    'week_index', s.week_index,
    'assignment_template', 'practical_weekly',
    'project_template', 'studio_build_weekly'
  ) as metadata,
  true as is_active
from seed_rows s
on conflict (project_key) do update
set
  title = excluded.title,
  concept_tags = excluded.concept_tags,
  difficulty_level = excluded.difficulty_level,
  classwork_prompt = excluded.classwork_prompt,
  estimated_minutes = excluded.estimated_minutes,
  metadata = excluded.metadata,
  is_active = true,
  updated_at = now();
