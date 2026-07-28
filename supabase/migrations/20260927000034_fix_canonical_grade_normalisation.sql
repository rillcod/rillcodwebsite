-- Fix the live linter warning in grade normalisation and clean legacy encoding
-- variants so familiar labels such as Basic 1 and JSS 2 remain dependable.

create or replace function public.canonical_grade(input text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  parts text[];
  seg text;
  rec record;
  first_norm text;
  norm_lvl text;
  nums integer[] := array[]::integer[];
  rng text[];
  lo integer;
begin
  if input is null or btrim(input) = '' then return null; end if;

  -- Accept the correct middle dot and the legacy mojibake form already present
  -- in some composed class names.
  parts := regexp_split_to_array(input, '\s*(?:·|Â·)\s*');
  seg := upper(btrim(parts[array_upper(parts, 1)]));

  for rec in
    select match_row[1] as lvl_raw, match_row[2]::integer as grade_number
    from regexp_matches(
      seg,
      '(SSS|SS|JSS|JS|BASIC|PRIMARY|PRY|ELEMENTARY|ELEM|NURSERY|NUR|CRECHE|KINDERGARTEN|KG|RECEPTION|GRADE|YEAR)\s*0*([0-9]+)',
      'g'
    ) as match_row
  loop
    norm_lvl := case rec.lvl_raw
      when 'JS' then 'JSS' when 'JSS' then 'JSS'
      when 'SSS' then 'SS' when 'SS' then 'SS'
      when 'BASIC' then 'Basic' when 'PRIMARY' then 'Basic' when 'PRY' then 'Basic'
      when 'ELEMENTARY' then 'Basic' when 'ELEM' then 'Basic'
      when 'NURSERY' then 'Nursery' when 'NUR' then 'Nursery' when 'CRECHE' then 'Nursery'
      when 'KG' then 'Nursery' when 'KINDERGARTEN' then 'Nursery' when 'RECEPTION' then 'Nursery'
      when 'GRADE' then 'Basic' when 'YEAR' then 'JSS'
      else initcap(rec.lvl_raw)
    end;
    if first_norm is null then first_norm := norm_lvl; end if;
    if norm_lvl = first_norm then
      nums := array_append(nums, rec.grade_number::integer);
    end if;
  end loop;

  if first_norm is null then return null; end if;
  rng := regexp_match(seg, '([0-9]+)\s*[-–—]\s*([0-9]+)');
  if rng is not null then
    lo := least(rng[1]::integer, rng[2]::integer);
  else
    select min(value) into lo from unnest(nums) as value;
  end if;
  return first_norm || ' ' || lo;
end;
$$;

