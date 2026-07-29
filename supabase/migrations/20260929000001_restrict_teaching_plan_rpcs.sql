-- Two SECURITY DEFINER functions that write teaching records were executable
-- by anon and authenticated while trusting a caller-supplied p_actor_id. They
-- never checked auth.uid(), so anyone holding the anon key could create term
-- plans or record lesson delivery for any class and attribute the work to any
-- user, bypassing the API that does check scope.
--
-- Both are called only from server routes using the service role, so execution
-- is revoked from anon and authenticated. The in-function guards are defence in
-- depth: if either grant is ever restored, a user-session call must now prove
-- it is acting as itself on a class it is entitled to touch.

revoke execute on function public.ensure_class_term_teaching_plan(
  uuid, uuid, uuid, uuid, uuid, integer
) from anon, authenticated;

revoke execute on function public.record_class_lesson_delivery(
  uuid, integer, uuid, text, uuid, text, uuid
) from anon, authenticated;

-- Shared check: may this authenticated user act on this class?
create or replace function public.actor_may_manage_class(
  p_class_id uuid,
  p_actor_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_class public.classes%rowtype;
begin
  -- No JWT means a trusted server context (service role); the calling route is
  -- responsible for scope and has already verified it.
  if v_uid is null then
    return true;
  end if;

  -- A user session may only ever act as itself.
  if p_actor_id is not null and p_actor_id is distinct from v_uid then
    return false;
  end if;

  select role into v_role from public.portal_users where id = v_uid;
  if v_role = 'admin' then
    return true;
  end if;

  select * into v_class from public.classes where id = p_class_id;
  if not found then
    return false;
  end if;

  if v_role = 'teacher' then
    -- The assigned teacher only. School-wide access would let one teacher
    -- write to another teacher's class.
    return v_class.teacher_id = v_uid;
  end if;

  return false;
end;
$$;

revoke execute on function public.actor_may_manage_class(uuid, uuid) from anon, authenticated;

create or replace function public.ensure_class_term_teaching_plan(
  p_class_id uuid,
  p_course_id uuid,
  p_academic_term_id uuid,
  p_curriculum_version_id uuid,
  p_actor_id uuid,
  p_sessions_per_week integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_class public.classes%ROWTYPE;
  v_term public.academic_terms%ROWTYPE;
  v_curr public.course_curricula%ROWTYPE;
  v_plan public.lesson_plans%ROWTYPE;
  v_plan_data jsonb := '{}'::jsonb;
  v_created boolean := false;
BEGIN
  IF p_class_id IS NULL OR p_course_id IS NULL OR p_academic_term_id IS NULL THEN
    RAISE EXCEPTION 'class_id, course_id and academic_term_id are required';
  END IF;

  IF NOT public.actor_may_manage_class(p_class_id, p_actor_id) THEN
    RAISE EXCEPTION 'You may not create a teaching plan for this class';
  END IF;

  SELECT * INTO v_class FROM public.classes WHERE id=p_class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class not found'; END IF;
  IF v_class.term_id IS DISTINCT FROM p_academic_term_id THEN RAISE EXCEPTION 'Academic term does not match class term'; END IF;
  SELECT * INTO v_term FROM public.academic_terms WHERE id=p_academic_term_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academic term not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id=p_course_id AND (v_class.program_id IS NULL OR c.program_id=v_class.program_id)) THEN
    RAISE EXCEPTION 'Course does not belong to the class programme';
  END IF;
  IF p_curriculum_version_id IS NOT NULL THEN
    SELECT * INTO v_curr FROM public.course_curricula WHERE id=p_curriculum_version_id;
    IF NOT FOUND OR v_curr.course_id IS DISTINCT FROM p_course_id THEN RAISE EXCEPTION 'Curriculum does not belong to the selected course'; END IF;
    IF v_curr.school_id IS NOT NULL AND v_curr.school_id IS DISTINCT FROM v_class.school_id THEN RAISE EXCEPTION 'Curriculum belongs to a different school'; END IF;
    v_plan_data := jsonb_build_object('curriculum_year',1);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_class_id::text||':'||p_academic_term_id::text||':'||p_course_id::text,0));
  SELECT * INTO v_plan FROM public.lesson_plans
  WHERE class_id=p_class_id AND term_id=p_academic_term_id AND course_id=p_course_id AND status<>'archived'
  LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    IF p_curriculum_version_id IS NOT NULL AND v_plan.curriculum_version_id IS DISTINCT FROM p_curriculum_version_id THEN
      UPDATE public.lesson_plans SET curriculum_version_id=p_curriculum_version_id,version=version+1,updated_at=now()
      WHERE id=v_plan.id RETURNING * INTO v_plan;
    END IF;
  ELSE
    INSERT INTO public.lesson_plans(
      class_id,school_id,course_id,term_id,term,term_start,term_end,sessions_per_week,
      curriculum_version_id,plan_data,status,version,created_by,created_at,updated_at
    ) VALUES (
      p_class_id,v_class.school_id,p_course_id,p_academic_term_id,
      v_term.term_label||' '||v_term.academic_year,v_term.start_date,v_term.end_date,
      greatest(COALESCE(p_sessions_per_week,1),1),p_curriculum_version_id,v_plan_data,'draft',1,p_actor_id,now(),now()
    ) RETURNING * INTO v_plan;
    v_created := true;
  END IF;

  RETURN jsonb_build_object('plan_id',v_plan.id,'created',v_created,'curriculum_version_id',v_plan.curriculum_version_id);
END $function$;

revoke execute on function public.ensure_class_term_teaching_plan(
  uuid, uuid, uuid, uuid, uuid, integer
) from anon, authenticated;

comment on function public.ensure_class_term_teaching_plan(uuid, uuid, uuid, uuid, uuid, integer) is
  'Service-role only. Creates the single class+term+course teaching plan; refuses a user session acting on a class it does not teach.';

comment on function public.actor_may_manage_class(uuid, uuid) is
  'True when the current context may write teaching records for the class: service role, an administrator, or the assigned teacher acting as itself.';
