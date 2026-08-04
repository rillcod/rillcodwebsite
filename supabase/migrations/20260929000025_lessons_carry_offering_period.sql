-- Lessons carry their delivery period, so special programmes stop borrowing the
-- school-term spine.
--
-- classes and lesson_plans already carry academic_offering_id + offering_period_id.
-- lessons did not, so its only time anchor was academic_term_id — a school-term
-- shape. A holiday programme or short course has no term, so its lessons were
-- left with no time anchor at all: twenty Summer School 2026 lessons sit on the
-- system today with no term, no class and no plan, reachable only through their
-- course. Slides inherit their timing from the lesson, so they had none either.
--
-- Same column names as classes and lesson_plans on purpose. A third spelling of
-- the same idea is how these things drift apart.

alter table public.lessons
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete set null,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete set null;

create index if not exists idx_lessons_academic_offering_id
  on public.lessons using btree (academic_offering_id);
create index if not exists idx_lessons_offering_period_id
  on public.lessons using btree (offering_period_id);

comment on column public.lessons.academic_offering_id is
  'Delivery offering. Duration programmes (holiday/short course) are anchored here rather than on academic_term_id.';
comment on column public.lessons.offering_period_id is
  'Delivery window within the offering. The duration-based counterpart of academic_term_id.';

-- Inherit the offering the same way assignments and CBT exams already do, via the
-- shared binder, rather than a second rule that says the same thing differently.
-- It reads class_id first, then lesson_plan_id — lessons carry both.
drop trigger if exists bind_lesson_to_academic_offering on public.lessons;
create trigger bind_lesson_to_academic_offering
  before insert or update of class_id, lesson_plan_id, academic_offering_id, offering_period_id
  on public.lessons
  for each row execute function public.bind_record_to_academic_offering();

-- Keep the two paths apart.
--
-- Not "never both": a termly_school class legitimately carries an offering and a
-- period as well as its term. The rule that matters is the other direction — a
-- lesson delivered under a duration programme must not also claim a school term,
-- because nothing about a holiday programme maps onto First/Second/Third Term.
-- Corrected rather than rejected: an insert that means well should not fail, it
-- should land on the right spine.
create or replace function public.keep_duration_lessons_off_the_term_spine()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_model text;
begin
  if new.academic_offering_id is null or new.academic_term_id is null then
    return new;
  end if;
  select academic_model into v_model
    from public.academic_offerings where id = new.academic_offering_id;
  if v_model = 'duration_programme' then
    new.academic_term_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_duration_lessons_off_the_term_spine on public.lessons;
create trigger keep_duration_lessons_off_the_term_spine
  before insert or update of academic_offering_id, academic_term_id
  on public.lessons
  for each row execute function public.keep_duration_lessons_off_the_term_spine();

-- Backfill what can be derived. A lesson that already belongs to a class or a
-- plan takes that record's offering; nothing is guessed. Lessons with neither
-- are deliberately left alone — see the note in the accompanying report.
update public.lessons l
   set academic_offering_id = c.academic_offering_id,
       offering_period_id   = c.offering_period_id
  from public.classes c
 where c.id = l.class_id
   and l.academic_offering_id is null
   and c.academic_offering_id is not null;

update public.lessons l
   set academic_offering_id = p.academic_offering_id,
       offering_period_id   = p.offering_period_id
  from public.lesson_plans p
 where p.id = l.lesson_plan_id
   and l.academic_offering_id is null
   and p.academic_offering_id is not null;
