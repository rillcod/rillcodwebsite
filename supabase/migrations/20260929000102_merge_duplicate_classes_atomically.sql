-- Collapse two classes that are the same school placement into one survivor.
-- Learner work is moved, never deleted. If any re-point or the final delete
-- fails, the whole transaction rolls back so students are not left half-moved.
create or replace function public.merge_duplicate_classes(
  p_source_class_id uuid,
  p_survivor_class_id uuid,
  p_actor_id uuid,
  p_section_label text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.portal_users%rowtype;
  v_source public.classes%rowtype;
  v_survivor public.classes%rowtype;
  v_label text;
  v_moved_students integer := 0;
  v_archived_plans integer := 0;
begin
  if p_source_class_id is null or p_survivor_class_id is null or p_source_class_id = p_survivor_class_id then
    raise exception using errcode='22023', message='INVALID_CLASS_MERGE';
  end if;

  select * into v_actor from public.portal_users where id=p_actor_id;
  if v_actor.id is null or v_actor.role not in ('admin','teacher')
     or coalesce(v_actor.is_active,false)=false or coalesce(v_actor.is_deleted,false)=true then
    raise exception using errcode='42501', message='ACTOR_NOT_ALLOWED';
  end if;

  -- Lock both rows in id order so two concurrent merges cannot deadlock.
  if p_source_class_id < p_survivor_class_id then
    select * into v_source from public.classes where id=p_source_class_id for update;
    select * into v_survivor from public.classes where id=p_survivor_class_id for update;
  else
    select * into v_survivor from public.classes where id=p_survivor_class_id for update;
    select * into v_source from public.classes where id=p_source_class_id for update;
  end if;

  if v_source.id is null or v_survivor.id is null then
    raise exception using errcode='P0002', message='CLASS_NOT_FOUND';
  end if;
  if v_source.school_id is distinct from v_survivor.school_id then
    raise exception using errcode='22023', message='CLASS_SCHOOL_MISMATCH';
  end if;

  if v_actor.role='teacher'
     and coalesce(v_actor.school_id, '00000000-0000-0000-0000-000000000000'::uuid)
       <> coalesce(v_survivor.school_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and not exists (
       select 1 from public.teacher_schools ts
       where ts.teacher_id=p_actor_id and ts.school_id=v_survivor.school_id
     ) then
    raise exception using errcode='42501', message='CLASS_OUT_OF_SCOPE';
  end if;

  v_label := nullif(btrim(coalesce(p_section_label, v_survivor.name, '')), '');

  -- Unique active teaching plan: keep the survivor's live plan, archive the
  -- duplicate so generated drafts can still be found after the merge.
  update public.lesson_plans src
  set status='archived', updated_at=now()
  where src.class_id=p_source_class_id
    and src.status<>'archived'
    and exists (
      select 1 from public.lesson_plans dest
      where dest.class_id=p_survivor_class_id
        and dest.status<>'archived'
        and dest.term_id is not distinct from src.term_id
        and dest.course_id is not distinct from src.course_id
    );
  get diagnostics v_archived_plans = row_count;

  -- Keep attendance attached to the living roster before dropping a duplicate placement.
  update public.attendance a
  set class_term_roster_id = dest.id,
      updated_at = now()
  from public.class_term_rosters src
  join public.class_term_rosters dest
    on dest.class_id=p_survivor_class_id
   and dest.student_id=src.student_id
   and dest.term_id is not distinct from src.term_id
  where src.class_id=p_source_class_id
    and a.class_term_roster_id=src.id;

  delete from public.class_term_rosters src
  where src.class_id=p_source_class_id
    and exists (
      select 1 from public.class_term_rosters dest
      where dest.class_id=p_survivor_class_id
        and dest.student_id=src.student_id
        and dest.term_id is not distinct from src.term_id
    );

  delete from public.curriculum_week_tracking src
  where src.class_id=p_source_class_id
    and exists (
      select 1 from public.curriculum_week_tracking dest
      where dest.class_id=p_survivor_class_id
        and dest.curriculum_id is not distinct from src.curriculum_id
        and dest.school_id is not distinct from src.school_id
        and dest.term_number is not distinct from src.term_number
        and dest.week_number is not distinct from src.week_number
        and dest.lesson_plan_id is not distinct from src.lesson_plan_id
    );

  delete from public.progression_path_visibility src
  where src.class_id=p_source_class_id
    and exists (
      select 1 from public.progression_path_visibility dest
      where dest.class_id=p_survivor_class_id
        and dest.student_id is not distinct from src.student_id
    );

  delete from public.timetable_slots src
  where src.class_id=p_source_class_id
    and exists (
      select 1 from public.timetable_slots dest
      where dest.class_id=p_survivor_class_id
        and dest.day_of_week is not distinct from src.day_of_week
        and dest.start_time is not distinct from src.start_time
    );

  -- Keep both flashcard decks; only the title has to differ for the unique scope.
  update public.flashcard_decks src
  set title = trim(both from src.title) || ' (merged class)'
  where src.class_id=p_source_class_id
    and exists (
      select 1 from public.flashcard_decks dest
      where dest.class_id=p_survivor_class_id
        and dest.created_by is not distinct from src.created_by
        and dest.lesson_id is not distinct from src.lesson_id
        and dest.course_id is not distinct from src.course_id
        and dest.term_id is not distinct from src.term_id
        and lower(btrim(dest.title)) = lower(btrim(src.title))
    );

  update public.portal_users
  set class_id=p_survivor_class_id,
      section_class=coalesce(v_label, section_class),
      updated_at=now()
  where class_id=p_source_class_id and role='student';
  get diagnostics v_moved_students = row_count;

  if to_regclass('public.students') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='students' and column_name='class_id'
     ) then
    execute 'update public.students set class_id=$1 where class_id=$2'
      using p_survivor_class_id, p_source_class_id;
  end if;

  if to_regclass('public.students') is not null then
    update public.students
    set current_class=coalesce(v_label, current_class),
        section=coalesce(v_label, section)
    where user_id in (
      select id from public.portal_users
      where class_id=p_survivor_class_id and role='student'
    );
  end if;

  update public.lesson_plans set class_id=p_survivor_class_id, updated_at=now() where class_id=p_source_class_id;
  update public.lessons set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.assignments set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.cbt_exams set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.exams set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.class_sessions set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.class_lesson_delivery set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.class_term_rosters set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.student_progress_reports set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.academic_assessment_evidence set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.enrollment_term_grades set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.announcements set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.consent_forms set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.flashcard_decks set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.lesson_materials set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.identity_cards set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.project_groups set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.academic_curriculum_delivery_schedules set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.academic_curriculum_proposals set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.academic_progression_decisions set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.academic_progression_decisions set next_class_id=p_survivor_class_id where next_class_id=p_source_class_id;
  update public.curriculum_project_usage set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.curriculum_week_performance set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.curriculum_week_tracking set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.progression_path_visibility set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.teaching_generation_runs set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.timetable_slots set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.whatsapp_groups set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.whatsapp_outbox set class_id=p_survivor_class_id where class_id=p_source_class_id;
  update public.student_transfer_requests set from_class_id=p_survivor_class_id where from_class_id=p_source_class_id;
  update public.student_transfer_requests set to_class_id=p_survivor_class_id where to_class_id=p_source_class_id;

  delete from public.classes where id=p_source_class_id;

  return jsonb_build_object(
    'source_class_id', p_source_class_id,
    'survivor_class_id', p_survivor_class_id,
    'moved_students', v_moved_students,
    'archived_colliding_plans', v_archived_plans
  );
end;
$$;

revoke all on function public.merge_duplicate_classes(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.merge_duplicate_classes(uuid,uuid,uuid,text) to service_role;

comment on function public.merge_duplicate_classes(uuid,uuid,uuid,text) is
  'Atomically moves roster, teaching records, and learner evidence from a duplicate class onto the survivor, then deletes only the empty shell. Rolls back if any step fails.';
