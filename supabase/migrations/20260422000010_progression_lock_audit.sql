-- Stage 3a: progression term lock + override audit trail

create table if not exists public.progression_override_audit (
  id uuid primary key default gen_random_uuid(),
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  actor_id uuid references public.portal_users(id) on delete set null,
  actor_role text,
  year_number int,
  term_number int,
  week_number int,
  action_type text not null check (action_type in ('override_unlock', 'week_edit_while_locked', 'term_status_change')),
  reason text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_progression_override_audit_plan
  on public.progression_override_audit(lesson_plan_id, created_at desc);

create index if not exists idx_progression_override_audit_school
  on public.progression_override_audit(school_id, created_at desc);

alter table public.progression_override_audit enable row level security;

drop policy if exists "staff read progression override audit" on public.progression_override_audit;
create policy "staff read progression override audit"
  on public.progression_override_audit
  for select
  using (
    exists (
      select 1
      from public.portal_users pu
      where pu.id = auth.uid()
        and pu.role in ('admin', 'teacher', 'school')
        and (
          pu.role = 'admin'
          or pu.school_id = progression_override_audit.school_id
        )
    )
  );

drop policy if exists "staff insert progression override audit" on public.progression_override_audit;
create policy "staff insert progression override audit"
  on public.progression_override_audit
  for insert
  with check (
    exists (
      select 1
      from public.portal_users pu
      where pu.id = auth.uid()
        and pu.role in ('admin', 'teacher')
        and (
          pu.role = 'admin'
          or pu.school_id = progression_override_audit.school_id
        )
    )
  );
