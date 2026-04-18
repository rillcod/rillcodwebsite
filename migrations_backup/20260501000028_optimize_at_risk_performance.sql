-- migration: optimize at_risk_students RPC for performance
-- replaces O(n) loop-based queries with CTE-based set operations
-- fixes performance issue with 1000+ students (30+ second timeout)

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
begin
  return query
  with 
  -- Get all students in scope
  students as (
    select
      pu.id,
      pu.full_name,
      pu.last_login,
      pu.class_id
    from public.portal_users pu
    where pu.role = 'student'
      and pu.school_id = p_school_id
      and (p_class_id is null or pu.class_id = p_class_id)
  ),
  
  -- Signal 1: no_login (last_login is null or older than 7 days)
  no_login_students as (
    select id
    from students
    where last_login is null
       or last_login < now() - interval '7 days'
  ),
  
  -- Signal 2: low_attendance (absent rate > 30% in last 30 days)
  attendance_stats as (
    select
      a.student_id,
      count(*) as total_records,
      count(*) filter (where a.status = 'absent') as absent_count
    from public.attendance a
    inner join students s on s.id = a.student_id
    where a.created_at >= now() - interval '30 days'
    group by a.student_id
  ),
  low_attendance_students as (
    select student_id as id
    from attendance_stats
    where total_records > 0
      and (absent_count::float / total_records) > 0.30
  ),
  
  -- Signal 3: overdue_assignments (>= 2 unsubmitted overdue assignments)
  overdue_counts as (
    select
      s.id as student_id,
      count(asgn.id) as overdue_count
    from students s
    inner join public.assignments asgn on asgn.class_id = s.class_id
    where asgn.due_date < now()
      and not exists (
        select 1
        from public.assignment_submissions asub
        where asub.assignment_id = asgn.id
          and asub.portal_user_id = s.id
      )
    group by s.id
  ),
  overdue_students as (
    select student_id as id
    from overdue_counts
    where overdue_count >= 2
  ),
  
  -- Aggregate all signals per student
  student_signals as (
    select
      s.id,
      s.full_name,
      jsonb_agg(distinct signal) as signals
    from students s
    cross join lateral (
      select 'no_login'::text as signal
      where exists (select 1 from no_login_students nls where nls.id = s.id)
      union all
      select 'low_attendance'::text
      where exists (select 1 from low_attendance_students las where las.id = s.id)
      union all
      select 'overdue_assignments'::text
      where exists (select 1 from overdue_students os where os.id = s.id)
    ) signals_list
    group by s.id, s.full_name
  )
  
  -- Return only students with at least one signal
  select
    ss.id as portal_user_id,
    ss.full_name,
    ss.signals as triggered_signals
  from student_signals ss
  where jsonb_array_length(ss.signals) > 0
  order by ss.full_name;
end;
$$;

-- grant remains the same
grant execute on function public.get_at_risk_students(uuid, uuid)
  to authenticated;

comment on function public.get_at_risk_students(uuid, uuid) is
  'Optimized CTE-based version - handles 1000+ students efficiently without loops';
