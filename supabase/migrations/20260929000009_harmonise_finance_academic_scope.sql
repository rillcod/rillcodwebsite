-- Join finance to the academic pathway without changing historical money records.
-- A junction is intentional: one school invoice can cover several class offerings.

create table if not exists public.finance_academic_links (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete cascade,
  payment_transaction_id uuid references public.payment_transactions(id) on delete cascade,
  billing_cycle_id uuid references public.billing_cycles(id) on delete cascade,
  academic_offering_id uuid not null references public.academic_offerings(id) on delete restrict,
  offering_period_id uuid not null references public.academic_offering_periods(id) on delete restrict,
  link_source text not null default 'automatic',
  created_at timestamptz not null default now(),
  constraint finance_academic_links_one_owner check (
    num_nonnulls(invoice_id, payment_transaction_id, billing_cycle_id) = 1
  )
);

create unique index if not exists finance_academic_invoice_scope_uidx
  on public.finance_academic_links(invoice_id, academic_offering_id, offering_period_id)
  where invoice_id is not null;
create unique index if not exists finance_academic_transaction_scope_uidx
  on public.finance_academic_links(payment_transaction_id, academic_offering_id, offering_period_id)
  where payment_transaction_id is not null;
create unique index if not exists finance_academic_cycle_scope_uidx
  on public.finance_academic_links(billing_cycle_id, academic_offering_id, offering_period_id)
  where billing_cycle_id is not null;
create index if not exists finance_academic_scope_lookup_idx
  on public.finance_academic_links(academic_offering_id, offering_period_id);

create or replace function public.validate_finance_academic_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offering_id uuid;
begin
  select offering_id into v_offering_id
  from public.academic_offering_periods
  where id = new.offering_period_id;

  if v_offering_id is null or v_offering_id <> new.academic_offering_id then
    raise exception using
      message = 'Finance period does not belong to the selected academic offering.',
      hint = 'Use an offering and period from the same enrolment pathway.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_finance_academic_link on public.finance_academic_links;
create trigger validate_finance_academic_link
before insert or update of academic_offering_id, offering_period_id
on public.finance_academic_links
for each row execute function public.validate_finance_academic_link();

create or replace function public.sync_billing_cycle_academic_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  v_school_id := coalesce(new.owner_school_id, new.school_id);
  if v_school_id is null or new.academic_term_id is null then
    return new;
  end if;

  insert into public.finance_academic_links(
    billing_cycle_id, academic_offering_id, offering_period_id, link_source
  )
  select new.id, c.academic_offering_id, c.offering_period_id, 'school_term'
  from public.classes c
  where c.school_id = v_school_id
    and c.term_id = new.academic_term_id
    and c.academic_offering_id is not null
    and c.offering_period_id is not null
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.sync_invoice_academic_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offering_id uuid;
  v_period_id uuid;
  v_term_id uuid;
  v_special_page_id uuid;
begin
  if new.billing_cycle_id is not null then
    insert into public.finance_academic_links(
      invoice_id, academic_offering_id, offering_period_id, link_source
    )
    select new.id, l.academic_offering_id, l.offering_period_id, 'billing_cycle'
    from public.finance_academic_links l
    where l.billing_cycle_id = new.billing_cycle_id
    on conflict do nothing;
  end if;

  if coalesce(new.metadata ->> 'academic_offering_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and coalesce(new.metadata ->> 'offering_period_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_offering_id := (new.metadata ->> 'academic_offering_id')::uuid;
    v_period_id := (new.metadata ->> 'offering_period_id')::uuid;
    insert into public.finance_academic_links(
      invoice_id, academic_offering_id, offering_period_id, link_source
    )
    select new.id, o.id, p.id, 'explicit_metadata'
    from public.academic_offerings o
    join public.academic_offering_periods p on p.offering_id = o.id
    where o.id = v_offering_id and p.id = v_period_id
    on conflict do nothing;
  end if;

  if coalesce(new.metadata ->> 'special_program_page_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_special_page_id := (new.metadata ->> 'special_program_page_id')::uuid;
    insert into public.finance_academic_links(
      invoice_id, academic_offering_id, offering_period_id, link_source
    )
    select new.id, scope.academic_offering_id, scope.offering_period_id, 'special_program'
    from (
      select o.id as academic_offering_id, p.id as offering_period_id
      from public.academic_offerings o
      join public.academic_offering_periods p on p.offering_id = o.id
      where o.special_program_page_id = v_special_page_id
      order by (p.status = 'active') desc, p.sequence_number desc
      limit 1
    ) scope
    on conflict do nothing;
  end if;

  if new.school_id is not null then
    select coalesce(
      (select academic_term_id from public.billing_cycles where id = new.billing_cycle_id),
      case when coalesce(new.metadata ->> 'academic_term_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (new.metadata ->> 'academic_term_id')::uuid else null end
    ) into v_term_id;

    if v_term_id is not null then
      insert into public.finance_academic_links(
        invoice_id, academic_offering_id, offering_period_id, link_source
      )
      select new.id, c.academic_offering_id, c.offering_period_id, 'school_term'
      from public.classes c
      where c.school_id = new.school_id
        and c.term_id = v_term_id
        and c.academic_offering_id is not null
        and c.offering_period_id is not null
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_payment_academic_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_special_page_id uuid;
begin
  if new.invoice_id is not null then
    insert into public.finance_academic_links(
      payment_transaction_id, academic_offering_id, offering_period_id, link_source
    )
    select new.id, l.academic_offering_id, l.offering_period_id, 'invoice'
    from public.finance_academic_links l
    where l.invoice_id = new.invoice_id
    on conflict do nothing;
  end if;

  if coalesce(new.payment_gateway_response ->> 'academic_offering_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and coalesce(new.payment_gateway_response ->> 'offering_period_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    insert into public.finance_academic_links(
      payment_transaction_id, academic_offering_id, offering_period_id, link_source
    )
    select new.id, o.id, p.id, 'explicit_metadata'
    from public.academic_offerings o
    join public.academic_offering_periods p on p.offering_id = o.id
    where o.id = (new.payment_gateway_response ->> 'academic_offering_id')::uuid
      and p.id = (new.payment_gateway_response ->> 'offering_period_id')::uuid
    on conflict do nothing;
  end if;

  if coalesce(new.payment_gateway_response ->> 'special_program_page_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_special_page_id := (new.payment_gateway_response ->> 'special_program_page_id')::uuid;
    insert into public.finance_academic_links(
      payment_transaction_id, academic_offering_id, offering_period_id, link_source
    )
    select new.id, scope.academic_offering_id, scope.offering_period_id, 'special_program'
    from (
      select o.id as academic_offering_id, p.id as offering_period_id
      from public.academic_offerings o
      join public.academic_offering_periods p on p.offering_id = o.id
      where o.special_program_page_id = v_special_page_id
      order by (p.status = 'active') desc, p.sequence_number desc
      limit 1
    ) scope
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.sync_class_finance_academic_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.school_id is null or new.term_id is null
     or new.academic_offering_id is null or new.offering_period_id is null then
    return new;
  end if;

  insert into public.finance_academic_links(
    billing_cycle_id, academic_offering_id, offering_period_id, link_source
  )
  select bc.id, new.academic_offering_id, new.offering_period_id, 'class_scope'
  from public.billing_cycles bc
  where coalesce(bc.owner_school_id, bc.school_id) = new.school_id
    and bc.academic_term_id = new.term_id
  on conflict do nothing;

  insert into public.finance_academic_links(
    invoice_id, academic_offering_id, offering_period_id, link_source
  )
  select i.id, new.academic_offering_id, new.offering_period_id, 'class_scope'
  from public.invoices i
  left join public.billing_cycles bc on bc.id = i.billing_cycle_id
  where i.school_id = new.school_id
    and coalesce(
      bc.academic_term_id,
      case
        when coalesce(i.metadata ->> 'academic_term_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (i.metadata ->> 'academic_term_id')::uuid
        else null
      end
    ) = new.term_id
  on conflict do nothing;

  insert into public.finance_academic_links(
    payment_transaction_id, academic_offering_id, offering_period_id, link_source
  )
  select t.id, new.academic_offering_id, new.offering_period_id, 'class_scope'
  from public.payment_transactions t
  join public.invoices i on i.id = t.invoice_id
  left join public.billing_cycles bc on bc.id = i.billing_cycle_id
  where i.school_id = new.school_id
    and coalesce(
      bc.academic_term_id,
      case
        when coalesce(i.metadata ->> 'academic_term_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (i.metadata ->> 'academic_term_id')::uuid
        else null
      end
    ) = new.term_id
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists sync_billing_cycle_academic_links on public.billing_cycles;
create trigger sync_billing_cycle_academic_links
after insert or update of academic_term_id, owner_school_id, school_id
on public.billing_cycles
for each row execute function public.sync_billing_cycle_academic_links();

drop trigger if exists sync_invoice_academic_links on public.invoices;
create trigger sync_invoice_academic_links
after insert or update of metadata, billing_cycle_id, school_id
on public.invoices
for each row execute function public.sync_invoice_academic_links();

drop trigger if exists sync_payment_academic_links on public.payment_transactions;
create trigger sync_payment_academic_links
after insert or update of invoice_id, payment_gateway_response
on public.payment_transactions
for each row execute function public.sync_payment_academic_links();
drop trigger if exists sync_class_finance_academic_links on public.classes;
create trigger sync_class_finance_academic_links
after insert or update of school_id, term_id, academic_offering_id, offering_period_id
on public.classes
for each row execute function public.sync_class_finance_academic_links();

-- Non-destructive backfill. Only bridge rows are inserted; invoice amounts,
-- statuses, allocations, payments and manual financial records are untouched.
insert into public.finance_academic_links(
  billing_cycle_id, academic_offering_id, offering_period_id, link_source
)
select bc.id, c.academic_offering_id, c.offering_period_id, 'school_term_backfill'
from public.billing_cycles bc
join public.classes c
  on c.school_id = coalesce(bc.owner_school_id, bc.school_id)
 and c.term_id = bc.academic_term_id
where bc.academic_term_id is not null
  and c.academic_offering_id is not null
  and c.offering_period_id is not null
on conflict do nothing;

insert into public.finance_academic_links(
  invoice_id, academic_offering_id, offering_period_id, link_source
)
select i.id, l.academic_offering_id, l.offering_period_id, 'billing_cycle_backfill'
from public.invoices i
join public.finance_academic_links l on l.billing_cycle_id = i.billing_cycle_id
where i.billing_cycle_id is not null
on conflict do nothing;

insert into public.finance_academic_links(
  invoice_id, academic_offering_id, offering_period_id, link_source
)
select i.id, c.academic_offering_id, c.offering_period_id, 'school_term_backfill'
from public.invoices i
join public.classes c
  on c.school_id = i.school_id
 and c.term_id = case
   when coalesce(i.metadata ->> 'academic_term_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   then (i.metadata ->> 'academic_term_id')::uuid
   else null
 end
where c.academic_offering_id is not null
  and c.offering_period_id is not null
on conflict do nothing;

insert into public.finance_academic_links(
  invoice_id, academic_offering_id, offering_period_id, link_source
)
select i.id, scope.academic_offering_id, scope.offering_period_id, 'special_program_backfill'
from public.invoices i
join lateral (
  select o.id as academic_offering_id, p.id as offering_period_id
  from public.academic_offerings o
  join public.academic_offering_periods p on p.offering_id = o.id
  where o.special_program_page_id = case
    when coalesce(i.metadata ->> 'special_program_page_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (i.metadata ->> 'special_program_page_id')::uuid
    else null
  end
  order by (p.status = 'active') desc, p.sequence_number desc
  limit 1
) scope on true
on conflict do nothing;

insert into public.finance_academic_links(
  payment_transaction_id, academic_offering_id, offering_period_id, link_source
)
select t.id, l.academic_offering_id, l.offering_period_id, 'invoice_backfill'
from public.payment_transactions t
join public.finance_academic_links l on l.invoice_id = t.invoice_id
where t.invoice_id is not null
on conflict do nothing;

insert into public.finance_academic_links(
  payment_transaction_id, academic_offering_id, offering_period_id, link_source
)
select t.id, scope.academic_offering_id, scope.offering_period_id, 'special_program_backfill'
from public.payment_transactions t
join lateral (
  select o.id as academic_offering_id, p.id as offering_period_id
  from public.academic_offerings o
  join public.academic_offering_periods p on p.offering_id = o.id
  where o.special_program_page_id = case
    when coalesce(t.payment_gateway_response ->> 'special_program_page_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (t.payment_gateway_response ->> 'special_program_page_id')::uuid
    else null
  end
  order by (p.status = 'active') desc, p.sequence_number desc
  limit 1
) scope on true
on conflict do nothing;

alter table public.finance_academic_links enable row level security;
drop policy if exists finance_academic_links_read on public.finance_academic_links;
create policy finance_academic_links_read
on public.finance_academic_links
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.invoices i
    where i.id = finance_academic_links.invoice_id
      and i.portal_user_id = auth.uid()
  )
  or exists (
    select 1 from public.payment_transactions t
    where t.id = finance_academic_links.payment_transaction_id
      and t.portal_user_id = auth.uid()
  )
);
grant select on public.finance_academic_links to authenticated;

comment on table public.finance_academic_links is
  'Non-destructive bridge from invoices, payments and billing cycles to one or more academic offering periods.';