-- Repair the special-programme offering backfill and reconcile legacy programme
-- payments through their exact registration page. Financial rows stay untouched.

create or replace function public.sync_special_program_academic_offering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offering uuid;
  v_period uuid;
  v_pathway text;
begin
  v_pathway := case
    when lower(new.title) like '%bootcamp%' then 'bootcamp'
    when lower(new.title) like '%short course%' then 'short_course'
    else 'holiday_programme'
  end;

  select id into v_offering
  from public.academic_offerings
  where special_program_page_id = new.id;

  if v_offering is null then
    insert into public.academic_offerings(
      title, pathway, enrollment_type, programme_id, special_program_page_id,
      calendar_mode, result_destination, starts_on, ends_on, status,
      delivery_mode, settings
    ) values (
      new.title, v_pathway, 'special', new.program_id, new.id,
      'fixed_dates', 'standalone', new.starts_on, new.ends_on,
      case when new.is_published then 'active' else 'draft' end,
      'hybrid', jsonb_build_object(
        'source', 'special_program_pages',
        'slug', new.slug,
        'pathway_source', 'special_program_registration'
      )
    ) returning id into v_offering;
  else
    update public.academic_offerings
    set title = new.title,
        pathway = v_pathway,
        enrollment_type = 'special',
        programme_id = new.program_id,
        starts_on = new.starts_on,
        ends_on = new.ends_on,
        status = case when new.is_published then 'active' else 'draft' end,
        updated_at = now()
    where id = v_offering;
  end if;

  select id into v_period
  from public.academic_offering_periods
  where offering_id = v_offering
  order by sequence_number
  limit 1;

  if v_period is null then
    insert into public.academic_offering_periods(
      offering_id, label, starts_on, ends_on, status
    ) values (
      v_offering, new.title, new.starts_on, new.ends_on,
      case when new.is_published then 'active' else 'planned' end
    ) returning id into v_period;
  else
    update public.academic_offering_periods
    set label = new.title,
        starts_on = new.starts_on,
        ends_on = new.ends_on,
        status = case when new.is_published then 'active' else 'planned' end,
        updated_at = now()
    where id = v_period;
  end if;

  if new.academic_offering_id is distinct from v_offering then
    update public.special_program_pages
    set academic_offering_id = v_offering
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_special_program_academic_offering on public.special_program_pages;
create trigger sync_special_program_academic_offering
after insert or update of title, program_id, starts_on, ends_on, is_published
on public.special_program_pages
for each row execute function public.sync_special_program_academic_offering();

-- The former migration touched only updated_at, which was not a trigger column.
-- Touch title so every orphaned page is processed by the corrected function.
update public.special_program_pages
set title = title
where academic_offering_id is null;

create or replace function public.propagate_payment_academic_links_to_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invoice_id is null then return new; end if;
  insert into public.finance_academic_links(
    invoice_id, academic_offering_id, offering_period_id, link_source
  )
  select new.invoice_id, l.academic_offering_id, l.offering_period_id, 'payment'
  from public.finance_academic_links l
  where l.payment_transaction_id = new.id
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists zz_propagate_payment_academic_links_to_invoice on public.payment_transactions;
create trigger zz_propagate_payment_academic_links_to_invoice
after insert or update of invoice_id, payment_gateway_response
on public.payment_transactions
for each row execute function public.propagate_payment_academic_links_to_invoice();

-- Current-format special payments carry the exact registration page directly.
insert into public.finance_academic_links(
  payment_transaction_id, academic_offering_id, offering_period_id, link_source
)
select t.id, scope.academic_offering_id, scope.offering_period_id, 'special_program_repair'
from public.payment_transactions t
join lateral (
  select o.id as academic_offering_id, p.id as offering_period_id
  from public.academic_offerings o
  join public.academic_offering_periods p on p.offering_id = o.id
  where o.special_program_page_id = case
    when coalesce(t.payment_gateway_response ->> 'special_program_page_id', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (t.payment_gateway_response ->> 'special_program_page_id')::uuid
    else null
  end
  order by (p.status = 'active') desc, p.sequence_number desc
  limit 1
) scope on true
on conflict do nothing;

-- Older Summer payments carry a prospect id; the prospect note preserves the
-- exact SpecialPage id chosen at registration.
insert into public.finance_academic_links(
  payment_transaction_id, academic_offering_id, offering_period_id, link_source
)
select t.id, scope.academic_offering_id, scope.offering_period_id, 'legacy_special_registration'
from public.payment_transactions t
join public.prospective_students ps
  on ps.id::text = t.payment_gateway_response ->> 'prospect_id'
join lateral (
  select o.id as academic_offering_id, p.id as offering_period_id
  from public.academic_offerings o
  join public.academic_offering_periods p on p.offering_id = o.id
  where o.special_program_page_id = case
    when substring(coalesce(ps.notes, '') from '\[SpecialPage:\s*([0-9a-f-]{36})\]')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then substring(ps.notes from '\[SpecialPage:\s*([0-9a-f-]{36})\]')::uuid
    else null
  end
  order by (p.status = 'active') desc, p.sequence_number desc
  limit 1
) scope on true
on conflict do nothing;

-- Settled invoices and existing invoice links inherit the same programme scope.
insert into public.finance_academic_links(
  invoice_id, academic_offering_id, offering_period_id, link_source
)
select t.invoice_id, l.academic_offering_id, l.offering_period_id, 'payment_repair'
from public.payment_transactions t
join public.finance_academic_links l on l.payment_transaction_id = t.id
where t.invoice_id is not null
on conflict do nothing;

insert into public.finance_academic_links(
  invoice_id, academic_offering_id, offering_period_id, link_source
)
select i.id, scope.academic_offering_id, scope.offering_period_id, 'legacy_special_registration'
from public.invoices i
join public.prospective_students ps
  on ps.id::text = i.metadata ->> 'prospect_id'
join lateral (
  select o.id as academic_offering_id, p.id as offering_period_id
  from public.academic_offerings o
  join public.academic_offering_periods p on p.offering_id = o.id
  where o.special_program_page_id = case
    when substring(coalesce(ps.notes, '') from '\[SpecialPage:\s*([0-9a-f-]{36})\]')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then substring(ps.notes from '\[SpecialPage:\s*([0-9a-f-]{36})\]')::uuid
    else null
  end
  order by (p.status = 'active') desc, p.sequence_number desc
  limit 1
) scope on true
on conflict do nothing;

comment on function public.sync_special_program_academic_offering() is
  'Creates and maintains the Special Programme academic offering used by registration, finance, curriculum direction and certificates.';