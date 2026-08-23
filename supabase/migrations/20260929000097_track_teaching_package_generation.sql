-- Durable, non-blocking history for lesson-plan package generation.
-- This is operational evidence only: it never locks teaching content and it
-- follows a deleted plan automatically, so build-time cleanup remains easy.

create table if not exists public.teaching_generation_runs (
  id uuid primary key default gen_random_uuid(),
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  curriculum_week_number integer not null check (curriculum_week_number > 0),
  session_number integer not null default 1 check (session_number > 0),
  source text not null check (source in ('teacher', 'cron', 'bootstrap', 'repair')),
  requested_types text[] not null default '{}'::text[],
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed', 'interrupted')),
  generated_count integer not null default 0 check (generated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  by_type jsonb not null default '{}'::jsonb,
  failed_types text[] not null default '{}'::text[],
  error_summary text,
  started_by uuid references public.portal_users(id) on delete set null,
  retry_of uuid references public.teaching_generation_runs(id) on delete set null,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists teaching_generation_runs_plan_slot_started_idx
  on public.teaching_generation_runs (
    lesson_plan_id,
    curriculum_week_number,
    session_number,
    started_at desc
  );

create index if not exists teaching_generation_runs_attention_idx
  on public.teaching_generation_runs (status, last_heartbeat_at)
  where status in ('running', 'partial', 'failed', 'interrupted');

alter table public.teaching_generation_runs enable row level security;

drop policy if exists teaching_generation_runs_staff_read on public.teaching_generation_runs;
create policy teaching_generation_runs_staff_read
  on public.teaching_generation_runs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.portal_users actor
      join public.lesson_plans plan on plan.id = teaching_generation_runs.lesson_plan_id
      left join public.classes c on c.id = teaching_generation_runs.class_id
      where actor.id = auth.uid()
        and actor.is_active is true
        and coalesce(actor.is_deleted, false) is false
        and (
          actor.role = 'admin'
          or c.teacher_id = auth.uid()
          or (
            actor.role in ('teacher', 'school')
            and actor.school_id is not null
            and actor.school_id = plan.school_id
          )
        )
    )
  );

revoke all on table public.teaching_generation_runs from anon;
revoke insert, update, delete on table public.teaching_generation_runs from authenticated;
grant select on table public.teaching_generation_runs to authenticated;
grant all on table public.teaching_generation_runs to service_role;

comment on table public.teaching_generation_runs is
  'Non-blocking durable attempts for one lesson-plan week/class-meeting package; used for visible partial failure and safe retry.';
