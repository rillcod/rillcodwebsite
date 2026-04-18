-- migration: instalment_plans table for parent invoice payment plans
-- requirements: nf-9

create table if not exists public.instalment_plans (
  id           uuid        primary key default gen_random_uuid(),
  invoice_id   uuid        not null references public.invoices(id) on delete cascade,
  parent_id    uuid        not null references public.portal_users(id) on delete cascade,
  total_amount numeric     not null,
  currency     text        not null default 'NGN',
  status       text        not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (invoice_id, parent_id)
);

create table if not exists public.instalment_items (
  id              uuid        primary key default gen_random_uuid(),
  plan_id         uuid        not null references public.instalment_plans(id) on delete cascade,
  amount          numeric     not null,
  due_date        date        not null,
  status          text        not null default 'pending'
    check (status in ('pending', 'paid', 'overdue')),
  paid_at         timestamptz,
  transaction_ref text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_instalment_items_plan on public.instalment_items(plan_id);
create index if not exists idx_instalment_items_due  on public.instalment_items(due_date) where status = 'pending';

alter table public.instalment_plans  enable row level security;
alter table public.instalment_items  enable row level security;

-- parents can manage their own plans
drop policy if exists "parents manage own plans" on public.instalment_plans;
create policy "parents manage own plans"
  on public.instalment_plans for all
  using (parent_id = auth.uid());

-- admins/school can view all plans in their school
drop policy if exists "staff view plans" on public.instalment_plans;
create policy "staff view plans"
  on public.instalment_plans for select
  using (
    exists (
      select 1 from public.portal_users pu
      where pu.id = auth.uid()
        and pu.role in ('admin', 'school', 'teacher')
    )
  );

-- instalment items follow plan access
drop policy if exists "plan owner access items" on public.instalment_items;
create policy "plan owner access items"
  on public.instalment_items for all
  using (
    exists (
      select 1 from public.instalment_plans ip
      where ip.id = instalment_items.plan_id
        and ip.parent_id = auth.uid()
    )
  );
