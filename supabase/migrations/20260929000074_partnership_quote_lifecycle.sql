-- Quote expiry and read receipts on issued partnership documents.
--
-- Three facts a proposal already implied but never recorded.
--
--   valid_until — the document prints "these fees stand until 12 November",
--   and that sentence lived only in the rendered HTML. Nothing stored the date
--   and nothing enforced it, so a school could open a link months later and
--   sign at a price that had lapsed, and the system would record it as a valid
--   signature against a rate we no longer offer.
--
--   first_opened_at / open_count — whether the recipient has read it. A
--   proposal sent and never opened needs a different follow-up from one opened
--   four times and unsigned, and there was no way to tell them apart.
--
-- All three are nullable with sane defaults: every row that already exists is
-- correct without backfill. An old proposal simply has no expiry recorded and
-- has never been opened, which is exactly what was true of it.

alter table public.partnership_agreements
  add column if not exists valid_until date,
  add column if not exists first_opened_at timestamptz,
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count integer not null default 0;

comment on column public.partnership_agreements.valid_until is
  'Date the quoted fees lapse. Printed on the proposal and enforced at signing. Null means no stated expiry.';
comment on column public.partnership_agreements.first_opened_at is
  'When the recipient first opened the public link. Null means never opened.';
comment on column public.partnership_agreements.last_opened_at is
  'When the recipient most recently opened the public link.';
comment on column public.partnership_agreements.open_count is
  'How many times the public link has been opened. Counts reads, not signatures.';

-- Documents waiting on somebody: what a follow-up list is built from. Partial,
-- because signed and void rows are not chased and there is no sense indexing
-- them.
create index if not exists partnership_agreements_open_quotes_idx
  on public.partnership_agreements (status, sent_at)
  where status in ('draft', 'sent');

-- The signature guard freezes a signed agreement. `signed_by_role` was not in
-- its protected list, so the one field describing the authority under which a
-- contract was signed could still be edited after the fact. The read-receipt
-- columns are deliberately NOT protected: a signed document can still be
-- opened and re-read, and counting that is not amending the contract.
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'guard_signed_agreement_immutable'
  ) then
    execute $fn$
      create or replace function public.guard_signed_agreement_immutable()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        if old.status = 'signed' then
          if new.document_html is distinct from old.document_html
             or new.terms_snapshot is distinct from old.terms_snapshot
             or new.terms_id is distinct from old.terms_id
             or new.reference is distinct from old.reference
             or new.signed_at is distinct from old.signed_at
             or new.signed_by_name is distinct from old.signed_by_name
             or new.signed_by_role is distinct from old.signed_by_role
             or new.valid_until is distinct from old.valid_until
          then
            raise exception
              'This agreement has been signed. Its terms and document are the record of what was signed and cannot be changed — supersede it with a new document instead.';
          end if;
        end if;
        return new;
      end;
      $body$;
    $fn$;
  end if;
end
$$;
