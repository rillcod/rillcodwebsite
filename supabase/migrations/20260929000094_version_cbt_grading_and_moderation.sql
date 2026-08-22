-- Version staff marking independently from the immutable learner sitting.
-- Schools may keep the simple grade flow; moderation fields activate only when used.

alter table public.cbt_sessions
  add column if not exists grading_version integer not null default 1,
  add column if not exists grading_changed_at timestamptz,
  add column if not exists grading_changed_by uuid,
  add column if not exists grading_change_reason text,
  add column if not exists moderation_status text not null default 'unreviewed';

alter table public.cbt_sessions
  drop constraint if exists cbt_sessions_grading_version_positive,
  drop constraint if exists cbt_sessions_moderation_status_check;

alter table public.cbt_sessions
  add constraint cbt_sessions_grading_version_positive check (grading_version > 0),
  add constraint cbt_sessions_moderation_status_check
    check (moderation_status in ('unreviewed', 'reviewed', 'approved', 'returned'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cbt_sessions_grading_changed_by_fkey'
      and conrelid = 'public.cbt_sessions'::regclass
  ) then
    alter table public.cbt_sessions
      add constraint cbt_sessions_grading_changed_by_fkey
      foreign key (grading_changed_by) references public.portal_users(id) on delete set null;
  end if;
end;
$$;

create or replace function public.version_cbt_grading_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(new.score, new.manual_scores, new.grading_notes, new.needs_grading, new.moderation_status)
    is distinct from
    row(old.score, old.manual_scores, old.grading_notes, old.needs_grading, old.moderation_status)
  then
    new.grading_version := old.grading_version + 1;
    new.grading_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists version_cbt_grading_change on public.cbt_sessions;
create trigger version_cbt_grading_change
before update on public.cbt_sessions
for each row execute function public.version_cbt_grading_change();

comment on column public.cbt_sessions.grading_version is
  'Monotonic teacher-marking version; learner autosave does not change it.';
comment on column public.cbt_sessions.moderation_status is
  'Optional review state for marked CBT or captured school-paper evidence.';
