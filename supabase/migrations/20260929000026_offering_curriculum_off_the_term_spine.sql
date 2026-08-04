-- Curriculum for a special programme stands on its own, off the school term.
--
-- academic_curriculum_releases forced every release onto the school-term spine:
-- academic_session and effective_term_number were both NOT NULL, and both
-- defaulted from the calendar month — session "2025/2026", term 1/2/3. A
-- holiday programme running 3 Aug to 4 Sep has no session and no term, so its
-- curriculum could only be created by stamping it with two values that mean
-- nothing to it and that the rest of the system would then read as truth.
--
-- A release now belongs to EITHER a school session+term OR an offering. Same
-- shape as the lessons change in 20260929000025: one table, one release
-- concept, two anchors, and the anchor keyed on academic_model rather than on
-- any programme by name.

alter table public.academic_curriculum_releases
  add column if not exists academic_offering_id uuid
    references public.academic_offerings(id) on delete set null;

create index if not exists idx_acr_academic_offering_id
  on public.academic_curriculum_releases using btree (academic_offering_id);

comment on column public.academic_curriculum_releases.academic_offering_id is
  'Set for duration-programme curricula. Such a release carries no academic_session or effective_term_number — those belong to the school-term spine.';

-- Widening only: every existing release keeps its session and term.
alter table public.academic_curriculum_releases
  alter column academic_session drop not null,
  alter column effective_term_number drop not null;

comment on column public.academic_curriculum_releases.academic_session is
  'School session (e.g. 2025/2026). Null for a duration-programme release.';
comment on column public.academic_curriculum_releases.effective_term_number is
  'School term this release takes effect from. Null for a duration-programme release.';

-- Keep the two apart, correcting rather than rejecting — a well-meant insert
-- should land on the right spine instead of failing. The column defaults still
-- stamp a session and term on every insert, so for a duration programme they
-- have to be cleared here or they would silently persist.
create or replace function public.keep_offering_curriculum_off_the_term_spine()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_model text;
begin
  if new.academic_offering_id is null then
    return new;
  end if;
  select academic_model into v_model
    from public.academic_offerings where id = new.academic_offering_id;
  if v_model = 'duration_programme' then
    new.academic_session := null;
    new.effective_term_number := null;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_offering_curriculum_off_the_term_spine
  on public.academic_curriculum_releases;
create trigger keep_offering_curriculum_off_the_term_spine
  before insert or update of academic_offering_id, academic_session, effective_term_number
  on public.academic_curriculum_releases
  for each row execute function public.keep_offering_curriculum_off_the_term_spine();

-- A school release still has to say which session and term it belongs to;
-- only an offering release may leave them empty.
alter table public.academic_curriculum_releases
  drop constraint if exists acr_release_has_one_spine;
alter table public.academic_curriculum_releases
  add constraint acr_release_has_one_spine check (
    academic_offering_id is not null
    or (academic_session is not null and effective_term_number is not null)
  );
