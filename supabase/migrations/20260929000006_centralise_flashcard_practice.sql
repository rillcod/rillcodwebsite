-- Flashcards are lesson practice inside the same academic delivery record.
-- Preserve existing decks while giving class-linked decks explicit pathway lineage.

alter table public.flashcard_decks
  add column if not exists academic_offering_id uuid references public.academic_offerings(id) on delete set null,
  add column if not exists offering_period_id uuid references public.academic_offering_periods(id) on delete set null,
  add column if not exists curriculum_release_id uuid references public.academic_curriculum_releases(id) on delete set null;

create or replace function public.bind_flashcard_deck_to_academic_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx record;
begin
  if new.lesson_plan_id is null then
    return new;
  end if;

  select class_id, course_id, school_id, term_id, academic_offering_id,
         offering_period_id, curriculum_release_id
  into ctx
  from public.lesson_plans
  where id = new.lesson_plan_id;

  if not found then
    raise exception 'Teaching plan not found for flashcard deck.';
  end if;

  new.class_id := ctx.class_id;
  new.course_id := ctx.course_id;
  new.school_id := ctx.school_id;
  new.term_id := ctx.term_id;
  new.academic_offering_id := ctx.academic_offering_id;
  new.offering_period_id := ctx.offering_period_id;
  new.curriculum_release_id := ctx.curriculum_release_id;
  return new;
end;
$$;

drop trigger if exists bind_flashcard_deck_academic_context on public.flashcard_decks;
create trigger bind_flashcard_deck_academic_context
before insert or update of lesson_plan_id on public.flashcard_decks
for each row execute function public.bind_flashcard_deck_to_academic_context();

update public.flashcard_decks d
set class_id = p.class_id,
    course_id = p.course_id,
    school_id = p.school_id,
    term_id = p.term_id,
    academic_offering_id = p.academic_offering_id,
    offering_period_id = p.offering_period_id,
    curriculum_release_id = p.curriculum_release_id
from public.lesson_plans p
where d.lesson_plan_id = p.id;

create index if not exists idx_flashcard_decks_offering_period
  on public.flashcard_decks(academic_offering_id, offering_period_id)
  where academic_offering_id is not null;
create index if not exists idx_flashcard_decks_plan_week
  on public.flashcard_decks(lesson_plan_id, curriculum_week_number)
  where lesson_plan_id is not null;

comment on function public.bind_flashcard_deck_to_academic_context() is
  'Keeps flashcard practice on the same offering, period, class and curriculum release as its teaching plan.';
