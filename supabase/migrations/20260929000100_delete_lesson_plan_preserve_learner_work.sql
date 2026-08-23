-- Delete rebuildable teaching content without cascading away learner submissions.
-- The route calls this with the already authenticated actor; execution is granted
-- only to service_role and scope is rechecked here inside the transaction.
create or replace function public.delete_lesson_plan_preserving_learner_work(
  p_plan_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.lesson_plans%rowtype;
  v_actor public.portal_users%rowtype;
  v_lesson_ids uuid[] := '{}';
  v_assignment_ids uuid[] := '{}';
  v_protected_ids uuid[] := '{}';
  v_disposable_ids uuid[] := '{}';
  v_exam_ids uuid[] := '{}';
  v_protected_exam_ids uuid[] := '{}';
  v_disposable_exam_ids uuid[] := '{}';
  v_cbt_ids uuid[] := '{}';
  v_protected_cbt_ids uuid[] := '{}';
  v_disposable_cbt_ids uuid[] := '{}';
begin
  select * into v_actor from public.portal_users where id=p_actor_id;
  if v_actor.id is null or v_actor.role not in ('admin','teacher')
     or coalesce(v_actor.is_active,false)=false or coalesce(v_actor.is_deleted,false)=true then
    raise exception using errcode='42501', message='ACTOR_NOT_ALLOWED';
  end if;

  select * into v_plan from public.lesson_plans where id=p_plan_id for update;
  if v_plan.id is null then raise exception using errcode='P0002', message='PLAN_NOT_FOUND'; end if;

  if v_actor.role='teacher'
     and coalesce(v_plan.created_by, '00000000-0000-0000-0000-000000000000'::uuid) <> p_actor_id
     and not exists (
       select 1 from public.teacher_schools ts
       where ts.teacher_id=p_actor_id and ts.school_id=v_plan.school_id
     )
     and not exists (
       select 1 from public.lessons l
       where l.lesson_plan_id=p_plan_id and l.created_by=p_actor_id
     ) then
    raise exception using errcode='42501', message='PLAN_OUT_OF_SCOPE';
  end if;

  select coalesce(array_agg(id), '{}') into v_lesson_ids
  from public.lessons
  where lesson_plan_id=p_plan_id or metadata->>'lesson_plan_id'=p_plan_id::text;

  select coalesce(array_agg(id), '{}') into v_assignment_ids
  from public.assignments
  where lesson_plan_id=p_plan_id
     or metadata->>'lesson_plan_id'=p_plan_id::text
     or (cardinality(v_lesson_ids)>0 and lesson_id=any(v_lesson_ids));

  select coalesce(array_agg(a.id), '{}') into v_protected_ids
  from public.assignments a
  where a.id=any(v_assignment_ids)
    and exists (select 1 from public.assignment_submissions s where s.assignment_id=a.id);

  select coalesce(array_agg(id), '{}') into v_disposable_ids
  from unnest(v_assignment_ids) as candidate(id)
  where not (id=any(v_protected_ids));

  update public.assignments
  set lesson_plan_id=null,
      lesson_id=null,
      metadata=coalesce(metadata,'{}'::jsonb)-'lesson_plan_id',
      updated_at=now()
  where id=any(v_protected_ids);

  select coalesce(array_agg(id), '{}') into v_exam_ids
  from public.exams
  where lesson_plan_id=p_plan_id or metadata->>'lesson_plan_id'=p_plan_id::text;
  select coalesce(array_agg(e.id), '{}') into v_protected_exam_ids
  from public.exams e
  where e.id=any(v_exam_ids)
    and exists (select 1 from public.exam_attempts a where a.exam_id=e.id);
  select coalesce(array_agg(id), '{}') into v_disposable_exam_ids
  from unnest(v_exam_ids) as candidate(id) where not (id=any(v_protected_exam_ids));
  update public.exams
  set lesson_plan_id=null,
      lesson_id=null,
      metadata=coalesce(metadata,'{}'::jsonb)-'lesson_plan_id',
      updated_at=now()
  where id=any(v_protected_exam_ids);

  select coalesce(array_agg(id), '{}') into v_cbt_ids
  from public.cbt_exams
  where lesson_plan_id=p_plan_id or metadata->>'lesson_plan_id'=p_plan_id::text;
  select coalesce(array_agg(e.id), '{}') into v_protected_cbt_ids
  from public.cbt_exams e
  where e.id=any(v_cbt_ids)
    and exists (select 1 from public.cbt_sessions s where s.exam_id=e.id);
  select coalesce(array_agg(id), '{}') into v_disposable_cbt_ids
  from unnest(v_cbt_ids) as candidate(id) where not (id=any(v_protected_cbt_ids));
  update public.cbt_exams
  set lesson_plan_id=null,
      lesson_id=null,
      metadata=coalesce(metadata,'{}'::jsonb)-'lesson_plan_id',
      updated_at=now()
  where id=any(v_protected_cbt_ids);

  delete from public.assignments where id=any(v_disposable_ids);
  delete from public.exams where id=any(v_disposable_exam_ids);
  delete from public.cbt_exams where id=any(v_disposable_cbt_ids);
  delete from public.lessons
  where lesson_plan_id=p_plan_id or metadata->>'lesson_plan_id'=p_plan_id::text;
  delete from public.lesson_plans where id=p_plan_id;

  return jsonb_build_object(
    'preserved_learner_assignments', cardinality(v_protected_ids),
    'removed_unused_assignments', cardinality(v_disposable_ids),
    'preserved_written_exams', cardinality(v_protected_exam_ids),
    'removed_unused_written_exams', cardinality(v_disposable_exam_ids),
    'preserved_cbt_exams', cardinality(v_protected_cbt_ids),
    'removed_unused_cbt_exams', cardinality(v_disposable_cbt_ids)
  );
end;
$$;

revoke all on function public.delete_lesson_plan_preserving_learner_work(uuid,uuid) from public, anon, authenticated;
grant execute on function public.delete_lesson_plan_preserving_learner_work(uuid,uuid) to service_role;

comment on function public.delete_lesson_plan_preserving_learner_work(uuid,uuid) is
  'Atomically removes rebuildable lesson-plan content, detaching assignments that contain learner submissions so submitted work and marks cannot cascade away.';
