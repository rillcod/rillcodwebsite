-- migration: audit_logs rls + fk + new finance audit columns
-- requirements: req 20.3, req 20.4

-- audit_logs already exists with:
--   id, user_id, action, table_name, record_id, old_values, new_values,
--   ip_address, user_agent, created_at
--
-- add new columns for the finance audit pattern used in grading.service.ts
-- and finance admin flows (actor_id, resource_type, resource_id, old_value,
-- new_value). existing columns are preserved unchanged.
-- the fk on actor_id is added with "if not exists" guards so the migration
-- is idempotent.

-- add new nullable columns (if not already present)
alter table public.audit_logs
  add column if not exists actor_id      uuid,
  add column if not exists resource_type text,
  add column if not exists resource_id   text,
  add column if not exists old_value     text,
  add column if not exists new_value     text;

-- add fk from actor_id → portal_users.id (nullable — system-generated rows
-- may not have an actor). guard with do-nothing block to stay idempotent.
do $$
begin
  if not exists (
    select 1
      from information_schema.table_constraints
     where constraint_name = 'fk_audit_actor'
       and table_schema     = 'public'
       and table_name       = 'audit_logs'
  ) then
    alter table public.audit_logs
      add constraint fk_audit_actor
        foreign key (actor_id) references public.portal_users(id);
  end if;
end;
$$;

-- ensure created_at always defaults to now() (column already exists)
alter table public.audit_logs
  alter column created_at set default now();

-- enable rls (safe to run even if already enabled)
alter table public.audit_logs enable row level security;

-- school admins can select payment-transaction audit rows for their own school.
-- no insert / update / delete policy is added — the table is append-only and
-- rows are written via the service_role key in api routes.
drop policy if exists "school_admin select payment audit logs" on public.audit_logs;

create policy "school_admin select payment audit logs"
  on public.audit_logs for select
  using (
    resource_type = 'payment_transaction'
    and exists (
      select 1 from public.portal_users pu
       where pu.id = auth.uid()
         and pu.role in ('admin', 'school_admin', 'school')
         and pu.school_id = (
           select pt.school_id from public.payment_transactions pt
            where pt.id = audit_logs.resource_id::uuid limit 1
         )
    )
  );
