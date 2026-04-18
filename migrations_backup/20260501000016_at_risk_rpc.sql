-- migration: create / replace get_at_risk_students rpc
-- requirements: req 5.1, 5.2, 5.3
--
-- replaces any existing function with the same name regardless of its
-- previous signature, because create or replace handles that case.
--
-- the function returns only students that have at least one triggered signal:
--   "no_login"            – last_login is null or older than 7 days
--   "low_attendance"      – absent rate > 30 % in the last 30 days
--   "overdue_assignments" – 2 or more overdue unsubmitted assignments

create or replace function public.get_at_risk_students(
  p_school_id uuid,
  p_class_id  uuid default null
)
returns table (
  portal_user_id   uuid,
  full_name        text,
  triggered_signals jsonb
)
language plpgsql
security definer
as $$
declare
  v_student record;

  -- attendance counters
  v_total_att  bigint;
  v_absent_att bigint;

  -- overdue assignment counter
  v_overdue bigint;

  -- signal accumulator
  v_signals jsonb;
begin
  for v_student in
    select
      pu.id,
      pu.full_name,
      pu.last_login,
      pu.class_id
    from public.portal_users pu
    where pu.role      = 'student'
      and pu.school_id = p_school_id
      and (p_class_id is null or pu.class_id = p_class_id)
  loop
    v_signals := '[]'::jsonb;

    -- ----------------------------------------------------------------
    -- signal: no_login
    -- ----------------------------------------------------------------
    if v_student.last_login is null
       or v_student.last_login < now() - interval '7 days'
    then
      v_signals := v_signals || '["no_login"]'::jsonb;
    end if;

    -- ----------------------------------------------------------------
    -- signal: low_attendance (absent rate > 30 % in last 30 days)
    -- ----------------------------------------------------------------
    select
      count(*)                                           as total,
      count(*) filter (where a.status = 'absent')       as absent
    into v_total_att, v_absent_att
    from public.attendance a
    where a.student_id  = v_student.id
      and a.created_at >= now() - interval '30 days';

    if v_total_att > 0
       and (v_absent_att::float / v_total_att) > 0.30
    then
      v_signals := v_signals || '["low_attendance"]'::jsonb;
    end if;

    -- ----------------------------------------------------------------
    -- signal: overdue_assignments (>= 2 unsubmitted overdue)
    -- ----------------------------------------------------------------
    select count(*)
    into v_overdue
    from public.assignments asgn
    where asgn.class_id  = v_student.class_id
      and asgn.due_date  < now()
      and not exists (
        select 1
        from public.assignment_submissions asub
        where asub.assignment_id    = asgn.id
          and asub.portal_user_id   = v_student.id
      );

    if v_overdue >= 2 then
      v_signals := v_signals || '["overdue_assignments"]'::jsonb;
    end if;

    -- ----------------------------------------------------------------
    -- only emit rows that have at least one signal
    -- ----------------------------------------------------------------
    if jsonb_array_length(v_signals) > 0 then
      portal_user_id    := v_student.id;
      full_name         := v_student.full_name;
      triggered_signals := v_signals;
      return next;
    end if;

  end loop;
end;
$$;

-- allow authenticated users (teachers / admins) to call the function.
-- the service_role key already bypasses rls so no separate grant is needed
-- for server-side usage.
grant execute on function public.get_at_risk_students(uuid, uuid)
  to authenticated;
