-- A teaching-package release and its learner notification are separate side
-- effects. Retrying the release must never create duplicate inbox rows, while
-- a deliberate later re-release should be allowed to notify again.

alter table public.notifications
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists idempotency_key text;

create unique index if not exists notifications_idempotency_key_unique
  on public.notifications(idempotency_key);

create index if not exists notifications_source_lookup_idx
  on public.notifications(source_type, source_id, created_at desc)
  where source_type is not null and source_id is not null;

comment on column public.notifications.source_type is
  'Business event that created the in-app notification, such as assignment_release.';
comment on column public.notifications.source_id is
  'Entity that caused the notification. This is correlation evidence, not an ownership foreign key.';
comment on column public.notifications.idempotency_key is
  'Stable per recipient and business-event version so retries cannot duplicate the customer notification.';

revoke insert, update, delete on table public.notifications from anon;
grant select, insert, update, delete on table public.notifications to service_role;
