-- A class on a duration programme does not sit in a school term.
--
-- Registration creates the cohort class through ensureClassWithTutor, which
-- stamps term_id from the school calendar and never sets academic_offering_id.
-- So every new summer registrant landed in a class that was detached from its
-- programme and pinned to a school term at the same time — the exact split that
-- left Summer School 2026 with finance on one offering and learners on two
-- others.
--
-- The app now attaches the offering. This is the backstop: whatever route
-- creates the class, if its offering is a duration programme the school term
-- comes off. Same shape as the lessons and curriculum rules — corrected rather
-- than rejected, and keyed on academic_model rather than on any programme.

create or replace function public.keep_duration_classes_off_the_term_spine()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_model text;
begin
  if new.academic_offering_id is null or new.term_id is null then
    return new;
  end if;
  select academic_model into v_model
    from public.academic_offerings where id = new.academic_offering_id;
  if v_model = 'duration_programme' then
    new.term_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_duration_classes_off_the_term_spine on public.classes;
create trigger keep_duration_classes_off_the_term_spine
  before insert or update of academic_offering_id, term_id
  on public.classes
  for each row execute function public.keep_duration_classes_off_the_term_spine();

-- The cohort class that already exists carries both. Clear the term so the one
-- live class matches the rule the trigger now enforces.
update public.classes c
   set term_id = null,
       updated_at = now()
  from public.academic_offerings o
 where o.id = c.academic_offering_id
   and o.academic_model = 'duration_programme'
   and c.term_id is not null;
