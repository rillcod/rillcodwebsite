-- A proposal is issued before there are terms; an MoU cannot be.
--
-- partnership_agreements.terms_id was NOT NULL, which quietly asserted that both
-- documents require an agreed rate. Only one does. A proposal is the thing you
-- send to *get* to a rate — it quotes the standard menu and commits nobody —
-- so requiring terms made the ordinary first step impossible.
--
-- The rule that actually matters is kept, and made explicit: an MoU without
-- terms is not an agreement, and is now rejected by name rather than by a
-- blanket NOT NULL that also caught the proposal.

alter table public.partnership_agreements
  alter column terms_id drop not null;

alter table public.partnership_agreements
  drop constraint if exists partnership_agreements_mou_needs_terms;
alter table public.partnership_agreements
  add constraint partnership_agreements_mou_needs_terms check (
    document_kind <> 'mou' or terms_id is not null
  );

comment on column public.partnership_agreements.terms_id is
  'The terms this document was rendered from. Null is legitimate for a proposal issued before a rate was agreed; an MoU always has one.';
