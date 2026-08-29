-- Convert one historical standalone lesson plan into the canonical plan for a
-- class without cloning its identity or losing its generated teaching content.
--
-- Learner evidence is never moved here. A standalone plan that somehow already
-- has submissions, attempts, progress, delivery, or scores must be reconciled
-- deliberately instead of guessing which class owns those records.

create or replace function public.adopt_legacy_lesson_plan_into_class(
  p_plan_id uuid,
  p_class_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.lesson_plans%rowtype;
  v_class public.classes%rowtype;
  v_actor public.portal_users%rowtype;
  v_existing_plan_id uuid;
  v_course_program_id uuid;
  v_school_name text;
  v_term_label text;
  v_evidence_count integer := 0;
  v_lessons integer := 0;
  v_assignments integer := 0;
  v_slides integer := 0;
  v_decks integer := 0;
  v_assessments integer := 0;
  v_cbt_assessments integer := 0;
begin
  if p_plan_id is null or p_class_id is null or p_actor_id is null then
    raise exception using errcode = '22023', message = 'PLAN_CLASS_AND_ACTOR_REQUIRED';
  end if;

  select * into v_actor
  from public.portal_users
  where id = p_actor_id;

  if v_actor.id is null
     or v_actor.role not in ('admin', 'teacher')
     or coalesce(v_actor.is_active, false) = false
     or coalesce(v_actor.is_deleted, false) = true then
    raise exception using errcode = '42501', message = 'ACTOR_NOT_ALLOWED';
  end if;

  -- Serialise adoption with plan creation and every other adoption targeting
  -- the same class. The existing unique indexes remain the final authority.
  perform pg_advisory_xact_lock(hashtextextended(p_class_id::text, 0));

  select * into v_plan
  from public.lesson_plans
  where id = p_plan_id
  for update;
  if v_plan.id is null then
    raise exception using errcode = 'P0002', message = 'PLAN_NOT_FOUND';
  end if;

  select * into v_class
  from public.classes
  where id = p_class_id
  for update;
  if v_class.id is null then
    raise exception using errcode = 'P0002', message = 'CLASS_NOT_FOUND';
  end if;

  -- Scope is checked before the idempotent return as well. A teacher must
  -- own both the historical plan and the selected class, even when a retry
  -- targets a plan that was already adopted.
  if v_actor.role = 'teacher'
     and (
       v_plan.created_by is distinct from p_actor_id
       or v_class.teacher_id is distinct from p_actor_id
     ) then
    raise exception using errcode = '42501', message = 'PLAN_OR_CLASS_OUT_OF_SCOPE';
  end if;

  if v_plan.class_id is not null then
    if v_plan.class_id = p_class_id then
      return jsonb_build_object(
        'plan_id', v_plan.id,
        'class_id', v_plan.class_id,
        'already_adopted', true
      );
    end if;
    raise exception using errcode = '23514', message = 'PLAN_ALREADY_ASSIGNED';
  end if;

  if v_plan.course_id is null then
    raise exception using errcode = '23514', message = 'PLAN_COURSE_REQUIRED';
  end if;

  if v_plan.school_id is not null and v_plan.school_id <> v_class.school_id then
    raise exception using errcode = '23514', message = 'PLAN_CLASS_SCHOOL_MISMATCH';
  end if;

  select program_id into v_course_program_id
  from public.courses
  where id = v_plan.course_id;
  if v_course_program_id is not null
     and v_class.program_id is not null
     and v_course_program_id <> v_class.program_id then
    raise exception using errcode = '23514', message = 'PLAN_CLASS_PROGRAM_MISMATCH';
  end if;

  if v_class.term_id is null and v_class.offering_period_id is null then
    raise exception using errcode = '23514', message = 'CLASS_TEACHING_PERIOD_REQUIRED';
  end if;
  if v_plan.term_id is not null
     and v_class.term_id is not null
     and v_plan.term_id <> v_class.term_id then
    raise exception using errcode = '23514', message = 'PLAN_CLASS_TERM_MISMATCH';
  end if;
  if v_plan.offering_period_id is not null
     and v_class.offering_period_id is not null
     and v_plan.offering_period_id <> v_class.offering_period_id then
    raise exception using errcode = '23514', message = 'PLAN_CLASS_PERIOD_MISMATCH';
  end if;

  if v_class.term_id is not null then
    select id into v_existing_plan_id
    from public.lesson_plans
    where class_id = p_class_id
      and course_id = v_plan.course_id
      and term_id = v_class.term_id
      and status <> 'archived'
      and id <> p_plan_id
    limit 1
    for update;
  else
    select id into v_existing_plan_id
    from public.lesson_plans
    where class_id = p_class_id
      and course_id = v_plan.course_id
      and offering_period_id = v_class.offering_period_id
      and status <> 'archived'
      and id <> p_plan_id
    limit 1
    for update;
  end if;

  if v_existing_plan_id is not null then
    raise exception using
      errcode = '23505',
      message = 'TARGET_CLASS_PLAN_EXISTS',
      detail = v_existing_plan_id::text;
  end if;

  select
    (select count(*) from public.class_lesson_delivery d where d.lesson_plan_id = p_plan_id)
    + (select count(*) from public.curriculum_week_performance p where p.lesson_plan_id = p_plan_id)
    + (select count(*) from public.academic_assessment_evidence e where e.lesson_plan_id = p_plan_id)
    + (select count(*)
       from public.assignment_submissions s
       join public.assignments a on a.id = s.assignment_id
       where a.lesson_plan_id = p_plan_id)
    + (select count(*)
       from public.exam_attempts a
       join public.exams e on e.id = a.exam_id
       where e.lesson_plan_id = p_plan_id)
    + (select count(*)
       from public.cbt_sessions s
       join public.cbt_exams e on e.id = s.exam_id
       where e.lesson_plan_id = p_plan_id)
    + (select count(*)
       from public.lesson_progress p
       join public.lessons l on l.id = p.lesson_id
       where l.lesson_plan_id = p_plan_id)
  into v_evidence_count;

  if v_evidence_count > 0 then
    raise exception using
      errcode = '23514',
      message = 'LEGACY_PLAN_HAS_LEARNER_EVIDENCE',
      detail = v_evidence_count::text,
      hint = 'Keep learner submissions and scores on their original identity and reconcile this plan manually.';
  end if;

  select name into v_school_name
  from public.schools
  where id = v_class.school_id;

  if v_class.term_id is not null then
    select concat_ws(' ', nullif(term_label, ''), nullif(academic_year, ''))
    into v_term_label
    from public.academic_terms
    where id = v_class.term_id;
  end if;

  -- Nothing with learner evidence reaches this point. Hold every generated
  -- item for teacher review and clear publish locks before its class identity
  -- changes; content bodies and IDs are kept exactly as they are.
  update public.lessons
  set content_locked_at = null,
      content_locked_by = null,
      status = 'draft',
      updated_at = now()
  where lesson_plan_id = p_plan_id;

  update public.assignments
  set content_locked_at = null,
      content_locked_by = null,
      is_active = false,
      updated_at = now()
  where lesson_plan_id = p_plan_id;

  update public.lesson_materials
  set is_public = false
  where lesson_plan_id = p_plan_id;

  update public.flashcard_decks
  set is_public = false,
      updated_at = now()
  where lesson_plan_id = p_plan_id;

  update public.exams
  set is_active = false,
      updated_at = now()
  where lesson_plan_id = p_plan_id;

  update public.cbt_exams
  set is_active = false,
      updated_at = now()
  where lesson_plan_id = p_plan_id;

  update public.lesson_plans
  set class_id = v_class.id,
      school_id = v_class.school_id,
      term_id = v_class.term_id,
      offering_period_id = v_class.offering_period_id,
      academic_offering_id = v_class.academic_offering_id,
      term = coalesce(nullif(v_term_label, ''), term),
      term_start = coalesce(v_class.start_date, term_start),
      term_end = coalesce(v_class.end_date, term_end),
      status = 'draft',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'legacy_adoption', jsonb_build_object(
          'adopted_at', now(),
          'adopted_by', p_actor_id,
          'class_id', p_class_id,
          'review_required', true
        )
      ),
      updated_at = now()
  where id = p_plan_id
  returning * into v_plan;

  -- Re-scope every rebuildable child to the adopted plan. The real foreign-key
  -- columns remain authoritative; compatibility metadata is maintained by the
  -- existing sync triggers.
  update public.lessons
  set class_id = v_class.id,
      school_id = v_class.school_id,
      school_name = v_school_name,
      course_id = v_plan.course_id,
      academic_term_id = v_class.term_id,
      academic_offering_id = v_class.academic_offering_id,
      offering_period_id = v_class.offering_period_id,
      curriculum_release_id = v_plan.curriculum_release_id,
      updated_at = now()
  where lesson_plan_id = p_plan_id;
  get diagnostics v_lessons = row_count;

  update public.assignments
  set class_id = v_class.id,
      school_id = v_class.school_id,
      school_name = v_school_name,
      course_id = v_plan.course_id,
      term_id = v_class.term_id,
      academic_offering_id = v_class.academic_offering_id,
      offering_period_id = v_class.offering_period_id,
      curriculum_release_id = v_plan.curriculum_release_id,
      updated_at = now()
  where lesson_plan_id = p_plan_id;
  get diagnostics v_assignments = row_count;

  update public.lesson_materials
  set class_id = v_class.id,
      academic_offering_id = v_class.academic_offering_id,
      offering_period_id = v_class.offering_period_id,
      curriculum_release_id = v_plan.curriculum_release_id
  where lesson_plan_id = p_plan_id;
  get diagnostics v_slides = row_count;

  update public.flashcard_decks
  set class_id = v_class.id,
      school_id = v_class.school_id,
      course_id = v_plan.course_id,
      term_id = v_class.term_id,
      academic_offering_id = v_class.academic_offering_id,
      offering_period_id = v_class.offering_period_id,
      curriculum_release_id = v_plan.curriculum_release_id,
      updated_at = now()
  where lesson_plan_id = p_plan_id;
  get diagnostics v_decks = row_count;

  update public.exams
  set class_id = v_class.id,
      school_id = v_class.school_id,
      course_id = v_plan.course_id,
      term_id = v_class.term_id,
      academic_offering_id = v_class.academic_offering_id,
      offering_period_id = v_class.offering_period_id,
      curriculum_release_id = v_plan.curriculum_release_id,
      updated_at = now()
  where lesson_plan_id = p_plan_id;
  get diagnostics v_assessments = row_count;

  update public.cbt_exams
  set class_id = v_class.id,
      school_id = v_class.school_id,
      course_id = v_plan.course_id,
      term_id = v_class.term_id,
      academic_offering_id = v_class.academic_offering_id,
      offering_period_id = v_class.offering_period_id,
      curriculum_release_id = v_plan.curriculum_release_id,
      updated_at = now()
  where lesson_plan_id = p_plan_id;
  get diagnostics v_cbt_assessments = row_count;
  v_assessments := v_assessments + v_cbt_assessments;

  update public.curriculum_week_tracking
  set class_id = v_class.id,
      school_id = v_class.school_id,
      curriculum_release_id = v_plan.curriculum_release_id,
      updated_at = now()
  where lesson_plan_id = p_plan_id;

  update public.teaching_generation_runs
  set class_id = v_class.id
  where lesson_plan_id = p_plan_id;

  return jsonb_build_object(
    'plan_id', v_plan.id,
    'class_id', v_class.id,
    'already_adopted', false,
    'review_required', true,
    'preserved', jsonb_build_object(
      'lessons', v_lessons,
      'assignments_and_projects', v_assignments,
      'slide_decks', v_slides,
      'practice_decks', v_decks,
      'assessments', v_assessments
    )
  );
end;
$$;

revoke all on function public.adopt_legacy_lesson_plan_into_class(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.adopt_legacy_lesson_plan_into_class(uuid, uuid, uuid)
  to service_role;

comment on function public.adopt_legacy_lesson_plan_into_class(uuid, uuid, uuid) is
  'Service-role only. Atomically adopts one evidence-free historical standalone plan as the canonical plan for a class, preserving its content IDs and holding every package for teacher review.';
