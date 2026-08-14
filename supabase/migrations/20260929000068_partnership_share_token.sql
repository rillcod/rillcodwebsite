-- A public document link needs a secret, not a reference.
--
-- The share link and the signing endpoint were keyed on `reference`, which is
-- printed on the face of every document and — by design, see the counter
-- migration — sequential per kind per year. RC-PROP-2026-00042 tells you that
-- RC-PROP-2026-00041 exists. Anyone could walk the range and read any school's
-- agreed fees, or sign an MOU in that school's name, without ever holding the
-- link we sent.
--
-- The token is what the link carries. It is random, unguessable, and separate
-- from the reference so the reference can stay printed and quotable.
--
-- Rotatable on purpose: a link forwarded to the wrong WhatsApp group is a
-- credential leak, and the fix has to be "issue a new link", not "void the
-- contract".

alter table public.partnership_agreements
  add column if not exists share_token uuid not null default gen_random_uuid();

-- Existing rows took the default at add-column time, so each already has its
-- own value; this is the guard that they are distinct before the unique index.
create unique index if not exists uq_partnership_agreements_share_token
  on public.partnership_agreements (share_token);

comment on column public.partnership_agreements.share_token is
  'Secret for the public /p/<token> link. Unguessable, unlike reference, which is sequential and printed on the document. Rotate to revoke a leaked link.';
