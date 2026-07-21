# Class Teaching Integration

## Final product boundary

The class is the operational teaching workspace. A teacher works in this order:

1. Open a class.
2. Select a course.
3. Attach a reusable curriculum version.
4. Create or reuse the class's term plan.
5. Create lessons inside that plan.
6. Mark the lesson or curriculum week delivered.
7. Read progress from those delivery records.

Curriculum remains in **Curriculum Studio** because it is reusable source material. Lesson Plans, Lessons, and Term Progression are no longer primary navigation destinations. Their existing URLs remain temporarily for bookmarks and deep links.

## Canonical ownership rules

- Exactly one active lesson plan may exist for `(class_id, academic_term_id, course_id)`.
- Changing curriculum updates the canonical plan; it must not create a competing plan.
- Every class lesson stores real `lesson_plan_id`, `class_id`, and `academic_term_id` foreign keys.
- JSON metadata is retained only as a compatibility mirror, never as the source of truth.
- A delivered lesson creates or updates `class_lesson_delivery`.
- The same database transaction updates `curriculum_week_tracking` when the plan has a curriculum.
- Teaching progress is derived from lessons and delivery; staff must not type a second progress record.
- Student promotion/completion is a separate controlled academic decision and must not be called term teaching progression.

## Integrated surfaces

### Class → Teaching

This surface owns course selection, curriculum attachment, canonical plan creation, lesson creation, delivery marking, and progress totals.

### Curriculum Studio

This surface owns reusable curriculum design, versioning, review, and publishing. It does not own a class's delivery state.

### Legacy pages

`/dashboard/lesson-plans`, `/dashboard/lessons`, and `/dashboard/progression` remain routable during transition. They are not independent systems and must use the same canonical IDs. New navigation must not restore them as separate daily-work tabs.

## Database contract

Migration `20260921000007_class_teaching_workspace.sql` provides:

- canonical lesson foreign keys;
- legacy metadata backfill;
- the active-plan uniqueness constraint;
- `class_lesson_delivery` with row-level security;
- `ensure_class_term_teaching_plan`, serialized with an advisory transaction lock;
- `record_class_lesson_delivery`, which synchronizes delivery and curriculum tracking;
- `class_term_teaching_progress`, a derived read model.

## Rules for future AI or developer changes

1. Never create a class term plan without `class_id`, `course_id`, and `term_id`.
2. Never identify a lesson plan only through `metadata.lesson_plan_id`.
3. Never create a second progress table for this workflow.
4. Never infer academic term from today's date when the class has `term_id`.
5. Never infer class or school scope from the selected curriculum; validate all relationships.
6. All delivery changes must call `record_class_lesson_delivery` or an equivalent single database transaction.
7. Reports must read the canonical plan, lesson, and delivery records.
8. Preserve legacy routes only as alternate views of this data, not alternate write models.

## Verification completed

- TypeScript compilation: passed.
- Repository tests: 71 files and 296 tests passed.
- Remote migration dry run: passed.
- Live Supabase migration state: up to date after applying migration 20260921000007.