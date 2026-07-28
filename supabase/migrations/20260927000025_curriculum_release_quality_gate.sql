-- Fuse the existing QA spine into curriculum governance.
-- Official curriculum editions are immutable, timetable-neutral snapshots. This
-- gate checks their academic structure before they can be published; each school
-- can still enter the edition in any term/week through its delivery schedule.

alter table public.academic_curriculum_releases
  add column if not exists qa_catalog_version text,
  add column if not exists quality_status text not null default 'pending',
  add column if not exists quality_report jsonb not null default '{}'::jsonb,
  add column if not exists quality_checked_at timestamptz;

do $$ begin
  alter table public.academic_curriculum_releases
    add constraint academic_curriculum_releases_quality_status_check
    check (quality_status in ('pending', 'passed', 'failed'));
exception when duplicate_object then null;
end $$;

create or replace function public.curriculum_release_quality_report(p_content jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_terms jsonb;
  v_term jsonb;
  v_week jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_seen text[] := array[]::text[];
  v_key text;
  v_term_no int;
  v_week_no int;
  v_year_no int;
  v_week_count int := 0;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return jsonb_build_object(
      'passed', false,
      'errors', jsonb_build_array('Curriculum content must be a structured document.'),
      'warnings', v_warnings,
      'term_count', 0,
      'week_count', 0
    );
  end if;

  v_terms := p_content -> 'terms';
  if jsonb_typeof(v_terms) <> 'array' or jsonb_array_length(v_terms) = 0 then
    return jsonb_build_object(
      'passed', false,
      'errors', jsonb_build_array('Add at least one curriculum term before publication.'),
      'warnings', v_warnings,
      'term_count', 0,
      'week_count', 0
    );
  end if;

  for v_term in select value from jsonb_array_elements(v_terms)
  loop
    v_term_no := case when (v_term ->> 'term') ~ '^[1-9][0-9]*$' then (v_term ->> 'term')::int else null end;
    v_year_no := case when coalesce(v_term ->> 'year', '1') ~ '^[1-9][0-9]*$' then coalesce(v_term ->> 'year', '1')::int else 1 end;

    if v_term_no is null then
      v_errors := v_errors || jsonb_build_array('Every curriculum section needs a valid term position.');
      continue;
    end if;

    if jsonb_typeof(v_term -> 'weeks') <> 'array' or jsonb_array_length(v_term -> 'weeks') = 0 then
      v_errors := v_errors || jsonb_build_array(format('Year %s, Term %s has no teaching weeks.', v_year_no, v_term_no));
      continue;
    end if;

    for v_week in select value from jsonb_array_elements(v_term -> 'weeks')
    loop
      v_week_count := v_week_count + 1;
      v_week_no := case when (v_week ->> 'week') ~ '^[1-9][0-9]*$' then (v_week ->> 'week')::int else null end;
      if v_week_no is null then
        v_errors := v_errors || jsonb_build_array(format('Year %s, Term %s contains a week without a valid number.', v_year_no, v_term_no));
        continue;
      end if;

      v_key := format('%s:%s:%s', v_year_no, v_term_no, v_week_no);
      if v_key = any(v_seen) then
        v_errors := v_errors || jsonb_build_array(format('Year %s, Term %s, Week %s is duplicated.', v_year_no, v_term_no, v_week_no));
      else
        v_seen := array_append(v_seen, v_key);
      end if;

      if nullif(btrim(coalesce(v_week ->> 'topic', '')), '') is null then
        v_errors := v_errors || jsonb_build_array(format('Year %s, Term %s, Week %s needs a clear topic.', v_year_no, v_term_no, v_week_no));
      end if;

      if jsonb_typeof(v_week -> 'subtopics') <> 'array' or jsonb_array_length(coalesce(v_week -> 'subtopics', '[]'::jsonb)) = 0 then
        v_warnings := v_warnings || jsonb_build_array(format('Year %s, Term %s, Week %s has no supporting focus points.', v_year_no, v_term_no, v_week_no));
      end if;
    end loop;
  end loop;

  if nullif(btrim(coalesce(p_content ->> 'overview', '')), '') is null then
    v_warnings := v_warnings || jsonb_build_array('Add a short curriculum overview for teachers.');
  end if;

  return jsonb_build_object(
    'passed', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'warnings', v_warnings,
    'term_count', jsonb_array_length(v_terms),
    'week_count', v_week_count,
    'qa_spine', coalesce(p_content #> '{metadata,qa_spine}', 'null'::jsonb)
  );
end;
$$;

create or replace function public.enforce_curriculum_release_quality()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report jsonb;
begin
  v_report := public.curriculum_release_quality_report(new.content);
  new.quality_report := v_report;
  new.quality_checked_at := now();
  new.qa_catalog_version := coalesce(
    nullif(new.content #>> '{metadata,qa_spine,catalog_version}', ''),
    new.qa_catalog_version
  );
  new.quality_status := case when coalesce((v_report ->> 'passed')::boolean, false) then 'passed' else 'failed' end;

  if new.status = 'published' and new.quality_status <> 'passed' then
    raise exception using
      errcode = '23514',
      message = 'This curriculum is not ready to become the official academic direction.',
      detail = coalesce(v_report -> 'errors', '[]'::jsonb)::text,
      hint = 'Correct the highlighted term/week gaps and publish again.';
  end if;
  return new;
end;
$$;

drop trigger if exists academic_curriculum_release_quality_gate
  on public.academic_curriculum_releases;
create trigger academic_curriculum_release_quality_gate
before insert or update of content, status
on public.academic_curriculum_releases
for each row execute function public.enforce_curriculum_release_quality();

comment on function public.curriculum_release_quality_report(jsonb) is
  'Human-readable structural QA report for an official curriculum edition. Timing differences belong to delivery schedules, not the core edition.';

