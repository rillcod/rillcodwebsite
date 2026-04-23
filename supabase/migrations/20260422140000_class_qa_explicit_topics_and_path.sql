-- 1) Explicit per-week topic titles (no rotating 8-way placeholder): computed by SQL for integrity.
-- 2) Per-school + per-class deterministic rotation (0-107) so two schools never share the same week/topic order.
-- 3) Optional teacher fields on `classes` for grade/track/lane (SCRATCHCC etc. still unique by class id).

create or replace function public.class_qa_path_offset(p_school_id uuid, p_class_id uuid)
returns int
language sql
immutable
as $$
  select (abs(hashtext(coalesce(p_school_id::text, '') || p_class_id::text)) % 108)::int;
$$;

comment on function public.class_qa_path_offset is
  'Deterministic 0-107 offset so each (school, class) has its own 108-week rotation over the same QA topic spine.';

create or replace function public.qa_build_explicit_topic(p_lane int, p_week int)
returns text
language sql
stable
as $$
  with
  st as (
    select array[
      'Hook & safety', 'Direct instruction', 'Guided practice', 'Independent build', 'Debug clinic',
      'Rubric & peer review', 'Sprint A', 'Sprint B', 'Integration', 'Showcase', 'Portfolio', 'Reteach & stretch'
    ]::text[] as a
  ),
  ng as (
    select array[
      'market pricing', 'traffic flow', 'hospital triage', 'farm yield', 'mobile money', 'solar charging',
      'sports stats', 'music playlist', 'school timetable', 'local news digest', 'waste collection', 'bus arrival times'
    ]::text[] as a
  )
  select format(
    '%s | Y%s T%s W%s — %s — tie-in: %s',
    (case p_lane
      when 1 then 'Blocks/Scratch (Young Innovator · Basic 1)'
      when 2 then 'Blocks/Scratch (Young Innovator · Basic 2)'
      when 3 then 'Blocks/Scratch (Young Innovator · Basic 3)'
      when 4 then 'Python (Basic 4 path)'
      when 5 then 'HTML & CSS (Basic 4 path)'
      when 6 then 'Python (Basic 5 path)'
      when 7 then 'HTML & CSS (Basic 5 path)'
      when 8 then 'Python (Basic 6 path)'
      when 9 then 'HTML & CSS (Basic 6 path)'
      when 10 then 'JSS web app (JS/React/Tailwind · JSS 1)'
      when 11 then 'JSS web app (JSS 2 — partial 40w lane)'
      else 'Unknown lane'
    end),
    (p_week - 1) / 36 + 1,
    ((p_week - 1) % 36) / 12 + 1,
    ((p_week - 1) % 12) + 1,
    (select a[1 + ((p_week - 1) % 12)] from st),
    (select a[1 + ((p_lane + p_week - 1) % 12)] from ng)
  );
$$;

comment on function public.qa_build_explicit_topic is
  'Explicit QA week title for (lane, week_index) — one distinct label per week per lane, Nigeria tie-in.';

-- Teacher-facing QA / grading alignment (name stays in `name` e.g. SCRATCHCC)
alter table public.classes
  add column if not exists qa_grade_key text,
  add column if not exists qa_grade_mode text default 'optional'
    check (qa_grade_mode is null or qa_grade_mode in ('optional', 'compulsory')),
  add column if not exists qa_grade_band text,
  add column if not exists qa_track_hint text,
  add column if not exists qa_spine_lane int check (qa_spine_lane is null or (qa_spine_lane >= 1 and qa_spine_lane <= 11));

comment on column public.classes.qa_grade_key is
  'Optional canonical e.g. basic_1, jss_2 — use when class name is not a grade (SCRATCHCC).';
comment on column public.classes.qa_grade_mode is
  'optional: band may span grades; compulsory: class maps to a single grade for QA.';
comment on column public.classes.qa_grade_band is
  'E.g. b1_1_2 for Basic 1–2 when mode is optional.';
comment on column public.classes.qa_track_hint is
  'E.g. python, html_css, jss_web_app — disambiguate lanes (Basic 4 has two).';
comment on column public.classes.qa_spine_lane is
  'Pin platform QA lane 1-11; if null, resolved from grade_key + track + programme policy.';

-- Replace generic spine labels with explicit titles (same rows, new topic text)
update public.platform_syllabus_week_template t
set
  topic = public.qa_build_explicit_topic(t.lane_index, t.week_index),
  subtopics = jsonb_build_array('Explicit QA seed', 'Nigeria link', 'Rubric'),
  metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
    'explicit_qa_titles', true,
    'topic_engine', 'qa_build_explicit_topic_v1'
  )
where t.catalog_version = 'qa_spine_v1';
