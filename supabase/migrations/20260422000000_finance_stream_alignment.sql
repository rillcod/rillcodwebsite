-- =============================================================
-- 20260422 — Finance stream alignment
-- =============================================================
-- Rillcod intentionally operates TWO separate billing streams:
--
--   1. SCHOOL stream  — partner schools are invoiced at term-cycle
--                       level; Rillcod retains a commission and
--                       settles the balance back to the school.
--   2. INDIVIDUAL stream — direct learners / parents are invoiced
--                          per enrolment or subscription; Rillcod
--                          keeps 100% of the payment.
--
-- Before this migration both streams share the same invoice/receipt
-- tables and the same sequence of numbers, which makes
-- reconciliation and audit trails impossible. We add a small,
-- safe, additive schema change so every invoice & receipt is
-- explicitly labelled with its stream, and the auto-generated
-- numbers carry a stream prefix (INV-SCH / INV-IND / REC-SCH /
-- REC-IND).  Existing rows are backfilled deterministically.
-- =============================================================

-- -----------------------------------------------------------------
-- 1. Add stream column (nullable first, backfill, then enforce)
-- -----------------------------------------------------------------
alter table public.invoices
  add column if not exists stream text;

alter table public.receipts
  add column if not exists stream text;

-- Backfill invoices:
--   * If the invoice is tied to a billing_cycle OR has a school_id
--     but no portal_user_id, treat it as a SCHOOL invoice.
--   * Everything else falls into the INDIVIDUAL stream.
update public.invoices i
   set stream = 'school'
 where stream is null
   and (
        exists (select 1 from public.billing_cycles bc where bc.invoice_id = i.id)
     or (i.school_id is not null and i.portal_user_id is null)
   );

update public.invoices
   set stream = 'individual'
 where stream is null;

-- Backfill receipts using the parent transaction / invoice intent:
--   * If linked invoice has stream, inherit it.
--   * Otherwise fall back to school_id-presence rule.
update public.receipts r
   set stream = coalesce(
         (select i.stream
            from public.payment_transactions t
            left join public.invoices i on i.payment_transaction_id = t.id
           where t.id = r.transaction_id
           limit 1),
         case
           when r.school_id is not null and r.student_id is null then 'school'
           else 'individual'
         end
       )
 where stream is null;

-- Enforce
alter table public.invoices
  alter column stream set default 'individual',
  alter column stream set not null;

alter table public.invoices
  drop constraint if exists invoices_stream_check,
  add  constraint invoices_stream_check
       check (stream in ('school', 'individual'));

alter table public.receipts
  alter column stream set default 'individual',
  alter column stream set not null;

alter table public.receipts
  drop constraint if exists receipts_stream_check,
  add  constraint receipts_stream_check
       check (stream in ('school', 'individual'));

create index if not exists idx_invoices_stream_status
  on public.invoices(stream, status);

create index if not exists idx_receipts_stream_issued
  on public.receipts(stream, issued_at desc);

-- -----------------------------------------------------------------
-- 2. Per-stream numbering
-- -----------------------------------------------------------------
-- We keep the legacy generate_invoice_number() signature for
-- backward compatibility, but the body now returns stream-aware
-- numbers:
--    Individual:  INV-YYYY-00001        (unchanged — protects history)
--    School:      INV-SCH-YYYY-00001    (new)
-- Similarly for receipts.
-- -----------------------------------------------------------------
create or replace function public.generate_invoice_number()
returns trigger
language plpgsql
as $$
declare
  year_prefix text;
  seq_val     int;
  v_stream    text;
begin
  v_stream := coalesce(new.stream, 'individual');

  if v_stream = 'school' then
    year_prefix := 'INV-SCH-' || to_char(now(), 'YYYY') || '-';
  else
    year_prefix := 'INV-' || to_char(now(), 'YYYY') || '-';
  end if;

  select count(*) + 1
    into seq_val
    from public.invoices
   where invoice_number like year_prefix || '%';

  new.invoice_number := year_prefix || lpad(seq_val::text, 5, '0');
  return new;
end;
$$;

create or replace function public.generate_receipt_number()
returns trigger
language plpgsql
as $$
declare
  year_prefix text;
  seq_val     int;
  v_stream    text;
begin
  v_stream := coalesce(new.stream, 'individual');

  if v_stream = 'school' then
    year_prefix := 'REC-SCH-' || to_char(now(), 'YYYY') || '-';
  else
    year_prefix := 'REC-' || to_char(now(), 'YYYY') || '-';
  end if;

  select count(*) + 1
    into seq_val
    from public.receipts
   where receipt_number like year_prefix || '%';

  new.receipt_number := year_prefix || lpad(seq_val::text, 6, '0');
  return new;
end;
$$;

-- Permissions unchanged; triggers re-used in place.

-- -----------------------------------------------------------------
-- 3. Convenience view for admin reconciliation
-- -----------------------------------------------------------------
create or replace view public.finance_ledger as
select
    t.id                         as transaction_id,
    t.created_at                 as transacted_at,
    t.paid_at                    as paid_at,
    t.payment_status             as status,
    t.payment_method             as method,
    t.amount                     as amount,
    t.currency                   as currency,
    t.transaction_reference      as reference,
    t.receipt_url                as receipt_url,
    t.school_id                  as school_id,
    t.portal_user_id             as portal_user_id,
    i.id                         as invoice_id,
    i.invoice_number             as invoice_number,
    i.stream                     as stream,
    r.id                         as receipt_id,
    r.receipt_number             as receipt_number
  from public.payment_transactions t
  left join public.invoices i on i.id = t.invoice_id
                              or i.payment_transaction_id = t.id
  left join public.receipts r on r.transaction_id = t.id;

comment on view public.finance_ledger is
  'Unified read-only ledger joining transactions, invoices & receipts with stream metadata for admin reconciliation.';

grant select on public.finance_ledger to authenticated;
