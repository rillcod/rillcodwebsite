-- Platform QA syllabus spine: 1120 week-topic rows (10 × 108-week lanes + 1 × 40-week lane)
-- Preserves year/term/week_index pattern aligned with progression seeds (3y × 3 terms × 12 weeks = 108).
-- Teachers/admins read via RLS; optional merge into course_curricula through app tooling.

create table if not exists public.platform_syllabus_week_template (
  id uuid primary key default gen_random_uuid(),
  catalog_version text not null default 'qa_spine_v1',
  program_id uuid not null references public.programs (id) on delete cascade,
  lane_index int not null check (lane_index >= 1 and lane_index <= 11),
  track text not null,
  grade_key text not null,
  grade_label text not null,
  syllabus_phase text not null,
  year_number int not null check (year_number between 1 and 6),
  term_number int not null check (term_number between 1 and 3),
  week_number int not null check (week_number between 1 and 12),
  week_index int not null check (week_index between 1 and 108),
  topic text not null,
  subtopics jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (catalog_version, program_id, lane_index, week_index)
);

create index if not exists platform_syllabus_week_template_program_lane_idx
  on public.platform_syllabus_week_template (program_id, lane_index, week_index);

create index if not exists platform_syllabus_week_template_grade_track_idx
  on public.platform_syllabus_week_template (program_id, grade_key, track, year_number, term_number, week_number);

comment on table public.platform_syllabus_week_template is
  'Canonical week-by-week topic spine for QA and syllabus alignment (catalog_version bumps when pattern changes).';

alter table public.platform_syllabus_week_template enable row level security;

drop policy if exists "staff read platform syllabus template" on public.platform_syllabus_week_template;
create policy "staff read platform syllabus template"
  on public.platform_syllabus_week_template
  for select
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id = auth.uid()
        and pu.role in ('admin', 'teacher')
    )
  );

-- Only service role / migrations insert; no insert policy for authenticated users.

insert into public.platform_syllabus_week_template (
  catalog_version,
  program_id,
  lane_index,
  track,
  grade_key,
  grade_label,
  syllabus_phase,
  year_number,
  term_number,
  week_number,
  week_index,
  topic,
  subtopics,
  metadata
)
with
rp as (
  select p.id as program_id
  from public.programs p
  where coalesce(p.program_scope, 'regular_school') = 'regular_school'
  order by p.created_at asc nulls last
  limit 1
),
lane as (
  select * from (
    values
      (1, 'basic_1', 'Basic 1', 'basic_1_6', 'young_innovator'),
      (2, 'basic_2', 'Basic 2', 'basic_1_6', 'young_innovator'),
      (3, 'basic_3', 'Basic 3', 'basic_1_6', 'young_innovator'),
      (4, 'basic_4', 'Basic 4', 'basic_1_6', 'python'),
      (5, 'basic_4', 'Basic 4', 'basic_1_6', 'html_css'),
      (6, 'basic_5', 'Basic 5', 'basic_1_6', 'python'),
      (7, 'basic_5', 'Basic 5', 'basic_1_6', 'html_css'),
      (8, 'basic_6', 'Basic 6', 'basic_1_6', 'python'),
      (9, 'basic_6', 'Basic 6', 'basic_1_6', 'html_css'),
      (10, 'jss_1', 'JSS 1', 'jss_1_3', 'jss_web_app'),
      (11, 'jss_2', 'JSS 2', 'jss_1_3', 'jss_web_app')
  ) as t(lane_index, grade_key, grade_label, syllabus_phase, track)
),
weeks_full as (
  select
    l.lane_index,
    l.grade_key,
    l.grade_label,
    l.syllabus_phase,
    l.track,
    w as week_index,
    ((w - 1) / 36) + 1 as year_number,
    (((w - 1) % 36) / 12) + 1 as term_number,
    (((w - 1) % 12) + 1) as week_number
  from lane l
  cross join lateral generate_series(1, 108) as w
  where l.lane_index <= 10
),
weeks_partial as (
  select
    l.lane_index,
    l.grade_key,
    l.grade_label,
    l.syllabus_phase,
    l.track,
    w as week_index,
    ((w - 1) / 36) + 1 as year_number,
    (((w - 1) % 36) / 12) + 1 as term_number,
    (((w - 1) % 12) + 1) as week_number
  from lane l
  cross join lateral generate_series(1, 40) as w
  where l.lane_index = 11
),
u as (
  select * from weeks_full
  union all
  select * from weeks_partial
)
select
  'qa_spine_v1',
  rp.program_id,
  u.lane_index,
  u.track,
  u.grade_key,
  u.grade_label,
  u.syllabus_phase,
  u.year_number,
  u.term_number,
  u.week_number,
  u.week_index,
  format(
    '%s · %s · Y%s T%s W%s — %s',
    u.grade_label,
    replace(replace(u.track, '_', ' '), 'html css', 'HTML/CSS'),
    u.year_number,
    u.term_number,
    u.week_number,
    case (u.week_index + u.lane_index) % 8
      when 0 then 'Foundations & safety'
      when 1 then 'Guided build'
      when 2 then 'Pair problem-solving'
      when 3 then 'Mini-project sprint'
      when 4 then 'Debug & iterate'
      when 5 then 'Showcase prep'
      when 6 then 'Reflection & rubric'
      else 'Stretch challenge'
    end
  ) as topic,
  jsonb_build_array(
    'Hands-on build',
    'Nigerian real-world context',
    'Formative check'
  ) as subtopics,
  jsonb_build_object(
    'catalog_role', 'qa_spine',
    'pattern_family', 'rillcod_regular_school',
    'lane_index', u.lane_index,
    'stack_track', u.track,
    'syllabus_phase', u.syllabus_phase
  ) as metadata
from rp
cross join u
on conflict (catalog_version, program_id, lane_index, week_index) do update
set
  topic = excluded.topic,
  subtopics = excluded.subtopics,
  metadata = excluded.metadata,
  grade_label = excluded.grade_label,
  syllabus_phase = excluded.syllabus_phase,
  year_number = excluded.year_number,
  term_number = excluded.term_number,
  week_number = excluded.week_number,
  track = excluded.track,
  grade_key = excluded.grade_key;
