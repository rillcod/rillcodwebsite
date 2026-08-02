# Teaching content workflow

This document is the product and engineering contract for the curriculum-to-class
delivery flow. New UI and API work must preserve one connected teaching system.

## Canonical flow

1. **Academic Office** owns the official curriculum and its weekly outcomes.
2. **Class Teaching** turns those weeks into a class lesson plan and shows readiness.
3. **Lesson Studio** is the rich authoring and delivery surface for one lesson.
4. Slides, flashcards, assignments and projects belong to the same weekly package.
5. Delivery state records what was taught; assessment records learner evidence.

The class workspace is the control surface. The lesson page is the deep authoring
surface. They must show the same underlying assets and link to each other.

## Canonical teaching-week identity

Every new weekly content asset must use these relations:

- `class_id`
- `lesson_plan_id`
- `curriculum_week_number`
- `lesson_id`

`class_id + lesson_plan_id + curriculum_week_number` identifies the intended
class week. `lesson_id` identifies the concrete lesson that owns the package.

Metadata copies are legacy read fallbacks only. New writes must use real columns.
Do not introduce a new content generator that writes only IDs inside `metadata`.

## Asset ownership

| Asset      | Storage                                        | Required linkage          |
| ---------- | ---------------------------------------------- | ------------------------- |
| Lesson     | `lessons`                                      | class, plan, week         |
| Slides     | `lesson_materials`                             | class, plan, week, lesson |
| Flashcards | `flashcard_decks`                              | class, plan, week, lesson |
| Assignment | `assignments`                                  | class, plan, week, lesson |
| Project    | `assignments` with `assignment_type = project` | class, plan, week, lesson |

The readiness indicator is complete only when all five assets exist: lesson,
slides, flashcards, assignment and project.

## Write and compatibility rules

- Generate idempotently: reuse an existing asset for the same plan and week.
- When a lesson is created after other assets, re-link only previously unlinked
  teaching assets for the same plan and week.
- Generated lessons must record their creator and academic term context.
- Manual material creation inherits canonical context from its lesson.
- Read legacy metadata so historical content remains visible, but migrate naturally
  as users create or regenerate content.
- Never create a second assignment through a UI-side direct insert after an API
  has already created it.

## UX contract

- The class Teaching workspace is the only class-level weekly preparation flow.
- Each week has one primary action: prepare the missing package with AI.
- Manual lesson creation opens the full Lesson Studio with the week prefilled.
- The class page must not add a second generic ?Add Lesson? panel below Teaching.
- Advanced and legacy tools may be links, but must not compete with the primary flow.
- Readiness should be visible as ?x of 5? and name the missing assets.
- On small screens, primary actions remain full-width and content cards stack
  without horizontal page overflow.

## Safeguards

Re-linking is limited to the relationship field `lesson_id` on:

- `assignments`
- `flashcard_decks`
- `lesson_materials`

It must never mutate or delete learner scores, grades, submissions, attempts,
feedback, attendance or published results. Those are evidence records and are
outside content harmonisation.
