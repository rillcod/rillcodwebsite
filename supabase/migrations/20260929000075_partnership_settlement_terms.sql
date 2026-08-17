-- When the school's share actually arrives, and what happens when it moves.
--
-- The proposal's money page tells a proprietor what they earn and then stops.
-- The next three questions it raises are always the same, and until now the
-- document was silent on all of them:
--
--   when do I get paid;
--   do I get paid if the parents have not paid yet;
--   what happens when a child leaves in week four.
--
-- These are commercial terms, so they belong in `partnership_terms` beside the
-- rate and the split — not in template prose, where they would be the same
-- promise made to every school regardless of what was actually negotiated. The
-- documents print them from the record, and print nothing when the record is
-- silent, which is the same rule the fee already follows.
--
-- All nullable. Every existing agreement is correct without a backfill: it has
-- no recorded settlement terms because none were recorded, and the documents
-- fall back to describing the mechanism without promising a date.

alter table public.partnership_terms
  add column if not exists settlement_days integer,
  add column if not exists settlement_trigger text,
  add column if not exists withdrawal_policy text,
  add column if not exists minimum_students integer;

comment on column public.partnership_terms.settlement_days is
  'Days after the settlement trigger by which the school''s share is paid. Null means no agreed timeframe.';
comment on column public.partnership_terms.settlement_trigger is
  'What starts the clock: term_end (we pay regardless of collection) or on_collection (we pay as parents pay).';
comment on column public.partnership_terms.withdrawal_policy is
  'What happens to a term''s fee when a learner withdraws part way through.';
comment on column public.partnership_terms.minimum_students is
  'Enrolment floor below which the programme is re-scoped rather than run. Null means no floor agreed.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'partnership_terms_settlement_trigger_check'
  ) then
    alter table public.partnership_terms
      add constraint partnership_terms_settlement_trigger_check
      check (settlement_trigger is null or settlement_trigger in ('term_end', 'on_collection'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'partnership_terms_withdrawal_policy_check'
  ) then
    alter table public.partnership_terms
      add constraint partnership_terms_withdrawal_policy_check
      check (withdrawal_policy is null or withdrawal_policy in ('pro_rata', 'no_refund', 'credit_next_term'));
  end if;

  -- A negative settlement window would print "paid 30 days before the term
  -- ends", and a negative floor is not a floor.
  if not exists (
    select 1 from pg_constraint where conname = 'partnership_terms_settlement_days_check'
  ) then
    alter table public.partnership_terms
      add constraint partnership_terms_settlement_days_check
      check (settlement_days is null or settlement_days between 0 and 365);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'partnership_terms_minimum_students_check'
  ) then
    alter table public.partnership_terms
      add constraint partnership_terms_minimum_students_check
      check (minimum_students is null or minimum_students >= 0);
  end if;
end
$$;
