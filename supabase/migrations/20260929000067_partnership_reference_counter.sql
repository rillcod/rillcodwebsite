-- Partnership references stop being derived from a row count.
--
-- The previous trigger read `count(*) + 1` over rows already carrying the
-- prefix. That has two faults, and the migration that introduced it said so:
--
--   Two inserts in the same instant both read the same count, so both take the
--   same number. One is then rejected by the unique index, which surfaces to
--   whoever clicked Generate as a raw duplicate-key error on a contract.
--
--   Deleting a document lowers the count, so the next issue reuses a number a
--   previous document already carried. Drafts are deletable by design, so this
--   is reachable in normal use — and a reference that has pointed at two
--   different documents is worse than no reference at all.
--
-- A counter table fixes both. `insert … on conflict do update … returning` is
-- one atomic statement: concurrent callers serialise on the row and each gets a
-- distinct value, and the counter never goes backwards when a document is
-- deleted. Numbering stays per kind per year, which is what the prefix means.

create table if not exists public.partnership_reference_counters (
  prefix      text primary key,
  next_value  integer not null default 1,
  updated_at  timestamptz not null default now()
);

comment on table public.partnership_reference_counters is
  'One row per reference prefix (RC-PROP-2026-, RC-MOU-2026-) holding the next number to issue. Written only by generate_partnership_reference().';

alter table public.partnership_reference_counters enable row level security;

-- No policies: the trigger runs as the table owner via security definer, and
-- nothing else has any business writing a counter.

-- Seed from what has already been issued, so numbering continues rather than
-- restarting over the top of existing references.
insert into public.partnership_reference_counters (prefix, next_value)
select
  substring(reference from '^(.*-\d{4}-)') as prefix,
  max((substring(reference from '(\d+)$'))::int) + 1
from public.partnership_agreements
where reference ~ '^.*-\d{4}-\d+$'
group by 1
on conflict (prefix) do update
  set next_value = greatest(public.partnership_reference_counters.next_value, excluded.next_value);

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
  seq_val  int;
begin
  if new.reference is not null and new.reference <> '' then
    return new;
  end if;

  v_prefix := case new.document_kind
                when 'mou' then 'RC-MOU-'
                else 'RC-PROP-'
              end || to_char(now(), 'YYYY') || '-';

  -- Atomic in one statement: the counter row is locked for its duration, so two
  -- concurrent issues take consecutive numbers rather than the same one.
  --
  -- RETURNING reflects the row as it ends up, on both branches. A first issue
  -- inserts next_value = 2 and returns 1; every issue after that increments and
  -- returns the value it just consumed.
  insert into public.partnership_reference_counters as c (prefix, next_value)
       values (v_prefix, 2)
  on conflict (prefix) do update
          set next_value = c.next_value + 1,
              updated_at = now()
    returning c.next_value - 1
       into seq_val;

  new.reference := v_prefix || lpad(seq_val::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists set_partnership_agreement_reference on public.partnership_agreements;
create trigger set_partnership_agreement_reference
  before insert on public.partnership_agreements
  for each row execute function public.generate_partnership_reference();

comment on function public.generate_partnership_reference() is
  'Assigns RC-PROP-YYYY-NNNNN / RC-MOU-YYYY-NNNNN from partnership_reference_counters. Atomic per prefix, and never reuses a number after a draft is deleted.';
