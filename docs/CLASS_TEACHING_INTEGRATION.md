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
- Every class lesson stores real lesson_plan_id, class_id, and academic_term_id foreign keys.
- Assignments and projects inherit class, course and term from the canonical plan.
- Flashcard decks store real class_id, lesson_plan_id, lesson_id, term_id, and curriculum-week scope.
- JSON metadata is reserved for lineage and authoring details; class/plan/week
  identity is read from the real foreign-key and scope columns only.
- Every plan/week/class-meeting has one lesson foundation, one slide deck, one
  flashcard deck, and at most one assignment/project of each type.
- Lesson, slides, flashcards, assignment and project are one teaching package.
  Generation keeps them held unless auto-publish is explicitly enabled; manual
  release publishes the whole package in one database transaction.
- A delivered lesson creates or updates `class_lesson_delivery`.
- The same database transaction updates `curriculum_week_tracking` when the plan has a curriculum.
- Teaching progress is derived from lessons and delivery; staff must not type a second progress record.
- Student promotion/completion is a separate controlled academic decision and must not be called term teaching progression.

## Integrated surfaces

### Class → Teaching

This surface owns course selection, curriculum attachment, canonical plan creation, lesson creation, assignment/project/flashcard/evaluation launches, delivery marking, and progress totals.

### Curriculum Studio

Curriculum Studio owns reusable syllabus authoring, versioning, publishing, preview, and export. Its Link to Class action calls the class teaching-workspace API with the exact curriculum version ID. It does not create a parallel lesson plan or write delivery progress directly.

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

Migrations `20260929000087`–`20260929000089` complete the package contract:

- canonical class/plan/week/session columns are the only identity fields;
  metadata is reserved for authoring details and lineage;
- lessons, slides, flashcards, assignments and projects release atomically;
- published records remain locked and immutable;
- historical generated duplicates are consolidated after all dependent assets
  are relinked;
- partial unique indexes prevent concurrent or scheduled generation from
  recreating the same plan/week/session asset.

Migration `20260929000124_remove_reverse_lesson_plan_identity.sql` completes the
identity consolidation. It safely removes the retired `lesson_plans.lesson_id`
reverse link and cleans duplicated metadata plan IDs only after confirming that
every asset has a real `lesson_plan_id`; it never touches learner submissions,
scores, attempts, attendance or published results.

## Rules for future AI or developer changes

1. Never create a class term plan without `class_id`, `course_id`, and `term_id`.
2. Never identify a lesson plan only through `metadata.lesson_plan_id`.
3. Never create a second progress table for this workflow.
4. Never infer academic term from today's date when the class has `term_id`.
5. Never infer class or school scope from the selected curriculum; validate all relationships.
6. All delivery changes must call `record_class_lesson_delivery` or an equivalent single database transaction.
7. Reports must read the canonical plan, lesson, and delivery records.
8. Preserve legacy routes only as alternate views or compatibility adapters, not alternate write models.
9. Curriculum deletion must return a conflict while any class plan references that version.
10. Never publish slides independently from their weekly teaching package.
11. Never remove a duplicate lesson until assignments, decks, materials,
    delivery evidence and learner progress have been checked and relinked.

## Verification completed

- TypeScript compilation: passed.
- Repository tests: 71 files and 296 tests passed.
- Remote migration dry run: passed.
- Live Supabase migration state: up to date after applying migration 20260921000007.

### Live package audit — 2026-08-21

- 73 lesson plans checked; every plan is linked to a valid class.
- Zero orphan plan links, class mismatches, course mismatches or incomplete
  class/plan/week/session identities.
- Historical duplicate lesson foundations were reduced from four duplicate
  groups (16 redundant rows) to zero without touching scores, submissions,
  learner progress or delivery history.
- Historical duplicate slide decks were consolidated and eight slides that had
  bypassed the held-package gate were returned to held status.
- Three historical packages retain a live lesson with held tasks/cards. This is
  intentional: staff must review and release the held learning work; cleanup
  must not expose unfinished assignments automatically.
## Evaluation and reporting boundary

Class evaluations use the existing CBT grading pipeline. Progress Reports and Report Builder continue consuming cbt_sessions and assignment evidence through their existing term-scoped aggregation. Canonical evaluation links are additive and must not rewrite report templates, formulas, revisions, readiness, comments, or edit-conflict protection.

## Grading Center boundary

The Grading Center is the single staff inbox for unfinished marking. It includes assignment submissions in `submitted`, `late`, or `pending_review` state and CBT sessions whose written responses set `needs_grading = true`.

- Teachers see work they created, work attached to a class they own, and school-wide work within an explicit teacher-school assignment.
- A teacher cannot grade class-scoped work owned by another teacher merely because both teachers belong to the same school.
- Assignment text and files remain visible before and after grading so every decision is auditable.
- Gradebook & Outcomes is the historical/result surface; it is not a second pending-work queue.
- Progress Reports and Report Builder remain consumers of graded evidence. This consolidation does not alter their templates, calculations, readiness, comments, revisions, or edit-conflict protection.

Live verification found 7 actionable assignment submissions that the former `pending_review`-only screen omitted. The corrected queue returns them without changing their records.
