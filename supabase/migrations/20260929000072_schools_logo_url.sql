-- A partner school's own logo. Optional, and nice to have.
--
-- The gallery route already selected `schools.logo_url` and the column was never
-- there, so PostgREST refused the whole query and the route answered "School not
-- found" for schools that plainly exist — a missing column reading as a missing
-- school. `check:schema` caught it.
--
-- Adding it rather than deleting the select, because a school's crest on its own
-- gallery, and beside ours on an agreement, is worth having. Nullable on purpose:
-- most schools will never upload one, and nothing may depend on it.

alter table public.schools
  add column if not exists logo_url text;

comment on column public.schools.logo_url is
  'Optional. The school''s own logo or crest, for its gallery and for documents addressed to it. Null for most schools; nothing may require it.';
