-- Database-level invariants for the consent -> parent claim -> onboarding -> finance pipeline.
-- Application checks improve the experience; these guards remain authoritative under
-- concurrent webhooks, retries, staff actions, cron repairs, and direct service-role writes.

alter table public.parent_claim_otps
  add column if not exists processing_at timestamptz;

create index if not exists idx_parent_claim_otps_processing
  on public.parent_claim_otps (processing_at)
  where verified = false and processing_at is not null;

comment on column public.parent_claim_otps.processing_at is
  'Short-lived atomic reservation while a verified claim provisions accounts. Stale reservations may be reclaimed so crashes never lock a family out.';

create or replace function public.guard_parent_student_link_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.portal_users p
    where p.id = new.parent_id
      and p.role = 'parent'
      and coalesce(p.is_deleted, false) = false
  ) then
    raise exception 'parent_student_links.parent_id must identify an active parent account'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
      from public.students s
      join public.portal_users u on u.id = s.user_id
     where s.id = new.student_id
       and u.role = 'student'
       and coalesce(s.is_deleted, false) = false
       and coalesce(u.is_deleted, false) = false
  ) then
    raise exception 'parent_student_links.student_id must identify an active student account'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_parent_student_link_roles on public.parent_student_links;
create trigger guard_parent_student_link_roles
before insert or update of parent_id, student_id on public.parent_student_links
for each row execute function public.guard_parent_student_link_roles();

create or replace function public.guard_consent_identity_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.matched_parent_id is not null and not exists (
    select 1 from public.portal_users p
     where p.id = new.matched_parent_id
       and p.role = 'parent'
       and coalesce(p.is_deleted, false) = false
  ) then
    raise exception 'form_leads.matched_parent_id must identify an active parent account'
      using errcode = '23514';
  end if;

  if new.matched_student_id is not null and not exists (
    select 1 from public.portal_users s
     where s.id = new.matched_student_id
       and s.role = 'student'
       and coalesce(s.is_deleted, false) = false
  ) then
    raise exception 'form_leads.matched_student_id must identify an active student account'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_consent_identity_roles on public.form_leads;
create trigger guard_consent_identity_roles
before insert or update of matched_parent_id, matched_student_id on public.form_leads
for each row execute function public.guard_consent_identity_roles();

create or replace function public.guard_consent_child_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.portal_users s
     where s.id = new.student_portal_user_id
       and s.role = 'student'
       and coalesce(s.is_deleted, false) = false
  ) then
    raise exception 'form_lead_child_links.student_portal_user_id must identify an active student account'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_consent_child_role on public.form_lead_child_links;
create trigger guard_consent_child_role
before insert or update of student_portal_user_id on public.form_lead_child_links
for each row execute function public.guard_consent_child_role();

-- One payment may settle only one invoice. The transaction row lock in
-- ensure_settled_invoice_atomic already protects the canonical writer. This trigger
-- also protects legacy/direct writers and tolerates any historical duplicates so a
-- migration never deletes or rewrites financial records.
create or replace function public.guard_one_invoice_per_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payment_transaction_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.payment_transaction_id::text, 0));
  if exists (
    select 1 from public.invoices i
     where i.payment_transaction_id = new.payment_transaction_id
       and i.id <> new.id
  ) then
    raise exception 'payment transaction % already has an invoice', new.payment_transaction_id
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_one_invoice_per_payment on public.invoices;
create trigger guard_one_invoice_per_payment
before insert or update of payment_transaction_id on public.invoices
for each row execute function public.guard_one_invoice_per_payment();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'parent_claim_audit_student_id_fkey') then
    alter table public.parent_claim_audit
      add constraint parent_claim_audit_student_id_fkey
      foreign key (student_id) references public.portal_users(id) on delete set null not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'parent_claim_audit_parent_id_fkey') then
    alter table public.parent_claim_audit
      add constraint parent_claim_audit_parent_id_fkey
      foreign key (parent_id) references public.portal_users(id) on delete set null not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'parent_claim_audit_action_check') then
    alter table public.parent_claim_audit
      add constraint parent_claim_audit_action_check
      check (action in ('code_sent','otp_failed','otp_verified','completion_failed','linked','blocked','unlinked')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'parent_claim_otps_attempts_check') then
    alter table public.parent_claim_otps
      add constraint parent_claim_otps_attempts_check
      check (attempts between 0 and 5) not valid;
  end if;
end;
$$;

comment on function public.guard_parent_student_link_roles() is
  'Prevents cross-role or deleted identities from entering the canonical parent-child junction.';
comment on function public.guard_one_invoice_per_payment() is
  'Serializes invoice creation per payment and prevents new duplicate payment-to-invoice links without rewriting historical finance data.';
