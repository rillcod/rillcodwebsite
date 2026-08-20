-- Delivery evidence follows the same week + meeting identity as generated
-- teaching content. Special-programme plans may be period-scoped instead of
-- term-scoped, so the delivery row must preserve either academic period.

alter table public.class_lesson_delivery
  add column if not exists offering_period_id uuid
    references public.academic_offering_periods(id) on delete restrict,
  add column if not exists session_number integer;

update public.class_lesson_delivery d
set
  offering_period_id = coalesce(d.offering_period_id, p.offering_period_id),
  session_number = coalesce(d.session_number, 1)
from public.lesson_plans p
where p.id = d.lesson_plan_id
  and (d.offering_period_id is null or d.session_number is null);

alter table public.class_lesson_delivery
  alter column academic_term_id drop not null,
  alter column session_number set default 1,
  alter column session_number set not null;

alter table public.class_lesson_delivery
  drop constraint if exists class_lesson_delivery_session_number_check,
  add constraint class_lesson_delivery_session_number_check
    check (session_number between 1 and 20),
  drop constraint if exists class_lesson_delivery_period_check,
  add constraint class_lesson_delivery_period_check
    check (academic_term_id is not null or offering_period_id is not null);

alter table public.class_lesson_delivery
  drop constraint if exists class_lesson_delivery_lesson_plan_id_week_number_lesson_id_key;

drop index if exists public.class_lesson_delivery_week_placeholder_unique;

create unique index if not exists class_lesson_delivery_week_session_unique
  on public.class_lesson_delivery (lesson_plan_id, week_number, session_number)
  where lesson_id is null;

create unique index if not exists class_lesson_delivery_lesson_session_unique
  on public.class_lesson_delivery (
    lesson_plan_id,
    week_number,
    session_number,
    lesson_id
  )
  where lesson_id is not null;

create index if not exists class_lesson_delivery_period_scope_idx
  on public.class_lesson_delivery (
    class_id,
    offering_period_id,
    course_id,
    week_number,
    session_number
  )
  where offering_period_id is not null;

drop function if exists public.record_class_lesson_delivery(
  uuid, integer, uuid, text, uuid, text, uuid
);

create function public.record_class_lesson_delivery(
  p_lesson_plan_id uuid,
  p_week_number integer,
  p_lesson_id uuid,
  p_status text,
  p_actor_id uuid,
  p_notes text default null,
  p_class_session_id uuid default null,
  p_session_number integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.lesson_plans%rowtype;
  v_delivery public.class_lesson_delivery%rowtype;
  v_term_number integer;
begin
  if p_week_number not between 1 and 53 then
    raise exception 'Week number must be between 1 and 53';
  end if;
  if coalesce(p_session_number, 0) not between 1 and 20 then
    raise exception 'Session number must be between 1 and 20';
  end if;
  if p_status not in ('planned', 'delivered', 'skipped') then
    raise exception 'Invalid delivery status';
  end if;

  select *
  into v_plan
  from public.lesson_plans
  where id = p_lesson_plan_id and status <> 'archived'
  for update;

  if not found
     or v_plan.class_id is null
     or v_plan.course_id is null
     or (v_plan.term_id is null and v_plan.offering_period_id is null) then
    raise exception 'Canonical class lesson plan not found';
  end if;

  if not public.actor_may_manage_class(v_plan.class_id, p_actor_id) then
    raise exception 'You may not record delivery for this class';
  end if;

  if p_lesson_id is not null and not exists (
    select 1
    from public.lessons l
    where l.id = p_lesson_id
      and l.lesson_plan_id = v_plan.id
      and l.class_id = v_plan.class_id
  ) then
    raise exception 'Lesson does not belong to this class plan';
  end if;

  if p_class_session_id is not null and not exists (
    select 1
    from public.class_sessions s
    where s.id = p_class_session_id and s.class_id = v_plan.class_id
  ) then
    raise exception 'Session does not belong to this class';
  end if;

  if p_lesson_id is null then
    insert into public.class_lesson_delivery (
      class_id,
      academic_term_id,
      offering_period_id,
      course_id,
      lesson_plan_id,
      lesson_id,
      class_session_id,
      week_number,
      session_number,
      status,
      delivered_at,
      delivered_by,
      notes,
      updated_at
    ) values (
      v_plan.class_id,
      v_plan.term_id,
      v_plan.offering_period_id,
      v_plan.course_id,
      v_plan.id,
      null,
      p_class_session_id,
      p_week_number,
      p_session_number,
      p_status,
      case when p_status = 'delivered' then now() else null end,
      case when p_status = 'delivered' then p_actor_id else null end,
      p_notes,
      now()
    )
    on conflict (lesson_plan_id, week_number, session_number)
      where lesson_id is null
    do update set
      class_session_id = excluded.class_session_id,
      status = excluded.status,
      delivered_at = excluded.delivered_at,
      delivered_by = excluded.delivered_by,
      notes = excluded.notes,
      updated_at = now()
    returning * into v_delivery;
  else
    insert into public.class_lesson_delivery (
      class_id,
      academic_term_id,
      offering_period_id,
      course_id,
      lesson_plan_id,
      lesson_id,
      class_session_id,
      week_number,
      session_number,
      status,
      delivered_at,
      delivered_by,
      notes,
      updated_at
    ) values (
      v_plan.class_id,
      v_plan.term_id,
      v_plan.offering_period_id,
      v_plan.course_id,
      v_plan.id,
      p_lesson_id,
      p_class_session_id,
      p_week_number,
      p_session_number,
      p_status,
      case when p_status = 'delivered' then now() else null end,
      case when p_status = 'delivered' then p_actor_id else null end,
      p_notes,
      now()
    )
    on conflict (lesson_plan_id, week_number, session_number, lesson_id)
      where lesson_id is not null
    do update set
      class_session_id = excluded.class_session_id,
      status = excluded.status,
      delivered_at = excluded.delivered_at,
      delivered_by = excluded.delivered_by,
      notes = excluded.notes,
      updated_at = now()
    returning * into v_delivery;
  end if;

  -- The legacy curriculum tracking table is term-shaped and cannot represent
  -- meetings independently. Keep it as a school-term compatibility projection;
  -- class_lesson_delivery remains authoritative for every pathway.
  if v_plan.curriculum_version_id is not null
     and v_plan.school_id is not null
     and v_plan.term_id is not null then
    select term_number
    into v_term_number
    from public.academic_terms
    where id = v_plan.term_id;

    insert into public.curriculum_week_tracking (
      curriculum_id,
      school_id,
      class_id,
      lesson_plan_id,
      term_number,
      week_number,
      status,
      teacher_notes,
      actual_date,
      completed_by,
      completed_at,
      updated_at
    ) values (
      v_plan.curriculum_version_id,
      v_plan.school_id,
      v_plan.class_id,
      v_plan.id,
      v_term_number,
      p_week_number,
      case p_status
        when 'delivered' then 'completed'
        when 'skipped' then 'skipped'
        else 'pending'
      end,
      p_notes,
      case when p_status = 'delivered' then current_date else null end,
      case when p_status = 'delivered' then p_actor_id else null end,
      case when p_status = 'delivered' then now() else null end,
      now()
    )
    on conflict (
      curriculum_id,
      school_id,
      class_id,
      lesson_plan_id,
      term_number,
      week_number
    )
      where school_id is not null
        and class_id is not null
        and lesson_plan_id is not null
    do update set
      status = excluded.status,
      teacher_notes = excluded.teacher_notes,
      actual_date = excluded.actual_date,
      completed_by = excluded.completed_by,
      completed_at = excluded.completed_at,
      updated_at = now();
  end if;

  return to_jsonb(v_delivery);
end
$function$;

revoke execute on function public.record_class_lesson_delivery(
  uuid, integer, uuid, text, uuid, text, uuid, integer
) from public, anon, authenticated;

grant execute on function public.record_class_lesson_delivery(
  uuid, integer, uuid, text, uuid, text, uuid, integer
) to service_role;

comment on function public.record_class_lesson_delivery(
  uuid, integer, uuid, text, uuid, text, uuid, integer
) is
  'Service-role teaching delivery writer. Preserves week+session identity and supports term or offering-period plans.';
