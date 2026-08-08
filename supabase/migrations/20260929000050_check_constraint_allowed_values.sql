-- Expose what each check constraint actually permits, so code can be checked
-- against it.
--
-- check-schema-drift.ts replays every select against the live schema and is the
-- only thing that catches a column that does not exist. Nothing covered the
-- other direction — a value the column will not accept — and that gap cost two
-- real features:
--
--   students.status    three soft-delete paths wrote 'inactive' against a
--                      column permitting pending, approved and rejected.
--                      Postgres rejects the whole update, so the rows were
--                      never soft-deleted, including by Class Health & Repair,
--                      whose only job is clearing them.
--
--   whatsapp_outbox    the parent milestone digest wrote 'pending' against a
--                      column permitting queued, processing, retry, sent,
--                      delivered, read, failed and cancelled. It is the only
--                      writer, so no milestone message ever reached a parent.
--
-- Both compiled and passed the whole suite. Most call sites reach Supabase
-- through `as any`, and TypeScript cannot see a check constraint in any case.
-- Only the database knows, so the checker has to ask it.
--
-- Parsing constraint definitions in the API is possible and worse: it means
-- shipping a regex that must understand every way Postgres formats a CHECK.
-- Postgres already knows; this just reads the answer out.
create or replace function public.check_constraint_allowed_values()
returns table (
  table_name   text,
  column_name  text,
  allowed_value text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rel.relname::text as table_name,
    att.attname::text as column_name,
    -- regexp_matches yields text[]; the capture already excludes the quotes.
    m.v[1]::text      as allowed_value
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  -- A constraint over exactly one column is the shape this can reason about.
  -- Multi-column checks express a relationship between columns, not a list of
  -- permitted values, and guessing at them would produce noise.
  join pg_attribute att
    on att.attrelid = rel.oid
   and att.attnum = con.conkey[1]
  cross join lateral regexp_matches(
    pg_get_constraintdef(con.oid),
    '''([^'']+)''::text',
    'g'
  ) as m(v)
  where ns.nspname = 'public'
    and con.contype = 'c'
    and array_length(con.conkey, 1) = 1
    -- Only the enum shape: `col = ANY (ARRAY['a','b'])`. A regex check such as
    -- students.class_arm's '^[A-Z0-9]{1,4}$' also contains a quoted literal,
    -- and reading that as a list of permitted values would flag every valid
    -- class arm ever written. A range or length check has no literal list at
    -- all and is excluded by the same test.
    and pg_get_constraintdef(con.oid) like '%= ANY (ARRAY[%'
  group by rel.relname, att.attname, m.v[1];
$$;

comment on function public.check_constraint_allowed_values() is
  'Every value a single-column CHECK constraint permits, as table/column/value rows. Read by scripts/check-write-constraints.ts, which fails the build when code writes a value the database would reject.';

grant execute on function public.check_constraint_allowed_values() to service_role;
