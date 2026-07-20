-- Durable reminder state for the external communication follow-up cron.

alter table public.communication_conversation_meta
  add column if not exists reminder_count integer not null default 0 check (reminder_count >= 0),
  add column if not exists last_reminder_at timestamptz,
  add column if not exists escalated_at timestamptz;

create index if not exists communication_conversation_meta_followup_idx
  on public.communication_conversation_meta (status, sla_due_at, last_reminder_at)
  where status in ('open', 'pending');
