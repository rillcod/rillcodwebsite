-- Migration: Optimize At-Risk Students RPC Function
-- Date: 2026-04-17
-- Purpose: Replace O(n) loop-based implementation with set-based CTEs for better performance

-- Drop the old function
drop function if exists public.get_at_risk_students(uuid, uuid);

-- Create optimized version using CTEs and set-based operations
create or replace function public.get_at_risk_students(
  p_school_id uuid,
  p_class_id  uuid default null
)
returns table (
  portal_user_id   uuid,
  full_name        text,
  triggered_signals jsonb
)
language sql
security definer
stable
as $$
  with students as (
    -- Get all students for the school/class
    select
      pu.id,
      pu.full_name,
      pu.last_login,
      pu.class_id
    from public.portal_users pu
    where pu.role = 'student'
      and pu.school_id = p_school_id
      and (p_class_id is null or pu.class_id = p_class_id)
      and pu.is_deleted = false
  ),
  
  no_login_signals as (
    -- Signal: no_login (last_login is null or older than 7 days)
    select
      s.id as student_id,
      'no_login'::text as signal
    from students s
    where s.last_login is null
       or s.last_login < now() - interval '7 days'
  ),
  
  attendance_stats as (
    -- Calculate attendance statistics for last 30 days
    select
      a.student_id,
      count(*) as total_records,
      count(*) filter (where a.status = 'absent') as absent_count
    from public.attendance a
    inner join students s on s.id = a.student_id
    where a.created_at >= now() - interval '30 days'
    group by a.student_id
  ),
  
  low_attendance_signals as (
    -- Signal: low_attendance (absent rate > 30%)
    select
      ast.student_id,
      'low_attendance'::text as signal
    from attendance_stats ast
    where ast.total_records > 0
      and (ast.absent_count::float / ast.total_records) > 0.30
  ),
  
  overdue_assignments as (
    -- Find overdue assignments for each student's class
    select
      s.id as student_id,
      asgn.id as assignment_id
    from students s
    inner join public.assignments asgn on asgn.class_id = s.class_id
    where asgn.due_date < now()
      and asgn.is_active = true
  ),
  
  submitted_assignments as (
    -- Find which overdue assignments have been submitted
    select distinct
      oa.student_id,
      oa.assignment_id
    from overdue_assignments oa
    inner join public.assignment_submissions asub
      on asub.assignment_id = oa.assignment_id
     and (asub.portal_user_id = oa.student_id or asub.user_id = oa.student_id)
  ),
  
  overdue_counts as (
    -- Count unsubmitted overdue assignments per student
    select
      oa.student_id,
      count(*) as overdue_count
    from overdue_assignments oa
    left join submitted_assignments sa
      on sa.student_id = oa.student_id
     and sa.assignment_id = oa.assignment_id
    where sa.assignment_id is null  -- Not submitted
    group by oa.student_id
  ),
  
  overdue_signals as (
    -- Signal: overdue_assignments (>= 2 unsubmitted overdue)
    select
      oc.student_id,
      'overdue_assignments'::text as signal
    from overdue_counts oc
    where oc.overdue_count >= 2
  ),
  
  all_signals as (
    -- Union all signals
    select student_id, signal from no_login_signals
    union all
    select student_id, signal from low_attendance_signals
    union all
    select student_id, signal from overdue_signals
  ),
  
  aggregated_signals as (
    -- Aggregate signals per student into JSONB array
    select
      als.student_id,
      jsonb_agg(als.signal order by als.signal) as signals
    from all_signals als
    group by als.student_id
  )
  
  -- Final result: only students with at least one signal
  select
    s.id as portal_user_id,
    s.full_name,
    coalesce(ags.signals, '[]'::jsonb) as triggered_signals
  from students s
  inner join aggregated_signals ags on ags.student_id = s.id
  order by s.full_name;
$$;

-- Grant execute permission
grant execute on function public.get_at_risk_students(uuid, uuid)
  to authenticated, service_role;

-- Add comment
comment on function public.get_at_risk_students(uuid, uuid) is
  'Optimized set-based function to identify at-risk students using CTEs instead of loops. Returns students with no_login, low_attendance, or overdue_assignments signals.';
