-- The reference counter has to survive losing its own row.
--
-- The counter migration seeded from existing references once, at the moment it
-- ran. That is correct exactly until the counter table and the agreements table
-- disagree — and they do: production holds RC-PROP-2026-00001 and an empty
-- counter, so the next issue starts at 1 again and dies on
-- `uq_partnership_agreements_reference`. Every attempt to issue a document
-- fails, with a raw duplicate-key error shown to whoever clicked Generate.
--
-- A one-off re-seed would fix today and break again the same way. Instead the
-- first insert for a prefix now derives its starting point from the references
-- that actually exist, so the counter cannot start behind reality. The cost is
-- one scan on the first issue per prefix per year; every issue after that takes
-- the fast path unchanged.
--
-- The atomicity the previous migration bought is untouched: still one statement,
-- still locking the counter row, still never reusing a number after a draft is
-- deleted.

create or replace function public.generate_partnership_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Prefixed, because an unprefixed `prefix` is ambiguous against the counter
  -- table's own `prefix` column and PL/pgSQL resolves it as the column.
  v_prefix text;
  seed_val int;
  seq_val  int;
begin
  if new.reference is not null and new.reference <> '' then
    return new;
  end if;

  v_prefix := case new.document_kind
                when 'mou' then 'RC-MOU-'
                else 'RC-PROP-'
              end || to_char(now(), 'YYYY') || '-';

  -- What the next number must be if the counter is missing or behind. Reads the
  -- highest number already issued under this prefix; 2 when there are none,
  -- because the insert branch stores "next" and returns next - 1.
  select coalesce(max((substring(reference from '(\d+)$'))::int), 0) + 2
    into seed_val
    from public.partnership_agreements
   where reference like v_prefix || '%'
     and reference ~ '\d+$';

  -- Atomic in one statement: the counter row is locked for its duration, so two
  -- concurrent issues take consecutive numbers rather than the same one.
  --
  -- RETURNING reflects the row as it ends up, on both branches. A first issue
  -- stores the seed and returns seed - 1; every issue after that increments and
  -- returns the value it just consumed.
  insert into public.partnership_reference_counters as c (prefix, next_value)
       values (v_prefix, seed_val)
  on conflict (prefix) do update
          set next_value = c.next_value + 1,
              updated_at = now()
    returning c.next_value - 1
       into seq_val;

  new.reference := v_prefix || lpad(seq_val::text, 5, '0');
  return new;
end;
$$;

comment on function public.generate_partnership_reference() is
  'Assigns RC-PROP-YYYY-NNNNN / RC-MOU-YYYY-NNNNN from partnership_reference_counters. Atomic per prefix, never reuses a number after a draft is deleted, and seeds itself from existing references when the counter row is missing.';

-- Repair the current state as well, so the first issue after this migration does
-- not have to take the seeding path.
insert into public.partnership_reference_counters (prefix, next_value)
select
  substring(reference from '^(.*-\d{4}-)') as prefix,
  max((substring(reference from '(\d+)$'))::int) + 1
from public.partnership_agreements
where reference ~ '^.*-\d{4}-\d+$'
group by 1
on conflict (prefix) do update
  set next_value = greatest(public.partnership_reference_counters.next_value, excluded.next_value);
