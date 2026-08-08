-- The Academic Office weighting table is the one source of truth. Protect it
-- below the UI/API boundary so no service-role script can publish incomplete,
-- negative or non-100% component weights.

create or replace function public.valid_academic_assessment_components(p_components jsonb)
returns boolean
language plpgsql
immutable
set search_path=public
as $$
declare
  k text;
  v numeric;
  total numeric:=0;
  keys text[]:=array['theory','classwork','practical','assignments','attendance','assessment'];
begin
  if jsonb_typeof(p_components)<>'object' then return false; end if;
  foreach k in array keys loop
    if not (p_components ? k) then return false; end if;
    v:=(p_components->>k)::numeric;
    if v<0 or v>100 then return false; end if;
    total:=total+v;
  end loop;
  return total=100;
exception when others then
  return false;
end;
$$;

alter table public.academic_assessment_schemes
  drop constraint if exists academic_assessment_schemes_valid_components;
alter table public.academic_assessment_schemes
  add constraint academic_assessment_schemes_valid_components
  check (public.valid_academic_assessment_components(components)) not valid;

comment on function public.valid_academic_assessment_components(jsonb) is
  'Validates the six centrally weighted result components and their exact 100 percent total.';
