-- A short code a school can type, that is not the reference.
--
-- The access-code portal was built to take "the code or reference printed on
-- your document" and exchange it for the share token. The reference is
-- sequential and printed on the face of every document, so that handed anyone
-- who could count from RC-PROP-2026-00001 the key to every agreement — the exact
-- hole the share token was added to close, reopened through a second door.
--
-- The portal was right that a school needs a way back in when the link is lost.
-- It just needs a secret to do it with. Six digits is short enough to read off
-- paper or over the phone, and combined with rate limiting it is not guessable
-- at any useful rate; the token remains the thing that actually grants access.
--
-- Generated in the same trigger as the reference, with a bounded retry, so a
-- collision on the unique index can never fail somebody's issue.

alter table public.partnership_agreements
  add column if not exists access_code text;

create unique index if not exists uq_partnership_agreements_access_code
  on public.partnership_agreements (access_code);

comment on column public.partnership_agreements.access_code is
  'Six digits a school can type to retrieve its document. Random, never derived from the reference, which is sequential and printed.';

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
  v_code   text;
  tries    int := 0;
begin
  -- Six digits, retried on the astronomically unlikely collision. Bounded, so a
  -- pathological case degrades to a null code rather than spinning: the share
  -- link still works, and the code is a convenience on top of it.
  if new.access_code is null then
    loop
      tries := tries + 1;
      v_code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
      exit when not exists (
        select 1 from public.partnership_agreements where access_code = v_code
      ) or tries > 10;
    end loop;
    if tries <= 10 then
      new.access_code := v_code;
    end if;
  end if;

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
  'Assigns the reference and a random six-digit access code. Reference is sequential per kind per year and printed; the access code is not derived from it.';

-- Give the documents that already exist a code, so nothing is left unreachable
-- through the portal.
update public.partnership_agreements
   set access_code = lpad((floor(random() * 900000) + 100000)::int::text, 6, '0')
 where access_code is null;
