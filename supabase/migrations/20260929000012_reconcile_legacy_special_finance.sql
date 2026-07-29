-- Reconcile pre-page-id Summer finance only when exactly one published special
-- programme exists. This is a deterministic legacy alias, not a name guess.

create or replace function public.sole_published_special_scope()
returns table(academic_offering_id uuid, offering_period_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with published_scopes as (
    select o.id as academic_offering_id, period.id as offering_period_id
    from public.special_program_pages sp
    join public.academic_offerings o on o.special_program_page_id = sp.id
    join lateral (
      select p.id
      from public.academic_offering_periods p
      where p.offering_id = o.id
      order by (p.status = 'active') desc, p.sequence_number desc
      limit 1
    ) period on true
    where sp.is_published = true
  )
  select s.academic_offering_id, s.offering_period_id
  from published_scopes s
  where (select count(*) from published_scopes) = 1
$$;

insert into public.finance_academic_links(
  payment_transaction_id, academic_offering_id, offering_period_id, link_source
)
select t.id, s.academic_offering_id, s.offering_period_id, 'legacy_summer_alias'
from public.payment_transactions t
cross join public.sole_published_special_scope() s
where lower(coalesce(t.payment_gateway_response ->> 'payment_type', '')) in (
  'summer_school', 'summer_school_balance', 'special_program', 'special_program_balance'
)
on conflict do nothing;

insert into public.finance_academic_links(
  invoice_id, academic_offering_id, offering_period_id, link_source
)
select i.id, s.academic_offering_id, s.offering_period_id, 'legacy_summer_alias'
from public.invoices i
cross join public.sole_published_special_scope() s
where lower(coalesce(i.metadata ->> 'source', '')) in (
  'summer_school_onboard', 'summer_balance_payment', 'special_program'
)
on conflict do nothing;

insert into public.finance_academic_links(
  invoice_id, academic_offering_id, offering_period_id, link_source
)
select t.invoice_id, l.academic_offering_id, l.offering_period_id, 'payment_repair'
from public.payment_transactions t
join public.finance_academic_links l on l.payment_transaction_id = t.id
where t.invoice_id is not null
on conflict do nothing;

insert into public.finance_academic_links(
  payment_transaction_id, academic_offering_id, offering_period_id, link_source
)
select t.id, l.academic_offering_id, l.offering_period_id, 'invoice_repair'
from public.payment_transactions t
join public.finance_academic_links l on l.invoice_id = t.invoice_id
where t.invoice_id is not null
on conflict do nothing;

comment on function public.sole_published_special_scope() is
  'Returns a finance backfill target only when one published special programme makes the destination unambiguous.';
comment on table public.finance_academic_links is
  'Non-destructive bridge from finance to academic offering periods. Legacy Summer aliases are linked only when one published special programme makes the destination unambiguous.';