-- One class meeting must never pay for two generation runs at the same time.
-- Existing content uniqueness protects saved rows, but without a running-run
-- claim two requests can still call AI concurrently before either row exists.

with ranked_running as (
  select
    id,
    row_number() over (
      partition by lesson_plan_id, curriculum_week_number, session_number
      order by started_at asc, id asc
    ) as position
  from public.teaching_generation_runs
  where status = 'running'
)
update public.teaching_generation_runs run
set
  status = 'interrupted',
  error_summary = 'Superseded duplicate generation request',
  completed_at = now(),
  last_heartbeat_at = now()
from ranked_running ranked
where run.id = ranked.id
  and ranked.position > 1;

create unique index if not exists teaching_generation_one_running_per_meeting
  on public.teaching_generation_runs (
    lesson_plan_id,
    curriculum_week_number,
    session_number
  )
  where status = 'running';

comment on index public.teaching_generation_one_running_per_meeting is
  'Claims one active generator per lesson-plan week and class meeting; retries resume after success, failure, or stale-run recovery.';
