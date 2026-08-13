-- Every issued proposal and MoU gets a reference, so a document can be named
-- rather than described.
--
-- The Desktop holds seventeen MoU PDFs for one school, told apart only by
-- filename suffixes — _Final, _Master, _30k, _70_30_Pop150 — two of them written
-- in the same minute. A reference on the document and on the row is what makes
-- "the signed one" a fact instead of a guess.
--
-- Format follows the invoice convention already in use
-- (generate_invoice_number): a prefix, the year, and a zero-padded sequence.
--   RC-MOU-2026-00001 · RC-PROP-2026-00001

alter table public.partnership_agreements
  add column if not exists reference text;

create or replace function public.generate_partnership_reference()
returns trigger
language plpgsql
as $$
declare
  prefix  text;
  seq_val int;
begin
  if new.reference is not null and new.reference <> '' then
    return new;
  end if;

  prefix := case new.document_kind
              when 'mou' then 'RC-MOU-'
              else 'RC-PROP-'
            end || to_char(now(), 'YYYY') || '-';

  select count(*) + 1
    into seq_val
    from public.partnership_agreements
   where reference like prefix || '%';

  new.reference := prefix || lpad(seq_val::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists set_partnership_agreement_reference on public.partnership_agreements;
create trigger set_partnership_agreement_reference
  before insert on public.partnership_agreements
  for each row execute function public.generate_partnership_reference();

-- The invoice numbering this mirrors counts rows and can hand two concurrent
-- inserts the same number. Low risk here — a person clicks Generate — but two
-- contracts sharing a reference is precisely the confusion this column exists to
-- remove, so a collision fails the insert instead of being written.
create unique index if not exists uq_partnership_agreements_reference
  on public.partnership_agreements (reference);

comment on column public.partnership_agreements.reference is
  'Human-quotable document number (RC-MOU-2026-00001). Assigned on insert, unique, and printed on the document itself so a signed copy can be matched to its row.';
