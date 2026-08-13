-- Commercial terms become a record, so the quote, the contract and the invoice
-- can stop disagreeing.
--
-- Today a partnership price lives in four places that do not know about each
-- other: schools.commission_rate, DEFAULT_COMMISSION_RATE (15) in
-- src/lib/finance/streams.ts, subscriptions.pricing_model, and a hardcoded
-- literal inside the MoU generator. The MoU states Rillcod Operations 70% /
-- School Profit Share 30%; the invoice engine falls back to a 15% commission.
-- A school billed on that fallback pays under a quarter of what it signed.
--
-- Deliberately NOT backfilled. Every one of the 29 school rows currently holds
-- commission_rate = 15 and rillcod_quota_percent = 0 — the column defaults, not
-- a negotiated rate, because no partner has been billed on agreed terms yet.
-- Copying those 15s in would manufacture 29 contracts nobody agreed to and make
-- the wrong number look authoritative. Terms are authored per school instead,
-- which is the point: rates are negotiated one school at a time.

create table if not exists public.partnership_terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,

  -- Two independent dimensions, because a real deal sets both — and because
  -- the School Invoice Builder already works this way. Its PricingMode is
  -- per_student | fixed_package | tiered, with revenueShareOn as a separate
  -- toggle on top. The vocabulary here matches it deliberately so terms map
  -- onto an invoice directly instead of being translated at the boundary.
  --
  --   1. What is charged   — billing_model and its amount
  --   2. How it divides    — the optional revenue share
  --
  -- The Bay-Flowers MoU is both at once: ₦30,000 per student per term, split
  -- Rillcod 70 / school 30. Modelling those as alternatives would have forced
  -- one of them out of the contract. Schools on a flat agreed rate are the same
  -- row with the share columns left null.
  billing_model text not null
    check (billing_model in ('per_student', 'fixed_package', 'tiered')),
  currency text not null default 'NGN',
  billing_cycle text not null default 'term'
    check (billing_cycle in ('term', 'session', 'month')),

  -- per_student: price per learner per cycle (invoice: ratePerChild).
  amount_per_student numeric(12, 2),

  -- fixed_package: one flat charge for the whole school (invoice: fixedPrice).
  fixed_package_price numeric(12, 2),

  -- tiered: population bands, as the proposal's pricing tiers.
  -- [{ "label": "1-100 students", "count": 100, "rate": 25000 }]
  tiers jsonb,

  -- Agreed upfront portion, carried into the invoice as deposit.
  deposit_amount numeric(12, 2),

  -- Optional split of what is collected (invoice: revenueShareOn + quotaPct).
  -- Null on both means no split: the agreed amount is what Rillcod is owed.
  -- Both sides are stored rather than one derived, so a document quotes instead
  -- of subtracting — which is how the README came to state the split backwards.
  rillcod_share_percent numeric(5, 2),
  school_share_percent numeric(5, 2),

  status text not null default 'draft'
    check (status in ('draft', 'proposed', 'agreed', 'superseded')),
  effective_from date,
  effective_to date,

  -- Terms are never edited in place once agreed; a change supersedes.
  version integer not null default 1,
  supersedes_id uuid references public.partnership_terms(id),

  notes text,
  created_by uuid references public.portal_users(id),
  agreed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Each model must carry the amount it bills on. A per_student row with no
-- price is not terms — it is a draft that would reach the invoice engine and
-- be silently defaulted, which is the failure this table exists to end.
alter table public.partnership_terms
  drop constraint if exists partnership_terms_model_fields;
alter table public.partnership_terms
  add constraint partnership_terms_model_fields check (
    case billing_model
      when 'per_student' then
        amount_per_student is not null and amount_per_student > 0
      when 'fixed_package' then
        fixed_package_price is not null and fixed_package_price > 0
      when 'tiered' then
        tiers is not null
        and jsonb_typeof(tiers) = 'array'
        and jsonb_array_length(tiers) > 0
      else false
    end
  );

-- The split is all-or-nothing and totals 100. Half a split — one side set, the
-- other null — would leave the invoice engine to infer the remainder, and
-- inference is exactly how 70/30 became 15/85.
alter table public.partnership_terms
  drop constraint if exists partnership_terms_shares_total;
alter table public.partnership_terms
  add constraint partnership_terms_shares_total check (
    (rillcod_share_percent is null and school_share_percent is null)
    or (
      rillcod_share_percent is not null
      and school_share_percent is not null
      and rillcod_share_percent + school_share_percent = 100
    )
  );

-- Rillcod's cut is never the minority share: 70/30 is the standard deal and
-- 50/50 is the floor. Encoding the floor means a fat-fingered 30/70 — exactly
-- the inversion already sitting in the README — cannot be saved at all.
alter table public.partnership_terms
  drop constraint if exists partnership_terms_rillcod_not_minority;
alter table public.partnership_terms
  add constraint partnership_terms_rillcod_not_minority check (
    rillcod_share_percent is null
    or rillcod_share_percent >= 50
  );

alter table public.partnership_terms
  drop constraint if exists partnership_terms_effective_window;
alter table public.partnership_terms
  add constraint partnership_terms_effective_window check (
    effective_to is null
    or effective_from is null
    or effective_to >= effective_from
  );

-- One school cannot be under two live agreements at once. Superseded and draft
-- rows are unlimited, so history and negotiation are both free.
create unique index if not exists uq_partnership_terms_one_agreed_per_school
  on public.partnership_terms (school_id)
  where status = 'agreed';

create index if not exists idx_partnership_terms_school
  on public.partnership_terms (school_id, status);

drop trigger if exists update_partnership_terms_updated_at on public.partnership_terms;
create trigger update_partnership_terms_updated_at
  before update on public.partnership_terms
  for each row execute function public.update_updated_at_column();

comment on table public.partnership_terms is
  'Agreed commercial terms for one partner school. The single source the proposal quotes, the MoU states and the invoice bills from. Never edited once agreed — a change inserts a superseding version.';
comment on column public.partnership_terms.rillcod_share_percent is
  'Rillcod''s share of collected revenue — the same quantity splitSchoolAmount() calls commissionRate (rillcodRetain = total * rate/100). Standard deal is 70; a CHECK enforces it never drops below 50. Null means no split: the agreed amount is what Rillcod is owed.';
comment on column public.partnership_terms.school_share_percent is
  'The partner school''s share. 30 under the standard deal. Stored alongside Rillcod''s so documents quote rather than subtract.';
comment on column public.partnership_terms.billing_model is
  'How the charge is computed, independent of how it divides. A school can be per_student with a split (₦30,000/learner, 70/30) or per_student flat with no split at all.';


-- Documents issued against terms: the proposal that wins the school, and the
-- MoU that binds it.
--
-- terms_snapshot and document_html are frozen copies, not references. A signed
-- agreement must render identically in five years even after the template is
-- rewritten and the terms superseded — regenerating a signed contract from a
-- live template would silently restate what somebody agreed to.
create table if not exists public.partnership_agreements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  terms_id uuid not null references public.partnership_terms(id),

  document_kind text not null check (document_kind in ('proposal', 'mou')),
  version integer not null default 1,

  terms_snapshot jsonb not null,
  document_html text,
  pdf_r2_key text,

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'signed', 'declined', 'void')),

  sent_at timestamptz,
  signed_at timestamptz,
  signed_by_name text,
  signed_by_role text,
  signed_by_user_id uuid references public.portal_users(id),
  signature_ip text,

  created_by uuid references public.portal_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A signature needs someone's name against it. A status of 'signed' with no
-- signer and no timestamp is a checkbox, not agreement.
alter table public.partnership_agreements
  drop constraint if exists partnership_agreements_signed_has_signer;
alter table public.partnership_agreements
  add constraint partnership_agreements_signed_has_signer check (
    status <> 'signed'
    or (signed_at is not null and coalesce(signed_by_name, '') <> '')
  );

create index if not exists idx_partnership_agreements_school
  on public.partnership_agreements (school_id, document_kind, status);

drop trigger if exists update_partnership_agreements_updated_at on public.partnership_agreements;
create trigger update_partnership_agreements_updated_at
  before update on public.partnership_agreements
  for each row execute function public.update_updated_at_column();

-- Once signed, the document and the terms behind it are sealed. Everything
-- else about the row stays editable so it can still be voided or filed.
create or replace function public.guard_signed_agreement_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'signed' then
    if new.terms_snapshot is distinct from old.terms_snapshot
      or new.document_html is distinct from old.document_html
      or new.terms_id is distinct from old.terms_id
      or new.signed_at is distinct from old.signed_at
      or new.signed_by_name is distinct from old.signed_by_name then
      raise exception
        'This agreement is signed. Its terms and document cannot change — supersede the terms and issue a new agreement instead.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_partnership_agreement_immutable on public.partnership_agreements;
create trigger guard_partnership_agreement_immutable
  before update on public.partnership_agreements
  for each row execute function public.guard_signed_agreement_immutable();

comment on table public.partnership_agreements is
  'Proposals and MoUs issued to partner schools. terms_snapshot and document_html are frozen at signature so a signed contract can never be restated by a later template or terms change.';


-- RLS. Terms and agreements are money and contract: staff author them, a
-- partner school may read its own, and nobody else sees anything. Writes stay
-- with the service role — a school must not be able to edit the rate it is
-- billed at, and acceptance is recorded server-side with the signer's details.
alter table public.partnership_terms enable row level security;
alter table public.partnership_agreements enable row level security;

drop policy if exists partnership_terms_staff_read on public.partnership_terms;
create policy partnership_terms_staff_read
  on public.partnership_terms
  for select
  using (
    exists (
      select 1 from public.portal_users u
       where u.id = auth.uid()
         and u.role in ('admin', 'teacher')
         and coalesce(u.is_deleted, false) = false
    )
  );

drop policy if exists partnership_terms_school_read_own on public.partnership_terms;
create policy partnership_terms_school_read_own
  on public.partnership_terms
  for select
  using (
    status in ('proposed', 'agreed', 'superseded')
    and exists (
      select 1 from public.portal_users u
       where u.id = auth.uid()
         and u.role = 'school'
         and u.school_id = partnership_terms.school_id
         and coalesce(u.is_deleted, false) = false
    )
  );

drop policy if exists partnership_agreements_staff_read on public.partnership_agreements;
create policy partnership_agreements_staff_read
  on public.partnership_agreements
  for select
  using (
    exists (
      select 1 from public.portal_users u
       where u.id = auth.uid()
         and u.role in ('admin', 'teacher')
         and coalesce(u.is_deleted, false) = false
    )
  );

drop policy if exists partnership_agreements_school_read_own on public.partnership_agreements;
create policy partnership_agreements_school_read_own
  on public.partnership_agreements
  for select
  using (
    status in ('sent', 'signed')
    and exists (
      select 1 from public.portal_users u
       where u.id = auth.uid()
         and u.role = 'school'
         and u.school_id = partnership_agreements.school_id
         and coalesce(u.is_deleted, false) = false
    )
  );
