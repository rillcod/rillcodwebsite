-- Harden curriculum / teaching-plan FK chains so deletes cascade cleanly
-- (no RESTRICT breakage, no orphan plans / flashcards / assignments left behind).
-- Also expands admin purge helpers for release wipe + teaching orphan cleanup.

create or replace function public._rill_rebind_fk(
  p_table text,
  p_column text,
  p_ref_table text,
  p_ref_column text default 'id',
  p_on_delete text default 'CASCADE',
  p_on_update text default 'CASCADE',
  p_constraint_name text default null
) returns void
language plpgsql
as $$
declare
  v_con name;
  v_table regclass;
  v_ref regclass;
  v_new_name text;
  v_sql text;
  v_attnum int;
  v_short text;
begin
  v_table := to_regclass(p_table);
  v_ref := to_regclass(p_ref_table);
  if v_table is null or v_ref is null then
    return;
  end if;

  select a.attnum into v_attnum
  from pg_attribute a
  where a.attrelid = v_table
    and a.attname = p_column
    and not a.attisdropped;
  if v_attnum is null then
    return;
  end if;

  for v_con in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = v_table
      and c.contype = 'f'
      and a.attname = p_column
      and c.confrelid = v_ref
  loop
    execute format('alter table %s drop constraint %I', v_table, v_con);
  end loop;

  v_short := regexp_replace(p_table, '^public\.', '');
  v_new_name := coalesce(p_constraint_name, format('%s_%s_fkey', v_short, p_column));

  v_sql := format(
    'alter table %s add constraint %I foreign key (%I) references %s(%I) on delete %s on update %s',
    v_table,
    v_new_name,
    p_column,
    v_ref,
    p_ref_column,
    p_on_delete,
    p_on_update
  );
  begin
    execute v_sql;
  exception
    when duplicate_object then
      null;
    when others then
      raise notice 'skip rebind %.%: %', p_table, p_column, sqlerrm;
  end;
end;
$$;

-- ── course_curricula children ───────────────────────────────────────────────
select public._rill_rebind_fk('public.lesson_plans', 'curriculum_version_id', 'public.course_curricula', 'id', 'CASCADE', 'CASCADE', 'fk_lesson_plans_curriculum');
select public._rill_rebind_fk('public.academic_curriculum_releases', 'source_curriculum_id', 'public.course_curricula', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.academic_curriculum_quality_runs', 'curriculum_id', 'public.course_curricula', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.academic_curriculum_proposals', 'curriculum_id', 'public.course_curricula', 'id', 'SET NULL', 'CASCADE');
select public._rill_rebind_fk('public.curriculum_week_tracking', 'curriculum_id', 'public.course_curricula', 'id', 'CASCADE', 'CASCADE', 'curriculum_week_tracking_curriculum_fkey');

-- ── academic_curriculum_releases children ───────────────────────────────────
select public._rill_rebind_fk('public.academic_curriculum_adoptions', 'release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.academic_curriculum_delivery_schedules', 'release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.academic_offering_curriculum_directions', 'release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.curriculum_week_tracking', 'curriculum_release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.lesson_plans', 'curriculum_release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.assignments', 'curriculum_release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.cbt_exams', 'curriculum_release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.exams', 'curriculum_release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
-- Keep student academic history; only detach the edition pointer.
select public._rill_rebind_fk('public.student_progress_reports', 'curriculum_release_id', 'public.academic_curriculum_releases', 'id', 'SET NULL', 'CASCADE');
select public._rill_rebind_fk('public.enrollment_term_grades', 'curriculum_release_id', 'public.academic_curriculum_releases', 'id', 'SET NULL', 'CASCADE');
select public._rill_rebind_fk('public.academic_assessment_evidence', 'curriculum_release_id', 'public.academic_curriculum_releases', 'id', 'SET NULL', 'CASCADE');
select public._rill_rebind_fk('public.flashcard_decks', 'curriculum_release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.lesson_materials', 'curriculum_release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.academic_curriculum_proposals', 'release_id', 'public.academic_curriculum_releases', 'id', 'SET NULL', 'CASCADE');
select public._rill_rebind_fk('public.academic_curriculum_quality_runs', 'release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.academic_curriculum_rollout_events', 'release_id', 'public.academic_curriculum_releases', 'id', 'CASCADE', 'CASCADE');

-- ── lesson_plans children (no orphan assignments / flashcards / exams) ──────
select public._rill_rebind_fk('public.assignments', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.exams', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
-- Evidence stays if a plan goes; only detach (student record).
select public._rill_rebind_fk('public.academic_assessment_evidence', 'lesson_plan_id', 'public.lesson_plans', 'id', 'SET NULL', 'CASCADE');
select public._rill_rebind_fk('public.cbt_exams', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.flashcard_decks', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.lessons', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.lesson_materials', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.class_lesson_delivery', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.curriculum_week_tracking', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.curriculum_week_performance', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.term_schedules', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.progression_override_audit', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.lesson_plan_pattern_applications', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.curriculum_project_usage', 'lesson_plan_id', 'public.lesson_plans', 'id', 'CASCADE', 'CASCADE');

-- ── lessons children ────────────────────────────────────────────────────────
select public._rill_rebind_fk('public.flashcard_decks', 'lesson_id', 'public.lessons', 'id', 'CASCADE', 'CASCADE');
select public._rill_rebind_fk('public.assignments', 'lesson_id', 'public.lessons', 'id', 'SET NULL', 'CASCADE');
select public._rill_rebind_fk('public.cbt_exams', 'lesson_id', 'public.lessons', 'id', 'SET NULL', 'CASCADE');
select public._rill_rebind_fk('public.exams', 'lesson_id', 'public.lessons', 'id', 'SET NULL', 'CASCADE');
select public._rill_rebind_fk('public.lesson_materials', 'lesson_id', 'public.lessons', 'id', 'CASCADE', 'CASCADE');

-- Drop helper (keep schema tidy; re-create if a later migration needs it)
drop function if exists public._rill_rebind_fk(text, text, text, text, text, text, text);

-- ── Expanded release purge (cascade-aware + teaching children) ──────────────
create or replace function public.admin_purge_curriculum_releases(p_release_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_release_ids, '{}');
  v_plan_ids uuid[];
  v_deleted int := 0;
begin
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('ok', true, 'deleted', 0);
  end if;

  -- Collect plans that will cascade-delete with these releases so we can
  -- clear trigger-guarded rows first if CASCADE is not yet live.
  select coalesce(array_agg(id), '{}') into v_plan_ids
  from public.lesson_plans
  where curriculum_release_id = any(v_ids);

  perform set_config('session_replication_role', 'replica', true);

  -- Explicit pre-clears (safe even after CASCADE FKs are in place)
  delete from public.academic_curriculum_delivery_schedules where release_id = any(v_ids);
  delete from public.academic_offering_curriculum_directions where release_id = any(v_ids);
  delete from public.academic_curriculum_adoptions where release_id = any(v_ids);
  delete from public.curriculum_week_tracking where curriculum_release_id = any(v_ids);

  if cardinality(v_plan_ids) > 0 then
    delete from public.assignments where lesson_plan_id = any(v_plan_ids);
    delete from public.exams where lesson_plan_id = any(v_plan_ids);
    delete from public.cbt_exams where lesson_plan_id = any(v_plan_ids);
    delete from public.flashcard_decks where lesson_plan_id = any(v_plan_ids);
    update public.academic_assessment_evidence
      set lesson_plan_id = null
      where lesson_plan_id = any(v_plan_ids);
    delete from public.lessons where lesson_plan_id = any(v_plan_ids);
    delete from public.lesson_materials where lesson_plan_id = any(v_plan_ids);
    delete from public.lesson_plans where id = any(v_plan_ids);
  end if;

  delete from public.assignments where curriculum_release_id = any(v_ids);
  delete from public.cbt_exams where curriculum_release_id = any(v_ids);
  delete from public.exams where curriculum_release_id = any(v_ids);
  delete from public.flashcard_decks where curriculum_release_id = any(v_ids);
  delete from public.lesson_materials where curriculum_release_id = any(v_ids);
  -- Preserve student transcript rows; only detach the edition.
  update public.student_progress_reports set curriculum_release_id = null where curriculum_release_id = any(v_ids);
  update public.enrollment_term_grades set curriculum_release_id = null where curriculum_release_id = any(v_ids);
  update public.academic_assessment_evidence set curriculum_release_id = null where curriculum_release_id = any(v_ids);
  delete from public.academic_curriculum_quality_runs where release_id = any(v_ids);

  delete from public.academic_curriculum_releases where id = any(v_ids);
  get diagnostics v_deleted = row_count;

  perform set_config('session_replication_role', 'origin', true);

  return jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'plans_removed', cardinality(v_plan_ids)
  );
exception
  when others then
    perform set_config('session_replication_role', 'origin', true);
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'hint', sqlstate);
end;
$$;

revoke all on function public.admin_purge_curriculum_releases(uuid[]) from public;
grant execute on function public.admin_purge_curriculum_releases(uuid[]) to service_role;

-- ── Teaching orphan inspector / purger ──────────────────────────────────────
create or replace function public.admin_inspect_teaching_orphans()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orphan_plans jsonb := '[]'::jsonb;
  v_orphan_lessons jsonb := '[]'::jsonb;
  v_orphan_assignments jsonb := '[]'::jsonb;
  v_orphan_flashcards jsonb := '[]'::jsonb;
  v_orphan_exams jsonb := '[]'::jsonb;
  v_orphan_cbt jsonb := '[]'::jsonb;
begin
  -- Plans pointing at missing class / course / curriculum version
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', lp.id,
    'status', lp.status,
    'class_id', lp.class_id,
    'course_id', lp.course_id,
    'curriculum_version_id', lp.curriculum_version_id,
    'curriculum_release_id', lp.curriculum_release_id,
    'reason', case
      when lp.class_id is not null and c.id is null then 'missing_class'
      when lp.course_id is not null and co.id is null then 'missing_course'
      when lp.curriculum_version_id is not null and cc.id is null then 'missing_curriculum'
      when lp.curriculum_release_id is not null and r.id is null then 'missing_release'
      when lp.class_id is null and lp.course_id is null then 'unattached'
      else 'orphan'
    end
  )), '[]'::jsonb)
  into v_orphan_plans
  from public.lesson_plans lp
  left join public.classes c on c.id = lp.class_id
  left join public.courses co on co.id = lp.course_id
  left join public.course_curricula cc on cc.id = lp.curriculum_version_id
  left join public.academic_curriculum_releases r on r.id = lp.curriculum_release_id
  where (lp.class_id is not null and c.id is null)
     or (lp.course_id is not null and co.id is null)
     or (lp.curriculum_version_id is not null and cc.id is null)
     or (lp.curriculum_release_id is not null and r.id is null)
     or (lp.class_id is null and lp.course_id is null and coalesce(lp.status, '') in ('draft', 'archived'));

  -- Lessons with FK or metadata pointing at a missing plan
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'title', l.title,
    'lesson_plan_id', l.lesson_plan_id,
    'reason', case
      when l.lesson_plan_id is not null and lp.id is null then 'missing_plan_fk'
      when nullif(l.metadata->>'lesson_plan_id','') is not null
        and l.metadata->>'lesson_plan_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and not exists (
          select 1 from public.lesson_plans p
          where p.id = (l.metadata->>'lesson_plan_id')::uuid
        ) then 'missing_plan_metadata'
      else 'orphan'
    end
  )), '[]'::jsonb)
  into v_orphan_lessons
  from public.lessons l
  left join public.lesson_plans lp on lp.id = l.lesson_plan_id
  where (l.lesson_plan_id is not null and lp.id is null)
     or (
       nullif(l.metadata->>'lesson_plan_id','') is not null
       and l.metadata->>'lesson_plan_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (
         select 1 from public.lesson_plans p
         where p.id = (l.metadata->>'lesson_plan_id')::uuid
       )
     );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'title', a.title,
    'lesson_plan_id', a.lesson_plan_id,
    'reason', case
      when a.lesson_plan_id is not null and lp.id is null then 'missing_plan_fk'
      when a.curriculum_release_id is not null and r.id is null then 'missing_release'
      when nullif(a.metadata->>'lesson_plan_id','') is not null
        and a.metadata->>'lesson_plan_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and not exists (
          select 1 from public.lesson_plans p
          where p.id = (a.metadata->>'lesson_plan_id')::uuid
        ) then 'missing_plan_metadata'
      else 'orphan'
    end
  )), '[]'::jsonb)
  into v_orphan_assignments
  from public.assignments a
  left join public.lesson_plans lp on lp.id = a.lesson_plan_id
  left join public.academic_curriculum_releases r on r.id = a.curriculum_release_id
  where (a.lesson_plan_id is not null and lp.id is null)
     or (a.curriculum_release_id is not null and r.id is null)
     or (
       nullif(a.metadata->>'lesson_plan_id','') is not null
       and a.metadata->>'lesson_plan_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (
         select 1 from public.lesson_plans p
         where p.id = (a.metadata->>'lesson_plan_id')::uuid
       )
     );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'lesson_plan_id', d.lesson_plan_id,
    'lesson_id', d.lesson_id,
    'reason', case
      when d.lesson_plan_id is not null and lp.id is null then 'missing_plan'
      when d.lesson_id is not null and l.id is null then 'missing_lesson'
      when d.curriculum_release_id is not null and r.id is null then 'missing_release'
      else 'orphan'
    end
  )), '[]'::jsonb)
  into v_orphan_flashcards
  from public.flashcard_decks d
  left join public.lesson_plans lp on lp.id = d.lesson_plan_id
  left join public.lessons l on l.id = d.lesson_id
  left join public.academic_curriculum_releases r on r.id = d.curriculum_release_id
  where (d.lesson_plan_id is not null and lp.id is null)
     or (d.lesson_id is not null and l.id is null)
     or (d.curriculum_release_id is not null and r.id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'lesson_plan_id', e.lesson_plan_id,
    'reason', case
      when e.lesson_plan_id is not null and lp.id is null then 'missing_plan'
      when e.curriculum_release_id is not null and r.id is null then 'missing_release'
      else 'orphan'
    end
  )), '[]'::jsonb)
  into v_orphan_exams
  from public.exams e
  left join public.lesson_plans lp on lp.id = e.lesson_plan_id
  left join public.academic_curriculum_releases r on r.id = e.curriculum_release_id
  where (e.lesson_plan_id is not null and lp.id is null)
     or (e.curriculum_release_id is not null and r.id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'title', x.title,
    'lesson_plan_id', x.lesson_plan_id,
    'reason', case
      when x.lesson_plan_id is not null and lp.id is null then 'missing_plan'
      when x.curriculum_release_id is not null and r.id is null then 'missing_release'
      else 'orphan'
    end
  )), '[]'::jsonb)
  into v_orphan_cbt
  from public.cbt_exams x
  left join public.lesson_plans lp on lp.id = x.lesson_plan_id
  left join public.academic_curriculum_releases r on r.id = x.curriculum_release_id
  where (x.lesson_plan_id is not null and lp.id is null)
     or (x.curriculum_release_id is not null and r.id is null);

  return jsonb_build_object(
    'orphan_lesson_plans', v_orphan_plans,
    'orphan_lessons', v_orphan_lessons,
    'orphan_assignments', v_orphan_assignments,
    'orphan_flashcards', v_orphan_flashcards,
    'orphan_exams', v_orphan_exams,
    'orphan_cbt_exams', v_orphan_cbt,
    'counts', jsonb_build_object(
      'lesson_plans', jsonb_array_length(v_orphan_plans),
      'lessons', jsonb_array_length(v_orphan_lessons),
      'assignments', jsonb_array_length(v_orphan_assignments),
      'flashcards', jsonb_array_length(v_orphan_flashcards),
      'exams', jsonb_array_length(v_orphan_exams),
      'cbt_exams', jsonb_array_length(v_orphan_cbt)
    )
  );
end;
$$;

revoke all on function public.admin_inspect_teaching_orphans() from public;
grant execute on function public.admin_inspect_teaching_orphans() to service_role;

create or replace function public.admin_purge_teaching_orphans()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scan jsonb;
  v_plan_ids uuid[];
  v_lesson_ids uuid[];
  v_assignment_ids uuid[];
  v_flash_ids uuid[];
  v_exam_ids uuid[];
  v_cbt_ids uuid[];
  v_counts jsonb;
begin
  v_scan := public.admin_inspect_teaching_orphans();

  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_plan_ids
  from jsonb_array_elements(v_scan->'orphan_lesson_plans') x;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_lesson_ids
  from jsonb_array_elements(v_scan->'orphan_lessons') x;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_assignment_ids
  from jsonb_array_elements(v_scan->'orphan_assignments') x;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_flash_ids
  from jsonb_array_elements(v_scan->'orphan_flashcards') x;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_exam_ids
  from jsonb_array_elements(v_scan->'orphan_exams') x;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into v_cbt_ids
  from jsonb_array_elements(v_scan->'orphan_cbt_exams') x;

  perform set_config('session_replication_role', 'replica', true);

  if cardinality(v_plan_ids) > 0 then
    delete from public.assignments where lesson_plan_id = any(v_plan_ids);
    delete from public.exams where lesson_plan_id = any(v_plan_ids);
    delete from public.cbt_exams where lesson_plan_id = any(v_plan_ids);
    delete from public.flashcard_decks where lesson_plan_id = any(v_plan_ids);
    update public.academic_assessment_evidence
      set lesson_plan_id = null
      where lesson_plan_id = any(v_plan_ids);
    delete from public.lessons where lesson_plan_id = any(v_plan_ids);
    delete from public.lesson_materials where lesson_plan_id = any(v_plan_ids);
    delete from public.lesson_plans where id = any(v_plan_ids);
  end if;

  if cardinality(v_lesson_ids) > 0 then
    delete from public.flashcard_decks where lesson_id = any(v_lesson_ids);
    delete from public.lessons where id = any(v_lesson_ids);
  end if;
  if cardinality(v_assignment_ids) > 0 then
    delete from public.assignments where id = any(v_assignment_ids);
  end if;
  if cardinality(v_flash_ids) > 0 then
    delete from public.flashcard_decks where id = any(v_flash_ids);
  end if;
  if cardinality(v_exam_ids) > 0 then
    delete from public.exams where id = any(v_exam_ids);
  end if;
  if cardinality(v_cbt_ids) > 0 then
    delete from public.cbt_exams where id = any(v_cbt_ids);
  end if;

  perform set_config('session_replication_role', 'origin', true);

  v_counts := jsonb_build_object(
    'lesson_plans', cardinality(v_plan_ids),
    'lessons', cardinality(v_lesson_ids),
    'assignments', cardinality(v_assignment_ids),
    'flashcards', cardinality(v_flash_ids),
    'exams', cardinality(v_exam_ids),
    'cbt_exams', cardinality(v_cbt_ids)
  );

  return jsonb_build_object('ok', true, 'purged', v_counts);
exception
  when others then
    perform set_config('session_replication_role', 'origin', true);
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'hint', sqlstate);
end;
$$;

revoke all on function public.admin_purge_teaching_orphans() from public;
grant execute on function public.admin_purge_teaching_orphans() to service_role;

comment on function public.admin_purge_curriculum_releases(uuid[]) is
  'Service-role wipe: cascade-clears release children (plans, assignments, flashcards, schedules) then deletes releases.';
comment on function public.admin_inspect_teaching_orphans() is
  'Lists orphan lesson plans, lessons, assignments, flashcards, exams, and CBT rows.';
comment on function public.admin_purge_teaching_orphans() is
  'Deletes orphan teaching artifacts detected by admin_inspect_teaching_orphans.';
