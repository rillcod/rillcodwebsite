-- Enforce one generated artifact per plan/week/type marker.
-- Scoped to AI-generated records only so existing manual content is unaffected.

create unique index if not exists uq_lessons_generated_plan_week
  on public.lessons(lesson_plan_id, curriculum_week_number, (metadata->>'generated_from'))
  where lesson_plan_id is not null
    and curriculum_week_number is not null
    and metadata->>'generated_from' = 'progression_lesson_route';

create unique index if not exists uq_assignments_generated_plan_week_type
  on public.assignments(lesson_plan_id, curriculum_week_number, assignment_type, (metadata->>'generated_from'))
  where lesson_plan_id is not null
    and curriculum_week_number is not null
    and metadata->>'generated_from' in ('progression_assignment_route', 'progression_project_route');

create unique index if not exists uq_flashcard_decks_generated_plan_week
  on public.flashcard_decks(lesson_plan_id, curriculum_week_number)
  where lesson_plan_id is not null
    and curriculum_week_number is not null;
