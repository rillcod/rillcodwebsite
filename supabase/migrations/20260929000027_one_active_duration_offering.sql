-- One live run of a programme at a school, not three.
--
-- Summer School 2026 existed as three duration offerings at once. Registration
-- and money arrived through one of them (53 finance links and the public
-- enrolment page), while teaching happened under the other two, split across
-- two classes. Nothing was wrong with any single row; the damage was that
-- nothing said they were the same programme, so finance pointed one way and
-- learners another.
--
-- Two rules stop it recurring. Neither touches the school-term pathway.

-- 1. A live duration programme has to say whose it is.
--
-- The offering that held the money named no programme and no school, which is
-- precisely why it could sit alongside the real one without ever looking like a
-- duplicate. Enforced for active rows only, so the archived evidence of this
-- merge stays exactly as it is.
create or replace function public.duration_offering_needs_its_owner()
returns trigger language plpgsql as $$
begin
  if new.academic_model = 'duration_programme' and new.status = 'active' then
    if new.programme_id is null then
      raise exception 'A live duration programme must name the programme it runs.'
        using hint = 'Set programme_id on the offering.';
    end if;
    if new.school_id is null then
      raise exception 'A live duration programme must name the school that runs it.'
        using hint = 'Set school_id on the offering.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists duration_offering_needs_its_owner on public.academic_offerings;
create trigger duration_offering_needs_its_owner
  before insert or update of academic_model, status, programme_id, school_id
  on public.academic_offerings
  for each row execute function public.duration_offering_needs_its_owner();

-- 2. Only one of them may be live at a time.
--
-- Partial, so a finished run can be archived and next year's created without
-- fighting the index; and scoped to duration programmes, so a school's termly
-- offerings are untouched.
create unique index if not exists uq_active_duration_offering_per_programme_school
  on public.academic_offerings (programme_id, school_id)
  where academic_model = 'duration_programme' and status = 'active';

comment on index public.uq_active_duration_offering_per_programme_school is
  'One live duration-programme offering per programme per school. Summer School 2026 ran as three at once, splitting finance from teaching.';
